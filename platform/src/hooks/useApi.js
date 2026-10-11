import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../api";
import {
  buildCacheKey,
  DEFAULT_CACHE_TTL_MS,
  hasCachedData,
  isCacheFresh,
  readCacheEntry,
} from "../apiCache";
import { GENERIC_REQUEST_ERROR, safeListError, statusSafeMessage } from "../utils/safeErrorText";

export function useApi(
  path,
  params = {},
  { enabled = true, cacheTtlMs = DEFAULT_CACHE_TTL_MS, safeErrorMessage = null } = {},
) {
  const paramsKey = JSON.stringify(params);
  const stableParams = useMemo(() => params, [paramsKey]);
  const cacheKey = path ? buildCacheKey(path, stableParams) : null;
  const cachedEntry = cacheKey ? readCacheEntry(cacheKey) : null;

  const [data, setData] = useState(() => cachedEntry?.data ?? null);
  const [loading, setLoading] = useState(Boolean(enabled && path && !cachedEntry?.data));
  const [error, setError] = useState(null);

  const reload = useCallback(
    async ({ skipCache = false, extraParams = {}, forceLoading = false } = {}) => {
      if (!enabled || !path) return null;
      const requestParams = { ...stableParams, ...extraParams };
      const key = buildCacheKey(path, stableParams);
      const entry = readCacheEntry(key);
      const canUseCache = !skipCache && isCacheFresh(entry, cacheTtlMs);
      if (canUseCache) {
        setData(entry.data);
        setLoading(false);
        setError(null);
        return entry.data;
      }

      if (forceLoading) {
        setLoading(true);
      } else if (entry?.data && !skipCache) {
        setData(entry.data);
        setLoading(false);
      } else if (!hasCachedData(key)) {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await fetchApi(path, requestParams, { cacheTtlMs, skipCache });
        setData(result);
        return result;
      } catch (err) {
        // `safeErrorMessage` opts a page into a deterministic, page-owned message derived from
        // the HTTP status alone; the response body is never read. Callers that do not opt in keep
        // the previous behaviour, so legacy pages are unaffected.
        setError(
          safeErrorMessage
            ? statusSafeMessage(err.status, safeErrorMessage)
            : safeListError(err.message, GENERIC_REQUEST_ERROR),
        );
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [path, paramsKey, enabled, cacheTtlMs, stableParams, safeErrorMessage],
  );

  const refresh = useCallback(
    () => reload({ skipCache: true, forceLoading: true }),
    [reload],
  );

  useEffect(() => {
    if (!enabled || !path) {
      setLoading(false);
      return;
    }
    const entry = cacheKey ? readCacheEntry(cacheKey) : null;
    if (entry?.data) {
      setData(entry.data);
      setLoading(false);
    }
    reload().catch(() => {});
  }, [path, paramsKey, enabled, reload, cacheKey]);

  return { data, loading, error, reload, refresh };
}
