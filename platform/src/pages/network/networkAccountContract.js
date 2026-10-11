/**
 * Frontend view of the backend Network Account contract (Phase 2).
 *
 * Sources (production backend, commit 15298635):
 *   GET /suppliers            -> toNetworkListDto      (campaigns:read)
 *   GET /suppliers/:key       -> toNetworkDetailDto    (campaigns:read)  includes accounts[]
 *   GET /marketplace/accounts -> { result: { [platform]: toNetworkAccountDto[] } } (integrations:read)
 *   GET /ops/sync-runs        -> ok({ total, items: toSyncObservabilityDto[], page, pageSize }) (ops:read)
 *   POST /sync/:platform/:accountLabel                  (sync:trigger)
 *   DELETE /marketplace/accounts/:platform/:accountLabel (integrations:manage)
 *
 * Everything rendered by the Network Accounts and API Credentials pages passes through the
 * allowlists below. Fields that are not listed are dropped before they reach React state, so a
 * masked key, a secret, a token or any future credential-shaped field can never be rendered.
 */

// Account (MarketplaceAccount -> toNetworkAccountDto) — metadata only.
// Deliberately excluded: maskedApiKey, maskedKey (partial key material), anything not listed.
export const ACCOUNT_FIELDS = Object.freeze([
  "id",
  "network",
  "platform",
  "accountLabel",
  "accountExternalId",
  "authType",
  "environment",
  "secretRef",
  "tokenExpiresAt",
  "syncEnabled",
  "financeSyncEnabled",
  "credentialHealth",
  "credentialsConfigured",
  "lastSuccessfulSync",
  "lastCampaignSyncAt",
  "lastCouponSyncAt",
  "lastOrderSyncAt",
  "lastPaymentSyncAt",
  "syncFrequencyMinutes",
  "lastAuthCheckAt",
  "lastSyncError",
  "connectedAt",
  "updatedAt",
]);

// Sync run (NetworkSyncRun -> toSyncObservabilityDto). Raw JSON blobs (metadata, checkpoints,
// rate-limit telemetry) are not rendered in Phase 2.
export const SYNC_RUN_FIELDS = Object.freeze([
  "syncRunId",
  "network",
  "networkAccountId",
  "sourceObject",
  "endpoint",
  "jobType",
  "status",
  "legacyStatus",
  "trigger",
  "parentSyncRunId",
  "startedAt",
  "finishedAt",
  "recordsFetched",
  "recordsCreated",
  "recordsUpdated",
  "recordsUnchanged",
  "recordsQuarantined",
  "retryCount",
  "recordCount",
  "errorCode",
  "errorMessage",
  "availability",
  "label",
]);

/**
 * Client-side mirror of the backend's `sanitizeSecretError`. The backend already applies it to
 * `lastSyncError`, sync-run `errorMessage` and every error-handler `message`, but not to
 * `syncHealth.lastSyncMessage` (raw SyncJobLog.message). We apply the same rules to every
 * backend-provided free-text string before it is rendered, so nothing depends on that gap.
 * Ordinary text is left untouched; only credential-shaped fragments are replaced.
 */
export function redactCredentialText(message) {
  if (message == null || message === "") return null;
  let text = String(message);
  text = text.replace(/Bearer\s+[A-Za-z0-9._\-+=/]+/gi, "Bearer [redacted]");
  text = text.replace(
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|application[_-]?key|user[_-]?api[_-]?key|client[_-]?secret|password|secret|authorization)\s*[:=]\s*\S+/gi,
    "$1=[redacted]",
  );
  text = text.replace(/[A-Za-z0-9+/_-]{40,}={0,2}/g, "[redacted]");
  if (text.length > 400) text = `${text.slice(0, 400)}…`;
  return text;
}

// Free-text fields that may carry upstream error text; redacted at the boundary.
const FREE_TEXT_FIELDS = new Set(["lastSyncError", "errorMessage"]);

// The allowlist is the guard: only listed keys are copied. `secretRef` is an opaque
// secret-manager reference (the backend contract documents it as "never the secret itself").
export function pickFields(source, allowlist) {
  if (!source || typeof source !== "object") return null;
  const out = {};
  for (const key of allowlist) {
    const value = source[key] === undefined ? null : source[key];
    out[key] = FREE_TEXT_FIELDS.has(key) ? redactCredentialText(value) : value;
  }
  return out;
}

export function toAccountView(dto) {
  return pickFields(dto, ACCOUNT_FIELDS);
}

export function toSyncRunView(dto) {
  return pickFields(dto, SYNC_RUN_FIELDS);
}

/** Flattens GET /marketplace/accounts `result` ({ platform: [dto] }) into account views. */
export function flattenMarketplaceAccounts(result) {
  if (!result || typeof result !== "object") return [];
  const rows = [];
  for (const [platform, list] of Object.entries(result)) {
    for (const dto of Array.isArray(list) ? list : []) {
      const view = toAccountView(dto);
      if (view) rows.push({ ...view, platform: view.platform ?? platform });
    }
  }
  return rows;
}

/** Builds platform -> network summary lookups from the GET /suppliers list. */
export function indexNetworksByPlatform(networks = []) {
  const byPlatform = new Map();
  for (const network of networks) {
    const platforms = new Set([...(network.syncPlatforms || []), ...(network.regions || [])]);
    for (const platform of platforms) byPlatform.set(String(platform).toLowerCase(), network);
  }
  return byPlatform;
}

export function canTriggerSyncFor(network, platform) {
  if (!network || !platform) return false;
  return Boolean(network.manualSyncSupported) && (network.syncPlatforms || []).includes(platform);
}

export function syncRunsPath() {
  return "/ops/sync-runs";
}

export function networkDetailPath(key) {
  return `/suppliers/${encodeURIComponent(key)}`;
}

export function triggerSyncPath(platform, accountLabel) {
  const base = `/sync/${encodeURIComponent(platform)}`;
  return accountLabel ? `${base}/${encodeURIComponent(accountLabel)}` : base;
}

export function disconnectPath(platform, accountLabel) {
  return `/marketplace/accounts/${encodeURIComponent(platform)}/${encodeURIComponent(accountLabel)}`;
}
