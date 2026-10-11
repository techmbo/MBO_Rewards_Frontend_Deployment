import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { PageLayout } from "../../components/layout/PageLayout";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { DateCell, MonoChip, Truncate } from "../../components/ui/TableCells";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { flattenMarketplaceAccounts, indexNetworksByPlatform, redactCredentialText } from "../network/networkAccountContract";
import { authTypeLabel } from "../network/networkAccountFormat";
import { BoolBadge, EnumBadge, NoticeBar } from "../network/networkAccountUi";
import { useNetworkAccountActions } from "../network/useNetworkAccountActions";

/**
 * API Credentials — security / integration-health metadata view.
 *
 * Primary source: GET /marketplace/accounts (integrations:read) -> toNetworkAccountDto per account.
 * Enrichment:     GET /suppliers (campaigns:read) for display names and for networks that have
 *                 no credentials configured at all. Optional: a 403 here only hides the
 *                 "not configured" rows and falls back to platform keys.
 *
 * Never rendered: key values, tokens, masked keys, passwords, authorization headers. The account
 * DTO is reduced to an explicit allowlist before it enters React state (see networkAccountContract).
 */

const EMPTY_FILTERS = { network: "", environment: "", credentialHealth: "", authType: "", configured: "" };

export function ApiCredentialsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canReadNetworks = hasPermission(user, PERMISSIONS.CAMPAIGNS_READ);

  const credentials = useApi("/marketplace/accounts");
  const networks = useApi("/suppliers", {}, { enabled: canReadNetworks });

  const [filters, setFilters] = useState(() => ({ ...EMPTY_FILTERS, network: searchParams.get("network") || "" }));
  useEffect(() => {
    const fromQuery = searchParams.get("network") || "";
    if (fromQuery) setFilters((current) => ({ ...current, network: fromQuery }));
  }, [searchParams]);

  const actions = useNetworkAccountActions({
    onChanged: () => {
      credentials.reload().catch(() => {});
      if (canReadNetworks) networks.reload().catch(() => {});
    },
  });

  const networkList = useMemo(() => (Array.isArray(networks.data?.data) ? networks.data.data : []), [networks.data]);
  const byPlatform = useMemo(() => indexNetworksByPlatform(networkList), [networkList]);

  const rows = useMemo(() => {
    const accountRows = flattenMarketplaceAccounts(credentials.data?.result).map((account) => {
      const network = byPlatform.get(String(account.platform).toLowerCase()) || null;
      return {
        id: account.id || `${account.platform}:${account.accountLabel}`,
        networkKey: network?.key || null,
        networkName: network?.name || null,
        network,
        account,
        configured: account.credentialsConfigured !== false,
      };
    });
    // Networks that require credentials but have none configured (from /suppliers when readable).
    const coveredKeys = new Set(accountRows.map((r) => r.networkKey).filter(Boolean));
    const missing = networkList
      .filter((n) => !n.credentialsConfigured && !coveredKeys.has(n.key))
      .map((n) => ({
        id: `missing:${n.key}`,
        networkKey: n.key,
        networkName: n.name,
        network: n,
        account: null,
        configured: false,
      }));
    return [...accountRows, ...missing];
  }, [credentials.data, networkList, byPlatform]);

  const networkOptions = useMemo(() => {
    const seen = new Map();
    for (const row of rows) {
      const value = row.networkKey || row.account?.platform;
      if (value && !seen.has(value)) seen.set(value, row.networkName || value);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        const networkValue = row.networkKey || row.account?.platform || "";
        if (filters.network && networkValue !== filters.network && row.account?.platform !== filters.network) return false;
        if (filters.environment && (row.account?.environment || null) !== filters.environment) return false;
        const health = row.account ? row.account.credentialHealth : "NOT_CONFIGURED";
        if (filters.credentialHealth && health !== filters.credentialHealth) return false;
        if (filters.authType && (row.account?.authType || null) !== filters.authType) return false;
        if (filters.configured === "yes" && !row.configured) return false;
        if (filters.configured === "no" && row.configured) return false;
        return true;
      }),
    [rows, filters],
  );

  const authTypeOptions = useMemo(() => {
    const values = new Set(rows.map((r) => r.account?.authType).filter(Boolean));
    return [...values].map((v) => ({ value: v, label: authTypeLabel(v) }));
  }, [rows]);

  const columns = useMemo(
    () => [
      {
        key: "network",
        label: "Network",
        minWidth: 160,
        render: (row) =>
          row.networkKey ? (
            <Link to={`/network/accounts/${encodeURIComponent(row.networkKey)}`} className="font-medium text-indigo-700 hover:underline" onClick={(e) => e.stopPropagation()}>
              {row.networkName || row.networkKey}
            </Link>
          ) : (
            <span className="font-mono text-xs text-slate-700">{row.account?.platform}</span>
          ),
      },
      {
        key: "account",
        label: "Account",
        minWidth: 150,
        render: (row) =>
          row.account ? (
            <div className="min-w-0">
              <span className="block truncate text-slate-800">{row.account.accountLabel || "—"}</span>
              <span className="block truncate font-mono text-[11px] text-slate-400">{row.account.platform}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">No account connected</span>
          ),
      },
      { key: "authType", label: "Authentication", minWidth: 110, render: (row) => (row.account ? authTypeLabel(row.account.authType) : <span className="text-xs text-slate-400">—</span>) },
      { key: "configured", label: "Credential", minWidth: 100, render: (row) => <BoolBadge value={row.configured} yes="Configured" no="Missing" /> },
      { key: "credentialHealth", label: "Credential health", minWidth: 130, render: (row) => <EnumBadge value={row.account ? row.account.credentialHealth : "NOT_CONFIGURED"} /> },
      { key: "environment", label: "Environment", minWidth: 100, render: (row) => <EnumBadge value={row.account?.environment} emptyLabel="—" /> },
      { key: "tokenExpiresAt", label: "Token expiry", minWidth: 120, title: "Null for static API keys; the backend does not report refresh support", render: (row) => <DateCell value={row.account?.tokenExpiresAt} /> },
      { key: "lastAuthCheckAt", label: "Last credential check", minWidth: 140, render: (row) => <DateCell value={row.account?.lastAuthCheckAt} /> },
      { key: "lastSuccessfulSync", label: "Last successful sync", minWidth: 140, render: (row) => <DateCell value={row.account?.lastSuccessfulSync} /> },
      {
        key: "lastSyncError",
        label: "Last error",
        minWidth: 180,
        render: (row) =>
          row.account?.lastSyncError ? (
            <Truncate className="text-xs text-rose-700" title={row.account.lastSyncError}>
              {row.account.lastSyncError}
            </Truncate>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      { key: "syncEnabled", label: "Sync", minWidth: 70, defaultHidden: true, render: (row) => <BoolBadge value={row.account ? row.account.syncEnabled : null} yes="On" no="Off" /> },
      { key: "financeSyncEnabled", label: "Finance sync", minWidth: 90, defaultHidden: true, render: (row) => <BoolBadge value={row.account ? row.account.financeSyncEnabled : null} yes="On" no="Off" /> },
      { key: "connectedAt", label: "Connected", minWidth: 130, defaultHidden: true, render: (row) => <DateCell value={row.account?.connectedAt} /> },
      { key: "updatedAt", label: "Updated", minWidth: 130, defaultHidden: true, render: (row) => <DateCell value={row.account?.updatedAt} /> },
      { key: "secretRef", label: "Secret reference", minWidth: 220, defaultHidden: true, title: "Opaque secret-manager reference, not a secret", render: (row) => <MonoChip value={row.account?.secretRef} /> },
      {
        key: "actions",
        label: "",
        minWidth: 60,
        render: (row) => (
          <ActionMenu
            items={[
              { label: "View network account", visible: Boolean(row.networkKey), onClick: () => navigate(`/network/accounts/${encodeURIComponent(row.networkKey)}`) },
              {
                label: "Disconnect",
                danger: true,
                visible: actions.disconnectAllowed(row.account),
                onClick: () => actions.requestDisconnect(row.network || { key: row.account?.platform, name: row.account?.platform }, row.account),
              },
            ]}
          />
        ),
      },
    ],
    [actions, navigate],
  );

  const summary = useMemo(() => {
    const withAccount = rows.filter((r) => r.account);
    const healthy = withAccount.filter((r) => r.account.credentialHealth === "HEALTHY").length;
    const attention = withAccount.filter((r) => ["EXPIRED", "FAILED"].includes(r.account.credentialHealth)).length;
    const missing = rows.filter((r) => !r.configured).length;
    return { total: withAccount.length, healthy, attention, missing };
  }, [rows]);

  return (
    <PageLayout
      title="API Credentials"
      subtitle="Credential configuration and health per network account. Metadata only: no key, token or secret value is ever returned by the backend or rendered here."
      actions={
        actions.canManage ? (
          <Link to="/integrations">
            <Button variant="secondary">Manage credentials (legacy Integrations)</Button>
          </Link>
        ) : null
      }
    >
      {!canReadNetworks ? (
        <NoticeBar tone="info">
          Your role does not include campaigns:read, so network display names and networks with no credentials configured are not shown.
        </NoticeBar>
      ) : networks.error ? (
        <NoticeBar tone="warning">Network list could not be loaded ({redactCredentialText(networks.error)}); showing connected accounts only.</NoticeBar>
      ) : null}

      <FilterBar
        filters={[
          { key: "network", label: "Network", allLabel: "All networks", options: networkOptions },
          { key: "environment", label: "Environment", allLabel: "All environments", options: [{ value: "PRODUCTION", label: "Production" }, { value: "SANDBOX", label: "Sandbox" }] },
          {
            key: "credentialHealth",
            label: "Credential health",
            allLabel: "All credential health",
            options: ["HEALTHY", "UNKNOWN", "EXPIRED", "FAILED", "NOT_CONFIGURED"].map((v) => ({ value: v, label: v.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) })),
          },
          { key: "authType", label: "Authentication", allLabel: "All auth types", options: authTypeOptions },
          { key: "configured", label: "Configured", allLabel: "Configured: any", options: [{ value: "yes", label: "Configured" }, { value: "no", label: "Missing" }] },
        ]}
        values={filters}
        onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      <p className="text-xs text-slate-500">
        {credentials.loading
          ? "Loading credential metadata…"
          : `${summary.total} credentialed account(s) · ${summary.healthy} healthy · ${summary.attention} expired or failed · ${summary.missing} network(s) without credentials` +
            (filtered.length !== rows.length ? ` · ${filtered.length} row(s) match the current filters` : "")}
      </p>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={credentials.loading}
        error={redactCredentialText(credentials.error)}
        onRetry={() => credentials.reload().catch(() => {})}
        onRefresh={() => {
          credentials.reload().catch(() => {});
          if (canReadNetworks) networks.reload().catch(() => {});
        }}
        dense
        emptyTitle="No credentials configured"
        emptyDescription={rows.length ? "No rows match the current filters." : "The backend has no connected network accounts."}
      />

      {actions.dialogs}
    </PageLayout>
  );
}
