import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../api";
import { redactCredentialText, syncRunsPath, toSyncRunView } from "../pages/network/networkAccountContract";

/**
 * GET /ops/sync-runs (ops:read).
 * Envelope is ok({ total, items, page, pageSize }) — the paged payload sits under `data` as an
 * object, so the generic usePagedQuery normaliser (which expects `data` to be the row array)
 * cannot be reused here.
 *
 * Supported server filters: network, networkAccountId, status, jobType, sourceObject, from, to.
 */
export function useSyncRuns(filters = {}, { pageSize = 20, enabled = true } = {}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    setPage(1);
  }, [filtersKey, pageSize]);

  const reload = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchApi(syncRunsPath(), { page, pageSize, ...JSON.parse(filtersKey) });
      const payload = response?.data ?? {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      setRows(items.map(toSyncRunView).filter(Boolean));
      setTotal(payload.total ?? null);
      return payload;
    } catch (err) {
      setError(redactCredentialText(err.message) || "Request failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, page, pageSize, filtersKey]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const totalPages = total == null ? null : Math.max(1, Math.ceil(total / pageSize));

  return { rows, total, totalPages, page, setPage, pageSize, loading, error, reload };
}
