import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "../api";
import { toSafeDisplayError } from "../utils/safeErrorText";

/**
 * Resolves the canonical campaign behind a supplier-side record, by ID only.
 *
 * Several network-operations contracts (supplier coupons, the tracking-link registry) carry the
 * supplier's own campaign id and the MBO SupplierCampaign row id, but no canonical campaign id —
 * and the campaign detail route is keyed by that canonical id. This runs one bounded lookup
 * against GET /ops/admin/campaigns (catalog:read), whose contains-search accepts the supplier-side
 * id, then keeps only a campaign whose own identifiers match exactly:
 *
 *   campaign.supplierCampaignRowId === target.supplierCampaignRowId   (MBO SupplierCampaign row)
 *   campaign.campaignSourceId      === target.campaignSourceId        (MBO CampaignSource)
 *
 * Brand and campaign name are never used. A supplier-side campaign id can appear on several
 * SupplierCampaign rows — the mismatch the Phase 3 review found — so anything other than a single
 * exact match reports NONE or AMBIGUOUS rather than guessing.
 *
 * This is the generic counterpart of useRuleCampaignLink, which stays specific to commission rules.
 */

/** Operator-facing text for a failed lookup. No backend error text is ever shown. */
export const CAMPAIGN_RESOLVE_ERROR = "Campaign link could not be resolved.";

export const RESOLVER_STATE = Object.freeze({
  DISABLED: "DISABLED",
  IDLE: "IDLE",
  LOADING: "LOADING",
  RESOLVED: "RESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  NONE: "NONE",
  ERROR: "ERROR",
});

/**
 * @param {string} path          campaigns list path
 * @param {object} target        { networkSource, supplierCampaignId, supplierCampaignRowId, campaignSourceId }
 *                               where `supplierCampaignId` is the SUPPLIER-SIDE id string
 * @param {object} options       { enabled } — false makes no request at all
 */
export function useCampaignResolver(path, target, { enabled = true } = {}) {
  const [state, setState] = useState(enabled ? RESOLVER_STATE.IDLE : RESOLVER_STATE.DISABLED);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const network = target?.networkSource || null;
  const supplierCampaignId = target?.supplierCampaignId || null;
  const supplierCampaignRowId = target?.supplierCampaignRowId || null;
  const campaignSourceId = target?.campaignSourceId || null;

  const resolve = useCallback(async () => {
    if (!enabled || !path) {
      setState(RESOLVER_STATE.DISABLED);
      return null;
    }
    if (!supplierCampaignId || (!supplierCampaignRowId && !campaignSourceId)) {
      setCampaign(null);
      setState(RESOLVER_STATE.NONE);
      return null;
    }
    const id = ++requestId.current;
    setState(RESOLVER_STATE.LOADING);
    setError(null);
    try {
      const response = await fetchApi(path, {
        q: supplierCampaignId,
        networkSource: network || undefined,
        page: 1,
        pageSize: 25,
      });
      if (id !== requestId.current) return null;
      const rows = Array.isArray(response?.data) ? response.data : [];
      const matches = rows.filter(
        (row) =>
          (supplierCampaignRowId && row?.supplierCampaignRowId === supplierCampaignRowId) ||
          (campaignSourceId && row?.campaignSourceId === campaignSourceId),
      );
      if (matches.length === 1) {
        setCampaign({
          id: matches[0].id ?? null,
          campaignName: matches[0].campaignName ?? null,
          brandName: matches[0].brandName ?? null,
          campaignSourceId: matches[0].campaignSourceId ?? null,
          supplierCampaignRowId: matches[0].supplierCampaignRowId ?? null,
        });
        setState(RESOLVER_STATE.RESOLVED);
        return matches[0];
      }
      setCampaign(null);
      setState(matches.length > 1 ? RESOLVER_STATE.AMBIGUOUS : RESOLVER_STATE.NONE);
      return null;
    } catch (err) {
      if (id !== requestId.current) return null;
      // Backend error bodies are not guaranteed to be operator-safe, so none of the response
      // text is kept: the state carries a fixed message only.
      setError(toSafeDisplayError(err, CAMPAIGN_RESOLVE_ERROR));
      setState(RESOLVER_STATE.ERROR);
      return null;
    }
  }, [enabled, path, network, supplierCampaignId, supplierCampaignRowId, campaignSourceId]);

  useEffect(() => {
    resolve().catch(() => {});
  }, [resolve]);

  return { state, campaign, error, resolve };
}
