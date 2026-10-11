import { useEffect, useMemo, useState } from "react";
import { hasPermission, PERMISSIONS } from "../../../auth/permissions";
import { useAuth } from "../../../context/AuthContext";
import { usePagedQuery } from "../../../hooks/usePagedQuery";
import { optionalArray, optionalFunc, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { CODE_STATE, URL_AS_CODE_HELP, URL_AS_CODE_LABEL, couponCodeState } from "./couponCodeSafety";
import {
  BACKEND_FILTER_GAPS,
  BACKEND_UNAVAILABLE_FIELDS,
  DISCOUNT_KIND,
  NETWORK_SOURCE_OPTIONS,
  SUPPLIER_COUPONS_PATH,
  buildCouponListParams,
  couponReadableText,
  formatDiscount,
  toCouponView,
} from "./couponContract";
import { CouponDrawer } from "./CouponDrawer";

/**
 * Coupon / Voucher Registry — laid out to the MBO Rewards Network Operations v13 reference
 * (.page-head, .grid4 metrics, .toolbar, one .card holding the dense registry, .note).
 *
 * Every SupplierCoupon record across networks and campaigns, one row each. INTERNAL admin only:
 * read-only, never the client Coupon CMS, and a campaign's Coupon Support flag is never a record.
 *
 * Data (unchanged): GET /supplier-coupons (coupons:read), reduced by toCouponView. Codes, discount
 * values and statuses are shown exactly as stored. Status is never derived from dates, and every
 * summary status count uses the stored couponStatus only.
 */

const PAGE_SIZE = 50;

/**
 * The page owns the message for a failed load; the response body is never displayed (the hook
 * derives what to show from the HTTP status alone).
 */
const LOAD_ERROR = "Coupons could not be loaded.";

/**
 * Filter values exactly as the backend query validator accepts them
 * (supplier/validators/schemas.js couponStatusSchema / couponTypeSchema). Any other value is
 * rejected by the endpoint, so none is offered.
 */
const STATUS_FILTER_OPTIONS = ["ACTIVE", "SCHEDULED", "EXPIRED", "UNKNOWN"];
const TYPE_FILTER_OPTIONS = ["CODE", "LINK", "UNKNOWN"];
// Stored statuses the summary counts (Prisma CouponStatus); DISABLED can be stored but not filtered.
const STORED_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "DISABLED", "UNKNOWN"];

const EMPTY_FILTERS = { search: "", networkSource: "", couponStatus: "", couponType: "", supplierCampaignId: "" };

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["ACTIVE", "MAPPED", "YES"]);
const AMBER = new Set(["SCHEDULED", "NEEDS_REVIEW", "REVIEW_REQUIRED", "VERIFY_LIVE", "PENDING"]);
const RED = new Set(["EXPIRED", "DISABLED", "UNMAPPED", "ERROR", "FAILED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

/* v13 .toolbar controls, th / td and button.action. */
const CONTROL =
  "h-[31px] rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff]";
const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";
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

function Mono({ value, title }) {
  if (value == null || value === "") return <Muted>Not available</Muted>;
  return (
    <span className="font-mono text-[10px]" title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString };

/** Supplier identifier or wording as secondary evidence (v13 .source-extra .keys). */
function SourceText({ children, title = "Source value as stored (diagnostic)" }) {
  return (
    <span className="block font-mono text-[9px] leading-tight text-[#b54708]" title={title}>
      {children}
    </span>
  );
}
SourceText.propTypes = { children: optionalNode, title: optionalString };

function Sub({ children, title }) {
  return (
    <span className="block font-mono text-[9px] leading-tight text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Sub.propTypes = { children: optionalNode, title: optionalString };

function Clip({ text, width = "max-w-[170px]" }) {
  if (!text) return <Muted>Not available</Muted>;
  return (
    <span className={`block truncate ${width}`} title={text}>
      {text}
    </span>
  );
}
Clip.propTypes = { text: optionalString, width: optionalString };

/** Supplier text as readable plain text (descriptions can carry basic HTML); never injected. */
function Readable({ value, width }) {
  const text = couponReadableText(value);
  if (text == null) return <Muted />;
  return <Clip text={text} width={width} />;
}
Readable.propTypes = { value: optionalString, width: optionalString };

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** v13 .metric. */
function Metric({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
      <span className="block text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <b className="mt-[5px] block text-[21px] leading-tight text-[#101828]">{children}</b>
      {hint ? <small className="mt-0.5 block text-[10px] leading-snug text-[#667085]">{hint}</small> : null}
    </div>
  );
}
Metric.propTypes = { label: optionalString, children: optionalNode, hint: optionalNode };

/** v13 .note (tone: info | warn | danger). */
function Note({ tone = "info", children }) {
  const tones = { info: "border-[#2457d6] bg-[#f8fafc]", warn: "border-[#b54708] bg-[#fffaeb]", danger: "border-[#b42318] bg-[#fef3f2]" };
  return <div className={`rounded-r-[7px] border-l-[3px] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467] ${tones[tone]}`}>{children}</div>;
}
Note.propTypes = { tone: optionalString, children: optionalNode };

/* ── Cells ────────────────────────────────────────────────────────────────── */

/**
 * The code exactly as stored (spacing and case untouched). A value that is really a URL is never
 * printed — it is not a redeemable code and could carry token material — and is flagged instead.
 */
function CodeCell({ coupon }) {
  const { state } = couponCodeState(coupon);
  if (state === CODE_STATE.CODE) {
    return (
      <span className="inline-block rounded-[5px] border border-dashed border-[#98a2b3] bg-[#f8fafc] px-1.5 py-[3px]">
        <span className="whitespace-pre font-mono text-[11px] font-extrabold" title="Coupon code exactly as stored">
          {String(coupon.couponCode)}
        </span>
      </span>
    );
  }
  if (state === CODE_STATE.URL_SUPPLIED) {
    return (
      <span className="block" data-coupon-code="url-supplied" title={URL_AS_CODE_HELP}>
        <span className="text-[10px] text-[#475467]">{URL_AS_CODE_LABEL}</span>
        <span className="mt-0.5 block">
          <Pill value="NEEDS REVIEW" tone="amber" />
        </span>
      </span>
    );
  }
  if (String(coupon.couponType || "").toUpperCase() === "LINK") return <Muted title="The record's coupon type is LINK">Link coupon · no code</Muted>;
  return <Muted title="No coupon code is stored on this record">No code returned</Muted>;
}
CodeCell.propTypes = { coupon: optionalObject };

/** Discount value exactly as stored; a bare number is never given a unit. */
function DiscountValueCell({ coupon }) {
  const discount = formatDiscount(coupon);
  if (discount.kind === DISCOUNT_KIND.NONE) return <Muted>Not returned</Muted>;
  return (
    <span className="block" data-discount-unit={discount.unitKnown ? "known" : "unknown"}>
      <b title="Discount value exactly as stored; never converted">{discount.text}</b>
      {discount.unitKnown ? null : <Sub title="Stored as a bare number; the contract states no unit, so none is added">unit not stated</Sub>}
    </span>
  );
}
DiscountValueCell.propTypes = { coupon: optionalObject };

function buildColumns({ onOpen, offset }) {
  return [
    { label: "#", field: "row", render: (c, index) => <span className="font-mono text-[10px] text-[#667085]">{offset + index + 1}</span> },
    { label: "Coupon / Voucher ID", field: "id", render: (c) => <Mono value={c.id} title="MBO SupplierCoupon record id" /> },
    {
      label: "Network Source",
      field: "network · networkSource",
      render: (c) => (
        <span className="block">
          <Mono value={c.network || c.supplier} />
          {c.networkSource && c.networkSource !== (c.network || c.supplier) ? <SourceText title="Source account / network source as stored">{c.networkSource}</SourceText> : null}
        </span>
      ),
    },
    { label: "Brand", field: "brandName", render: (c) => <Clip text={c.brandName} width="max-w-[140px]" /> },
    { label: "Campaign", field: "campaignName", render: (c) => <Clip text={c.campaignName} /> },
    {
      label: "Supplier Campaign ID",
      field: "campaign.supplierCampaignId",
      render: (c) => (
        <span className="block">
          <Mono value={c.campaign?.supplierCampaignId} title="Supplier-side campaign id; not unique across MBO rows" />
          {c.supplierCampaignId ? <Sub title="MBO SupplierCampaign row id">row {c.supplierCampaignId}</Sub> : null}
        </span>
      ),
    },
    {
      label: "Supplier Coupon ID",
      field: "supplierCouponId",
      render: (c) => (c.supplierCouponId ? <SourceText title="Supplier / network coupon id">{c.supplierCouponId}</SourceText> : <Muted>Not available</Muted>),
    },
    { label: "Coupon Code", field: "couponCode", render: (c) => <CodeCell coupon={c} /> },
    { label: "Title", field: "title", render: (c) => <Readable value={c.title} width="max-w-[180px]" /> },
    { label: "Description", field: "couponDescription", render: (c) => <Readable value={c.couponDescription} width="max-w-[220px]" /> },
    { label: "Coupon Type", field: "couponType", render: (c) => <Pill value={c.couponType} tone="purple" title="Coupon type" empty="Not available" /> },
    { label: "Discount Type", field: "discountType", render: (c) => (c.discountType ? <Mono value={c.discountType} /> : <Muted>Not returned</Muted>) },
    { label: "Discount Value", field: "discountValue", render: (c) => <DiscountValueCell coupon={c} /> },
    {
      label: "Exclusive",
      field: "couponIsExclusive",
      render: (c) => (c.couponIsExclusive == null ? <Muted>Not stated</Muted> : <Pill value={c.couponIsExclusive ? "YES" : "NO"} tone={c.couponIsExclusive ? "green" : "blue"} />),
    },
    { label: "Country", field: "country", render: (c) => (c.country ? <Mono value={c.country} /> : <Muted />) },
    { label: "Customer Type", field: "customerType", render: (c) => c.customerType || <Muted /> },
    { label: "Start Date", field: "couponStartDate", render: (c) => (formatDate(c.couponStartDate) ? <span>{formatDate(c.couponStartDate)}</span> : <Muted />) },
    {
      label: "End Date",
      field: "couponEndDate",
      render: (c) => (formatDate(c.couponEndDate) ? <span>{formatDate(c.couponEndDate)}</span> : <Muted title="No end date returned">Open-ended</Muted>),
    },
    { label: "Coupon Status", field: "couponStatus", render: (c) => <Pill value={c.couponStatus} title="Coupon status as stored" empty="Not available" /> },
    {
      label: "Mapping Status",
      field: "mappingStatus",
      render: (c) => (
        <span className="block">
          <Pill value={c.mappingStatus} title="Mapping status (backend)" empty="Not available" />
          {c.fieldMappingOutcome ? <Sub title="Field mapping outcome">{c.fieldMappingOutcome}</Sub> : null}
        </span>
      ),
    },
    {
      label: "Source Object / Path",
      field: "sourceObject · sourcePath",
      render: (c) =>
        c.sourceObject || c.sourcePath ? (
          <span className="block">
            {c.sourceObject ? <SourceText>{c.sourceObject}</SourceText> : null}
            {c.sourcePath ? <SourceText>{c.sourcePath}</SourceText> : null}
          </span>
        ) : (
          <Muted />
        ),
    },
    { label: "Last Synced", field: "lastSyncedAt", render: (c) => (formatDateTime(c.lastSyncedAt) ? <span>{formatDateTime(c.lastSyncedAt)}</span> : <Muted />) },
    {
      label: "Action",
      field: "",
      sticky: true,
      render: (c) => (
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(c.id);
          }}
        >
          Details
        </button>
      ),
    },
  ];
}

function RegistryTable({ coupons, columns, onRowClick }) {
  return (
    <div className="max-h-[65vh] overflow-auto">
      <table aria-label="Coupon / voucher records" className="w-full min-w-[2200px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label} className={`${TH} ${col.sticky ? "right-0 z-[3] shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]" : ""}`}>
                {col.label}
                {col.field ? <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {coupons.map((coupon, index) => (
            <tr key={coupon.id || `coupon-${index}`} className="cursor-pointer hover:bg-[#fbfcff]" onClick={() => onRowClick(coupon.id)}>
              {columns.map((col) => (
                <td key={col.label} className={`${TD} ${col.sticky ? "sticky right-0 bg-white shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]" : ""}`}>
                  {col.render(coupon, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
RegistryTable.propTypes = { coupons: optionalArray, columns: optionalArray, onRowClick: optionalFunc };

export function NetworkCouponsPage() {
  const { user } = useAuth();
  const canReadCatalog = hasPermission(user, PERMISSIONS.CATALOG_READ);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState(null);
  const debouncedSearch = useDebounced(filters.search);
  const debouncedCampaign = useDebounced(filters.supplierCampaignId);

  const params = useMemo(
    () =>
      buildCouponListParams({
        search: debouncedSearch,
        networkSource: filters.networkSource,
        couponStatus: filters.couponStatus,
        couponType: filters.couponType,
        supplierCampaignId: debouncedCampaign,
      }),
    [debouncedSearch, filters.networkSource, filters.couponStatus, filters.couponType, debouncedCampaign],
  );
  const query = usePagedQuery(SUPPLIER_COUPONS_PATH, params, { pageSize: PAGE_SIZE, safeErrorMessage: LOAD_ERROR });

  const rows = useMemo(() => query.rows.map(toCouponView).filter(Boolean), [query.rows]);
  const selected = useMemo(() => rows.find((c) => c.id === selectedId) || null, [rows, selectedId]);

  const total = typeof query.pagination?.total === "number" ? query.pagination.total : null;
  const hasMore = Boolean(query.pagination?.hasMore);
  const totalPages = query.pagination?.totalPages ?? (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null);
  const page = query.page;
  const settled = !query.loading && !query.error;
  // Page counts describe the whole result only when every record is on this one page.
  const wholeResult = settled && page === 1 && !hasMore && total != null && rows.length >= total;
  const scope = wholeResult ? "All matching records" : `This page (${rows.length} rows)`;

  const stats = useMemo(() => {
    const status = Object.fromEntries(STORED_STATUSES.map((s) => [s, 0]));
    for (const c of rows) {
      const key = c.couponStatus ? String(c.couponStatus).toUpperCase() : null;
      if (key && key in status) status[key] += 1;
    }
    const codes = new Set();
    for (const c of rows) {
      const { state } = couponCodeState(c);
      if (state === CODE_STATE.CODE) codes.add(String(c.couponCode));
    }
    return {
      status,
      networks: new Set(rows.map((c) => c.network || c.supplier).filter(Boolean)).size,
      campaigns: new Set(rows.map((c) => c.supplierCampaignId).filter(Boolean)).size,
      exclusive: rows.filter((c) => c.couponIsExclusive === true).length,
      uniqueCodes: codes.size,
    };
  }, [rows]);

  const columns = useMemo(() => buildColumns({ onOpen: setSelectedId, offset: (page - 1) * PAGE_SIZE }), [page]);
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const filtersActive = Object.values(filters).some(Boolean);
  const count = (value) => (settled ? value : "…");

  let body;
  if (query.loading) {
    body = <p className="px-4 py-8 text-center text-[11px] text-[#667085]">Loading coupon / voucher records…</p>;
  } else if (query.error) {
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
  } else if (!rows.length) {
    body = (
      <div className="px-4 py-8 text-center text-[11px] text-[#667085]">
        <b className="mb-1 block text-[#344054]">No coupon / voucher records</b>
        {filtersActive
          ? "No record matched these filters."
          : "No SupplierCoupon record exists yet. Records appear once a network sync has mapped coupon or voucher data."}
      </div>
    );
  } else {
    body = <RegistryTable coupons={rows} columns={columns} onRowClick={setSelectedId} />;
  }

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Coupon / Voucher Registry</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            The actual supplier coupon and voucher records synced from every network, across all campaigns. Each row is one record. A
            campaign&apos;s Coupon Support flag is only a capability and is never a record here. Not the client Coupon CMS.
          </p>
        </div>
        <Pill value="INTERNAL ADMIN" tone="amber" title="Supplier coupon ids, source paths and links are internal" />
      </div>

      {/* .grid4 metrics */}
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-8">
        <Metric label="Total Coupon Records" hint="Backend total for this query">
          {total != null && settled ? total : <Muted>{query.loading ? "…" : "Not available"}</Muted>}
        </Metric>
        <Metric label="Active" hint={`${scope} · stored status`}>
          {count(stats.status.ACTIVE)}
        </Metric>
        <Metric label="Expired" hint={`${scope} · stored status`}>
          {count(stats.status.EXPIRED)}
        </Metric>
        <Metric label="Scheduled" hint={`${scope} · stored status`}>
          {count(stats.status.SCHEDULED)}
        </Metric>
        <Metric label="Networks" hint={scope}>
          {count(stats.networks)}
        </Metric>
        <Metric label="Campaigns" hint={`${scope} · supplier campaign rows`}>
          {count(stats.campaigns)}
        </Metric>
        <Metric label="Exclusive" hint={scope}>
          {count(stats.exclusive)}
        </Metric>
        <Metric label="Unique Codes" hint={`${scope} · exact match`}>
          {count(stats.uniqueCodes)}
        </Metric>
      </div>

      {/* .toolbar — backend-applied filters only */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search coupons"
          className={`${CONTROL} min-w-[240px] flex-1 sm:max-w-[340px]`}
          placeholder="Search code, title, description, supplier coupon id"
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
        />
        <select aria-label="Network" className={CONTROL} value={filters.networkSource} onChange={(e) => setFilter("networkSource", e.target.value)}>
          <option value="">All Networks</option>
          {NETWORK_SOURCE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <select aria-label="Coupon Status" className={CONTROL} value={filters.couponStatus} onChange={(e) => setFilter("couponStatus", e.target.value)}>
          <option value="">Any Status</option>
          {STATUS_FILTER_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select aria-label="Coupon Type" className={CONTROL} value={filters.couponType} onChange={(e) => setFilter("couponType", e.target.value)}>
          <option value="">Any Type</option>
          {TYPE_FILTER_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Supplier campaign row ID"
          className={`${CONTROL} w-[210px] font-mono`}
          placeholder="Supplier campaign row ID (exact)"
          value={filters.supplierCampaignId}
          onChange={(e) => setFilter("supplierCampaignId", e.target.value)}
        />
        {filtersActive ? (
          <button type="button" className={ACTION_BUTTON} onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset
          </button>
        ) : null}
      </div>

      {/* .card registry */}
      <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e7ec] px-4 py-3">
          <h2 className="m-0 text-sm font-bold">Coupon / Voucher Records</h2>
          <span className="text-[10px] text-[#667085]">{settled ? `${rows.length} records on this page` : ""}</span>
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

      {/* .note */}
      <div className="mb-3.5">
        <Note>
          <b>Operational rule:</b> codes, discount values and statuses are shown exactly as stored. A fixed amount is never turned into
          a percentage, promotional wording is never turned into a number, and status is never worked out from dates. Supplier coupon
          ids, source paths and supplier coupon links are internal admin evidence and are not client-safe; open <b>Details</b> for the
          record&apos;s evidence. Payload bodies are never requested or rendered.
        </Note>
      </div>

      <div className="rounded-xl border border-[#e4e7ec] bg-white p-4">
        <h2 className="m-0 text-sm font-bold">What this registry can and cannot filter</h2>
        <div className="mt-2 space-y-1.5 text-[11px] leading-[1.55] text-[#475467]">
          <p>
            <b>Applied by the backend:</b> network (contains), coupon status, coupon type, supplier campaign row id (exact), and a
            contains search over coupon code, title, promotion description, description and supplier coupon id.
          </p>
          <p>
            <b>Not supported by the backend:</b> {BACKEND_FILTER_GAPS.join(", ")}, discount type, and brand / campaign name.
          </p>
          <p>
            <b>Not returned by this contract:</b> <span className="font-mono">{BACKEND_UNAVAILABLE_FIELDS.join(", ")}</span>.
          </p>
        </div>
      </div>

      <CouponDrawer coupon={selected} open={Boolean(selected)} onClose={() => setSelectedId(null)} canReadCatalog={canReadCatalog} />
    </div>
  );
}
