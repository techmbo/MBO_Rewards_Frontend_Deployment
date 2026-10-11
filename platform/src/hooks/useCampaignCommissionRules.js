import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "../api";
import { redactCredentialText } from "../pages/network/networkAccountContract";

/**
 * Supplier commission rules for one campaign, with a provable completeness contract and an
 * explicit linkage classification.
 *
 * Backend reality (production 15298635): GET /ops/admin/supplier-commission-rules only accepts
 * `network` and a contains-based `q`; it loads a capped rule set (meta.truncated) and pages the
 * matches with page/pageSize. There is no exact lookup by supplier campaign id or campaign source.
 *
 * Linkage (audited against the backend contract):
 *   AUTHORITATIVE — rule.supplierCampaignId === campaign.supplierCampaignRowId, or
 *                   rule.campaignSourceId === campaign.campaignSourceId.
 *                   Only these belong to this campaign source and count against the campaign
 *                   contract's commissionRuleCount (which counts rules on the primary source).
 *   RELATED       — only the supplier-side campaign id string matches. Those rows hang off a
 *                   different SupplierCampaign row / CampaignSource (other region or account
 *                   namespace) and are never counted as this campaign's rules.
 *
 * Strategy:
 *   1. query network + q=<supplierCampaignId>, pageSize 100, and walk EVERY match page (bounded);
 *   2. classify each row as authoritative or related;
 *   3. coverage is "complete" only when all match pages were fetched, the backend reports the
 *      loaded set was not truncated, AND the authoritative rows loaded reach the authoritative
 *      count. Related rows never make coverage complete.
 */
export const RULE_PAGE_SIZE = 100;
export const RULE_MAX_PAGES = 10; // 1,000 search matches; q narrows matches to one campaign family

export const RULE_LINKAGE = Object.freeze({ AUTHORITATIVE: "AUTHORITATIVE", RELATED: "RELATED", NONE: "NONE" });

export function classifyCampaignRule(rule, campaign) {
  if (!rule || !campaign) return RULE_LINKAGE.NONE;
  if (campaign.supplierCampaignRowId && rule.supplierCampaignId === campaign.supplierCampaignRowId) {
    return RULE_LINKAGE.AUTHORITATIVE;
  }
  if (campaign.campaignSourceId && rule.campaignSourceId === campaign.campaignSourceId) {
    return RULE_LINKAGE.AUTHORITATIVE;
  }
  if (campaign.supplierCampaignId && rule.sourceCampaignId === campaign.supplierCampaignId) {
    return RULE_LINKAGE.RELATED;
  }
  return RULE_LINKAGE.NONE;
}

export function useCampaignCommissionRules(path, campaign, { enabled = true, project = null } = {}) {
  const [rows, setRows] = useState([]);
  const [relatedRows, setRelatedRows] = useState([]);
  const [coverage, setCoverage] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const network = campaign?.networkSource || null;
  const supplierCampaignId = campaign?.supplierCampaignId || null;
  const supplierCampaignRowId = campaign?.supplierCampaignRowId || null;
  const campaignSourceId = campaign?.campaignSourceId || null;
  const authoritativeCount = campaign?.commissionRuleCount ?? null;

  const reload = useCallback(async () => {
    if (!enabled || !path || !network || !supplierCampaignId) {
      setLoading(false);
      return null;
    }
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const target = { supplierCampaignId, supplierCampaignRowId, campaignSourceId };
      const authoritative = [];
      const related = [];
      let page = 1;
      let totalPages = null;
      let searchMatches = null;
      let meta = null;
      let pagesFetched = 0;
      while (page <= RULE_MAX_PAGES) {
        const response = await fetchApi(path, { network, q: supplierCampaignId, page, pageSize: RULE_PAGE_SIZE });
        if (id !== requestId.current) return null;
        const list = Array.isArray(response?.data) ? response.data : [];
        pagesFetched += 1;
        meta = response?.meta ?? meta;
        searchMatches = response?.pagination?.total ?? response?.total ?? searchMatches;
        totalPages =
          response?.pagination?.totalPages ??
          (searchMatches != null ? Math.max(1, Math.ceil(searchMatches / RULE_PAGE_SIZE)) : null);
        for (const dto of list) {
          const view = project ? project(dto) : dto;
          if (!view) continue;
          const linkage = classifyCampaignRule(view, target);
          if (linkage === RULE_LINKAGE.AUTHORITATIVE) authoritative.push(view);
          else if (linkage === RULE_LINKAGE.RELATED) related.push(view);
        }
        const hasMore = response?.pagination?.hasMore ?? (totalPages != null && page < totalPages);
        if (!hasMore || list.length === 0) break;
        page += 1;
      }
      const allPagesFetched = totalPages == null ? false : pagesFetched >= totalPages;
      const truncated = Boolean(meta?.truncated || meta?.totalIsPartial || meta?.searchComplete === false);
      const lookupExhaustive = allPagesFetched && !truncated && meta != null;
      // Related rows are deliberately excluded: they belong to another network row and can
      // never prove that this campaign source's rules were fully loaded.
      const authoritativeCovered = authoritativeCount == null || authoritative.length >= authoritativeCount;
      setRows(authoritative);
      setRelatedRows(related);
      setCoverage({
        loadedExact: authoritative.length,
        loadedRelated: related.length,
        searchMatches,
        pagesFetched,
        totalPages,
        allPagesFetched,
        pageCapReached: !allPagesFetched && pagesFetched >= RULE_MAX_PAGES,
        truncated,
        searchScope: meta?.searchScope ?? null,
        lookupExhaustive,
        complete: lookupExhaustive && authoritativeCovered,
      });
      return authoritative;
    } catch (err) {
      if (id !== requestId.current) return null;
      setError(redactCredentialText(err.message) || "Request failed");
      throw err;
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [enabled, path, network, supplierCampaignId, supplierCampaignRowId, campaignSourceId, authoritativeCount, project]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  return { rows, relatedRows, coverage, loading, error, reload };
}
