import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "../api";
import { redactCredentialText } from "../pages/network/networkAccountContract";

/**
 * Pager for endpoints that wrap their page as ok({ rows | items, total, page, pageSize }).
 * (`data` is an object there, so the shared usePagedQuery normaliser cannot be reused.)
 */
export function useOkPagedRows(path, filters = {}, { pageSize = 20, enabled = true, project = null } = {}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState(null);
  const filtersKey = JSON.stringify(filters);

  useEffect(() => {
    setPage(1);
  }, [filtersKey, pageSize, path]);

  const reload = useCallback(async () => {
    if (!enabled || !path) {
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetchApi(path, { page, pageSize, ...JSON.parse(filtersKey) });
      const payload = response?.data && !Array.isArray(response.data) ? response.data : response;
      const list = Array.isArray(payload?.rows) ? payload.rows : Array.isArray(payload?.items) ? payload.items : [];
      setRows(project ? list.map(project).filter(Boolean) : list);
      setTotal(payload?.total ?? null);
      return payload;
    } catch (err) {
      setError(redactCredentialText(err.message) || "Request failed");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [enabled, path, page, pageSize, filtersKey, project]);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const totalPages = total == null ? null : Math.max(1, Math.ceil(total / pageSize));
  return { rows, total, totalPages, page, setPage, pageSize, loading, error, reload };
}
