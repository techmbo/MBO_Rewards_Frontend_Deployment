import { useMemo } from "react";
import { usePagedQuery } from "../../../../hooks/usePagedQuery";
import {
  optionalArray,
  optionalBool,
  optionalFunc,
  optionalNode,
  optionalObject,
  optionalString,
  optionalStringOrNumber,
} from "../../../../utils/propValidators";
import { redactCredentialText } from "../../networkAccountContract";
import { TRACKING_LINKS_PATH, toTrackingLinkView } from "../campaignContract";

/**
 * Campaign › Tracking Links — laid out to the v13 campaign workspace (.section-actions, .note,
 * .record-summary chips, .related-table). The campaign is the hub; every link shown here comes from
 * a related record, never from the campaign row itself:
 *
 *   Supplier / network layer (internal admin only, never client-facing)
 *     - campaign.sources[]          per-source supplier tracking URL (SupplierCampaign.trackingUrl)
 *     - GET /ops/admin/tracking-links?network=&q=<supplierCampaignId>   (tracking:read)
 *                                   registry records, narrowed to the exact supplier campaign id
 *   MBO layer
 *     - campaign.clientAssignments[] client-facing MBO tracking URL per assignment
 *     - campaign.tracking            backend count of GENERATED / ACTIVE MBO links on assignments
 *     - registry mboTrackingLink     supplier-level MBO slug generated at sync (no client yet)
 *
 * Nothing is derived or generated in React: a URL is shown only when a record returns it, and a
 * count only when the records behind it are complete.
 */

const REGISTRY_PAGE_SIZE = 50;

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["ACTIVE", "JOINED", "APPROVED", "MAPPED", "YES", "GENERATED", "PUBLISHED", "ASSIGNED"]);
const AMBER = new Set(["PENDING", "VERIFY_LIVE", "NEEDS_REVIEW", "PAUSED"]);
const RED = new Set(["REJECTED", "FAILED", "ERROR", "NO", "SUSPENDED", "NOT_APPLIED", "UNMAPPED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";

function Muted({ children = "—", title }) {
  return (
    <span className="text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Muted.propTypes = { children: optionalNode, title: optionalString };

function Pill({ value, tone, title }) {
  if (value == null || value === "") return <Muted title={title ? `${title}: not returned` : "Not returned"} />;
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
Pill.propTypes = { value: optionalStringOrNumber, tone: optionalString, title: optionalString };

/** Boolean as a YES / NO pill; `null` / `undefined` means the record did not say. */
function Flag({ value, title }) {
  if (value == null) return <Muted title={title ? `${title}: not returned` : "Not returned"} />;
  return <Pill value={value ? "YES" : "NO"} title={title} />;
}
Flag.propTypes = { value: optionalBool, title: optionalString };

function Mono({ value }) {
  if (value == null || value === "") return <Muted />;
  return <span className="whitespace-nowrap font-mono text-[10px]">{String(value)}</span>;
}
Mono.propTypes = { value: optionalStringOrNumber };

/** v13 .actual-value: the full URL in monospace, never shortened or rebuilt. */
function UrlValue({ url, layer }) {
  if (!url) return <Muted>None</Muted>;
  const colour = layer === "mbo" ? "text-[#2457d6]" : "text-[#344054]";
  return (
    <span className="block min-w-[220px] max-w-[440px]">
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        title={layer === "mbo" ? "MBO client tracking URL" : "Supplier / network URL (internal only, not client-safe)"}
        className={`break-all font-mono text-[10px] leading-snug hover:underline ${colour}`}
      >
        {url}
      </a>
    </span>
  );
}
UrlValue.propTypes = { url: optionalString, layer: optionalString };

/** Canonical value first; the network's own value underneath only when it differs. */
function CanonicalWithSource({ value, source }) {
  const showSource = source != null && source !== "" && String(source).toUpperCase() !== String(value ?? "").toUpperCase();
  return (
    <span className="block">
      <Pill value={value} />
      {showSource ? (
        <span className="mt-1 block font-mono text-[9px] leading-tight text-[#b54708]" title="Network value as received (diagnostic)">
          source: {String(source)}
        </span>
      ) : null}
    </span>
  );
}
CanonicalWithSource.propTypes = { value: optionalStringOrNumber, source: optionalStringOrNumber };

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

/** v13 .summary-chip. */
function SummaryChip({ label, value, title }) {
  return (
    <span title={title} className="whitespace-nowrap rounded-full border border-[#e4e7ec] bg-white px-[9px] py-[6px] text-[9px] text-[#475467]">
      {label} <b className="text-[#101828]">{value}</b>
    </span>
  );
}
SummaryChip.propTypes = { label: optionalString, value: optionalNode, title: optionalString };

/** v13 .note (tone: info | warn | danger). */
function Note({ tone = "info", children }) {
  const tones = {
    info: "border-[#2457d6] bg-[#f8fafc]",
    warn: "border-[#b54708] bg-[#fffaeb]",
    danger: "border-[#b42318] bg-[#fef3f2]",
  };
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

/** v13 .related-table: dense, horizontally scrollable. */
function RelatedTable({ columns, rows, rowKey, label }) {
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#e4e7ec] bg-white">
      <table aria-label={label} className="w-full min-w-[900px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} className={TH} title={col.title}>
                {col.label}
                {col.field ? <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey(row, index)} className="hover:bg-[#fbfcff]">
              {columns.map((col) => (
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
RelatedTable.propTypes = { columns: optionalArray, rows: optionalArray, rowKey: optionalFunc, label: optionalString };

/** A layer heading that keeps supplier URLs and MBO client URLs visibly apart. */
function LayerHeading({ layer, title, children }) {
  const tag =
    layer === "mbo" ? (
      <Pill value="MBO CLIENT TRACKING URLS" tone="blue" title="Links MBO issues to clients" />
    ) : (
      <Pill value="SUPPLIER / NETWORK URLS · INTERNAL · NOT CLIENT-SAFE" tone="amber" title="Never share these with clients" />
    );
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#eef2f6] pb-2">
      <div className="min-w-0">
        <h3 className="m-0 text-[13px] font-bold text-[#101828]">{title}</h3>
        {children ? <p className="mt-0.5 text-[10.5px] leading-snug text-[#667085]">{children}</p> : null}
      </div>
      {tag}
    </div>
  );
}
LayerHeading.propTypes = { layer: optionalString, title: optionalString, children: optionalNode };

function SubHeading({ title, children }) {
  return (
    <div className="mb-1.5 mt-3.5">
      <h4 className="m-0 text-[11px] font-extrabold text-[#344054]">{title}</h4>
      {children ? <p className="mt-0.5 text-[10px] leading-snug text-[#667085]">{children}</p> : null}
    </div>
  );
}
SubHeading.propTypes = { title: optionalString, children: optionalNode };

const hasUrl = (value) => typeof value === "string" && value.trim() !== "";
const countWhere = (rows, predicate) => rows.filter(predicate).length;

export function CampaignTrackingLinksTab({ campaign, canRead }) {
  const enabled = Boolean(canRead && campaign.networkSource && campaign.supplierCampaignId);
  const filters = useMemo(
    () => ({ network: campaign.networkSource || undefined, q: campaign.supplierCampaignId || undefined }),
    [campaign.networkSource, campaign.supplierCampaignId],
  );
  const query = usePagedQuery(TRACKING_LINKS_PATH, filters, { pageSize: REGISTRY_PAGE_SIZE, enabled });
  // The registry search is a contains-match, so keep only records of this exact supplier campaign id.
  const registryRows = useMemo(
    () => query.rows.map(toTrackingLinkView).filter(Boolean).filter((r) => r.supplierLinkId === campaign.supplierCampaignId),
    [query.rows, campaign.supplierCampaignId],
  );

  const sources = Array.isArray(campaign.sources) ? campaign.sources : [];
  const assignments = Array.isArray(campaign.clientAssignments) ? campaign.clientAssignments : [];
  const mboClientLinks = assignments.filter((a) => hasUrl(a.mboTrackingUrl));
  const supplierLevelSlugs = registryRows.filter((r) => hasUrl(r.mboTrackingLink));
  const backendMboCount =
    campaign.tracking && typeof campaign.tracking.primaryLinkCount === "number" ? campaign.tracking.primaryLinkCount : null;

  // Registry state. Counts from it are only shown when the whole match set is on this page.
  const registryState = !canRead ? "no-permission" : !enabled ? "not-queryable" : query.loading ? "loading" : query.error ? "error" : "loaded";
  const registrySettled = registryState !== "loading";
  const registryComplete = registryState === "loaded" && !query.pagination?.hasMore;

  const sourcesWithUrl = countWhere(sources, (s) => hasUrl(s.campaignTrackingLink));
  const registryWithSupplierUrl = countWhere(registryRows, (r) => hasUrl(r.supplierTrackingLink));
  const anySupplierUrl = sourcesWithUrl > 0 || registryWithSupplierUrl > 0;
  const linkSupportProven = campaign.linkSupport === true || sources.some((s) => s.linkSupport === true);

  const noTrackingData =
    registrySettled && sources.length === 0 && registryRows.length === 0 && mboClientLinks.length === 0 && !(backendMboCount > 0);

  return (
    <div className="space-y-3.5 text-[#101828]">
      {/* 1. Tracking Summary (.record-summary) */}
      <div className="rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[13px] font-bold">Tracking Summary</h3>
          <span className="flex flex-wrap items-center gap-1.5 text-[9px] text-[#667085]">
            Capability: Link <Flag value={campaign.linkSupport} title="Link Support (capability flag)" /> Deeplink{" "}
            <Flag value={campaign.deeplinkSupport} title="Deeplink Support (capability flag)" />
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SummaryChip label="Campaign sources" value={sources.length} />
          <SummaryChip
            label="Sources with supplier tracking URL"
            value={`${sourcesWithUrl} / ${sources.length}`}
            title="Campaign source records that return a supplier tracking URL"
          />
          {registryComplete ? (
            <>
              <SummaryChip label="Registry records" value={registryRows.length} title="Tracking-link registry records for this supplier campaign id" />
              <SummaryChip label="Registry ACTIVE" value={countWhere(registryRows, (r) => r.linkStatus === "ACTIVE")} />
              <SummaryChip
                label="Registry VERIFY_LIVE"
                value={countWhere(registryRows, (r) => r.linkStatus === "VERIFY_LIVE")}
                title="Link exists but the network's click-id parameter is not confirmed yet"
              />
            </>
          ) : null}
          <SummaryChip label="MBO client links" value={mboClientLinks.length} title="Client assignments that return an MBO tracking URL" />
          {backendMboCount != null ? (
            <SummaryChip
              label="MBO links GENERATED / ACTIVE"
              value={backendMboCount}
              title="Backend count of GENERATED or ACTIVE MBO tracking links across this campaign's client assignments"
            />
          ) : null}
        </div>
        {registryState === "loaded" && query.pagination?.hasMore ? (
          <p className="mt-2 text-[10px] text-[#667085]">Registry counts are not shown: the registry search has more pages than this view loads.</p>
        ) : null}
      </div>

      {noTrackingData ? (
        <EmptyState title="No tracking data available">
          This campaign has no campaign source record, no tracking-link registry record and no MBO tracking link.
        </EmptyState>
      ) : (
        <>
          {/* 2. Supplier / Source Tracking Links */}
          <div className="rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
            <LayerHeading layer="supplier" title="Supplier / Source Tracking Links">
              The network&apos;s own URLs, read from related records. Internal admin data: never shown to or shared with clients.
            </LayerHeading>

            {registrySettled && !anySupplierUrl ? (
              linkSupportProven ? (
                <Note tone="warn">
                  <b>Link supported, but no supplier link synced.</b> The campaign or a campaign source reports Link Support YES, but no
                  source record{registryState === "loaded" ? " and no registry record" : ""} returns a supplier tracking URL.
                  {registryState !== "loaded" ? " The tracking-link registry was not checked (see below)." : ""}
                </Note>
              ) : (
                <Note>No related record returns a supplier tracking URL for this campaign.</Note>
              )
            ) : null}

            <SubHeading title="Campaign source records">
              One row per campaign source. The supplier tracking URL is the source&apos;s SupplierCampaign tracking URL; a destination URL is
              never substituted in.
            </SubHeading>
            {sources.length ? (
              <RelatedTable
                label="Campaign source tracking links"
                rowKey={(s, i) => s.id || `source-${i}`}
                rows={sources}
                columns={[
                  { label: "Network Source", field: "networkSource", render: (s) => <Mono value={s.networkSource} /> },
                  {
                    label: "Campaign Source",
                    field: "sources[].id",
                    render: (s) => (
                      <span className="block whitespace-nowrap">
                        <Mono value={s.id} />
                        {s.isPrimary ? <span className="ml-1"><Pill value="PRIMARY" tone="purple" /></span> : null}
                      </span>
                    ),
                  },
                  { label: "Supplier Campaign ID", field: "supplierCampaignId", render: (s) => <Mono value={s.supplierCampaignId} /> },
                  {
                    label: "Supplier Tracking URL",
                    field: "sources[].campaignTrackingLink",
                    title: "Supplier / network URL. Internal only, not client-safe.",
                    render: (s) => <UrlValue url={s.campaignTrackingLink} layer="supplier" />,
                  },
                  { label: "Link Support", field: "linkSupport", render: (s) => <Flag value={s.linkSupport} title="Link Support" /> },
                  { label: "Deeplink", field: "deeplinkSupport", render: (s) => <Flag value={s.deeplinkSupport} title="Deeplink Support" /> },
                  {
                    label: "Source Status",
                    field: "campaignStatus",
                    render: (s) => <CanonicalWithSource value={s.campaignStatus} source={s.sourceCampaignStatus} />,
                  },
                  {
                    label: "Relationship",
                    field: "relationshipStatus",
                    render: (s) => <CanonicalWithSource value={s.relationshipStatus} source={s.sourceRelationshipStatus} />,
                  },
                  { label: "Source Active", field: "isActive", render: (s) => <Flag value={s.isActive} title="Campaign source active" /> },
                  { label: "Last Synced", field: "lastSyncedAt", render: (s) => <DateValue value={s.lastSyncedAt} /> },
                ]}
              />
            ) : (
              <EmptyState title="No campaign source records">This canonical campaign has no linked campaign source.</EmptyState>
            )}

            <SubHeading title="Network tracking-link records">
              GET /ops/admin/tracking-links for supplier campaign id{" "}
              <span className="font-mono">{campaign.supplierCampaignId || "—"}</span> (tracking:read). For networks that allow it, the
              backend falls back to the destination URL when no tracking URL was synced, so that column is labelled accordingly.
            </SubHeading>
            {registryState === "no-permission" ? (
              <Note>Your role does not include tracking:read, so the tracking-link registry is not shown.</Note>
            ) : registryState === "not-queryable" ? (
              <Note tone="warn">This campaign has no network source or supplier campaign id, so the tracking-link registry cannot be queried.</Note>
            ) : registryState === "loading" ? (
              <p className="py-3 text-[11px] text-[#667085]">Loading tracking-link records…</p>
            ) : registryState === "error" ? (
              <Note tone="danger">
                <b>Tracking-link records could not be loaded.</b> {redactCredentialText(query.error)}{" "}
                <button
                  type="button"
                  onClick={() => query.reload().catch(() => {})}
                  className="ml-1 rounded-[7px] border border-[#e4e7ec] bg-white px-2 py-[3px] text-[10px] font-extrabold text-[#101828] hover:bg-[#f8fafc]"
                >
                  Retry
                </button>
              </Note>
            ) : registryRows.length ? (
              <RelatedTable
                label="Network tracking-link records"
                rowKey={(r, i) => r.id || `registry-${i}`}
                rows={registryRows}
                columns={[
                  {
                    label: "Link Type",
                    field: "linkType",
                    render: (r) => (
                      <span className="block whitespace-nowrap">
                        {r.linkType || <Muted />}
                        {campaign.supplierCampaignRowId && r.id === campaign.supplierCampaignRowId ? (
                          <span className="ml-1" title="Registry record of this campaign's primary source">
                            <Pill value="PRIMARY SOURCE" tone="purple" />
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  { label: "Network Source", field: "networkSource", render: (r) => <Mono value={r.networkSource} /> },
                  {
                    label: "Supplier Link (tracking or destination)",
                    field: "supplierTrackingLink",
                    title: "Supplier / network URL resolved by the backend. Internal only, not client-safe.",
                    render: (r) => <UrlValue url={r.supplierTrackingLink} layer="supplier" />,
                  },
                  { label: "Destination URL", field: "landingPageUrl", render: (r) => <UrlValue url={r.landingPageUrl} layer="supplier" /> },
                  { label: "Deeplink URL", field: "supplierDeeplinkUrl", render: (r) => <UrlValue url={r.supplierDeeplinkUrl} layer="supplier" /> },
                  { label: "Deeplink", field: "deeplinkSupported", render: (r) => <Pill value={r.deeplinkSupported} title="Deeplink supported" /> },
                  { label: "Link Status", field: "linkStatus", render: (r) => <Pill value={r.linkStatus} title="Link status" /> },
                  { label: "Mapping", field: "mappingStatus", render: (r) => <Pill value={r.mappingStatus} title="Mapping status" /> },
                  { label: "Attribution Param", field: "attributionParameter", render: (r) => <Mono value={r.attributionParameter} /> },
                  { label: "Updated", field: "updatedAt", render: (r) => <DateValue value={r.updatedAt} /> },
                ]}
              />
            ) : (
              <EmptyState title="No tracking-link registry record">The registry has no record for this supplier campaign id.</EmptyState>
            )}
          </div>

          {/* 3. MBO Tracking Links */}
          <div className="rounded-[10px] border border-[#b2ccff] bg-white p-3.5">
            <LayerHeading layer="mbo" title="MBO Tracking Links">
              Links MBO generates for clients. They exist only through client assignments and are kept apart from supplier URLs.
            </LayerHeading>

            <SubHeading title="Client assignment links">
              The backend returns one GENERATED or ACTIVE MBO link per client assignment (the primary one when marked).
            </SubHeading>
            {mboClientLinks.length ? (
              <RelatedTable
                label="MBO client tracking links"
                rowKey={(a, i) => a.id || `assignment-${i}`}
                rows={mboClientLinks}
                columns={[
                  {
                    label: "MBO Tracking Link",
                    field: "clientAssignments[].mboTrackingUrl",
                    title: "MBO client tracking URL",
                    render: (a) => <UrlValue url={a.mboTrackingUrl} layer="mbo" />,
                  },
                  { label: "Client", field: "clientName", render: (a) => (a.clientName ? <b>{a.clientName}</b> : <Mono value={a.clientId} />) },
                  { label: "Assignment Status", field: "status", render: (a) => <Pill value={a.status} title="Assignment status" /> },
                  { label: "Published", field: "published", render: (a) => <Flag value={a.published} title="Published to client" /> },
                  { label: "Campaign Source", field: "campaignSourceId", render: (a) => <Mono value={a.campaignSourceId} /> },
                  { label: "Assignment", field: "clientAssignments[].id", render: (a) => <Mono value={a.id} /> },
                ]}
              />
            ) : (
              <EmptyState title="No MBO tracking links yet">
                {assignments.length
                  ? `${assignments.length} client assignment${assignments.length === 1 ? "" : "s"} returned, none with a generated MBO tracking link.`
                  : "MBO tracking links are created when this campaign is assigned to a client."}
              </EmptyState>
            )}
            {backendMboCount != null && backendMboCount > mboClientLinks.length ? (
              <p className="mt-2 text-[10px] text-[#667085]">
                The backend counts {backendMboCount} GENERATED / ACTIVE MBO link{backendMboCount === 1 ? "" : "s"} across these assignments;
                only one per assignment is returned in the campaign detail.
              </p>
            ) : null}

            {supplierLevelSlugs.length ? (
              <>
                <SubHeading title="Supplier-level MBO slugs (not client-assigned)">
                  Generated at supplier sync time on the network record. Not a client link until a client assignment exists.
                </SubHeading>
                <RelatedTable
                  label="Supplier-level MBO slugs"
                  rowKey={(r, i) => `slug-${r.id || i}`}
                  rows={supplierLevelSlugs}
                  columns={[
                    { label: "MBO Slug URL", field: "mboTrackingLink", render: (r) => <UrlValue url={r.mboTrackingLink} layer="mbo" /> },
                    { label: "Client", render: () => <Pill value="NOT ASSIGNED" tone="blue" title="No client assignment behind this slug" /> },
                    { label: "Network Source", field: "networkSource", render: (r) => <Mono value={r.networkSource} /> },
                    { label: "Supplier Campaign ID", field: "supplierLinkId", render: (r) => <Mono value={r.supplierLinkId} /> },
                    { label: "Updated", field: "updatedAt", render: (r) => <DateValue value={r.updatedAt} /> },
                  ]}
                />
              </>
            ) : null}
          </div>
        </>
      )}

      <Note>
        <b>MBO rule:</b> <b>Supplier / network URLs</b> are the network&apos;s own affiliate links and stay internal. <b>MBO client tracking
        URLs</b> are generated only after a client assignment and are the only links meant for clients. <b>Link Support</b> is a
        capability flag, not proof that a link record exists.
      </Note>
    </div>
  );
}
CampaignTrackingLinksTab.propTypes = { campaign: optionalObject, canRead: optionalBool };
