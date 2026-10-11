import { useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { PageLayout } from "../../components/layout/PageLayout";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingState } from "../../components/ui/LoadingState";
import { Select } from "../../components/ui/FormControls";
import { DateCell, MonoChip, Truncate } from "../../components/ui/TableCells";
import { useAuth } from "../../context/AuthContext";
import { useApi } from "../../hooks/useApi";
import { useSyncRuns } from "../../hooks/useSyncRuns";
import { networkDetailPath, redactCredentialText, toAccountView } from "./networkAccountContract";
import { authTypeLabel, humanize } from "./networkAccountFormat";
import { BoolBadge, EnumBadge, FieldGrid, NoticeBar, NumberCell, Section, SyncStatusStrip } from "./networkAccountUi";
import { useNetworkAccountActions } from "./useNetworkAccountActions";

const CAPABILITY_ORDER = ["campaigns", "coupons", "tracking", "conversions", "performance", "orders", "payments"];

export function NetworkAccountDetailPage() {
  const { key } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canReadSyncRuns = hasPermission(user, PERMISSIONS.OPS_READ);

  const { data, loading, error, reload } = useApi(networkDetailPath(key));
  const network = data?.data ?? null;
  const accounts = useMemo(() => (network?.accounts || []).map(toAccountView).filter(Boolean), [network]);

  const actions = useNetworkAccountActions({ onChanged: () => reload().catch(() => {}) });

  // Recent sync runs: filter by a selected account (networkAccountId) or by platform (network).
  const selectedAccountId = searchParams.get("account") || "";
  const platforms = network?.syncPlatforms?.length ? network.syncPlatforms : network?.regions || [];
  const [platform, setPlatform] = useState("");
  const effectivePlatform = platform || platforms[0] || "";
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId) || null;
  const syncRunFilters = useMemo(
    () => (selectedAccount ? { networkAccountId: selectedAccount.id } : effectivePlatform ? { network: effectivePlatform } : {}),
    [selectedAccount, effectivePlatform],
  );
  const syncRuns = useSyncRuns(syncRunFilters, { pageSize: 20, enabled: canReadSyncRuns && Boolean(network) && Object.keys(syncRunFilters).length > 0 });

  const selectAccount = useCallback(
    (id) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("account", id);
      else next.delete("account");
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const accountColumns = useMemo(
    () => [
      {
        key: "accountLabel",
        label: "Account",
        minWidth: 150,
        render: (a) => (
          <div className="min-w-0">
            <span className="block truncate font-medium text-slate-800">{a.accountLabel || "—"}</span>
            <span className="block truncate font-mono text-[11px] text-slate-400">{a.platform}</span>
          </div>
        ),
      },
      { key: "accountExternalId", label: "External ID", minWidth: 120, render: (a) => <MonoChip value={a.accountExternalId} /> },
      { key: "environment", label: "Environment", minWidth: 100, render: (a) => <EnumBadge value={a.environment} /> },
      { key: "authType", label: "Auth", minWidth: 90, render: (a) => authTypeLabel(a.authType) },
      { key: "credentialsConfigured", label: "Credential", minWidth: 100, render: (a) => <BoolBadge value={a.credentialsConfigured} yes="Configured" no="Missing" /> },
      { key: "credentialHealth", label: "Credential health", minWidth: 120, render: (a) => <EnumBadge value={a.credentialHealth} /> },
      { key: "syncEnabled", label: "Sync", minWidth: 70, render: (a) => <BoolBadge value={a.syncEnabled} yes="On" no="Off" /> },
      { key: "financeSyncEnabled", label: "Finance sync", minWidth: 90, render: (a) => <BoolBadge value={a.financeSyncEnabled} yes="On" no="Off" /> },
      { key: "lastSuccessfulSync", label: "Last successful sync", minWidth: 140, render: (a) => <DateCell value={a.lastSuccessfulSync} /> },
      { key: "lastAuthCheckAt", label: "Last auth check", minWidth: 130, render: (a) => <DateCell value={a.lastAuthCheckAt} /> },
      { key: "tokenExpiresAt", label: "Token expiry", minWidth: 120, render: (a) => <DateCell value={a.tokenExpiresAt} /> },
      { key: "syncFrequencyMinutes", label: "Cadence (min)", minWidth: 90, defaultHidden: true, render: (a) => <NumberCell value={a.syncFrequencyMinutes} /> },
      { key: "connectedAt", label: "Connected", minWidth: 130, defaultHidden: true, render: (a) => <DateCell value={a.connectedAt} /> },
      { key: "secretRef", label: "Secret reference", minWidth: 200, defaultHidden: true, title: "Opaque secret-manager reference, not a secret", render: (a) => <MonoChip value={a.secretRef} /> },
      {
        key: "lastSyncError",
        label: "Last sync error",
        minWidth: 180,
        render: (a) =>
          a.lastSyncError ? (
            <Truncate className="text-xs text-rose-700" title={a.lastSyncError}>
              {a.lastSyncError}
            </Truncate>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: "actions",
        label: "",
        minWidth: 200,
        render: (a) => (
          <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant={selectedAccountId === a.id ? "primary" : "ghost"} onClick={() => selectAccount(selectedAccountId === a.id ? "" : a.id)}>
              {selectedAccountId === a.id ? "Runs: selected" : "Show runs"}
            </Button>
            {actions.syncAllowed(network, a) ? (
              <Button size="sm" variant="secondary" onClick={() => actions.requestSync(network, a)}>
                Trigger sync
              </Button>
            ) : null}
            {actions.disconnectAllowed(a) ? (
              <Button size="sm" variant="danger" onClick={() => actions.requestDisconnect(network, a)}>
                Disconnect
              </Button>
            ) : null}
          </div>
        ),
      },
    ],
    [network, actions, selectedAccountId, selectAccount],
  );

  const syncRunColumns = useMemo(
    () => [
      { key: "sourceObject", label: "Source object", minWidth: 130, render: (r) => <MonoChip value={r.sourceObject} /> },
      { key: "status", label: "Status", minWidth: 100, render: (r) => <EnumBadge value={r.status} /> },
      { key: "jobType", label: "Job type", minWidth: 100, render: (r) => humanize(r.jobType) },
      { key: "trigger", label: "Trigger", minWidth: 90, render: (r) => r.trigger || "—" },
      { key: "startedAt", label: "Started", minWidth: 130, render: (r) => <DateCell value={r.startedAt} /> },
      { key: "finishedAt", label: "Finished", minWidth: 130, render: (r) => <DateCell value={r.finishedAt} /> },
      { key: "recordsFetched", label: "Fetched", minWidth: 80, render: (r) => <NumberCell value={r.recordsFetched} /> },
      { key: "recordsCreated", label: "Created", minWidth: 80, render: (r) => <NumberCell value={r.recordsCreated} /> },
      { key: "recordsUpdated", label: "Updated", minWidth: 80, render: (r) => <NumberCell value={r.recordsUpdated} /> },
      { key: "recordsUnchanged", label: "Unchanged", minWidth: 90, defaultHidden: true, render: (r) => <NumberCell value={r.recordsUnchanged} /> },
      { key: "recordsQuarantined", label: "Quarantined", minWidth: 100, render: (r) => <NumberCell value={r.recordsQuarantined} /> },
      { key: "retryCount", label: "Retries", minWidth: 80, render: (r) => <NumberCell value={r.retryCount} /> },
      { key: "endpoint", label: "Endpoint", minWidth: 160, defaultHidden: true, render: (r) => <MonoChip value={r.endpoint} /> },
      {
        key: "errorMessage",
        label: "Error",
        minWidth: 200,
        render: (r) =>
          r.errorCode || r.errorMessage ? (
            <Truncate className="text-xs text-rose-700" title={`${r.errorCode ? `[${r.errorCode}] ` : ""}${r.errorMessage || ""}`}>
              {r.errorCode ? `[${r.errorCode}] ` : ""}
              {r.errorMessage || ""}
            </Truncate>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      { key: "syncRunId", label: "Run ID", minWidth: 200, defaultHidden: true, render: (r) => <MonoChip value={r.syncRunId} /> },
    ],
    [],
  );

  const sourceObjectColumns = useMemo(
    () => [
      { key: "label", label: "Object", minWidth: 140, render: (s) => s.label || s.sourceObject || "—" },
      { key: "sourceObject", label: "Source key", minWidth: 120, render: (s) => <MonoChip value={s.sourceObject} /> },
      { key: "endpoint", label: "Endpoint", minWidth: 180, render: (s) => <MonoChip value={s.endpoint} /> },
      { key: "live", label: "Live", minWidth: 70, render: (s) => <BoolBadge value={Boolean(s.live)} yes="Live" no="Not live" /> },
      { key: "availability", label: "Availability", minWidth: 110, render: (s) => <EnumBadge value={s.availability} emptyLabel="—" /> },
      { key: "lastRunStatus", label: "Last run", minWidth: 100, render: (s) => <EnumBadge value={s.lastRun?.status} emptyLabel="No run recorded" /> },
      { key: "lastRunStarted", label: "Started", minWidth: 130, render: (s) => <DateCell value={s.lastRun?.startedAt} /> },
      { key: "lastRunFinished", label: "Finished", minWidth: 130, render: (s) => <DateCell value={s.lastRun?.finishedAt} /> },
      { key: "lastRunRecords", label: "Records", minWidth: 80, render: (s) => <NumberCell value={s.lastRun?.recordsFetched ?? s.lastRun?.recordCount} /> },
      { key: "notes", label: "Notes", minWidth: 160, defaultHidden: true, render: (s) => (s.notes ? <Truncate title={s.notes}>{s.notes}</Truncate> : "—") },
    ],
    [],
  );

  const title = network ? `${network.name || network.key}` : "Network account";

  return (
    <PageLayout
      title={title}
      subtitle={network ? `Network Accounts · ${network.key}` : "Network Accounts"}
      actions={
        <>
          <Link to="/network/accounts">
            <Button variant="secondary">Back to Network Accounts</Button>
          </Link>
          <Link to={`/integrity/api-credentials?network=${encodeURIComponent(key)}`}>
            <Button variant="secondary">API Credentials</Button>
          </Link>
        </>
      }
    >
      {loading ? <LoadingState label="Loading network account…" /> : null}
      {error && !loading ? <ErrorState message={redactCredentialText(error)} onRetry={() => reload().catch(() => {})} /> : null}

      {network ? (
        <div className="space-y-6">
          <SyncStatusStrip liveSync={network.syncHealth?.liveSync} scheduler={network.syncHealth?.scheduler} />

          {actions.lastSyncMessage ? (
            <NoticeBar tone="info">
              Sync request for <span className="font-mono">{actions.lastSyncMessage.platform}/{actions.lastSyncMessage.accountLabel}</span>:{" "}
              {redactCredentialText(actions.lastSyncMessage.message) || `status ${actions.lastSyncMessage.status || "unknown"}`}.
            </NoticeBar>
          ) : null}

          <Section title="Overview" subtitle="Network-level status derived by the backend from credential evidence, sync logs and imported data">
            <FieldGrid
              columns={4}
              fields={[
                { label: "Network key", value: network.key, type: "mono" },
                { label: "Integration status", value: network.integrationStatus, type: "enum" },
                { label: "Connection status", value: network.connectionStatus, type: "enum" },
                { label: "Sync status", value: network.syncStatus, type: "enum" },
                { label: "Data health", value: network.dataHealth, type: "enum" },
                { label: "Mapping status", value: network.mapping?.status, type: "enum" },
                { label: "Seed status", value: network.seedStatus, type: "enum" },
                { label: "Connected accounts", value: network.accountCount, type: "number" },
                { label: "Platforms", value: network.regions },
                { label: "Manual sync platforms", value: network.syncPlatforms },
                { label: "Credentials configured", value: network.credentialsConfigured, type: "bool" },
                { label: "Record updated", value: network.updatedAt, type: "date" },
              ]}
            />
            {network.mapping?.issues?.length ? (
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {network.mapping.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
            {network.catalogNotes?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                {network.catalogNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </Section>

          <Section
            title="Connection"
            subtitle="Connected accounts / profiles for this network. Credential values are never returned by the backend."
            actions={
              actions.canManage ? (
                <Link to="/integrations">
                  <Button size="sm" variant="secondary">Connect account (legacy Integrations)</Button>
                </Link>
              ) : null
            }
          >
            <DataTable
              columns={accountColumns}
              rows={accounts}
              dense
              showColumnPicker
              onRowClick={(a) => selectAccount(selectedAccountId === a.id ? "" : a.id)}
              rowClassName={(a) => (a.id === selectedAccountId ? "bg-indigo-50/60" : "")}
              emptyTitle="No account connected"
              emptyDescription="This network has no connected account. Connect one through the legacy Integrations page until the native connect flow ships."
            />
          </Section>

          <Section title="Sync" subtitle="Sync health reported by the backend. Counts that the sync log does not persist are shown as not available.">
            <FieldGrid
              columns={4}
              fields={[
                { label: "Last successful sync", value: network.syncHealth?.lastSuccessfulSync, type: "date" },
                { label: "Last failed sync", value: network.syncHealth?.lastFailedSync, type: "date" },
                { label: "Last attempted sync", value: network.lastAttemptedSync, type: "date" },
                { label: "Last job status", value: network.syncHealth?.lastSyncJobStatus, type: "enum" },
                { label: "Duration (ms)", value: network.syncHealth?.durationMs, type: "number" },
                { label: "Records processed", value: network.syncHealth?.recordsProcessed, type: "number" },
                { label: "Records created", value: network.syncHealth?.recordsCreated, type: "number" },
                { label: "Records updated", value: network.syncHealth?.recordsUpdated, type: "number" },
                { label: "Records rejected", value: network.syncHealth?.recordsRejected, type: "number" },
                { label: "Error count", value: network.syncHealth?.errorCount, type: "number" },
                { label: "Sync cadence (min)", value: network.syncFrequencyMinutes, type: "number" },
                { label: "Last campaign sync", value: network.lastCampaignSyncAt, type: "date" },
                { label: "Last coupon sync", value: network.lastCouponSyncAt, type: "date" },
                { label: "Last order sync", value: network.lastOrderSyncAt, type: "date" },
                { label: "Last payment sync", value: network.lastPaymentSyncAt, type: "date" },
                {
                  label: "Last sync message",
                  render: () =>
                    network.syncHealth?.lastSyncMessage ? (
                      <span className="text-xs text-slate-700">{redactCredentialText(network.syncHealth.lastSyncMessage)}</span>
                    ) : (
                      <span className="text-xs text-slate-400">Not available</span>
                    ),
                },
              ]}
            />
            {network.pipeline?.length ? (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pipeline stages</p>
                <div className="flex flex-wrap gap-2">
                  {network.pipeline.map((stage) => (
                    <span key={stage.stage} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                      {humanize(stage.stage)}
                      <EnumBadge value={stage.status} />
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Source objects</p>
              <DataTable
                columns={sourceObjectColumns}
                rows={(network.sourceObjects || []).map((s) => ({ ...s, id: s.sourceObject }))}
                dense
                showColumnPicker={false}
                emptyTitle="No source objects catalogued"
                emptyDescription="The backend source-object catalog has no entries for this network."
              />
            </div>
          </Section>

          <Section title="Capabilities" subtitle="Capability state per resource and the backend's coverage assessment">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {CAPABILITY_ORDER.map((resource) => {
                const cap = network.capabilities?.[resource];
                const cov = network.coverage?.[resource];
                return (
                  <div key={resource} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{humanize(resource)}</span>
                      <EnumBadge value={cap?.state} />
                    </div>
                    {cov ? (
                      <dl className="mt-2 space-y-1 text-xs text-slate-600">
                        <div className="flex justify-between gap-2"><dt>Health</dt><dd><EnumBadge value={cov.health} emptyLabel="—" /></dd></div>
                        <div className="flex justify-between gap-2"><dt>Imported</dt><dd><NumberCell value={cov.importedCount} /></dd></div>
                        <div className="flex justify-between gap-2"><dt>Promoted</dt><dd><NumberCell value={cov.promotedCount} /></dd></div>
                        <div className="flex justify-between gap-2"><dt>Linked</dt><dd><NumberCell value={cov.linkedCount} /></dd></div>
                        <div className="flex justify-between gap-2"><dt>Last synced</dt><dd><DateCell value={cov.lastSyncedAt} /></dd></div>
                      </dl>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {network.coverage?.brands ? (
              <p className="mt-3 text-xs text-slate-500">
                Brands coverage: <EnumBadge value={network.coverage.brands.health} /> · linked merchants{" "}
                <NumberCell value={network.coverage.brands.linkedCount} />
              </p>
            ) : null}
          </Section>

          <Section
            title="Credential health"
            subtitle="Per-account credential state. Metadata only; see API Credentials for the cross-network view."
            actions={
              <Link to={`/integrity/api-credentials?network=${encodeURIComponent(key)}`}>
                <Button size="sm" variant="secondary">Open API Credentials</Button>
              </Link>
            }
          >
            {accounts.length ? (
              <FieldGrid
                columns={3}
                fields={accounts.map((a) => ({
                  label: `${a.accountLabel} · ${a.platform}`,
                  render: () => (
                    <div className="flex flex-wrap items-center gap-2">
                      <EnumBadge value={a.credentialHealth} />
                      <span className="text-xs text-slate-500">{authTypeLabel(a.authType)}</span>
                      {a.lastAuthCheckAt ? (
                        <span className="text-xs text-slate-500">
                          checked <DateCell value={a.lastAuthCheckAt} />
                        </span>
                      ) : null}
                    </div>
                  ),
                }))}
              />
            ) : (
              <p className="text-sm text-slate-500">No credentials are configured for this network.</p>
            )}
          </Section>

          <Section
            title="Recent sync runs"
            subtitle={
              selectedAccount
                ? `Runs recorded for account "${selectedAccount.accountLabel}" (${selectedAccount.platform})`
                : effectivePlatform
                  ? `Runs recorded for platform ${effectivePlatform}. Select an account above to narrow to that account.`
                  : "No platform is registered for manual sync on this network."
            }
            actions={
              !selectedAccount && platforms.length > 1 ? (
                <Select
                  className="min-w-[180px]"
                  value={effectivePlatform}
                  onChange={(e) => setPlatform(e.target.value)}
                  options={platforms.map((p) => ({ value: p, label: p }))}
                />
              ) : null
            }
          >
            {!canReadSyncRuns ? (
              <NoticeBar tone="info">Your role does not include ops:read, so sync run history is not shown.</NoticeBar>
            ) : Object.keys(syncRunFilters).length === 0 ? (
              <NoticeBar tone="info">Sync runs cannot be queried for this network because it has no platform or account identifier.</NoticeBar>
            ) : (
              <DataTable
                columns={syncRunColumns}
                rows={syncRuns.rows.map((r) => ({ ...r, id: r.syncRunId }))}
                loading={syncRuns.loading}
                error={syncRuns.error}
                onRetry={() => syncRuns.reload().catch(() => {})}
                onRefresh={() => syncRuns.reload().catch(() => {})}
                page={syncRuns.page}
                totalPages={syncRuns.totalPages}
                total={syncRuns.total}
                onPageChange={syncRuns.setPage}
                dense
                emptyTitle="No sync runs recorded"
                emptyDescription="The backend has no NetworkSyncRun rows for this selection yet."
              />
            )}
          </Section>

          <Section title="Operational metadata" subtitle="Tracking parameter rules and contract metadata">
            <FieldGrid
              columns={3}
              fields={[
                { label: "Tracking confirmation", value: network.tracking?.confirmation, type: "enum" },
                { label: "Client ID param", value: network.tracking?.clientIdParam, type: "mono" },
                { label: "Assignment ID param", value: network.tracking?.assignmentIdParam, type: "mono" },
                { label: "Click ID param", value: network.tracking?.clickIdParam, type: "mono" },
                { label: "Verification flags", value: network.tracking?.verificationFlags },
                { label: "Network record ID", value: network.id, type: "mono" },
              ]}
            />
            {network.tracking?.notes?.length ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
                {network.tracking.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </Section>
        </div>
      ) : null}

      {actions.dialogs}
    </PageLayout>
  );
}
