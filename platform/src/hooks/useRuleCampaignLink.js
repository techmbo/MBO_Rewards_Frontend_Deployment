import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "../api";
import { toSafeDisplayError } from "../utils/safeErrorText";

/**
 * Resolves the canonical campaign behind one supplier commission rule, by ID only.
 *
 * The rule contract carries no canonical campaign id (production 15298635), and the campaign
 * detail route is keyed by that id, so a link cannot be built from the rule alone. This runs one
 * bounded lookup against GET /ops/admin/campaigns (catalog:read), whose contains-search accepts
 * the supplier-side campaign id, and then keeps only a campaign whose own identifiers match the
 * rule exactly:
 *
 *   campaign.supplierCampaignRowId === rule.supplierCampaignId   (MBO SupplierCampaign row)
 *   campaign.campaignSourceId      === rule.campaignSourceId     (MBO CampaignSource)
 *
 * Brand or campaign name is never used: a supplier-side campaign id can appear on several
 * SupplierCampaign rows, which is exactly the mismatch the Phase 3 review found. Anything other
 * than a single exact match reports NONE or AMBIGUOUS rather than guessing.
 */
/** Operator-facing text for a failed lookup. No backend error text is ever shown. */
export const CAMPAIGN_LOOKUP_ERROR = "Campaign link could not be resolved.";

export const LINK_STATE = Object.freeze({
  DISABLED: "DISABLED",
  IDLE: "IDLE",
  LOADING: "LOADING",
  RESOLVED: "RESOLVED",
  AMBIGUOUS: "AMBIGUOUS",
  NONE: "NONE",
  ERROR: "ERROR",
});

export function useRuleCampaignLink(path, rule, { enabled = true } = {}) {
  const [state, setState] = useState(enabled ? LINK_STATE.IDLE : LINK_STATE.DISABLED);
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const requestId = useRef(0);

  const network = rule?.networkSource || null;
  const sourceCampaignId = rule?.sourceCampaignId || null;
  const supplierCampaignRowId = rule?.supplierCampaignId || null;
  const campaignSourceId = rule?.campaignSourceId || null;

  const resolve = useCallback(async () => {
    if (!enabled || !path) {
      setState(LINK_STATE.DISABLED);
      return null;
    }
    if (!sourceCampaignId || (!supplierCampaignRowId && !campaignSourceId)) {
      setState(LINK_STATE.NONE);
      setCampaign(null);
      return null;
    }
    const id = ++requestId.current;
    setState(LINK_STATE.LOADING);
    setError(null);
    try {
      const response = await fetchApi(path, {
        q: sourceCampaignId,
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
        });
        setState(LINK_STATE.RESOLVED);
        return matches[0];
      }
      setCampaign(null);
      setState(matches.length > 1 ? LINK_STATE.AMBIGUOUS : LINK_STATE.NONE);
      return null;
    } catch (err) {
      if (id !== requestId.current) return null;
      // Backend error bodies on this contract are not guaranteed to be operator-safe (an ORM
      // failure carries no credential pattern, so redaction would pass it through intact).
      // None of the response text is kept: the state carries a fixed message only.
      setError(toSafeDisplayError(err, CAMPAIGN_LOOKUP_ERROR));
      setState(LINK_STATE.ERROR);
      return null;
    }
  }, [enabled, path, network, sourceCampaignId, supplierCampaignRowId, campaignSourceId]);

  useEffect(() => {
    resolve().catch(() => {});
  }, [resolve]);

  return { state, campaign, error, resolve };
}
