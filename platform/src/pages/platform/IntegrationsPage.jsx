import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteApi, fetchApi, postApi } from "../../api";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { useAuth } from "../../context/AuthContext";
import {
  optionalBool,
  optionalFunc,
  optionalNode,
  optionalObject,
  optionalString,
  optionalStringOrNumber,
} from "../../utils/propValidators";
import { redactCredentialText } from "../network/networkAccountContract";

/**
 * Network Integrations — laid out to the MBO Rewards Network Operations v13 reference
 * (API Credentials view: one table of network accounts, metadata only), with the connect step in
 * v13's .modal / .form-grid.
 *
 *   GET    /marketplace/accounts                         connected accounts per platform (metadata only)
 *   POST   /marketplace/accounts/:platform/connect       save credentials (integrations:manage)
 *   DELETE /marketplace/accounts/:platform/:accountLabel  disconnect      (integrations:manage)
 *   POST   /sync/:platform/:accountLabel                 sync one account (sync:trigger)
 *   POST   /sync/all                                     full sync        (sync:trigger)
 *   GET    /sync/status                                  progress of a running sync
 *
 * Secrets live only in the open connect form and are cleared when it closes. The backend never
 * returns them; this page shows the masked value it sends back.
 */

const SECRET = "secret";
const ID = "id";
const TEXT = "text";

/*
 * Every network the backend syncs, with exactly the fields its connect endpoint accepts
 * (marketplaceAccounts.controller buildMarketplaceAccountData). Optimise is three regional
 * accounts, each with its own agency.
 */
const NETWORKS = [
  {
    platform: "boostiny",
    network: "Boostiny",
    help: "Publisher API key from your Boostiny account.",
    fields: [{ key: "apiKey", label: "API Key", kind: SECRET, required: true }],
  },
  ...[
    ["optimise_sea", "SEA", "118"],
    ["optimise_mena", "MENA", "172"],
    ["optimise_uk", "UK", "1"],
  ].map(([platform, region, agencyId]) => ({
    platform,
    network: "Optimise",
    region,
    help: `${region} service-account API key and your publisher Contact ID. Agency ID ${agencyId}.`,
    defaults: { agencyId },
    fields: [
      { key: "apiKey", label: "API Key", kind: SECRET, required: true },
      { key: "agencyId", label: "Agency ID", kind: ID, required: true },
      { key: "contactId", label: "Contact ID", kind: ID, required: true },
    ],
  })),
  {
    platform: "trackier",
    network: "Trackier / vCommission",
    help: "Trackier Publisher API key (sent as X-Api-Key).",
    fields: [{ key: "apiKey", label: "Publisher API Key", kind: SECRET, required: true }],
  },
  {
    platform: "partnerize",
    network: "Partnerize",
    help: "User Application Key and User API Key. Publisher ID is optional.",
    fields: [
      { key: "applicationKey", label: "User Application Key", kind: SECRET, required: true },
      { key: "userApiKey", label: "User API Key", kind: SECRET, required: true },
      { key: "publisherId", label: "Publisher ID", kind: ID },
    ],
  },
  {
    platform: "impact",
    network: "Impact",
    help: "Account SID and Auth Token from your Impact API settings.",
    fields: [
      { key: "accountSid", label: "Account SID", kind: ID, required: true },
      { key: "authToken", label: "Auth Token", kind: SECRET, required: true },
    ],
  },
  {
    platform: "awin",
    network: "Awin",
    help: "Awin API token (OAuth2) and your numeric Publisher ID.",
    fields: [
      { key: "apiKey", label: "API Token", kind: SECRET, required: true },
      { key: "publisherId", label: "Publisher ID", kind: ID, required: true, numeric: true },
    ],
  },
  {
    platform: "admitad",
    network: "Admitad",
    help: "Client ID and Client Secret of your Admitad app. The platform exchanges them for access tokens. Scope is optional when the server already sets one.",
    fields: [
      { key: "clientId", label: "Client ID", kind: ID, required: true },
      { key: "clientSecret", label: "Client Secret", kind: SECRET, required: true },
      { key: "scope", label: "Scope", kind: TEXT, placeholder: "Space-separated scopes of your Admitad app", wide: true },
    ],
  },
  {
    platform: "cj",
    network: "CJ",
    help: "CJ Personal Access Token, your Company ID (CID) and Website ID (PID).",
    fields: [
      { key: "apiKey", label: "Personal Access Token", kind: SECRET, required: true, wide: true },
      { key: "companyId", label: "Company ID (CID)", kind: ID, required: true, numeric: true },
      { key: "websiteId", label: "Website ID (PID)", kind: ID, required: true, numeric: true },
    ],
  },
  {
    platform: "rakuten",
    network: "Rakuten Advertising",
    help: "API access token. The Web Services security token (Advanced Reports) and Publisher ID are optional.",
    warning:
      "Rakuten access tokens expire and the platform cannot refresh them yet. When a Rakuten sync reports an expired credential, reconnect with a new token.",
    fields: [
      { key: "apiKey", label: "Access Token", kind: SECRET, required: true, wide: true },
      { key: "securityToken", label: "Web Services Security Token", kind: SECRET },
      { key: "publisherId", label: "Publisher ID (SID)", kind: ID },
    ],
  },
];

const NETWORK_COUNT = new Set(NETWORKS.map((n) => n.network)).size;
const NETWORK_BY_PLATFORM = Object.fromEntries(NETWORKS.map((n) => [n.platform, n]));

/* v13 tokens. */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
};
const HEALTH_TONES = { HEALTHY: "green", UNKNOWN: "blue", NOT_CONFIGURED: "amber", EXPIRED: "red", FAILED: "red" };
const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";
/* The Action column stays in view while the rest of the table scrolls sideways. */
const STICKY_RIGHT = "sticky right-0 shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]";
const ACTION_BUTTON =
  "rounded-[7px] border border-[#e4e7ec] bg-white px-2.5 py-[5px] text-[10px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:opacity-40";
const PRIMARY_BUTTON =
  "rounded-[7px] border border-[#2457d6] bg-[#2457d6] px-2.5 py-[5px] text-[10px] font-extrabold text-white hover:bg-[#1d47b3] disabled:opacity-50";
const INPUT =
  "mt-1 w-full rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] py-[7px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff]";

function Pill({ tone = "blue", children, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[8px] font-black leading-none ${PILL_TONES[tone]}`}
    >
      {children}
    </span>
  );
}
Pill.propTypes = { tone: optionalString, children: optionalNode, title: optionalString };

function Muted({ children = "—" }) {
  return <span className="text-[#98a2b3]">{children}</span>;
}
Muted.propTypes = { children: optionalNode };

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
      <span className="block text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <b className="mt-[5px] block text-[21px]">{value}</b>
      <small className="text-[10px] text-[#667085]">{hint}</small>
    </div>
  );
}
Metric.propTypes = { label: optionalString, value: optionalStringOrNumber, hint: optionalString };

function Note({ tone = "info", children }) {
  const border = tone === "danger" ? "border-[#b42318] bg-[#fef3f2]" : tone === "warn" ? "border-[#b54708] bg-[#fffaeb]" : "border-[#2457d6] bg-[#f8fafc]";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-r-[7px] border-l-[3px] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467] ${border}`}>
      {children}
    </div>
  );
}
Note.propTypes = { tone: optionalString, children: optionalNode };

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatSyncCounts(result) {
  if (!result || typeof result !== "object") return "";
  const parts = [];
  const add = (label, value) => {
    if (typeof value === "number" && value > 0) parts.push(`${value} ${label}`);
  };
  add("campaigns", result.campaigns);
  add("coupons", result.vouchers ?? result.coupons);
  add("conversions", result.conversions);
  add("payments", result.payments);
  add("performance rows", result.reporting ?? result.performanceRows);
  return parts.length ? `Imported ${parts.join(", ")}.` : "No new records were imported.";
}

function findResultNode(result, accountLabel) {
  if (!result || typeof result !== "object") return null;
  if (typeof result.campaigns === "number" || result.skipped === true || result.partialSuccess !== undefined) return result;
  if (accountLabel && result[accountLabel]) return findResultNode(result[accountLabel], null);
  for (const value of Object.values(result)) {
    const found = findResultNode(value, accountLabel);
    if (found) return found;
  }
  return null;
}

function describeSyncOutcome(response, label, accountLabel) {
  const node = findResultNode(response?.result || {}, accountLabel) || response?.result;
  const summary = formatSyncCounts(node);
  const prefix = label ? `Sync finished for ${label}.` : "Sync finished.";
  return summary ? `${prefix} ${summary}` : prefix;
}

const safeError = (error, fallback) => redactCredentialText(error?.message || fallback) || fallback;

function emptyForm(spec, accountLabel = "") {
  const values = { accountLabel, environment: "PRODUCTION" };
  for (const field of spec.fields) values[field.key] = spec.defaults?.[field.key] ?? "";
  return values;
}

function validate(spec, values) {
  const errors = {};
  for (const field of spec.fields) {
    const value = String(values[field.key] ?? "").trim();
    if (field.required && !value) errors[field.key] = `${field.label} is required.`;
    else if (value && field.numeric && !/^\d+$/.test(value)) errors[field.key] = `${field.label} must be numeric.`;
  }
  return errors;
}

/* v13 .modal — the connect form for one network. */
function ConnectModal({ spec, initialLabel, busy, error, onClose, onSubmit }) {
  const [values, setValues] = useState(() => emptyForm(spec, initialLabel));
  const [errors, setErrors] = useState({});
  const replacing = Boolean(initialLabel);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  function submit(event) {
    event.preventDefault();
    const nextErrors = validate(spec, values);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const body = { accountLabel: values.accountLabel.trim() || "default", environment: values.environment };
    for (const field of spec.fields) {
      const value = String(values[field.key] ?? "").trim();
      if (value) body[field.key] = value;
    }
    onSubmit(body);
  }

  const title = `${replacing ? "Replace credentials" : "Connect"} · ${spec.network}${spec.region ? ` ${spec.region}` : ""}`;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(16,24,40,.35)] p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-[720px] overflow-auto rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-[#e4e7ec] px-4 py-3.5">
          <div>
            <h2 className="m-0 text-sm font-bold">{title}</h2>
            <p className="mt-1 text-[11px] text-[#667085]">{spec.help}</p>
          </div>
          <button type="button" className={ACTION_BUTTON} onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <form className="space-y-3 p-4" onSubmit={submit} autoComplete="off" noValidate>
          {spec.warning ? <Note tone="warn">{spec.warning}</Note> : null}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <label className="text-[9px] font-extrabold text-[#667085]">
              ACCOUNT LABEL
              <input
                className={INPUT}
                value={values.accountLabel}
                disabled={replacing}
                placeholder="default"
                maxLength={40}
                onChange={(e) => setValues((v) => ({ ...v, accountLabel: e.target.value }))}
              />
            </label>
            <label className="text-[9px] font-extrabold text-[#667085]">
              ENVIRONMENT
              <select className={INPUT} value={values.environment} onChange={(e) => setValues((v) => ({ ...v, environment: e.target.value }))}>
                <option value="PRODUCTION">PRODUCTION</option>
                <option value="SANDBOX">SANDBOX</option>
              </select>
            </label>
            {spec.fields.map((field) => (
              <label key={field.key} className={`text-[9px] font-extrabold text-[#667085] ${field.wide ? "sm:col-span-2" : ""}`}>
                {field.label.toUpperCase()}
                {field.required ? <span className="text-[#b42318]"> *</span> : <span className="font-normal"> (optional)</span>}
                <input
                  className={`${INPUT} ${errors[field.key] ? "border-[#b42318]" : ""} ${field.kind === SECRET ? "font-mono" : ""}`}
                  type={field.kind === SECRET ? "password" : "text"}
                  inputMode={field.numeric ? "numeric" : undefined}
                  autoComplete={field.kind === SECRET ? "new-password" : "off"}
                  spellCheck={false}
                  placeholder={field.placeholder || ""}
                  value={values[field.key]}
                  aria-invalid={Boolean(errors[field.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
                {errors[field.key] ? <span className="mt-1 block font-normal text-[#b42318]">{errors[field.key]}</span> : null}
              </label>
            ))}
          </div>
          {error ? <Note tone="danger">{error}</Note> : null}
          <p className="text-[10px] text-[#667085]">
            Credentials are encrypted on the server and never shown again. This page only ever displays a masked value.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className={ACTION_BUTTON} onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={PRIMARY_BUTTON} disabled={busy}>
              {busy ? "Saving…" : replacing ? "Save credentials" : "Connect account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
ConnectModal.propTypes = {
  spec: optionalObject,
  initialLabel: optionalString,
  busy: optionalBool,
  error: optionalString,
  onClose: optionalFunc,
  onSubmit: optionalFunc,
};

function ConfirmModal({ title, body, busy, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[rgba(16,24,40,.35)] p-4">
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-[460px] rounded-xl border border-[#e4e7ec] bg-white">
        <div className="border-b border-[#e4e7ec] px-4 py-3.5">
          <h2 className="m-0 text-sm font-bold">{title}</h2>
        </div>
        <div className="space-y-3 p-4 text-[11px] text-[#475467]">
          <p>{body}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className={ACTION_BUTTON} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="rounded-[7px] border border-[#b42318] bg-[#b42318] px-2.5 py-[5px] text-[10px] font-extrabold text-white disabled:opacity-50" onClick={onConfirm} disabled={busy}>
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
ConfirmModal.propTypes = { title: optionalString, body: optionalNode, busy: optionalBool, onCancel: optionalFunc, onConfirm: optionalFunc };

/**
 * Per-account sync state from GET /sync/status, keyed "platform:accountLabel" ("platform:*" when a
 * unit covers every account of a platform). Durable run units say which account is RUNNING or
 * still PENDING; a manual single-account sync shows up only as the in-memory job
 * `sync:<platform>:<accountLabel>[:<sourceObject>]`.
 */
function serverSyncStates(status) {
  const states = {};
  const mark = (platform, accountLabel, state) => {
    if (!platform) return;
    const key = `${platform}:${accountLabel || "*"}`;
    if (states[key] !== "running") states[key] = state;
  };
  for (const unit of Array.isArray(status?.units) ? status.units : []) {
    if (unit?.status === "RUNNING") mark(unit.platform, unit.accountLabel, "running");
    else if (unit?.status === "PENDING" && unit.executable !== false) mark(unit.platform, unit.accountLabel, "queued");
  }
  const memory = status?.inMemory;
  if (memory?.status === "running" && typeof memory.jobName === "string") {
    const [prefix, platform, accountLabel] = memory.jobName.split(":");
    if (prefix === "sync" && platform && platform !== "orchestration") mark(platform, accountLabel, "running");
  }
  return states;
}

function rowSyncState(states, platform, accountLabel) {
  return states[`${platform}:${accountLabel}`] || states[`${platform}:*`] || null;
}

function AccountRowActions({ row, canManage, canSync, syncing, queued, anySyncRunning, onConnect, onReplace, onSync, onDisconnect }) {
  if (!row.account) {
    return canManage ? (
      <button type="button" className={PRIMARY_BUTTON} onClick={onConnect}>
        Connect
      </button>
    ) : (
      <Muted />
    );
  }
  return (
    <div className="flex items-center gap-1">
      {syncing ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#b2ccff] bg-[#eef4ff] px-2.5 py-1.5 text-[11px] font-extrabold text-[#1d4ed8]"
          role="status"
        >
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#1d4ed8] border-t-transparent" aria-hidden="true" />
          Syncing…
        </span>
      ) : queued ? (
        <span className="inline-flex rounded-lg border border-[#fedf89] bg-[#fffaeb] px-2.5 py-1.5 text-[11px] font-extrabold text-[#9a6700]" role="status">
          Queued
        </span>
      ) : canSync ? (
        <button type="button" className={ACTION_BUTTON} onClick={onSync} disabled={anySyncRunning}>
          Sync now
        </button>
      ) : null}
      {canManage ? (
        <ActionMenu
          items={[
            { label: "Replace credentials", onClick: onReplace },
            { label: "Add another account", onClick: onConnect },
            { label: "Disconnect", onClick: onDisconnect },
          ]}
        />
      ) : null}
    </div>
  );
}
AccountRowActions.propTypes = {
  row: optionalObject,
  canManage: optionalBool,
  canSync: optionalBool,
  syncing: optionalBool,
  queued: optionalBool,
  anySyncRunning: optionalBool,
  onConnect: optionalFunc,
  onReplace: optionalFunc,
  onSync: optionalFunc,
  onDisconnect: optionalFunc,
};

const COLUMNS = [
  "Network Source",
  "Account",
  "Environment",
  "Credential",
  "Credential Health",
  "Sync Enabled",
  "Last Successful Sync",
  "Last Sync Error",
  "Action",
];

export function IntegrationsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSIONS.INTEGRATIONS_MANAGE);
  const canSync = hasPermission(user, PERMISSIONS.SYNC_TRIGGER);

  const [connections, setConnections] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null); // { platform, accountLabel }
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState("");
  const [confirm, setConfirm] = useState(null); // { platform, accountLabel }
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [syncing, setSyncing] = useState(null); // "all" | "platform:label"
  const [serverStates, setServerStates] = useState({}); // from GET /sync/status, see serverSyncStates
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadConnections = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetchApi("/marketplace/accounts");
      if (mounted.current) setConnections(response?.result || {});
    } catch (error) {
      if (mounted.current) setLoadError(safeError(error, "Could not load connected accounts."));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  // A sync may have been started elsewhere (another tab, the scheduler, a full run), so the server
  // decides which rows are syncing. Read it on load and keep polling while anything is active.
  const refreshServerSync = useCallback(async () => {
    try {
      const status = await fetchApi("/sync/status", {}, { skipCache: true });
      const next = serverSyncStates(status);
      if (mounted.current) setServerStates(next);
      return Object.keys(next).length > 0;
    } catch {
      // No system:read, or the status endpoint is down: fall back to this tab's own state.
      return false;
    }
  }, []);

  const serverActive = Object.keys(serverStates).length > 0;
  useEffect(() => {
    refreshServerSync();
  }, [refreshServerSync]);
  useEffect(() => {
    if (!serverActive && !syncing) return undefined;
    const timer = setInterval(async () => {
      const stillActive = await refreshServerSync();
      // A sync started elsewhere just finished: pick up its new last-sync times.
      if (!stillActive && !syncing) loadConnections();
    }, 5000);
    return () => clearInterval(timer);
  }, [serverActive, syncing, refreshServerSync, loadConnections]);

  const rows = useMemo(
    () =>
      NETWORKS.flatMap((spec) => {
        const accounts = Array.isArray(connections[spec.platform]) ? connections[spec.platform] : [];
        return accounts.length
          ? accounts.map((account) => ({ spec, account, key: `${spec.platform}:${account.accountLabel}` }))
          : [{ spec, account: null, key: spec.platform }];
      }),
    [connections],
  );

  const metrics = useMemo(() => {
    const connected = rows.filter((r) => r.account);
    return {
      connectedNetworks: new Set(connected.map((r) => r.spec.network)).size,
      accounts: connected.length,
      attention: connected.filter(
        (r) => ["EXPIRED", "FAILED"].includes(String(r.account.credentialHealth || "").toUpperCase()) || r.account.lastSyncError,
      ).length,
    };
  }, [rows]);

  const closeModal = useCallback(() => {
    setModal(null);
    setModalError("");
  }, []);

  async function handleConnect(body) {
    if (!modal) return;
    setModalBusy(true);
    setModalError("");
    try {
      await postApi(`/marketplace/accounts/${modal.platform}/connect`, body);
      const spec = NETWORK_BY_PLATFORM[modal.platform];
      setModal(null);
      setNotice({ tone: "info", text: `${spec.network}${spec.region ? ` ${spec.region}` : ""} connected as [${body.accountLabel}]. Run Sync now to import its data.` });
      await loadConnections();
    } catch (error) {
      setModalError(safeError(error, "Connection failed. Check the details and try again."));
    } finally {
      if (mounted.current) setModalBusy(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await deleteApi(`/marketplace/accounts/${confirm.platform}/${encodeURIComponent(confirm.accountLabel)}`);
      setNotice({ tone: "info", text: `Disconnected [${confirm.accountLabel}] from ${NETWORK_BY_PLATFORM[confirm.platform].network}.` });
      setConfirm(null);
      await loadConnections();
    } catch (error) {
      setNotice({ tone: "danger", text: safeError(error, "Disconnect failed.") });
      setConfirm(null);
    } finally {
      if (mounted.current) setConfirmBusy(false);
    }
  }

  async function waitForSync(label, accountLabel) {
    for (let attempt = 0; attempt < 200 && mounted.current; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const status = await fetchApi("/sync/status");
      if (status?.status === "running") {
        const pct = typeof status.percentComplete === "number" ? ` ${status.percentComplete}%` : "";
        setNotice({ tone: "info", text: `Syncing ${label || "all networks"}…${pct}` });
        continue;
      }
      if (status?.status === "success" || status?.status === "partial") {
        setNotice({
          tone: status.status === "partial" ? "warn" : "info",
          text: `${describeSyncOutcome(status, label, accountLabel)}${status.status === "partial" ? ` ${status.warning || "Some data could not be imported."}` : ""}`,
        });
        return;
      }
      if (status?.status === "failed") throw new Error(status?.error || "Sync failed.");
      return;
    }
  }

  async function runSync(platform, accountLabel) {
    const all = !platform;
    const label = all ? null : `${NETWORK_BY_PLATFORM[platform].network} [${accountLabel}]`;
    setSyncing(all ? "all" : `${platform}:${accountLabel}`);
    setNotice({ tone: "info", text: all ? "Starting full sync…" : `Starting sync for ${label}…` });
    try {
      const response = await postApi(all ? "/sync/all" : `/sync/${platform}/${encodeURIComponent(accountLabel)}`);
      if (response?.status === "running") await waitForSync(label, accountLabel);
      else setNotice({ tone: "info", text: describeSyncOutcome(response, label, accountLabel) });
      await loadConnections();
    } catch (error) {
      setNotice({ tone: "danger", text: safeError(error, "Sync failed.") });
      // "A sync is already in progress": show which account it is in the Action column.
      refreshServerSync();
    } finally {
      if (mounted.current) setSyncing(null);
    }
  }

  const modalSpec = modal ? NETWORK_BY_PLATFORM[modal.platform] : null;

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Network Integrations</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            Connect every affiliate network account MBO Rewards syncs from. Credentials are encrypted on the server and never
            shown again; this page lists account metadata only. Once connected, scheduled syncs pick the account up
            automatically, or run Sync now.
          </p>
        </div>
        {canSync ? (
          <button type="button" className={PRIMARY_BUTTON} onClick={() => runSync(null, null)} disabled={Boolean(syncing) || serverActive}>
            {syncing === "all" || serverActive ? "Syncing…" : "Run full sync"}
          </button>
        ) : null}
      </div>

      {/* .grid4 metrics */}
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Metric label="Networks" value={NETWORK_COUNT} hint="Supported by the platform" />
        <Metric label="Connected Networks" value={loading ? "…" : metrics.connectedNetworks} hint={`of ${NETWORK_COUNT}`} />
        <Metric label="Accounts" value={loading ? "…" : metrics.accounts} hint="Saved network accounts" />
        <Metric label="Needs Attention" value={loading ? "…" : metrics.attention} hint="Expired / failed / sync error" />
      </div>

      {notice ? (
        <div className="mb-3.5">
          <Note tone={notice.tone}>{notice.text}</Note>
        </div>
      ) : null}

      {/* .card */}
      <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-sm font-bold">Network Accounts</h2>
            <Pill tone="blue">METADATA ONLY</Pill>
          </div>
          <button type="button" className={ACTION_BUTTON} onClick={loadConnections} disabled={loading}>
            Refresh
          </button>
        </div>
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[1100px] border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((label) => (
                  <th key={label} className={label === "Action" ? `${TH} ${STICKY_RIGHT} z-[3]` : TH}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-2 py-[22px] text-center text-[11px] text-[#667085]" colSpan={COLUMNS.length}>
                    Loading accounts…
                  </td>
                </tr>
              ) : loadError ? (
                <tr>
                  <td className="px-2 py-[22px] text-center text-[11px]" colSpan={COLUMNS.length}>
                    <span className="text-[#b42318]">{loadError}</span>{" "}
                    <button type="button" className="font-extrabold text-[#2457d6] hover:underline" onClick={loadConnections}>
                      Retry
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map(({ spec, account, key }) => {
                  const health = String(account?.credentialHealth || "").toUpperCase();
                  const syncKey = account ? `${spec.platform}:${account.accountLabel}` : null;
                  return (
                    <tr key={key} className="hover:bg-[#fbfcff]">
                      <td className={TD}>
                        <b className="font-extrabold">{spec.network}</b>
                        {spec.region ? <span className="ml-1 text-[#667085]">{spec.region}</span> : null}
                        <div className="mt-0.5 font-mono text-[9px] text-[#98a2b3]">{spec.platform}</div>
                      </td>
                      <td className={TD}>{account ? <span className="font-mono">{account.accountLabel}</span> : <Muted>No account connected</Muted>}</td>
                      <td className={TD}>{account?.environment ? <Pill tone="blue">{account.environment}</Pill> : <Muted />}</td>
                      <td className={TD}>{account?.maskedKey || account?.maskedApiKey ? <span className="font-mono">{account.maskedKey || account.maskedApiKey}</span> : <Muted />}</td>
                      <td className={TD}>{account ? <Pill tone={HEALTH_TONES[health] || "blue"}>{health || "UNKNOWN"}</Pill> : <Pill tone="amber">NOT CONNECTED</Pill>}</td>
                      <td className={TD}>{account ? (account.syncEnabled === false ? <span className="text-[#667085]">NO</span> : <b>YES</b>) : <Muted />}</td>
                      <td className={TD}>{formatDate(account?.lastSuccessfulSync) || <Muted>{account ? "Never" : "—"}</Muted>}</td>
                      <td className={TD}>
                        {account?.lastSyncError ? (
                          <span className="block max-w-[220px] truncate text-[#b42318]" title={redactCredentialText(account.lastSyncError)}>
                            {redactCredentialText(account.lastSyncError)}
                          </span>
                        ) : (
                          <Muted />
                        )}
                      </td>
                      <td className={`${TD} ${STICKY_RIGHT} bg-white`}>
                        <AccountRowActions
                          row={{ account }}
                          canManage={canManage}
                          canSync={canSync}
                          syncing={syncing === syncKey || rowSyncState(serverStates, spec.platform, account?.accountLabel) === "running"}
                          queued={rowSyncState(serverStates, spec.platform, account?.accountLabel) === "queued"}
                          anySyncRunning={Boolean(syncing) || serverActive}
                          onConnect={() => setModal({ platform: spec.platform, accountLabel: "" })}
                          onReplace={() => setModal({ platform: spec.platform, accountLabel: account?.accountLabel || "" })}
                          onSync={() => runSync(spec.platform, account.accountLabel)}
                          onDisconnect={() => setConfirm({ platform: spec.platform, accountLabel: account.accountLabel })}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* .note */}
      <Note>
        <b>Operational rule:</b> a network shows data only after an account is connected <b>and</b> synced. Credentials
        set directly on the backend server (environment variables) are also used by syncs but are not listed here.
        Scheduled syncs run incrementally; <b>Sync now</b> refreshes one account and <b>Run full sync</b> refreshes all.
      </Note>

      {modalSpec ? (
        <ConnectModal
          key={`${modal.platform}:${modal.accountLabel}`}
          spec={modalSpec}
          initialLabel={modal.accountLabel}
          busy={modalBusy}
          error={modalError}
          onClose={closeModal}
          onSubmit={handleConnect}
        />
      ) : null}
      {confirm ? (
        <ConfirmModal
          title={`Disconnect ${NETWORK_BY_PLATFORM[confirm.platform].network} [${confirm.accountLabel}]?`}
          body="Its saved credentials are deleted and scheduled syncs stop for this account. Data already imported stays."
          busy={confirmBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={handleDisconnect}
        />
      ) : null}
    </div>
  );
}

