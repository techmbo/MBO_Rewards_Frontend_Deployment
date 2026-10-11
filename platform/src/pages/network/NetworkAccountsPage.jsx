import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageLayout } from "../../components/layout/PageLayout";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { DateCell, MonoChip, Truncate } from "../../components/ui/TableCells";
import { useNetworkAccounts } from "../../hooks/useNetworkAccounts";
import { redactCredentialText } from "./networkAccountContract";
import { BoolBadge, EnumBadge, NoticeBar, NumberCell, SyncStatusStrip } from "./networkAccountUi";
import { useNetworkAccountActions } from "./useNetworkAccountActions";

// Server-side filters map 1:1 onto GET /suppliers query params. Values are the backend enums.
const SERVER_FILTERS = [
  { key: "q", type: "search", label: "network", placeholder: "Search network name or key" },
  {
    key: "connectionStatus",
    label: "Connection",
    allLabel: "All connections",
    options: [
      { value: "CONNECTED", label: "Connected" },
      { value: "NOT_CONFIGURED", label: "Not configured" },
      { value: "PLANNED", label: "Planned" },
    ],
  },
  {
    key: "dataHealth",
    label: "Data health",
    allLabel: "All data health",
    options: [
      { value: "HEALTHY", label: "Healthy" },
      { value: "PARTIAL", label: "Partial" },
      { value: "NEEDS_REVIEW", label: "Needs review" },
      { value: "ERROR", label: "Error" },
      { value: "NO_RECENT_DATA", label: "No recent data" },
      { value: "NOT_CONFIGURED", label: "Not configured" },
    ],
  },
];

// Account-level filters are applied client-side. This is safe because GET /suppliers is not
// paginated: every registered network and every account row is already loaded.
const CLIENT_FILTERS = [
  {
    key: "environment",
    label: "Environment",
    allLabel: "All environments",
    options: [
      { value: "PRODUCTION", label: "Production" },
      { value: "SANDBOX", label: "Sandbox" },
    ],
  },
  {
    key: "credentialHealth",
    label: "Credential health",
    allLabel: "All credential health",
    options: [
      { value: "HEALTHY", label: "Healthy" },
      { value: "UNKNOWN", label: "Unknown" },
      { value: "EXPIRED", label: "Expired" },
      { value: "FAILED", label: "Failed" },
      { value: "NOT_CONFIGURED", label: "Not configured" },
    ],
  },
  {
    key: "syncEnabled",
    label: "Sync enabled",
    allLabel: "Sync enabled: any",
    options: [
      { value: "yes", label: "Sync enabled" },
      { value: "no", label: "Sync disabled" },
    ],
  },
];

const EMPTY_FILTERS = { q: "", connectionStatus: "", dataHealth: "", environment: "", credentialHealth: "", syncEnabled: "" };

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function rowCredentialHealth(row) {
  if (row.account) return row.account.credentialHealth;
  return row.network.credentialsConfigured ? null : "NOT_CONFIGURED";
}

function matchesClientFilters(row, filters) {
  if (filters.environment && (row.account?.environment || null) !== filters.environment) return false;
  if (filters.credentialHealth && (rowCredentialHealth(row) || null) !== filters.credentialHealth) return false;
  if (filters.syncEnabled) {
    if (!row.account) return false;
    const enabled = row.account.syncEnabled !== false;
    if (filters.syncEnabled === "yes" && !enabled) return false;
    if (filters.syncEnabled === "no" && enabled) return false;
  }
  return true;
}

export function NetworkAccountsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debouncedQ = useDebounced(filters.q);

  const serverFilters = useMemo(
    () => ({
      q: debouncedQ || undefined,
      connectionStatus: filters.connectionStatus || undefined,
      dataHealth: filters.dataHealth || undefined,
    }),
    [debouncedQ, filters.connectionStatus, filters.dataHealth],
  );

  const data = useNetworkAccounts(serverFilters);
  const actions = useNetworkAccountActions({ onChanged: () => data.reload({ refresh: true }).catch(() => {}) });

  const visibleRows = useMemo(() => data.rows.filter((row) => matchesClientFilters(row, filters)), [data.rows, filters]);

  const summary = useMemo(() => {
    const connectedNetworks = data.networks.filter((n) => n.connectionStatus === "CONNECTED").length;
    const accounts = data.rows.filter((r) => r.account).length;
    return { networks: data.networks.length, connectedNetworks, accounts };
  }, [data.networks, data.rows]);

  const columns = useMemo(
    () => [
      {
        key: "network",
        label: "Network",
        minWidth: 170,
        render: (row) => (
          <div className="min-w-0">
            <Link
              to={`/network/accounts/${encodeURIComponent(row.networkKey)}`}
              className="block truncate font-medium text-indigo-700 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {row.network.name || row.networkKey}
            </Link>
            <span className="block truncate font-mono text-[11px] text-slate-400">{row.networkKey}</span>
          </div>
        ),
      },
      {
        key: "account",
        label: "Account / profile",
        minWidth: 170,
        render: (row) =>
          row.account ? (
            <div className="min-w-0">
              <span className="block truncate text-slate-800">{row.account.accountLabel || "—"}</span>
              <span className="block truncate font-mono text-[11px] text-slate-400">
                {row.account.platform}
                {row.account.accountExternalId ? ` · ${row.account.accountExternalId}` : ""}
              </span>
            </div>
          ) : row.detailError ? (
            <span className="text-xs text-rose-600" title={row.detailError}>
              Account details unavailable
            </span>
          ) : (
            <span className="text-xs text-slate-400">No account connected</span>
          ),
      },
      { key: "environment", label: "Environment", minWidth: 110, render: (row) => <EnumBadge value={row.account?.environment} emptyLabel="—" /> },
      { key: "connectionStatus", label: "Connection", minWidth: 120, render: (row) => <EnumBadge value={row.network.connectionStatus} /> },
      { key: "integrationStatus", label: "Integration", minWidth: 120, render: (row) => <EnumBadge value={row.network.integrationStatus} /> },
      { key: "syncStatus", label: "Sync status", minWidth: 110, render: (row) => <EnumBadge value={row.network.syncStatus} /> },
      { key: "credentialHealth", label: "Credential health", minWidth: 130, render: (row) => <EnumBadge value={rowCredentialHealth(row)} /> },
      { key: "syncEnabled", label: "Sync", minWidth: 80, render: (row) => <BoolBadge value={row.account ? row.account.syncEnabled : null} yes="On" no="Off" /> },
      { key: "financeSyncEnabled", label: "Finance sync", minWidth: 100, render: (row) => <BoolBadge value={row.account ? row.account.financeSyncEnabled : null} yes="On" no="Off" /> },
      {
        key: "lastSuccessfulSync",
        label: "Last successful sync",
        minWidth: 140,
        title: "Account-level when an account exists, otherwise the network-level value",
        render: (row) => <DateCell value={row.account ? row.account.lastSuccessfulSync : row.network.lastSuccessfulSync} />,
      },
      { key: "lastAttemptedSync", label: "Last attempted sync", minWidth: 140, defaultHidden: true, render: (row) => <DateCell value={row.network.lastAttemptedSync} /> },
      {
        key: "lastSyncError",
        label: "Last sync error",
        minWidth: 160,
        render: (row) =>
          row.account?.lastSyncError ? (
            <Truncate className="text-xs text-rose-700" title={row.account.lastSyncError}>
              {row.account.lastSyncError}
            </Truncate>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      { key: "dataHealth", label: "Data health", minWidth: 120, render: (row) => <EnumBadge value={row.network.dataHealth} /> },
      { key: "importedCampaigns", label: "Campaigns (network)", minWidth: 110, title: "Imported campaigns for the whole network, not per account", render: (row) => <NumberCell value={row.network.metrics?.importedCampaigns} /> },
      { key: "importedCoupons", label: "Coupons (network)", minWidth: 110, render: (row) => <NumberCell value={row.network.metrics?.importedCoupons} /> },
      { key: "importedPerformance", label: "Performance rows (network)", minWidth: 120, defaultHidden: true, render: (row) => <NumberCell value={row.network.metrics?.importedPerformance} /> },
      { key: "openErrors", label: "Open mapper errors", minWidth: 110, render: (row) => <NumberCell value={row.network.metrics?.openMapperErrors} /> },
      { key: "syncFrequencyMinutes", label: "Sync cadence (min)", minWidth: 110, defaultHidden: true, render: (row) => <NumberCell value={row.account?.syncFrequencyMinutes ?? row.network.syncFrequencyMinutes} /> },
      { key: "authType", label: "Auth type", minWidth: 90, defaultHidden: true, render: (row) => (row.account?.authType ? <MonoChip value={row.account.authType} /> : <span className="text-xs text-slate-400">—</span>) },
      { key: "connectedAt", label: "Connected at", minWidth: 130, defaultHidden: true, render: (row) => <DateCell value={row.account?.connectedAt} /> },
      {
        key: "actions",
        label: "",
        minWidth: 60,
        render: (row) => (
          // Stop the click from reaching the row handler, which would navigate to the detail page.
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <ActionMenu
            items={[
              { label: "View network account", onClick: () => navigate(`/network/accounts/${encodeURIComponent(row.networkKey)}`) },
              {
                label: "Trigger sync",
                visible: actions.syncAllowed(row.network, row.account),
                onClick: () => actions.requestSync(row.network, row.account),
              },
              {
                label: "Disconnect",
                danger: true,
                visible: actions.disconnectAllowed(row.account),
                onClick: () => actions.requestDisconnect(row.network, row.account),
              },
            ]}
          />
          </div>
        ),
      },
    ],
    [navigate, actions],
  );

  return (
    <PageLayout
      title="Network Accounts"
      subtitle="Connected publisher / network accounts, their connection, credential and sync state. One row per account; networks without an account are listed as not configured."
      actions={
        actions.canManage ? (
          <Link to="/integrations">
            <Button variant="secondary">Connect account (legacy Integrations)</Button>
          </Link>
        ) : null
      }
    >
      <SyncStatusStrip liveSync={data.liveSync} scheduler={data.scheduler} />

      {actions.lastSyncMessage ? (
        <NoticeBar tone="info">
          Sync request for <span className="font-mono">{actions.lastSyncMessage.platform}/{actions.lastSyncMessage.accountLabel}</span>:{" "}
          {redactCredentialText(actions.lastSyncMessage.message) || `status ${actions.lastSyncMessage.status || "unknown"}`}. Use Refresh to pick up
          the result once the backend finishes.
        </NoticeBar>
      ) : null}

      {Object.keys(data.detailErrors).length ? (
        <NoticeBar tone="warning">
          Account details could not be loaded for: {Object.keys(data.detailErrors).join(", ")}. Network-level status is still shown
          for those rows.
        </NoticeBar>
      ) : null}

      <FilterBar
        filters={[...SERVER_FILTERS, ...CLIENT_FILTERS]}
        values={filters}
        onChange={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onReset={() => setFilters(EMPTY_FILTERS)}
      />

      <p className="text-xs text-slate-500">
        {data.loading
          ? "Loading networks…"
          : `${summary.networks} registered network(s) · ${summary.connectedNetworks} connected · ${summary.accounts} account(s)` +
            (data.detailsLoading ? " · loading account details…" : "") +
            (visibleRows.length !== data.rows.length ? ` · ${visibleRows.length} row(s) match the current filters` : "")}
      </p>

      <DataTable
        columns={columns}
        rows={visibleRows}
        loading={data.loading}
        error={data.error}
        onRetry={() => data.reload().catch(() => {})}
        onRefresh={() => data.reload({ refresh: true }).catch(() => {})}
        onRowClick={(row) => navigate(`/network/accounts/${encodeURIComponent(row.networkKey)}`)}
        dense
        emptyTitle="No network accounts"
        emptyDescription={
          data.rows.length
            ? "No rows match the current filters."
            : "The backend returned no registered networks. Nothing is connected or registered yet."
        }
      />

      {actions.dialogs}
    </PageLayout>
  );
}
