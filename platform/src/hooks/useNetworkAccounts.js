import { useCallback, useEffect, useRef, useState } from "react";
import { fetchApi } from "../api";
import { networkDetailPath, redactCredentialText, toAccountView } from "../pages/network/networkAccountContract";

/**
 * Network Accounts data source.
 *
 * 1. GET /suppliers (server-side filters: q, connectionStatus, dataHealth; not paginated — the
 *    backend returns every registered network, so client-side account filters are safe).
 * 2. For every network that reports accountCount > 0, GET /suppliers/:key to obtain its
 *    account rows (toNetworkAccountDto). The list call warms the backend aggregate cache, so the
 *    detail calls run in parallel afterwards.
 *
 * One row per connected account. Networks without any account produce a single row with
 * `account: null` so operators can see what is not configured.
 */
export function useNetworkAccounts(serverFilters = {}) {
  const [networks, setNetworks] = useState([]);
  const [envelope, setEnvelope] = useState({ liveSync: null, scheduler: null, total: null, contract: null });
  const [details, setDetails] = useState({});
  const [detailErrors, setDetailErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestId = useRef(0);
  const filtersKey = JSON.stringify(serverFilters);

  const load = useCallback(
    async ({ refresh = false } = {}) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const params = { ...JSON.parse(filtersKey) };
        if (refresh) params.refresh = "true"; // asks the backend to drop its 5-minute aggregate cache
        const response = await fetchApi("/suppliers", params);
        if (id !== requestId.current) return null;
        const list = Array.isArray(response?.data) ? response.data : [];
        setNetworks(list);
        setEnvelope({
          liveSync: response?.liveSync ?? null,
          scheduler: response?.scheduler ?? null,
          total: response?.total ?? list.length,
          contract: response?.contract ?? null,
        });
        setLoading(false);

        const withAccounts = list.filter((network) => (network.accountCount ?? 0) > 0);
        setDetailsLoading(withAccounts.length > 0);
        const settled = await Promise.allSettled(
          withAccounts.map((network) => fetchApi(networkDetailPath(network.key))),
        );
        if (id !== requestId.current) return null;
        const nextDetails = {};
        const nextErrors = {};
        settled.forEach((outcome, index) => {
          const key = withAccounts[index].key;
          if (outcome.status === "fulfilled") {
            const detail = outcome.value?.data ?? null;
            nextDetails[key] = detail
              ? { ...detail, accounts: (detail.accounts || []).map(toAccountView).filter(Boolean) }
              : null;
          } else {
            nextErrors[key] = redactCredentialText(outcome.reason?.message) || "Failed to load account details";
          }
        });
        setDetails(nextDetails);
        setDetailErrors(nextErrors);
        setDetailsLoading(false);
        return list;
      } catch (err) {
        if (id !== requestId.current) return null;
        setError(redactCredentialText(err.message) || "Request failed");
        setLoading(false);
        setDetailsLoading(false);
        throw err;
      }
    },
    [filtersKey],
  );

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const rows = [];
  for (const network of networks) {
    const detail = details[network.key];
    const accounts = detail?.accounts || [];
    if (accounts.length) {
      for (const account of accounts) {
        rows.push({
          rowId: `${network.key}:${account.id || `${account.platform}:${account.accountLabel}`}`,
          networkKey: network.key,
          network,
          account,
          detailError: null,
        });
      }
    } else {
      rows.push({
        rowId: `${network.key}:none`,
        networkKey: network.key,
        network,
        account: null,
        detailError: detailErrors[network.key] || null,
      });
    }
  }

  return {
    networks,
    rows,
    details,
    detailErrors,
    liveSync: envelope.liveSync,
    scheduler: envelope.scheduler,
    total: envelope.total,
    contract: envelope.contract,
    loading,
    detailsLoading,
    error,
    reload: load,
  };
}
