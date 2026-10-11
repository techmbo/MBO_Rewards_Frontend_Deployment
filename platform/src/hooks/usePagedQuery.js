import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "../api";
import { GENERIC_REQUEST_ERROR, safeListError, statusSafeMessage } from "../utils/safeErrorText";
import {
  buildCacheKey,
  DEFAULT_CACHE_TTL_MS,
  hasCachedData,
  isCacheFresh,
  readCacheEntry,
} from "../apiCache";

function normalizePagedResponse(response, page, pageSize) {
  const {
    data,
    rows,
    items,
    pagination,
    meta,
    ok,
    page: respPage,
    pageSize: respPageSize,
    total,
    totalPages,
    ...rest
  } = response || {};
  const basePagination = pagination && typeof pagination === "object" ? pagination : {};

  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.rows)) list = data.rows;
    else if (Array.isArray(data.items)) list = data.items;
    else if (Array.isArray(data.data)) list = data.data;
  } else if (Array.isArray(rows)) {
    list = rows;
  } else if (Array.isArray(items)) {
    list = items;
  }

  const nestedTotal =
    data && typeof data === "object" && !Array.isArray(data)
      ? data.total ?? data.pagination?.total
      : null;

  const resolvedPage = Number(basePagination.page ?? respPage ?? data?.page ?? page) || page;
  const resolvedPageSize =
    Number(basePagination.pageSize ?? respPageSize ?? data?.pageSize ?? pageSize) || pageSize;
  const resolvedTotal =
    basePagination.total != null
      ? Number(basePagination.total)
      : total != null
        ? Number(total)
        : nestedTotal != null
          ? Number(nestedTotal)
          : null;
  const resolvedTotalPages =
    basePagination.totalPages != null
      ? Math.max(1, Number(basePagination.totalPages) || 1)
      : totalPages != null
        ? Math.max(1, Number(totalPages) || 1)
        : resolvedTotal != null
          ? Math.max(1, Math.ceil(resolvedTotal / resolvedPageSize))
          : basePagination.hasMore
            ? resolvedPage + 1
            : 1;
  const resolvedHasMore =
    basePagination.hasMore != null
      ? Boolean(basePagination.hasMore)
      : resolvedTotal != null
        ? resolvedPage * resolvedPageSize < resolvedTotal
        : false;

  const extras =
    data && typeof data === "object" && !Array.isArray(data)
      ? { ...rest, ...data, rows: undefined, items: undefined, data: undefined, total: undefined }
      : rest || {};

  return {
    data: list,
    pagination: {
      ...basePagination,
      page: resolvedPage,
      pageSize: resolvedPageSize,
      total: resolvedTotal,
      totalPages: resolvedTotalPages,
      hasMore: resolvedHasMore,
    },
    meta: meta ?? null,
    ok: ok ?? true,
    extras,
  };
}

function readCachedResult(path, page, pageSize, filters) {
  if (!path) return null;
  const key = buildCacheKey(path, { page, pageSize, ...filters });
  const entry = readCacheEntry(key);
  if (!entry?.data) return null;
  return normalizePagedResponse(entry.data, page, pageSize);
}

const EMPTY_RESULT = { data: [], pagination: {}, extras: {} };

export function usePagedQuery(path, filters = {}, { pageSize = 25, enabled = true, cacheTtlMs = DEFAULT_CACHE_TTL_MS, safeErrorMessage = null } = {}) {
  const filtersKey = JSON.stringify(filters);
  const stableFilters = useMemo(() => filters, [filtersKey]);

  const [page, setPage] = useState(1);
  const cacheKey = path ? buildCacheKey(path, { page, pageSize, ...stableFilters }) : null;
  const initialCached = readCachedResult(path, 1, pageSize, stableFilters);

  const [loading, setLoading] = useState(Boolean(enabled && path && !initialCached));
  const [error, setError] = useState(null);
  const [result, setResult] = useState(initialCached ?? EMPTY_RESULT);

  useEffect(() => {
    setPage(1);
    const cached = readCachedResult(path, 1, pageSize, stableFilters);
    if (cached) {
      setResult(cached);
      setLoading(false);
    }
  }, [path, filtersKey, pageSize, stableFilters]);

  const reload = useCallback(
    async ({ skipCache = false, extraParams = {}, forceLoading = false } = {}) => {
      if (!enabled || !path) return null;
      const params = { page, pageSize, ...stableFilters, ...extraParams };
      const key = buildCacheKey(path, { page, pageSize, ...stableFilters });
      const entry = readCacheEntry(key);
      const canUseCache = !skipCache && isCacheFresh(entry, cacheTtlMs);

      if (canUseCache) {
        const normalized = normalizePagedResponse(entry.data, page, pageSize);
        setResult(normalized);
        setLoading(false);
        setError(null);
        // Stale-while-revalidate: show cache immediately, refresh in background.
        fetchApi(path, params, { cacheTtlMs, skipCache: true })
          .then((response) => {
            setResult(normalizePagedResponse(response, page, pageSize));
          })
          .catch(() => {});
        return normalized;
      }

      if (forceLoading) {
        setLoading(true);
      } else if (entry?.data && !skipCache) {
        setResult(normalizePagedResponse(entry.data, page, pageSize));
        setLoading(false);
      } else if (!hasCachedData(key)) {
        setLoading(true);
      }
      setError(null);
      try {
        const response = await fetchApi(path, params, { cacheTtlMs, skipCache });
        const normalized = normalizePagedResponse(response, page, pageSize);
        setResult(normalized);
        return normalized;
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
    [path, page, pageSize, filtersKey, enabled, cacheTtlMs, stableFilters, safeErrorMessage],
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
    const cached = readCachedResult(path, page, pageSize, stableFilters);
    if (cached) {
      setResult(cached);
      setLoading(false);
    }
    reload().catch(() => {});
  }, [reload, enabled, path, page, cacheKey]);

  return {
    page,
    setPage,
    pageSize,
    loading,
    error,
    result,
    rows: result.data,
    pagination: result.pagination,
    meta: result.meta,
    extras: result.extras,
    reload,
    refresh,
  };
}
