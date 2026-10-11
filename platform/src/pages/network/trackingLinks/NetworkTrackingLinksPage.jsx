import { useCallback, useEffect, useMemo, useState } from "react";
import { hasPermission, PERMISSIONS } from "../../../auth/permissions";
import { useAuth } from "../../../context/AuthContext";
import { usePagedQuery } from "../../../hooks/usePagedQuery";
import { optionalArray, optionalBool, optionalFunc, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { hasSensitiveParams, redactUrlSecrets } from "../couponsVouchers/couponCodeSafety";
import {
  BACKEND_FILTER_GAPS,
  BACKEND_UNAVAILABLE_FIELDS,
  CLIENT_TRACKING_LINKS_PATH,
  NETWORK_SOURCE_OPTIONS,
  SLUG_DISCLAIMER,
  SLUG_STATE,
  SUPPLIER_LINK_ID_HELP,
  TRACKING_REGISTRY_PATH,
  URL_HELP,
  buildRegistryParams,
  deeplinkSupport,
  supplierSlugState,
  toClientLinkView,
  toTrackingLinkView,
} from "./trackingLinkContract";
import { TrackingLinkDrawer } from "./TrackingLinkDrawer";

/**
 * Tracking Links Registry — laid out to the MBO Rewards Network Operations v13 reference
 * (.page-head, metric boxes, .toolbar, .card registries, .note). INTERNAL admin only.
 *
 * Three link classes, never merged:
 *   1. SOURCE · INTERNAL      supplier / network URLs. Never client-safe.
 *   2. MBO SLUG · SUPPLIER    the MBO slug URL on a supplier campaign, generated at sync time. It is
 *                             supplier-level: it does not mean a client assignment exists.
 *   3. ASSIGNED · CLIENT      real TrackingLink records under a client campaign assignment.
 *
 * Two existing endpoints, each in its own registry tab:
 *   GET /ops/admin/tracking-links (unchanged): one row per SupplierCampaign that carries a link
 *     (classes 1 and 2). Server filters: network, contains q.
 *   GET /tracking-links: one row per client TrackingLink (class 3), the endpoint the row drawer
 *     already reads. Server filters: status, clientId, assignmentId, contains search.
 *
 * The class of a URL is shown once, on its column header and in the legend, not on every row.
 * No URL is generated, rewritten or health-checked, and no class is inferred from a URL's domain.
 * Credential-like query values are redacted before render.
 */

const PAGE_SIZE = 50;
const SOURCE_LOAD_ERROR = "Tracking links could not be loaded.";
const CLIENT_LOAD_ERROR = "Client tracking links could not be loaded.";

// GET /tracking-links status values as the backend validator accepts them (trackingLinkStatusSchema).
const CLIENT_STATUS_OPTIONS = ["GENERATED", "ACTIVE", "REVOKED"];

const EMPTY_SOURCE_FILTERS = { q: "", network: "", view: "ALL" };
const EMPTY_CLIENT_FILTERS = { search: "", status: "", clientId: "", assignmentId: "" };

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["ACTIVE", "MAPPED", "YES", "GENERATED", "PUBLISHED"]);
const AMBER = new Set(["VERIFY_LIVE", "NEEDS_REVIEW", "PENDING", "PAUSED"]);
const RED = new Set(["REVOKED", "UNMAPPED", "ERROR", "FAILED", "EXPIRED", "NO"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

/** Link-class tags, shown once per column header and in the legend. */
const CLASS_TAGS = {
  source: { label: "SOURCE · INTERNAL · NOT CLIENT-SAFE", tone: "amber", help: "Supplier / network URL. Internal admin data only; never client-safe." },
  slug: { label: "MBO SLUG · SUPPLIER-LEVEL", tone: "blue", help: `MBO slug URL on the supplier campaign. ${SLUG_DISCLAIMER}` },
  client: { label: "ASSIGNED · CLIENT DELIVERY", tone: "green", help: "MBO tracking URL on a client campaign assignment." },
};

/* v13 .toolbar controls, th / td and button.action. */
const CONTROL =
  "h-[31px] rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff]";
const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2.5 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2.5 py-2 align-middle text-[10.5px] text-[#101828]";
const ACTION_BUTTON =
  "rounded-[7px] border border-[#e4e7ec] bg-white px-2.5 py-[5px] text-[10px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:opacity-40";

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function Muted({ children = "—", title }) {
  return (
    <span className="font-normal text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Muted.propTypes = { children: optionalNode, title: optionalString };

function Pill({ value, tone, title, empty = "—" }) {
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

function ClassTag({ layer }) {
  const tag = CLASS_TAGS[layer];
  return <Pill value={tag.label} tone={tag.tone} title={tag.help} />;
}
ClassTag.propTypes = { layer: optionalString };

/** A long id shown short; the full value stays on hover. */
function ShortId({ value, title }) {
  if (value == null || value === "") return <Muted>—</Muted>;
  const text = String(value);
  const short = text.length > 12 ? `${text.slice(0, 8)}…` : text;
  return (
    <span className="font-mono text-[10px] text-[#344054]" title={title ? `${title}: ${text}` : text}>
      {short}
    </span>
  );
}
ShortId.propTypes = { value: optionalStringOrNumber, title: optionalString };

function Mono({ value, title }) {
  if (value == null || value === "") return <Muted>—</Muted>;
  return (
    <span className="font-mono text-[10px]" title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString };

/** Brand in bold with the campaign underneath, both clipped to one line. */
function BrandCampaign({ brand, campaign }) {
  return (
    <span className="block max-w-[170px]">
      <span className="block truncate font-semibold" title={brand || undefined}>
        {brand || <Muted>No brand</Muted>}
      </span>
      <span className="block truncate text-[10px] text-[#667085]" title={campaign || undefined}>
        {campaign || "No campaign name"}
      </span>
    </span>
  );
}
BrandCampaign.propTypes = { brand: optionalString, campaign: optionalString };

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function DateValue({ value }) {
  const short = formatDate(value);
  return short ? <span title={formatDateTime(value) || undefined}>{short}</span> : <Muted />;
}
DateValue.propTypes = { value: optionalString };

/**
 * One URL on one line, clipped, with the full (redacted) value on hover. Credential-like query
 * values are replaced before render, and a URL that needed redaction is text, not a link, so its
 * original value never reaches the DOM through an href.
 */
function UrlValue({ url, layer, missing = "Not returned", help }) {
  const text = url == null || String(url).trim() === "" ? null : String(url).trim();
  if (!text) return <Muted title={help}>{missing}</Muted>;
  const redacted = hasSensitiveParams(text);
  const shown = redacted ? redactUrlSecrets(text) : text;
  const display = shown.replace(/^https?:\/\//i, "");
  const colour = layer === "source" ? "text-[#344054]" : layer === "client" ? "text-[#067647]" : "text-[#2457d6]";
  const cls = `block max-w-[210px] truncate font-mono text-[10px] ${colour}`;
  if (redacted) {
    return (
      <span className={cls} data-url-redacted="true" title={`${shown}\nA credential-like query value was redacted; the link is not clickable.`}>
        {display}
      </span>
    );
  }
  return (
    <a href={text} target="_blank" rel="noreferrer noopener" className={`${cls} hover:underline`} title={shown} onClick={(e) => e.stopPropagation()}>
      {display}
    </a>
  );
}
UrlValue.propTypes = { url: optionalString, layer: optionalString, missing: optionalString, help: optionalString };

/** Compact v13 metric box. */
function Metric({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-2.5">
      <span className="block truncate text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <b className="mt-0.5 block text-[18px] leading-tight text-[#101828]">{children}</b>
      {hint ? <small className="block truncate text-[9.5px] text-[#667085]" title={hint}>{hint}</small> : null}
    </div>
  );
}
Metric.propTypes = { label: optionalString, children: optionalNode, hint: optionalString };

/** v13 .note (tone: info | warn | danger). */
function Note({ tone = "info", children }) {
  const tones = { info: "border-[#2457d6] bg-[#f8fafc]", warn: "border-[#b54708] bg-[#fffaeb]", danger: "border-[#b42318] bg-[#fef3f2]" };
  return <div className={`rounded-r-[7px] border-l-[3px] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467] ${tones[tone]}`}>{children}</div>;
}
Note.propTypes = { tone: optionalString, children: optionalNode };

/* ── Registry table (shared layout) ───────────────────────────────────────── */

function RegistryTable({ label, rows, columns, onRowClick }) {
  return (
    <div className="max-h-[65vh] overflow-auto">
      <table aria-label={label} className="w-full min-w-[1080px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} className={`${TH} ${col.sticky ? "right-0 z-[3] shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]" : ""}`}>
                {col.label}
                {col.tag ? (
                  <span className="mt-1 block normal-case tracking-normal">
                    <ClassTag layer={col.tag} />
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.id || `row-${index}`}
              className={`${onRowClick ? "cursor-pointer" : ""} hover:bg-[#fbfcff]`}
              onClick={onRowClick ? () => onRowClick(row.id) : undefined}
            >
              {columns.map((col) => (
                <td key={col.label} className={`${TD} ${col.sticky ? "sticky right-0 bg-white shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]" : ""}`}>
                  {col.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
RegistryTable.propTypes = { label: optionalString, rows: optionalArray, columns: optionalArray, onRowClick: optionalFunc };

function RegistryCard({ title, subtitle, query, rows, filtersActive, emptyText, loadingText, children }) {
  const total = typeof query.pagination?.total === "number" ? query.pagination.total : null;
  const hasMore = Boolean(query.pagination?.hasMore);
  const totalPages = query.pagination?.totalPages ?? (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null);
  const page = query.page;
  let body;
  if (query.loading) body = <p className="px-4 py-8 text-center text-[11px] text-[#667085]">{loadingText}</p>;
  else if (query.error)
    body = (
      <div className="px-4 py-6">
        <Note tone="danger">
          <b>{String(query.error)}</b>{" "}
          <button type="button" className={`${ACTION_BUTTON} ml-1`} onClick={() => query.reload().catch(() => {})}>
            Retry
          </button>
        </Note>
      </div>
    );
  else if (!rows.length)
    body = (
      <div className="px-4 py-8 text-center text-[11px] text-[#667085]">
        <b className="mb-1 block text-[#344054]">No records</b>
        {filtersActive ? "No record matched these filters." : emptyText}
      </div>
    );
  else body = children;

  return (
    <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e7ec] px-4 py-2.5">
        <h2 className="m-0 text-sm font-bold">{title}</h2>
        {subtitle ? <span className="text-[10px] text-[#667085]">{subtitle}</span> : null}
      </div>
      {body}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7ec] px-4 py-2.5 text-[10px] text-[#667085]">
        <span>
          Page {page}
          {totalPages != null ? ` of ${totalPages}` : ""}
          {total != null ? ` · ${total} records` : ""}
        </span>
        <div className="flex gap-1.5">
          <button type="button" className={ACTION_BUTTON} disabled={page <= 1 || query.loading} onClick={() => query.setPage(page - 1)}>
            Previous
          </button>
          <button
            type="button"
            className={ACTION_BUTTON}
            disabled={query.loading || !(hasMore || (totalPages != null && page < totalPages))}
            onClick={() => query.setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
RegistryCard.propTypes = {
  title: optionalString,
  subtitle: optionalNode,
  query: optionalObject,
  rows: optionalArray,
  filtersActive: optionalBool,
  emptyText: optionalString,
  loadingText: optionalString,
  children: optionalNode,
};

/* ── Columns ──────────────────────────────────────────────────────────────── */

function sourceColumns({ offset, onOpen }) {
  return [
    { label: "#", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> },
    { label: "Link ID", render: (r) => <ShortId value={r.id} title="Supplier campaign row id" /> },
    { label: "Brand / Campaign", render: (r) => <BrandCampaign brand={r.brandName} campaign={r.campaignName} /> },
    { label: "Network", render: (r) => <Mono value={r.networkSource || r.supplier} /> },
    { label: "Supplier Campaign ID", render: (r) => <Mono value={r.supplierLinkId} title={SUPPLIER_LINK_ID_HELP} /> },
    {
      label: "Supplier / Source URL",
      tag: "source",
      render: (r) => <UrlValue url={r.supplierTrackingLink} layer="source" missing="None resolved" help={URL_HELP.supplierTrackingLink} />,
    },
    {
      label: "MBO Tracking URL",
      tag: "slug",
      render: (r) => <UrlValue url={r.mboTrackingLink} layer="slug" missing="Not generated" help={URL_HELP.mboTrackingLink} />,
    },
    {
      label: "Method",
      render: (r) => {
        const deeplink = deeplinkSupport(r);
        const title = [
          `Deeplink: ${deeplink.label}`,
          r.attributionParameter ? `Attribution parameter: ${r.attributionParameter}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return r.linkType ? <span title={title}>{r.linkType}</span> : <Muted title={title}>Not returned</Muted>;
      },
    },
    { label: "Status", render: (r) => <Pill value={r.linkStatus} title="Link status (backend)" empty="Not available" /> },
    { label: "Mapping", render: (r) => <Pill value={r.mappingStatus} title="Mapping status (backend)" empty="Not available" /> },
    { label: "Updated", render: (r) => <DateValue value={r.updatedAt} /> },
    {
      label: "Action",
      sticky: true,
      render: (r) => (
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(r.id);
          }}
        >
          Details
        </button>
      ),
    },
  ];
}

function clientColumns({ offset }) {
  return [
    { label: "#", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> },
    { label: "Link ID", render: (r) => <ShortId value={r.id} title="TrackingLink id" /> },
    {
      label: "Client / Assignment",
      render: (r) => (
        <span className="block max-w-[170px]">
          <span className="block truncate font-semibold" title={r.clientName || r.clientId || undefined}>
            {r.clientName || <ShortId value={r.clientId} title="Client id" />}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-[#667085]">
            <ShortId value={r.assignmentId} title="Assignment id" />
            {r.assignmentStatus ? <span title="Assignment status">{String(r.assignmentStatus).toLowerCase()}</span> : null}
            {r.assignmentPublished ? <span title="Assignment published">· published</span> : null}
          </span>
        </span>
      ),
    },
    { label: "Brand / Campaign", render: (r) => <BrandCampaign brand={r.brand} campaign={r.campaignDisplayName} /> },
    { label: "Network", render: (r) => <Mono value={r.supplier} /> },
    { label: "Supplier / Source URL", tag: "source", render: (r) => <UrlValue url={r.supplierTrackingUrl} layer="source" /> },
    {
      label: "MBO Tracking URL",
      tag: "client",
      render: (r) => <UrlValue url={r.mboTrackingUrl} layer="client" missing="Not generated" help={r.slug ? `Slug: ${r.slug}` : undefined} />,
    },
    { label: "Method", render: (r) => (r.trackingType ? <Mono value={r.trackingType} /> : <Muted>Not returned</Muted>) },
    {
      label: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1">
          <Pill value={r.status} title="Tracking link status (backend)" empty="Not available" />
          {r.isPrimary ? <Pill value="PRIMARY" tone="purple" /> : null}
        </span>
      ),
    },
    { label: "Clicks", render: (r) => (r.clickCount != null ? <span className="tabular-nums">{r.clickCount}</span> : <Muted />) },
    { label: "Created", render: (r) => <DateValue value={r.createdAt} /> },
    { label: "Updated", render: (r) => <DateValue value={r.updatedAt} /> },
  ];
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function NetworkTrackingLinksPage() {
  const { user } = useAuth();
  const canReadCatalog = hasPermission(user, PERMISSIONS.CATALOG_READ);
  const canReadTracking = hasPermission(user, PERMISSIONS.TRACKING_READ);
  const [registry, setRegistry] = useState("SOURCE");
  const [sourceFilters, setSourceFilters] = useState(EMPTY_SOURCE_FILTERS);
  const [clientFilters, setClientFilters] = useState(EMPTY_CLIENT_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const [resolvedCampaignId, setResolvedCampaignId] = useState(null);

  const debouncedQ = useDebounced(sourceFilters.q);
  const sourceParams = useMemo(() => buildRegistryParams({ q: debouncedQ, network: sourceFilters.network }), [debouncedQ, sourceFilters.network]);
  const sourceQuery = usePagedQuery(TRACKING_REGISTRY_PATH, sourceParams, { pageSize: PAGE_SIZE, safeErrorMessage: SOURCE_LOAD_ERROR });

  const debouncedSearch = useDebounced(clientFilters.search);
  const debouncedClient = useDebounced(clientFilters.clientId);
  const debouncedAssignment = useDebounced(clientFilters.assignmentId);
  const clientParams = useMemo(() => {
    const params = {};
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (clientFilters.status) params.status = clientFilters.status;
    if (debouncedClient.trim()) params.clientId = debouncedClient.trim();
    if (debouncedAssignment.trim()) params.assignmentId = debouncedAssignment.trim();
    return params;
  }, [debouncedSearch, clientFilters.status, debouncedClient, debouncedAssignment]);
  const clientQuery = usePagedQuery(CLIENT_TRACKING_LINKS_PATH, clientParams, { pageSize: PAGE_SIZE, safeErrorMessage: CLIENT_LOAD_ERROR });

  const sourceRows = useMemo(() => sourceQuery.rows.map(toTrackingLinkView).filter(Boolean), [sourceQuery.rows]);
  const clientRows = useMemo(() => clientQuery.rows.map(toClientLinkView).filter(Boolean), [clientQuery.rows]);
  const visibleSourceRows = useMemo(() => {
    if (sourceFilters.view === "DEEPLINK") return sourceRows.filter((r) => deeplinkSupport(r).supported === true);
    if (sourceFilters.view === "SLUG") return sourceRows.filter((r) => supplierSlugState(r) === SLUG_STATE.GENERATED);
    return sourceRows;
  }, [sourceRows, sourceFilters.view]);
  const selected = useMemo(() => sourceRows.find((r) => r.id === selectedId) || null, [sourceRows, selectedId]);

  const openRow = useCallback((id) => {
    setResolvedCampaignId(null);
    setSelectedId(id);
  }, []);
  const handleClose = useCallback(() => {
    setSelectedId(null);
    setResolvedCampaignId(null);
  }, []);
  const handleResolved = useCallback((id) => setResolvedCampaignId(id), []);

  const settled = (query) => !query.loading && !query.error;
  const totalOf = (query) => (settled(query) && typeof query.pagination?.total === "number" ? query.pagination.total : null);
  const scopeOf = (query, rows) => {
    const total = totalOf(query);
    const whole = total != null && query.page === 1 && !query.pagination?.hasMore && rows.length >= total;
    return whole ? "All matching records" : `This page (${rows.length} rows)`;
  };
  const val = (query, value) => (settled(query) ? value : "…");
  const totalBox = (query) => totalOf(query) ?? <Muted>{query.loading ? "…" : "Not available"}</Muted>;

  const sourceCols = useMemo(() => sourceColumns({ offset: (sourceQuery.page - 1) * PAGE_SIZE, onOpen: openRow }), [sourceQuery.page, openRow]);
  const clientCols = useMemo(() => clientColumns({ offset: (clientQuery.page - 1) * PAGE_SIZE }), [clientQuery.page]);
  const sourceFiltersActive = Boolean(sourceFilters.q || sourceFilters.network || sourceFilters.view !== "ALL");
  const clientFiltersActive = Object.values(clientFilters).some(Boolean);
  const isSource = registry === "SOURCE";
  const sourceScope = scopeOf(sourceQuery, sourceRows);
  const clientScope = scopeOf(clientQuery, clientRows);

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Tracking Links Registry</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            Supplier source links, supplier-level MBO slugs and client-assigned MBO links across all networks, kept as separate classes.
          </p>
        </div>
        <Pill value="INTERNAL ADMIN" tone="amber" title="Supplier URLs on this page are internal and not client-safe" />
      </div>

      {/* registry tabs */}
      <div role="tablist" aria-label="Link registries" className="mb-3 flex flex-wrap items-center gap-[5px]">
        {[
          { key: "SOURCE", label: "Source & MBO Slug Registry", query: sourceQuery },
          { key: "CLIENT", label: "Client-Assigned Links", query: clientQuery },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={registry === tab.key}
            onClick={() => setRegistry(tab.key)}
            className={`rounded-[7px] border px-3 py-[7px] text-[10.5px] font-extrabold ${
              registry === tab.key ? "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]" : "border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f8fafc]"
            }`}
          >
            {tab.label}
            {totalOf(tab.query) != null ? ` (${totalOf(tab.query)})` : ""}
          </button>
        ))}
        <span className="ml-auto flex flex-wrap items-center gap-1.5" aria-label="Link class legend">
          <ClassTag layer="source" />
          <ClassTag layer="slug" />
          <ClassTag layer="client" />
        </span>
      </div>

      {/* metrics for the active registry */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {isSource ? (
          <>
            <Metric label="Source Link Records" hint="Backend total">
              {totalBox(sourceQuery)}
            </Metric>
            <Metric label="With Supplier URL" hint={sourceScope}>
              {val(sourceQuery, sourceRows.filter((r) => r.supplierTrackingLink).length)}
            </Metric>
            <Metric label="MBO Slug Generated" hint={`${sourceScope} · not client assignments`}>
              {val(sourceQuery, sourceRows.filter((r) => supplierSlugState(r) === SLUG_STATE.GENERATED).length)}
            </Metric>
            <Metric label="Active · Networks" hint={`${sourceScope} · linkStatus ACTIVE`}>
              {settled(sourceQuery) ? (
                <>
                  {sourceRows.filter((r) => String(r.linkStatus || "").toUpperCase() === "ACTIVE").length}
                  <span className="text-[13px] font-semibold text-[#667085]">
                    {" "}
                    · {new Set(sourceRows.map((r) => r.networkSource || r.supplier).filter(Boolean)).size}
                  </span>
                </>
              ) : (
                "…"
              )}
            </Metric>
          </>
        ) : (
          <>
            <Metric label="Client-Assigned Links" hint="Backend total">
              {totalBox(clientQuery)}
            </Metric>
            <Metric label="Active" hint={`${clientScope} · status ACTIVE`}>
              {val(clientQuery, clientRows.filter((r) => String(r.status || "").toUpperCase() === "ACTIVE").length)}
            </Metric>
            <Metric label="Clients" hint={clientScope}>
              {val(clientQuery, new Set(clientRows.map((r) => r.clientId).filter(Boolean)).size)}
            </Metric>
            <Metric label="Networks" hint={clientScope}>
              {val(clientQuery, new Set(clientRows.map((r) => r.supplier).filter(Boolean)).size)}
            </Metric>
          </>
        )}
      </div>

      {isSource ? (
        <>
          {/* .toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Search source links"
              className={`${CONTROL} min-w-[240px] flex-1 sm:max-w-[360px]`}
              placeholder="Search brand, campaign, supplier campaign id, URL"
              value={sourceFilters.q}
              onChange={(e) => setSourceFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <select
              aria-label="Network"
              className={CONTROL}
              value={sourceFilters.network}
              onChange={(e) => setSourceFilters((prev) => ({ ...prev, network: e.target.value }))}
            >
              <option value="">All Networks</option>
              {NETWORK_SOURCE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              aria-label="Page view"
              title="Refines the rows already loaded on this page only"
              className={CONTROL}
              value={sourceFilters.view}
              onChange={(e) => setSourceFilters((prev) => ({ ...prev, view: e.target.value }))}
            >
              <option value="ALL">View: all loaded rows</option>
              <option value="DEEPLINK">View: deeplink supported (this page)</option>
              <option value="SLUG">View: MBO slug generated (this page)</option>
            </select>
            {sourceFiltersActive ? (
              <button type="button" className={ACTION_BUTTON} onClick={() => setSourceFilters(EMPTY_SOURCE_FILTERS)}>
                Reset
              </button>
            ) : null}
          </div>

          <RegistryCard
            title="Source & MBO Slug Registry"
            subtitle="One row per supplier campaign with a link · no client assignment on these rows · open Details for client links"
            query={sourceQuery}
            rows={sourceRows}
            filtersActive={sourceFiltersActive}
            loadingText="Loading source tracking links…"
            emptyText="No supplier campaign with a link exists yet. Rows appear once a network sync has recorded a tracking or destination URL."
          >
            {visibleSourceRows.length ? (
              <RegistryTable label="Source tracking links" rows={visibleSourceRows} columns={sourceCols} onRowClick={openRow} />
            ) : (
              <p className="px-4 py-8 text-center text-[11px] text-[#667085]">No loaded row matches this view.</p>
            )}
          </RegistryCard>
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Search client links"
              className={`${CONTROL} min-w-[220px] flex-1 sm:max-w-[320px]`}
              placeholder="Search client links"
              value={clientFilters.search}
              onChange={(e) => setClientFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
            <select
              aria-label="Link status"
              className={CONTROL}
              value={clientFilters.status}
              onChange={(e) => setClientFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">Any Status</option>
              {CLIENT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="search"
              aria-label="Client ID"
              className={`${CONTROL} w-[170px] font-mono`}
              placeholder="Client ID (exact)"
              value={clientFilters.clientId}
              onChange={(e) => setClientFilters((prev) => ({ ...prev, clientId: e.target.value }))}
            />
            <input
              type="search"
              aria-label="Assignment ID"
              className={`${CONTROL} w-[190px] font-mono`}
              placeholder="Assignment ID (exact)"
              value={clientFilters.assignmentId}
              onChange={(e) => setClientFilters((prev) => ({ ...prev, assignmentId: e.target.value }))}
            />
            {clientFiltersActive ? (
              <button type="button" className={ACTION_BUTTON} onClick={() => setClientFilters(EMPTY_CLIENT_FILTERS)}>
                Reset
              </button>
            ) : null}
          </div>

          <RegistryCard
            title="Client-Assigned Links"
            subtitle="One row per TrackingLink on a client assignment · client linkage from the record itself"
            query={clientQuery}
            rows={clientRows}
            filtersActive={clientFiltersActive}
            loadingText="Loading client-assigned links…"
            emptyText="No tracking link has been generated for a client assignment yet."
          >
            <RegistryTable label="Client-assigned tracking links" rows={clientRows} columns={clientCols} />
          </RegistryCard>
        </>
      )}

      <Note>
        <b>Link classes:</b> source URLs are the network&apos;s own links and are never client-safe. MBO slugs are generated on the
        supplier campaign at sync time and do not mean a client assignment exists. Client-assigned links are TrackingLink records under
        a client assignment. Hover a URL or ID for its full value; credential-like query values are redacted. Nothing here generates,
        rewrites or health-checks a URL.
      </Note>

      <details className="mt-3 rounded-xl border border-[#e4e7ec] bg-white px-4 py-3">
        <summary className="cursor-pointer text-[12px] font-bold">What these registries can and cannot filter</summary>
        <div className="mt-2 space-y-1.5 text-[11px] leading-[1.55] text-[#475467]">
          <p>
            <b>Source registry (backend):</b> network, and a contains search over campaign name, merchant name, tracking URL, MBO URL and
            supplier campaign id. <b>Not supported:</b> {BACKEND_FILTER_GAPS.join(", ")}.
          </p>
          <p>
            <b>Client-assigned links (backend):</b> status, client id, assignment id and a contains search.
          </p>
          <p>
            <b>Not returned by the source registry:</b> <span className="font-mono">{BACKEND_UNAVAILABLE_FIELDS.join(", ")}</span>, and no
            creation time. Client links return no supplier campaign id.
          </p>
        </div>
      </details>

      <TrackingLinkDrawer
        row={selected}
        open={Boolean(selected)}
        onClose={handleClose}
        canReadCatalog={canReadCatalog}
        canReadTracking={canReadTracking}
        resolvedCampaignId={resolvedCampaignId}
        onResolved={handleResolved}
      />
    </div>
  );
}
