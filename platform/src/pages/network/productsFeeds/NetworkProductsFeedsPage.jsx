import { useCallback, useEffect, useMemo, useState } from "react";
import { Drawer } from "../../../components/ui/Drawer";
import { usePagedQuery } from "../../../hooks/usePagedQuery";
import { optionalArray, optionalBool, optionalFunc, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { hasSensitiveParams, redactUrlSecrets } from "../couponsVouchers/couponCodeSafety";
import { pickFields } from "../networkAccountContract";
import { NETWORK_SOURCE_OPTIONS } from "../trackingLinks/trackingLinkContract";
import { PRODUCT_FEEDS_PATH, errorCodeLabel, toProductFeedView } from "./productFeedContract";
import { ProductFeedDrawer } from "./ProductFeedDrawer";

/**
 * Products / Feeds Registry — laid out to the MBO Rewards Network Operations v13 reference
 * (.page-head, metric boxes, registry tabs, .toolbar, .card registries, .note). INTERNAL admin only.
 *
 * Two objects, two registries, never merged:
 *
 *   1. PRODUCT FEEDS   GET /ops/admin/product-feeds (unchanged). One row per ProductFeed.
 *                      Server params: page, pageSize only — no filter, search or sort.
 *   2. PRODUCTS        GET /ops/products. One row per canonical Product.
 *                      Server filters: q, supplier, status, availability, sku, merchantId.
 *
 * GET /ops/products is a pure read in the production backend: ProductOpsService.listProducts no
 * longer calls promoteBatch() and holds no promotion dependency (backend 4fb8e7c, included in the
 * production build). It returns canonical Product rows only, never staged raw entities.
 *
 * Not faked here:
 *   - Feed assignmentCount / exceptionCount: ProductFeed has no such columns; the DTO sends 0.
 *   - Product → campaign linkage: only a stored Product.campaignSourceId is a relation. The
 *     backend can also derive one from a tracking-URL PID match; that is labelled as derived and
 *     kept out of the table.
 *   - Product → feed linkage: shown only from the stored productFeedId. The backend's
 *     productFeedSource label is synthesised from the network name when no feed exists, so it is
 *     never shown without a productFeedId.
 *   - Sale price, discount, category, last updated and tracking URLs are not returned and are not
 *     derived. Prices stay in the currency returned; nothing is converted.
 */

const PAGE_SIZE = 50;
const FEEDS_LOAD_ERROR = "Product feeds could not be loaded.";
const PRODUCTS_LOAD_ERROR = "Products could not be loaded.";
const PRODUCTS_PATH = "/ops/products";

/* Values the backend accepts for these filters (Prisma enums ProductStatus / ProductAvailability). */
const PRODUCT_STATUS_OPTIONS = ["ACTIVE", "INACTIVE", "DISCONTINUED", "UNKNOWN"];
const AVAILABILITY_OPTIONS = ["IN_STOCK", "OUT_OF_STOCK", "PREORDER", "UNKNOWN"];

const EMPTY_PRODUCT_FILTERS = { q: "", supplier: "", status: "", availability: "", sku: "", merchantId: "" };

/** Exactly the keys toAdminProductListDto returns that this page reads. Nothing else is taken off a row. */
const PRODUCT_FIELDS = Object.freeze([
  "id",
  "networkSource",
  "networkAccount",
  "brandName",
  "campaignName",
  "campaignSourceId",
  "campaignLinkProvenance",
  "supplierProductId",
  "productName",
  "sku",
  "price",
  "currency",
  "availability",
  "mappingStatus",
  "productFeedSource",
  "productFeedId",
  "status",
  "imageUrl",
  "url",
]);
const PRODUCT_SOURCE_FIELDS = Object.freeze(["id", "supplier", "sourceAccountLabel", "supplierProductId"]);

const CAMPAIGN_LINK_NATIVE = "NATIVE_CAMPAIGN_SOURCE_FK";
const CAMPAIGN_LINK_DERIVED = "DERIVED_BY_TRACKING_URL_PID_MATCH";

function toProductView(dto) {
  const view = pickFields(dto, PRODUCT_FIELDS);
  if (!view) return null;
  view.sources = Array.isArray(dto?.sources) ? dto.sources.map((s) => pickFields(s, PRODUCT_SOURCE_FIELDS)).filter(Boolean) : [];
  return view;
}

/**
 * Whether the row carried any error signal at all. `hasError` is the current contract; a raw
 * `lastError` key is the older one. Only the key's presence is checked, never its text. With
 * neither, "no error" is not claimed.
 */
function feedErrorSignal(raw) {
  if (!raw || typeof raw !== "object") return false;
  return typeof raw.hasError === "boolean" || Object.prototype.hasOwnProperty.call(raw, "lastError");
}

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  grey: "border-[#e4e7ec] bg-[#f8fafc] text-[#475467]",
};
const GREEN = new Set(["ACTIVE", "MAPPED", "IN_STOCK"]);
const AMBER = new Set(["NEEDS_REVIEW", "PAUSED", "PREORDER"]);
const RED = new Set(["ERROR", "UNMAPPED", "OUT_OF_STOCK", "DISCONTINUED", "INACTIVE"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  if (key === "UNKNOWN") return "grey";
  return "blue";
}

/* v13 .toolbar controls, th / td and button.action. */
const CONTROL =
  "h-[31px] rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff]";
const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-[9px] align-middle text-[10.5px] text-[#101828]";
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

function Pill({ value, tone, title, empty = "Not available" }) {
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

function Mono({ value, title, empty = "Not available", emptyTitle }) {
  if (value == null || value === "") return <Muted title={emptyTitle}>{empty}</Muted>;
  return (
    <span className="font-mono text-[10px]" title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString, empty: optionalString, emptyTitle: optionalString };

/** A long id shown short; the full value stays on hover. */
function ShortId({ value, title, empty = "—" }) {
  if (value == null || value === "") return <Muted>{empty}</Muted>;
  const text = String(value);
  const short = text.length > 12 ? `${text.slice(0, 8)}…` : text;
  return (
    <span className="font-mono text-[10px] text-[#344054]" title={title ? `${title}: ${text}` : text}>
      {short}
    </span>
  );
}
ShortId.propTypes = { value: optionalStringOrNumber, title: optionalString, empty: optionalString };

function Clip({ text, width = "max-w-[200px]", bold = false }) {
  if (text == null || text === "") return <Muted>Not available</Muted>;
  return (
    <span className={`block truncate ${width} ${bold ? "font-semibold" : ""}`} title={String(text)}>
      {String(text)}
    </span>
  );
}
Clip.propTypes = { text: optionalStringOrNumber, width: optionalString, bold: optionalBool };

/** A count as supplied. A missing count is never shown as zero. */
function Count({ value, title }) {
  if (value == null || value === "") return <Muted title={title}>Not available</Muted>;
  return (
    <span className="tabular-nums" title={title}>
      {Number(value).toLocaleString()}
    </span>
  );
}
Count.propTypes = { value: optionalStringOrNumber, title: optionalString };

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

const LAST_SYNC_HELP = "The feed's lastSyncedAt, or its updatedAt when no sync time is stored. The contract does not say which.";

function DateValue({ value, help }) {
  const short = formatDate(value);
  if (!short) return <Muted title={help}>Not available</Muted>;
  return <span title={[formatDateTime(value), help].filter(Boolean).join("\n")}>{short}</span>;
}
DateValue.propTypes = { value: optionalString, help: optionalString };

/** Price exactly as returned (Decimal → number by the backend). No rounding, conversion or sale price. */
function Price({ value, compact = false }) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return <Muted title="Price not returned">{compact ? "—" : "Not available"}</Muted>;
  return <span className="tabular-nums">{String(value)}</span>;
}
Price.propTypes = { value: optionalStringOrNumber, compact: optionalBool };

/**
 * The product's source-side destination URL, on one line. It is not an MBO tracking URL. A URL
 * carrying a credential-like query value is redacted and rendered as text, never as a link.
 */
function SourceUrl({ url, width = "w-[140px]" }) {
  const text = url == null || String(url).trim() === "" ? null : String(url).trim();
  if (!text) return <Muted>Not returned</Muted>;
  const redacted = hasSensitiveParams(text);
  const shown = redacted ? redactUrlSecrets(text) : text;
  const display = shown.replace(/^https?:\/\//i, "");
  const cls = `block ${width} truncate font-mono text-[10px] text-[#344054]`;
  if (redacted || !/^https?:\/\//i.test(text)) {
    return (
      <span
        className={cls}
        data-url-redacted={redacted ? "true" : undefined}
        title={`${shown}${redacted ? "\nA credential-like query value was redacted; the link is not clickable." : ""}`}
      >
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
SourceUrl.propTypes = { url: optionalString, width: optionalString };

/**
 * Thumbnail for a returned image URL. Only an https URL without credential-like parameters is
 * loaded, with no referrer. A missing, unsafe or broken image gets a text placeholder; no image
 * is generated or guessed.
 */
function Thumb({ url, size = 32 }) {
  const [broken, setBroken] = useState(false);
  const text = url == null ? "" : String(url).trim();
  const box = { width: size, height: size };
  const placeholder = (label, title) => (
    <span
      style={box}
      title={title}
      data-thumb={label}
      className="inline-flex items-center justify-center rounded-[5px] border border-dashed border-[#e4e7ec] bg-[#f8fafc] text-center text-[7.5px] leading-tight text-[#98a2b3]"
    >
      {label}
    </span>
  );
  if (!text) return placeholder("No image", "No image URL returned");
  if (!/^https:\/\//i.test(text) || hasSensitiveParams(text)) return placeholder("Not shown", "Image URL is not https or carries a credential-like parameter");
  if (broken) return placeholder("Broken", "The image URL did not load");
  return (
    <img
      src={text}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      style={box}
      className="rounded-[5px] border border-[#e4e7ec] bg-white object-contain"
      onError={() => setBroken(true)}
    />
  );
}
Thumb.propTypes = { url: optionalString, size: optionalStringOrNumber };

/** Feed error state from the boolean + closed code set only. Raw error text is never read. */
function FeedError({ feed }) {
  if (!feed.errorSignal) return <Muted title="The row returned no error signal; no-error is not assumed">Not returned</Muted>;
  if (feed.hasError === true) {
    const label = errorCodeLabel(feed.safeErrorCode);
    return (
      <span className="inline-flex items-center gap-1" data-feed-error="present">
        <Pill value="ERROR" tone="red" title="The feed reports an error. The detail is not displayed." />
        {label ? <span className="text-[10px] text-[#b42318]">{label}</span> : null}
      </span>
    );
  }
  return (
    <span className="text-[10px] text-[#667085]" data-feed-error="none">
      None reported
    </span>
  );
}
FeedError.propTypes = { feed: optionalObject };

/** Compact v13 metric box. */
function Metric({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-2.5">
      <span className="block truncate text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <b className="mt-0.5 block truncate text-[18px] leading-tight text-[#101828]">{children}</b>
      {hint ? (
        <small className="block truncate text-[9.5px] text-[#667085]" title={hint}>
          {hint}
        </small>
      ) : null}
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
              <th key={col.label} title={col.help} className={`${TH} ${col.sticky ? "right-0 z-[3] shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]" : ""}`}>
                {col.label}
                {col.tag ? (
                  <span className="mt-1 block normal-case tracking-normal">
                    <Pill value={col.tag} tone="amber" title="Source-side value. Internal admin data only; not client-safe." />
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `row-${index}`} className="cursor-pointer hover:bg-[#fbfcff]" onClick={() => onRowClick(row.id)}>
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

function DetailsButton({ onClick }) {
  return (
    <button
      type="button"
      className={ACTION_BUTTON}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      Details
    </button>
  );
}
DetailsButton.propTypes = { onClick: optionalFunc };

/* ── Columns ──────────────────────────────────────────────────────────────── */

function feedColumns({ offset, onOpen }) {
  return [
    { label: "#", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> },
    { label: "Feed ID", render: (r) => <ShortId value={r.id} title="MBO ProductFeed id" /> },
    { label: "Network Source", render: (r) => <Mono value={r.supplier} /> },
    { label: "Feed Name", render: (r) => <Clip text={r.feedName} bold /> },
    { label: "Network Feed ID", render: (r) => <Mono value={r.feedExternalId} title="The network's own feed identifier" /> },
    { label: "Feed Status", render: (r) => <Pill value={r.status} title="Feed status exactly as the backend reports it" /> },
    { label: "Products", help: "Canonical Product rows linked to this feed", render: (r) => <Count value={r.productCount} /> },
    { label: "Feed Items", help: "ProductFeedItem rows recorded for this feed", render: (r) => <Count value={r.itemCount} /> },
    { label: "Error Count", help: "ProductFeed.errorCount as stored", render: (r) => <Count value={r.errorCount} /> },
    { label: "Error State", render: (r) => <FeedError feed={r} /> },
    {
      label: "Campaign Source ID",
      render: (r) => <ShortId value={r.campaignSourceId} title="MBO CampaignSource id (stored on the feed)" empty="Not linked" />,
    },
    { label: "Last Sync", help: LAST_SYNC_HELP, render: (r) => <DateValue value={r.lastSyncAt} help={LAST_SYNC_HELP} /> },
    { label: "Action", sticky: true, render: (r) => <DetailsButton onClick={() => onOpen(r.id)} /> },
  ];
}

function productColumns({ offset, onOpen }) {
  return [
    { label: "#", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> },
    { label: "Image", render: (r) => <Thumb url={r.imageUrl} /> },
    {
      label: "Product",
      render: (r) => (
        <span className="block max-w-[160px]">
          <Clip text={r.productName} width="max-w-[160px]" bold />
          <ShortId value={r.id} title="MBO Product id" />
        </span>
      ),
    },
    { label: "Network", help: "Network source", render: (r) => <Mono value={r.networkSource} /> },
    { label: "Supplier Product ID", render: (r) => <Mono value={r.supplierProductId} empty="Not returned" /> },
    { label: "Merchant / Brand", render: (r) => <Clip text={r.brandName} width="max-w-[110px]" /> },
    { label: "SKU", render: (r) => <Mono value={r.sku} empty="—" emptyTitle="SKU not returned" /> },
    { label: "Price", help: "As returned. Not converted; no sale price is returned.", render: (r) => <Price value={r.price} compact /> },
    { label: "Currency", help: "As returned with the price", render: (r) => <Mono value={r.currency} empty="—" emptyTitle="Currency not returned" /> },
    { label: "Availability", render: (r) => <Pill value={r.availability} title="Availability as the backend reports it" /> },
    { label: "Status", render: (r) => <Pill value={r.status} title="Product status as the backend reports it" /> },
    { label: "Mapping", render: (r) => <Pill value={r.mappingStatus} title="Mapping status as the backend reports it" /> },
    { label: "Source URL", tag: "SOURCE · INTERNAL", render: (r) => <SourceUrl url={r.url} /> },
    { label: "Action", sticky: true, render: (r) => <DetailsButton onClick={() => onOpen(r.id)} /> },
  ];
}

/* ── Product detail ───────────────────────────────────────────────────────── */

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <span className="mt-0.5 block min-w-0 text-[11px] text-[#101828]">{children}</span>
    </div>
  );
}
Field.propTypes = { label: optionalString, children: optionalNode };

function DetailSection({ title, children }) {
  return (
    <section className="rounded-[10px] border border-[#e4e7ec] p-3">
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[.03em] text-[#475467]">{title}</h3>
      {children}
    </section>
  );
}
DetailSection.propTypes = { title: optionalString, children: optionalNode };

function CampaignLink({ product }) {
  if (!product.campaignSourceId) return <Muted>No campaign source link</Muted>;
  if (product.campaignLinkProvenance === CAMPAIGN_LINK_NATIVE) {
    return (
      <span className="block">
        <Mono value={product.campaignSourceId} title="Stored Product.campaignSourceId" />
        <span className="block text-[10px] text-[#667085]">Stored relation{product.campaignName ? ` · ${product.campaignName}` : ""}</span>
      </span>
    );
  }
  return (
    <span className="block">
      <Mono value={product.campaignSourceId} />
      <span className="block text-[10px] text-[#b54708]">
        {product.campaignLinkProvenance === CAMPAIGN_LINK_DERIVED
          ? "Derived by the backend from a tracking-URL PID match. Not a stored relation."
          : "Provenance not returned. Not treated as a stored relation."}
        {product.campaignName ? ` · ${product.campaignName}` : ""}
      </span>
    </span>
  );
}
CampaignLink.propTypes = { product: optionalObject };

function ProductDrawer({ product, onClose }) {
  if (!product) return null;
  return (
    <Drawer open onClose={onClose} title={product.productName || `Product ${product.id}`} width="max-w-3xl">
      <div className="space-y-3 text-[#101828]">
        <Note>
          A canonical Product record as <span className="font-mono">GET /ops/products</span> returns it. Nothing here edits, syncs or
          publishes a product.
        </Note>

        <DetailSection title="Identity">
          <div className="flex gap-3">
            <Thumb url={product.imageUrl} size={72} />
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3">
              <Field label="MBO product ID">
                <Mono value={product.id} />
              </Field>
              <Field label="Supplier product ID">
                <Mono value={product.supplierProductId} empty="Not returned" />
              </Field>
              <Field label="SKU">
                <Mono value={product.sku} empty="Not returned" />
              </Field>
              <Field label="Network source">
                <Mono value={product.networkSource} />
              </Field>
              <Field label="Network account">
                <Mono value={product.networkAccount} empty="Not returned" />
              </Field>
              <Field label="Merchant / brand">{product.brandName || <Muted>Not available</Muted>}</Field>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Price and state">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Field label="Price">
              <Price value={product.price} />
            </Field>
            <Field label="Currency">
              <Mono value={product.currency} empty="Not returned" />
            </Field>
            <Field label="Availability">
              <Pill value={product.availability} />
            </Field>
            <Field label="Status">
              <Pill value={product.status} />
            </Field>
            <Field label="Mapping">
              <Pill value={product.mappingStatus} />
            </Field>
          </div>
          <p className="mt-2 text-[10px] text-[#667085]">
            Price and currency as returned. No conversion, sale price or discount is applied or derived.
          </p>
        </DetailSection>

        <DetailSection title="Source product URL">
          <Pill value="SOURCE · INTERNAL · NOT CLIENT-SAFE" tone="amber" />
          <div className="mt-1.5">
            <SourceUrl url={product.url} width="max-w-full" />
          </div>
          <p className="mt-1.5 text-[10px] text-[#667085]">The product&apos;s destination URL from the source. It is not an MBO tracking URL.</p>
        </DetailSection>

        <DetailSection title="Feed and campaign linkage">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Field label="Product feed">
              {product.productFeedId ? (
                <span className="block">
                  <Mono value={product.productFeedId} title="Stored Product.productFeedId" />
                  {product.productFeedSource ? <span className="block text-[10px] text-[#667085]">{product.productFeedSource}</span> : null}
                </span>
              ) : (
                <Muted>No feed link stored</Muted>
              )}
            </Field>
            <Field label="Campaign source">
              <CampaignLink product={product} />
            </Field>
          </div>
        </DetailSection>

        <DetailSection title={`Source records (${product.sources.length})`}>
          {product.sources.length ? (
            <table className="w-full border-collapse" aria-label="Product source records">
              <thead>
                <tr>
                  {["Source ID", "Network", "Account", "Supplier product ID"].map((h) => (
                    <th key={h} className={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {product.sources.map((s, i) => (
                  <tr key={s.id || i}>
                    <td className={TD}>
                      <ShortId value={s.id} title="ProductSource id" />
                    </td>
                    <td className={TD}>
                      <Mono value={s.supplier} />
                    </td>
                    <td className={TD}>
                      <Mono value={s.sourceAccountLabel} />
                    </td>
                    <td className={TD}>
                      <Mono value={s.supplierProductId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Muted>No source record returned</Muted>
          )}
        </DetailSection>

        <DetailSection title="Not returned by this contract">
          <p className="text-[10.5px] text-[#475467]">
            Category, sale price, last updated, description, raw payload reference, mapper version and supplier campaign ID.
          </p>
        </DetailSection>
      </div>
    </Drawer>
  );
}
ProductDrawer.propTypes = { product: optionalObject, onClose: optionalFunc };

/* ── Page ─────────────────────────────────────────────────────────────────── */

export function NetworkProductsFeedsPage() {
  const [registry, setRegistry] = useState("FEEDS");
  const [productFilters, setProductFilters] = useState(EMPTY_PRODUCT_FILTERS);
  const [selectedFeedId, setSelectedFeedId] = useState(null);
  const [selectedProductId, setSelectedProductId] = useState(null);

  const feedQuery = usePagedQuery(PRODUCT_FEEDS_PATH, {}, { pageSize: PAGE_SIZE, safeErrorMessage: FEEDS_LOAD_ERROR });

  const debouncedQ = useDebounced(productFilters.q);
  const debouncedSku = useDebounced(productFilters.sku);
  const debouncedMerchant = useDebounced(productFilters.merchantId);
  const productParams = useMemo(() => {
    const params = {};
    if (debouncedQ.trim()) params.q = debouncedQ.trim();
    if (productFilters.supplier) params.supplier = productFilters.supplier;
    if (productFilters.status) params.status = productFilters.status;
    if (productFilters.availability) params.availability = productFilters.availability;
    if (debouncedSku.trim()) params.sku = debouncedSku.trim();
    if (debouncedMerchant.trim()) params.merchantId = debouncedMerchant.trim();
    return params;
  }, [debouncedQ, productFilters.supplier, productFilters.status, productFilters.availability, debouncedSku, debouncedMerchant]);
  const productQuery = usePagedQuery(PRODUCTS_PATH, productParams, { pageSize: PAGE_SIZE, safeErrorMessage: PRODUCTS_LOAD_ERROR });

  const feedRows = useMemo(
    () =>
      feedQuery.rows
        .map((raw) => {
          const view = toProductFeedView(raw);
          return view ? { ...view, errorSignal: feedErrorSignal(raw) } : null;
        })
        .filter(Boolean),
    [feedQuery.rows],
  );
  const productRows = useMemo(() => productQuery.rows.map(toProductView).filter(Boolean), [productQuery.rows]);
  const selectedFeed = useMemo(() => feedRows.find((r) => r.id === selectedFeedId) || null, [feedRows, selectedFeedId]);
  const selectedProduct = useMemo(() => productRows.find((r) => r.id === selectedProductId) || null, [productRows, selectedProductId]);
  const closeFeed = useCallback(() => setSelectedFeedId(null), []);
  const closeProduct = useCallback(() => setSelectedProductId(null), []);

  const settled = (query) => !query.loading && !query.error;
  const totalOf = (query) => (settled(query) && typeof query.pagination?.total === "number" ? query.pagination.total : null);
  const scopeOf = (query, rows) => {
    const total = totalOf(query);
    const whole = total != null && query.page === 1 && !query.pagination?.hasMore && rows.length >= total;
    return whole ? "All records" : `This page (${rows.length} rows)`;
  };
  const val = (query, value) => (settled(query) ? value : "…");
  const totalBox = (query) => totalOf(query) ?? <Muted>{query.loading ? "…" : "Not available"}</Muted>;

  const feedCols = useMemo(() => feedColumns({ offset: (feedQuery.page - 1) * PAGE_SIZE, onOpen: setSelectedFeedId }), [feedQuery.page]);
  const productCols = useMemo(
    () => productColumns({ offset: (productQuery.page - 1) * PAGE_SIZE, onOpen: setSelectedProductId }),
    [productQuery.page],
  );
  const productFiltersActive = Object.values(productFilters).some(Boolean);
  const isFeeds = registry === "FEEDS";
  const feedScope = scopeOf(feedQuery, feedRows);
  const productScope = scopeOf(productQuery, productRows);

  const feedErrorBox = () => {
    if (!settled(feedQuery)) return "…";
    const unknown = feedRows.filter((r) => !r.errorSignal).length;
    const present = feedRows.filter((r) => r.errorSignal && r.hasError === true).length;
    if (unknown && !present) return <Muted>Not returned</Muted>;
    return unknown ? `${present}+` : present;
  };
  const latestSync = () => {
    if (!settled(feedQuery)) return "…";
    const times = feedRows.map((r) => (r.lastSyncAt ? new Date(r.lastSyncAt).getTime() : NaN)).filter(Number.isFinite);
    if (!times.length) return <Muted>Not available</Muted>;
    return <span className="text-[14px]">{formatDate(new Date(Math.max(...times)).toISOString())}</span>;
  };
  const productsInFeeds = () => {
    if (!settled(feedQuery)) return "…";
    const counts = feedRows.map((r) => r.productCount).filter((v) => v != null && Number.isFinite(Number(v)));
    if (!counts.length) return <Muted>Not available</Muted>;
    return counts.reduce((sum, v) => sum + Number(v), 0).toLocaleString();
  };

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Products / Feeds Registry</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            Supplier product feeds and individual product records are separate objects, each in its own registry. Only real records are
            shown; nothing is built from campaign metadata.
          </p>
        </div>
        <Pill value="INTERNAL ADMIN" tone="amber" title="Source product data on this page is internal and not client-safe" />
      </div>

      {/* registry tabs */}
      <div role="tablist" aria-label="Product registries" className="mb-3 flex flex-wrap items-center gap-[5px]">
        {[
          { key: "FEEDS", label: "Product Feed Registry", query: feedQuery },
          { key: "PRODUCTS", label: "Product Registry", query: productQuery },
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
      </div>

      {/* metrics for the active registry */}
      {isFeeds ? (
        <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="Feed Records" hint="Backend total">
            {totalBox(feedQuery)}
          </Metric>
          <Metric label="Active Feeds" hint={`${feedScope} · status ACTIVE`}>
            {val(feedQuery, feedRows.filter((r) => String(r.status || "").toUpperCase() === "ACTIVE").length)}
          </Metric>
          <Metric label="Networks" hint={feedScope}>
            {val(feedQuery, new Set(feedRows.map((r) => r.supplier).filter(Boolean)).size)}
          </Metric>
          <Metric label="Products In Feeds" hint={`${feedScope} · sum of feed product counts`}>
            {productsInFeeds()}
          </Metric>
          <Metric label="Feed Errors" hint={`${feedScope} · hasError`}>
            {feedErrorBox()}
          </Metric>
          <Metric label="Last Sync" hint={`${feedScope} · latest sync/updated time`}>
            {latestSync()}
          </Metric>
        </div>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Metric label="Product Records" hint="Backend total for these filters">
            {totalBox(productQuery)}
          </Metric>
          <Metric label="In Stock" hint={`${productScope} · availability IN_STOCK`}>
            {val(productQuery, productRows.filter((r) => String(r.availability || "").toUpperCase() === "IN_STOCK").length)}
          </Metric>
          <Metric label="Networks" hint={productScope}>
            {val(productQuery, new Set(productRows.map((r) => r.networkSource).filter(Boolean)).size)}
          </Metric>
          <Metric label="Linked To A Feed" hint={`${productScope} · stored productFeedId`}>
            {val(productQuery, productRows.filter((r) => r.productFeedId).length)}
          </Metric>
        </div>
      )}

      {isFeeds ? (
        <RegistryCard
          title="Product Feed Registry"
          subtitle="One row per ProductFeed · the backend applies paging only, no filter or search"
          query={feedQuery}
          rows={feedRows}
          filtersActive={false}
          loadingText="Loading product feeds…"
          emptyText="No ProductFeed row exists yet. Feeds appear once a network sync has recorded feed-level metadata."
        >
          <RegistryTable label="Product feeds" rows={feedRows} columns={feedCols} onRowClick={setSelectedFeedId} />
        </RegistryCard>
      ) : (
        <>
          {/* .toolbar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label="Search products"
              className={`${CONTROL} min-w-[220px] flex-1 sm:max-w-[320px]`}
              placeholder="Search name, SKU, brand, supplier product id"
              value={productFilters.q}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, q: e.target.value }))}
            />
            <select
              aria-label="Network"
              className={CONTROL}
              value={productFilters.supplier}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, supplier: e.target.value }))}
            >
              <option value="">All Networks</option>
              {NETWORK_SOURCE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              aria-label="Product status"
              className={CONTROL}
              value={productFilters.status}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="">Any Status</option>
              {PRODUCT_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              aria-label="Availability"
              className={CONTROL}
              value={productFilters.availability}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, availability: e.target.value }))}
            >
              <option value="">Any Availability</option>
              {AVAILABILITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              type="search"
              aria-label="SKU"
              className={`${CONTROL} w-[130px] font-mono`}
              placeholder="SKU contains"
              value={productFilters.sku}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, sku: e.target.value }))}
            />
            <input
              type="search"
              aria-label="Merchant ID"
              className={`${CONTROL} w-[170px] font-mono`}
              placeholder="Merchant ID (exact)"
              value={productFilters.merchantId}
              onChange={(e) => setProductFilters((prev) => ({ ...prev, merchantId: e.target.value }))}
            />
            {productFiltersActive ? (
              <button type="button" className={ACTION_BUTTON} onClick={() => setProductFilters(EMPTY_PRODUCT_FILTERS)}>
                Reset
              </button>
            ) : null}
          </div>

          <RegistryCard
            title="Product Registry"
            subtitle="One row per canonical Product · no campaign or feed filter exists for products"
            query={productQuery}
            rows={productRows}
            filtersActive={productFiltersActive}
            loadingText="Loading products…"
            emptyText="No canonical Product row exists yet. Products appear once a sync has promoted product records."
          >
            <RegistryTable label="Products" rows={productRows} columns={productCols} onRowClick={setSelectedProductId} />
          </RegistryCard>
        </>
      )}

      <Note>
        <b>Feeds and products are different objects.</b> A feed row is the network&apos;s feed-level record; a product row is one canonical
        product. Products are not filtered by campaign, campaign source or feed because the backend offers no such filter; a product&apos;s
        feed link is shown in its Details only when the record stores one. Prices stay in the currency returned. Product URLs are
        source-side destinations, not MBO tracking links.
      </Note>

      <details className="mt-3 rounded-xl border border-[#e4e7ec] bg-white px-4 py-3">
        <summary className="cursor-pointer text-[12px] font-bold">What these registries can and cannot show</summary>
        <div className="mt-2 space-y-1.5 text-[11px] leading-[1.55] text-[#475467]">
          <p>
            <b>Feed registry (backend):</b> paging only. No network, status or search filter is accepted, so none is offered.
          </p>
          <p>
            <b>Product registry (backend):</b> contains search over name, SKU, brand and supplier product id / SKU; network; status;
            availability; SKU contains; merchant id (exact). <b>Not supported:</b> campaign, campaign source or feed filters.
          </p>
          <p>
            <b>Feed fields not shown:</b> assignment and exception counts are not stored on a feed (the backend sends 0); feed format, source
            account, mapping version, feed URL presence and created / updated times are not passed through the admin feed contract. Error
            detail is shown as presence plus a known code only.
          </p>
          <p>
            <b>Product fields not returned:</b> category, sale price, last updated, raw payload reference and mapper version.
          </p>
        </div>
      </details>

      <ProductFeedDrawer feed={selectedFeed} open={Boolean(selectedFeed)} onClose={closeFeed} />
      <ProductDrawer product={selectedProduct} onClose={closeProduct} />
    </div>
  );
}
