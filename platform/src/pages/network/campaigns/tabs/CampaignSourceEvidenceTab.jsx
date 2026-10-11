import { useMemo } from "react";
import { useOkPagedRows } from "../../../../hooks/useOkPagedRows";
import { optionalArray, optionalBool, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../../utils/propValidators";
import { RAW_PAYLOADS_PATH, toRawPayloadView } from "../campaignContract";

/**
 * Campaign › Source Evidence — INTERNAL admin diagnostics, laid out to the v13 campaign workspace
 * (.flow of .node boxes, .source-proof rows, .related-table, .note). It shows how the network's
 * record became the MBO canonical campaign:
 *
 *   NETWORK / SUPPLIER → RAW RECORD → SOURCE RECORD → MAPPING (campaign source) → MBO CANONICAL CAMPAIGN
 *
 * The canonical campaign is not the supplier record. Source values (sourceCampaignStatus,
 * sourceRelationshipStatus, sourceCampaignType, originalCurrency) are shown exactly as the backend
 * returns them and are never normalized here; canonical values are shown beside them. The
 * campaign-level values come from the primary source record chosen by the backend. Every campaign
 * source keeps its own row: values from different sources are never merged.
 *
 * Raw evidence is referenced, never rendered. Two tracks:
 *   1. campaign.rawPayloadId / rawPayloadLink: the campaign contract's direct pointer
 *      (SupplierCampaign → RawPayload). rawPayloadLink is a backend endpoint, not an admin page, so it
 *      is shown as a reference and not linked.
 *   2. GET /ops/raw-payloads?supplier=&externalId= (ops:read): matches RawPayload.externalId exactly.
 *      Some networks store a composed external id, so an empty result never proves that no raw
 *      payload exists; it is labelled discovery-only.
 */

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["MAPPED", "ACTIVE", "JOINED", "APPROVED", "YES", "CERTIFIED", "SYNCED", "PROCESSED", "PROMOTED"]);
const AMBER = new Set(["NEEDS_REVIEW", "PENDING", "VERIFY_LIVE", "RECEIVED", "REVOKED"]);
const RED = new Set(["ERROR", "FAILED", "REJECTED", "SUSPENDED", "NOT_APPLIED", "NO"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";
const ACTION_BUTTON =
  "whitespace-nowrap rounded-[7px] border border-[#e4e7ec] bg-white px-2 py-[4px] text-[9.5px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:opacity-40";

function Muted({ children = "Not available", title }) {
  return (
    <span className="font-normal text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Muted.propTypes = { children: optionalNode, title: optionalString };

function Pill({ value, tone, title, empty }) {
  if (value == null || value === "") return <Muted title={title ? `${title}: not returned` : undefined}>{empty}</Muted>;
  const text = String(value);
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[8px] font-black leading-none ${
        PILL_TONES[tone || toneFor(text)]
      }`}
    >
      {text}
    </span>
  );
}
Pill.propTypes = { value: optionalStringOrNumber, tone: optionalString, title: optionalString, empty: optionalString };

function Mono({ value, title }) {
  if (value == null || value === "") return <Muted />;
  return (
    <span className="break-all font-mono text-[10px]" title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString };

/** A value exactly as the network sent it (v13 .source-extra .keys): amber monospace, never normalized. */
function SourceValue({ value }) {
  if (value == null || value === "") return <Muted>Not returned</Muted>;
  return (
    <span className="font-mono text-[10px] font-bold text-[#b54708]" title="Source value as received (not normalized)">
      {String(value)}
    </span>
  );
}
SourceValue.propTypes = { value: optionalStringOrNumber };

function Flag({ value, title }) {
  if (value == null) return <Muted title={title ? `${title}: not returned` : undefined} />;
  return <Pill value={value ? "YES" : "NO"} title={title} />;
}
Flag.propTypes = { value: optionalBool, title: optionalString };

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DateValue({ value }) {
  const text = formatDateTime(value);
  return text ? <span className="whitespace-nowrap">{text}</span> : <Muted />;
}
DateValue.propTypes = { value: optionalString };

/** v13 .note (tone: info | warn | danger). */
function Note({ tone = "info", children }) {
  const tones = { info: "border-[#2457d6] bg-[#f8fafc]", warn: "border-[#b54708] bg-[#fffaeb]", danger: "border-[#b42318] bg-[#fef3f2]" };
  return <div className={`rounded-r-[7px] border-l-[3px] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467] ${tones[tone]}`}>{children}</div>;
}
Note.propTypes = { tone: optionalString, children: optionalNode };

/** v13 .empty-state. */
function EmptyState({ title, children }) {
  return (
    <div className="rounded-[9px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-[18px] text-center text-[11px] text-[#667085]">
      <b className="mb-1 block text-[#344054]">{title}</b>
      {children}
    </div>
  );
}
EmptyState.propTypes = { title: optionalString, children: optionalNode };

function Card({ title, subtitle, action, children }) {
  return (
    <section className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[13px] font-bold text-[#101828]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[10.5px] leading-snug text-[#667085]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
Card.propTypes = { title: optionalString, subtitle: optionalNode, action: optionalNode, children: optionalNode };

/** v13 .source-proof row: label + canonical key, then the value. */
function Proof({ label, field, children }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-[#eef2f6] py-[7px] sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-2">
      <span className="text-[9px] font-extrabold text-[#667085]">
        {label}
        {field ? <span className="block font-mono text-[8.5px] font-normal text-[#98a2b3]">{field}</span> : null}
      </span>
      <div className="min-w-0 text-[10.5px]">{children}</div>
    </div>
  );
}
Proof.propTypes = { label: optionalString, field: optionalString, children: optionalNode };

/** v13 .flow node. */
function FlowNode({ step, title, children }) {
  return (
    <div className="min-w-[170px] max-w-[230px] flex-1 rounded-lg border border-[#e4e7ec] bg-white p-2.5">
      <span className="block text-[8px] font-black uppercase tracking-[.05em] text-[#98a2b3]">{step}</span>
      <span className="mt-0.5 block text-[10px] font-extrabold text-[#101828]">{title}</span>
      <div className="mt-1.5 space-y-1 text-[10px]">{children}</div>
    </div>
  );
}
FlowNode.propTypes = { step: optionalString, title: optionalString, children: optionalNode };

const Arrow = () => (
  <span aria-hidden="true" className="shrink-0 self-center text-[#98a2b3]">
    →
  </span>
);

/* ── Source records ───────────────────────────────────────────────────────── */

const SOURCE_COLUMNS = (campaign) => [
  {
    label: "Role",
    field: "isPrimary",
    render: (s) => (
      <span className="flex flex-wrap gap-1">
        {s.isPrimary ? <Pill value="PRIMARY" tone="purple" title="Marked primary by the backend" /> : <Pill value="ALTERNATIVE" tone="blue" />}
        {campaign.campaignSourceId && s.id === campaign.campaignSourceId ? (
          <Pill value="CAMPAIGN VALUES" tone="green" title="The campaign-level values on this page come from this source" />
        ) : null}
      </span>
    ),
  },
  { label: "Network Source", field: "networkSource", render: (s) => <Mono value={s.networkSource} /> },
  { label: "Campaign Source ID", field: "sources[].id", render: (s) => <Mono value={s.id} /> },
  { label: "Supplier Campaign ID", field: "supplierCampaignId", render: (s) => <Mono value={s.supplierCampaignId} /> },
  { label: "Source Campaign Status", field: "sourceCampaignStatus", render: (s) => <SourceValue value={s.sourceCampaignStatus} /> },
  { label: "Canonical Campaign Status", field: "campaignStatus", render: (s) => <Pill value={s.campaignStatus} empty="Not available" /> },
  { label: "Source Relationship", field: "sourceRelationshipStatus", render: (s) => <SourceValue value={s.sourceRelationshipStatus} /> },
  { label: "Canonical Relationship", field: "relationshipStatus", render: (s) => <Pill value={s.relationshipStatus} empty="Not available" /> },
  { label: "Canonical Campaign Type", field: "campaignType", render: (s) => (s.campaignType ? <Mono value={s.campaignType} /> : <Muted />) },
  { label: "Original Currency", field: "originalCurrency", render: (s) => <SourceValue value={s.originalCurrency} /> },
  { label: "Canonical Currency", field: "currency", render: (s) => (s.currency ? <Mono value={s.currency} /> : <Muted />) },
  { label: "Active", field: "isActive", render: (s) => <Flag value={s.isActive} title="Campaign source active" /> },
  { label: "Last Synced", field: "lastSyncedAt", render: (s) => <DateValue value={s.lastSyncedAt} /> },
];

function SourceTable({ label, sources, campaign }) {
  const columns = SOURCE_COLUMNS(campaign);
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#e4e7ec] bg-white">
      <table aria-label={label} className="w-full min-w-[1300px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} className={TH}>
                {col.label}
                <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sources.map((source, index) => (
            <tr key={source.id || `source-${index}`} className="hover:bg-[#fbfcff]">
              {columns.map((col) => (
                <td key={col.label} className={TD}>
                  {col.render(source)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
SourceTable.propTypes = { label: optionalString, sources: optionalArray, campaign: optionalObject };

/* ── Raw payload discovery ────────────────────────────────────────────────── */

const RAW_COLUMNS = [
  { label: "Raw Payload ID", field: "rawPayloadId", render: (p) => <Mono value={p.rawPayloadId} /> },
  { label: "Source Object", field: "sourceObject", render: (p) => <Mono value={p.sourceObject || p.resourceKey} /> },
  { label: "Endpoint / Report", field: "endpointOrReport", render: (p) => <Mono value={p.endpointOrReport} /> },
  { label: "Network Account", field: "sourceAccountLabel", render: (p) => <Mono value={p.sourceAccountLabel || p.networkAccountId} /> },
  { label: "External ID", field: "externalId", render: (p) => <Mono value={p.externalId} /> },
  { label: "Sync Run", field: "syncRunId", render: (p) => <Mono value={p.syncRunId} /> },
  { label: "Fetched", field: "fetchedAt", render: (p) => <DateValue value={p.fetchedAt} /> },
  { label: "HTTP", field: "httpStatus", render: (p) => <Mono value={p.httpStatus} /> },
  { label: "Processing", field: "processingStatus", render: (p) => <Pill value={p.processingStatus} empty="Not available" /> },
  { label: "Mapper", field: "mapperVersion", render: (p) => <Mono value={p.mapperVersion} /> },
  { label: "Payload Hash", field: "payloadHash", render: (p) => <Mono value={p.payloadHash} /> },
];

function RawTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#e4e7ec] bg-white">
      <table aria-label="Raw payload references" className="w-full min-w-[1200px] border-collapse">
        <thead>
          <tr>
            {RAW_COLUMNS.map((col) => (
              <th key={col.label} className={TH}>
                {col.label}
                <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.rawPayloadId || `raw-${index}`} className="hover:bg-[#fbfcff]">
              {RAW_COLUMNS.map((col) => (
                <td key={col.label} className={TD}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
RawTable.propTypes = { rows: optionalArray };

/* ── Tab ──────────────────────────────────────────────────────────────────── */

export function CampaignSourceEvidenceTab({ campaign, canReadRawPayloads }) {
  const c = campaign;
  const sources = Array.isArray(c.sources) ? c.sources : [];
  const primarySources = sources.filter((s) => s.isPrimary);
  const alternativeSources = sources.filter((s) => !s.isPrimary);
  const warnings = Array.isArray(c.operationalWarnings) ? c.operationalWarnings : [];

  const enabled = Boolean(canReadRawPayloads && c.networkSource && c.supplierCampaignId);
  const filters = useMemo(
    () => ({ supplier: c.networkSource || undefined, externalId: c.supplierCampaignId || undefined }),
    [c.networkSource, c.supplierCampaignId],
  );
  const payloads = useOkPagedRows(RAW_PAYLOADS_PATH, filters, { pageSize: 20, enabled, project: toRawPayloadView });

  // Campaign-level source → canonical pairs, only where the backend returns both sides.
  const comparisons = [
    { label: "Campaign Status", sourceKey: "sourceCampaignStatus", canonicalKey: "campaignStatus", source: c.sourceCampaignStatus, canonical: c.campaignStatus, pill: true },
    {
      label: "Relationship Status",
      sourceKey: "sourceRelationshipStatus",
      canonicalKey: "relationshipStatus",
      source: c.sourceRelationshipStatus,
      canonical: c.relationshipStatus,
      pill: true,
    },
    { label: "Campaign Type", sourceKey: "sourceCampaignType", canonicalKey: "campaignType", source: c.sourceCampaignType, canonical: c.campaignType },
    { label: "Currency", sourceKey: "originalCurrency", canonicalKey: "currency", source: c.originalCurrency, canonical: c.currency },
  ];
  const mappingTone = c.mappingStatus === "ERROR" ? "danger" : c.mappingStatus === "NEEDS_REVIEW" ? "warn" : null;

  return (
    <div className="space-y-3.5 text-[#101828]">
      {/* Pipeline */}
      <Card
        title="Source → MBO Pipeline"
        subtitle="How the network's record became this canonical campaign. The canonical campaign is MBO's record, not the supplier's."
        action={<Pill value="INTERNAL ADMIN · DIAGNOSTIC" tone="amber" title="Source identifiers, raw references and network values; never client data" />}
      >
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FlowNode step="1 · Network / supplier" title="Network source">
            <Mono value={c.networkSource} />
            {c.networkAccount ? <span className="block font-mono text-[9px] text-[#667085]">account {c.networkAccount}</span> : null}
          </FlowNode>
          <Arrow />
          <FlowNode step="2 · Raw record" title="Raw payload">
            {c.rawPayloadId ? <Mono value={c.rawPayloadId} title="Direct raw payload reference" /> : <Muted>No direct reference</Muted>}
          </FlowNode>
          <Arrow />
          <FlowNode step="3 · Source record" title="Supplier campaign">
            <Mono value={c.supplierCampaignId} title="Supplier-side campaign id" />
            {c.supplierCampaignRowId ? <span className="block font-mono text-[9px] text-[#667085]">row {c.supplierCampaignRowId}</span> : null}
          </FlowNode>
          <Arrow />
          <FlowNode step="4 · Mapping" title="Campaign source">
            <Mono value={c.campaignSourceId} title="Campaign source linking the supplier record to the canonical campaign" />
            <span className="block">
              <Pill value={c.mappingStatus} title="Mapping status (backend)" empty="Mapping status not returned" />
            </span>
          </FlowNode>
          <Arrow />
          <FlowNode step="5 · MBO canonical" title="Canonical campaign">
            <Mono value={c.id} title="Canonical campaign id" />
            {c.campaignName ? <span className="block truncate text-[10px] text-[#475467]">{c.campaignName}</span> : null}
          </FlowNode>
        </div>
      </Card>

      <div className="grid gap-3.5 lg:grid-cols-2">
        {/* 1. Source Summary */}
        <Card title="Source Summary" subtitle="The primary source record behind the campaign-level values.">
          <Proof label="Network Source" field="networkSource">
            <Mono value={c.networkSource} />
          </Proof>
          <Proof label="Source Account" field="networkAccount">
            <Mono value={c.networkAccount} />
          </Proof>
          <Proof label="Supplier Campaign ID" field="supplierCampaignId">
            <Mono value={c.supplierCampaignId} />
          </Proof>
          <Proof label="Supplier Campaign Row ID" field="supplierCampaignRowId">
            <Mono value={c.supplierCampaignRowId} />
          </Proof>
          <Proof label="Campaign Source ID" field="campaignSourceId">
            <Mono value={c.campaignSourceId} />
          </Proof>
          <Proof label="Merchant ID" field="merchantId">
            <Mono value={c.merchantId} />
          </Proof>
          <Proof label="Last Synced" field="lastSyncedAt">
            <DateValue value={c.lastSyncedAt} /> {c.health?.sync ? <Pill value={c.health.sync} title="Sync state" /> : null}
          </Proof>
          <Proof label="Sources" field="sources[].isPrimary">
            {sources.length ? (
              <span>
                {primarySources.length} primary · {alternativeSources.length} alternative
              </span>
            ) : (
              <Muted>No campaign source</Muted>
            )}
          </Proof>
        </Card>

        {/* 3. Canonical vs Source */}
        <Card title="Source Value → MBO Canonical Value" subtitle="Campaign-level values from the primary source. Source values are exactly as received; canonical values are the backend's normalization.">
          <div className="overflow-x-auto">
            <table aria-label="Source to canonical comparison" className="w-full min-w-[460px] border-collapse">
              <thead>
                <tr>
                  <th className={TH}>Field</th>
                  <th className={TH}>Source value</th>
                  <th className={TH} aria-label="maps to" />
                  <th className={TH}>MBO canonical value</th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => (
                  <tr key={row.label}>
                    <td className={`${TD} text-[9.5px] font-extrabold text-[#667085]`}>{row.label}</td>
                    <td className={TD}>
                      <SourceValue value={row.source} />
                      <span className="block font-mono text-[8.5px] text-[#98a2b3]">{row.sourceKey}</span>
                    </td>
                    <td className={`${TD} text-[#98a2b3]`}>→</td>
                    <td className={TD}>
                      {row.pill ? <Pill value={row.canonical} empty="Not available" /> : row.canonical ? <Mono value={row.canonical} /> : <Muted />}
                      <span className="block font-mono text-[8.5px] text-[#98a2b3]">{row.canonicalKey}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] leading-snug text-[#667085]">
            Not compared: brand, campaign name, country and category. The campaign detail returns only their canonical values, so no source value is
            shown for them.
          </p>
        </Card>
      </div>

      {/* 2. Source Records */}
      <Card
        title="Source Records"
        subtitle="One row per campaign source linked to this canonical campaign. Each row keeps its own source and canonical values; sources are never merged."
      >
        {sources.length ? (
          <div className="space-y-3">
            <div>
              <h4 className="mb-1.5 text-[11px] font-extrabold text-[#344054]">Primary source{primarySources.length === 1 ? "" : "s"}</h4>
              {primarySources.length ? (
                <SourceTable label="Primary campaign sources" sources={primarySources} campaign={c} />
              ) : (
                <Note tone="warn">No campaign source is marked primary by the backend.</Note>
              )}
            </div>
            {alternativeSources.length ? (
              <div>
                <h4 className="mb-1.5 text-[11px] font-extrabold text-[#344054]">Alternative sources</h4>
                <SourceTable label="Alternative campaign sources" sources={alternativeSources} campaign={c} />
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState title="No campaign source">This canonical campaign has no linked campaign source, so no source record maps to it.</EmptyState>
        )}
      </Card>

      {/* 4. Mapping / Review Evidence */}
      <Card title="Mapping / Review Evidence" subtitle="Mapping state exactly as the backend reports it.">
        {mappingTone ? (
          <div className="mb-2.5">
            <Note tone={mappingTone}>
              <b>Mapping status {c.mappingStatus}.</b> {c.mappingStatus === "ERROR" ? "The backend reports a mapping error for this campaign." : "The backend flags this campaign for mapping review."}
            </Note>
          </div>
        ) : null}
        <div className="grid gap-x-6 lg:grid-cols-2">
          <div>
            <Proof label="Mapping Status" field="mappingStatus">
              <Pill value={c.mappingStatus} empty="Not available" />
            </Proof>
            <Proof label="Mapping Certification" field="mappingCertificationStatus">
              <Pill value={c.mappingCertificationStatus} empty="None" />
            </Proof>
            <Proof label="Brand Mapping Complete" field="brandMappingComplete">
              <Flag value={c.brandMappingComplete} title="Brand mapping complete" />
            </Proof>
          </div>
          <div>
            <Proof label="Operational Warnings" field="operationalWarnings">
              {warnings.length ? <span className="font-mono font-bold text-[#b54708]">{warnings.join(", ")}</span> : <Muted>None returned</Muted>}
            </Proof>
            <Proof label="Field Mapping Outcome" field="fieldMappingOutcome">
              <Muted title="Not part of the campaign detail response">Not returned</Muted>
            </Proof>
            <Proof label="Mapping Version / Review Reasons" field="mappingVersion · reviewReasons">
              <Muted title="Not part of the campaign detail response">Not returned</Muted>
            </Proof>
          </div>
        </div>
      </Card>

      {/* 5. Raw Evidence References */}
      <Card title="Raw Evidence References" subtitle="References only. No payload body is rendered on this page.">
        <Proof label="Direct Raw Payload" field="rawPayloadId">
          {c.rawPayloadId ? (
            <span data-raw-payload-reference={c.rawPayloadId}>
              <Mono value={c.rawPayloadId} />
            </span>
          ) : (
            <Muted>No direct reference on the campaign record</Muted>
          )}
        </Proof>
        <Proof label="Backend Endpoint" field="rawPayloadLink">
          {c.rawPayloadLink ? (
            <span title="Backend API path (ops:read); not an admin page, so it is not linked">
              <Mono value={`GET ${c.rawPayloadLink}`} />
            </span>
          ) : (
            <Muted>Not returned</Muted>
          )}
        </Proof>

        <div className="mt-3">
          <h4 className="m-0 text-[11px] font-extrabold text-[#344054]">Discovery lookup</h4>
          <p className="mb-1.5 mt-0.5 text-[10px] leading-snug text-[#667085]">
            GET /ops/raw-payloads by supplier and external id (exact match). Some networks store a composed external id, so an empty result does not
            prove that no raw payload exists.
          </p>
          {!canReadRawPayloads ? (
            <Note>Your role does not include ops:read, so the raw payload lookup is not shown.</Note>
          ) : !enabled ? (
            <Note tone="warn">This campaign has no network source or supplier campaign id, so raw payloads cannot be looked up.</Note>
          ) : payloads.loading ? (
            <p className="py-3 text-[11px] text-[#667085]">Looking up raw payload references…</p>
          ) : payloads.error ? (
            <Note tone="danger">
              <b>Raw payload references could not be loaded.</b> {String(payloads.error)}{" "}
              <button type="button" className={`${ACTION_BUTTON} ml-1`} onClick={() => payloads.reload().catch(() => {})}>
                Retry
              </button>
            </Note>
          ) : payloads.rows.length ? (
            <>
              <RawTable rows={payloads.rows} />
              {payloads.totalPages > 1 ? (
                <div className="mt-2 flex items-center justify-between text-[10px] text-[#667085]">
                  <span>
                    Page {payloads.page} of {payloads.totalPages}
                    {payloads.total != null ? ` · ${payloads.total} references` : ""}
                  </span>
                  <span className="flex gap-1.5">
                    <button type="button" className={ACTION_BUTTON} disabled={payloads.page <= 1} onClick={() => payloads.setPage(payloads.page - 1)}>
                      Previous
                    </button>
                    <button type="button" className={ACTION_BUTTON} disabled={payloads.page >= payloads.totalPages} onClick={() => payloads.setPage(payloads.page + 1)}>
                      Next
                    </button>
                  </span>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="No raw payload matched the lookup">
              {c.rawPayloadId
                ? "The exact external-id match found nothing, but the campaign record still points at a raw payload (see the direct reference above)."
                : "The exact external-id match found nothing. This does not prove that no raw payload exists."}
            </EmptyState>
          )}
        </div>
      </Card>

      <Note>
        <b>Internal only.</b> Supplier ids, source values, raw payload references and mapping diagnostics on this tab are admin evidence and are
        not part of any client-facing data.
      </Note>
    </div>
  );
}
CampaignSourceEvidenceTab.propTypes = { campaign: optionalObject, canReadRawPayloads: optionalBool };
