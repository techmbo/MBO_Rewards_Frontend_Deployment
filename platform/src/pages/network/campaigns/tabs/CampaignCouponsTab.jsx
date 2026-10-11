import { Fragment, useMemo, useState } from "react";
import { ExpandableText } from "../../../../components/ui/TableCells";
import { usePagedQuery } from "../../../../hooks/usePagedQuery";
import { optionalArray, optionalBool, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../../utils/propValidators";
import { redactCredentialText } from "../../networkAccountContract";
import { SUPPLIER_COUPONS_PATH, toCouponView } from "../campaignContract";
import { htmlToReadableText } from "../campaignText";

/**
 * Campaign › Coupons / Vouchers — laid out to the v13 campaign workspace (.metric summary,
 * .related-table, .note). Coupon / voucher records are separate related objects; the campaign only
 * carries Coupon Support, a capability flag that never proves a record exists.
 *
 * Source: GET /supplier-coupons?supplierCampaignId=<SupplierCampaign row id> (coupons:read), reduced
 * by toCouponView. Codes, dates, status and discount fields are shown exactly as the record returns
 * them: nothing is generated, reformatted, converted or derived from dates here.
 */

const PAGE_SIZE = 100;

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["ACTIVE", "MAPPED", "YES"]);
const AMBER = new Set(["SCHEDULED", "NEEDS_REVIEW", "VERIFY_LIVE", "PENDING"]);
const RED = new Set(["EXPIRED", "DISABLED", "ERROR", "FAILED", "NO", "UNMAPPED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

// Coupon statuses the backend stores (SupplierCoupon.couponStatus).
const COUPON_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "DISABLED", "UNKNOWN"];

const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";
const ACTION_BUTTON =
  "whitespace-nowrap rounded-[7px] border border-[#e4e7ec] bg-white px-2 py-[4px] text-[9.5px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:opacity-40";

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

function Mono({ value, title, strong = false }) {
  if (value == null || value === "") return <Muted />;
  return (
    <span className={`whitespace-pre font-mono ${strong ? "text-[11px] font-extrabold" : "text-[10px]"}`} title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString, strong: optionalBool };

/** Source identifier / network wording as secondary evidence (v13 .source-extra .keys). */
function SourceText({ children, title = "Source value as received (diagnostic)" }) {
  return (
    <span className="block font-mono text-[9px] leading-tight text-[#b54708]" title={title}>
      {children}
    </span>
  );
}
SourceText.propTypes = { children: optionalNode, title: optionalString };

function Flag({ value, title }) {
  if (value == null) return <Muted title={title ? `${title}: not returned` : undefined} />;
  return <Pill value={value ? "YES" : "NO"} title={title} />;
}
Flag.propTypes = { value: optionalBool, title: optionalString };

function formatDate(value, withTime = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : { timeZone: "UTC" }),
  });
}

function DateValue({ value, withTime = false, empty = "—" }) {
  const text = formatDate(value, withTime);
  return text ? <span className="whitespace-nowrap">{text}</span> : <Muted>{empty}</Muted>;
}
DateValue.propTypes = { value: optionalString, withTime: optionalBool, empty: optionalString };

/** Source text as readable plain text (network descriptions can carry basic HTML); never injected. */
function ReadableText({ value, maxWidthClass = "max-w-[260px]" }) {
  if (value == null || value === "") return <Muted />;
  const readable = htmlToReadableText(value);
  if (readable == null) return <Muted title="Markup only, no readable text" />;
  return <ExpandableText text={readable} maxWidthClass={maxWidthClass} />;
}
ReadableText.propTypes = { value: optionalString, maxWidthClass: optionalString };

/** v13 .metric. */
function Metric({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-3">
      <span className="block text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <div className="mt-1 text-[15px] font-bold leading-tight text-[#101828]">{children}</div>
      {hint ? <span className="mt-1 block text-[10px] leading-snug text-[#667085]">{hint}</span> : null}
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

/** v13 .empty-state. */
function EmptyState({ title, tag, children }) {
  return (
    <div className="rounded-[9px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-[18px] text-center text-[11px] text-[#667085]">
      {tag ? <div className="mb-1.5">{tag}</div> : null}
      <b className="mb-1 block text-[#344054]">{title}</b>
      {children}
    </div>
  );
}
EmptyState.propTypes = { title: optionalString, tag: optionalNode, children: optionalNode };

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

/* ── Registry ──────────────────────────────────────────────────────────────── */

const COLUMNS = [
  {
    label: "Coupon / Voucher ID",
    field: "id · supplierCouponId",
    render: (c) => (
      <span className="block">
        <Mono value={c.id} title="MBO coupon record id" />
        {c.supplierCouponId ? <SourceText title="Supplier / network coupon id">{c.supplierCouponId}</SourceText> : null}
      </span>
    ),
  },
  {
    label: "Network Source",
    field: "network · networkSource",
    render: (c) => (
      <span className="block">
        <Mono value={c.network} />
        {c.networkSource && c.networkSource !== c.network ? <SourceText title="Source account">{c.networkSource}</SourceText> : null}
      </span>
    ),
  },
  {
    label: "Coupon Code",
    field: "couponCode",
    render: (c) =>
      c.couponCode ? (
        <span className="inline-block rounded-[5px] border border-dashed border-[#98a2b3] bg-[#f8fafc] px-1.5 py-[3px]">
          <Mono value={c.couponCode} strong title="Coupon code exactly as returned" />
        </span>
      ) : (
        <Muted title={c.couponType === "LINK" ? "Link coupon: no code" : "No code returned"}>{c.couponType === "LINK" ? "No code (link)" : "No code"}</Muted>
      ),
  },
  { label: "Title", field: "title", render: (c) => <ReadableText value={c.title} maxWidthClass="max-w-[200px]" /> },
  { label: "Description", field: "couponDescription", render: (c) => <ReadableText value={c.couponDescription} /> },
  { label: "Coupon Type", field: "couponType", render: (c) => <Pill value={c.couponType} tone="purple" title="Coupon type" /> },
  { label: "Discount Type", field: "discountType", render: (c) => (c.discountType ? <Mono value={c.discountType} /> : <Muted title="Discount type not returned">Not returned</Muted>) },
  {
    label: "Discount Value",
    field: "discountValue",
    render: (c) =>
      c.discountValue != null && c.discountValue !== "" ? (
        <b className="whitespace-nowrap" title="Discount value exactly as returned; never converted">
          {String(c.discountValue)}
        </b>
      ) : (
        <Muted>Not returned</Muted>
      ),
  },
  { label: "Exclusive", field: "couponIsExclusive", render: (c) => <Flag value={c.couponIsExclusive} title="Exclusive" /> },
  { label: "Country", field: "country", render: (c) => <Mono value={c.country} /> },
  { label: "Customer Type", field: "customerType", render: (c) => c.customerType || <Muted /> },
  { label: "Start Date", field: "couponStartDate", render: (c) => <DateValue value={c.couponStartDate} /> },
  { label: "End Date", field: "couponEndDate", render: (c) => <DateValue value={c.couponEndDate} empty="Not returned" /> },
  { label: "Coupon Status", field: "couponStatus", render: (c) => <Pill value={c.couponStatus} title="Coupon status (as stored by the backend)" empty="Not available" /> },
  { label: "Mapping Status", field: "mappingStatus", render: (c) => <Pill value={c.mappingStatus} title="Mapping status" /> },
  { label: "Source Campaign", field: "supplierCampaignId", render: (c) => <Mono value={c.supplierCampaignId} title="SupplierCampaign row id" /> },
  { label: "Last Synced", field: "lastSyncedAt", render: (c) => <DateValue value={c.lastSyncedAt} withTime /> },
];

function EvidenceField({ label, children }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-2 border-b border-[#eef2f6] py-1.5">
      <span className="text-[9px] font-extrabold text-[#667085]">{label}</span>
      <div className="min-w-0 break-words text-[10.5px]">{children}</div>
    </div>
  );
}
EvidenceField.propTypes = { label: optionalString, children: optionalNode };

/** Record detail / evidence: source references only; no raw payload body. */
function CouponEvidence({ coupon: c }) {
  return (
    <div className="grid gap-x-6 bg-[#fbfcff] px-3 py-2 md:grid-cols-2">
      <div>
        <EvidenceField label="Promotion description">
          <ReadableText value={c.promotionDescription} maxWidthClass="max-w-full" />
        </EvidenceField>
        <EvidenceField label="Coupon link (supplier)">
          {c.couponLink ? (
            <a
              href={c.couponLink}
              target="_blank"
              rel="noreferrer noopener"
              title="Supplier / network URL. Internal only, not client-safe."
              className="break-all font-mono text-[10px] text-[#344054] hover:underline"
            >
              {c.couponLink}
            </a>
          ) : (
            <Muted>None</Muted>
          )}
        </EvidenceField>
        <EvidenceField label="Supplier coupon id">{c.supplierCouponId ? <SourceText>{c.supplierCouponId}</SourceText> : <Muted />}</EvidenceField>
        <EvidenceField label="First seen">
          <DateValue value={c.firstSeenAt} withTime />
        </EvidenceField>
      </div>
      <div>
        <EvidenceField label="Source object">{c.sourceObject ? <SourceText>{c.sourceObject}</SourceText> : <Muted />}</EvidenceField>
        <EvidenceField label="Source path">{c.sourcePath ? <SourceText>{c.sourcePath}</SourceText> : <Muted />}</EvidenceField>
        <EvidenceField label="Field mapping outcome">
          <Mono value={c.fieldMappingOutcome} />
        </EvidenceField>
        <EvidenceField label="Mapping version">
          <Mono value={c.mappingVersion} />
        </EvidenceField>
        <EvidenceField label="Raw payload reference">
          <Mono value={c.rawPayloadId} title="Reference only; open Source Evidence for payload metadata" />
        </EvidenceField>
      </div>
    </div>
  );
}
CouponEvidence.propTypes = { coupon: optionalObject };

function CouponTable({ coupons }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#e4e7ec] bg-white">
      <table aria-label="Coupon / voucher records" className="w-full min-w-[1400px] border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.label} className={TH}>
                {col.label}
                <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span>
              </th>
            ))}
            <th className={TH}>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((coupon, index) => {
            const key = coupon.id || `coupon-${index}`;
            const expanded = open.has(key);
            return (
              <Fragment key={key}>
                <tr className={expanded ? "bg-[#fbfcff]" : "hover:bg-[#fbfcff]"}>
                  {COLUMNS.map((col) => (
                    <td key={col.label} className={TD}>
                      {col.render(coupon)}
                    </td>
                  ))}
                  <td className={TD}>
                    <button type="button" className={ACTION_BUTTON} aria-expanded={expanded} onClick={() => toggle(key)}>
                      {expanded ? "Hide" : "Details"}
                    </button>
                  </td>
                </tr>
                {expanded ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="border-b border-[#e4e7ec] p-0">
                      <CouponEvidence coupon={coupon} />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
CouponTable.propTypes = { coupons: optionalArray };

/** Empty state chosen from the capability flag; "supported but not synced" only when support is proven. */
function NoCouponRecords({ couponSupport, reason }) {
  if (couponSupport === true) {
    return (
      <EmptyState title="Coupon Support is YES, but no coupon / voucher record is synced" tag={<Pill value="SUPPORTED — DATA NOT SYNCED" tone="amber" />}>
        {reason}
      </EmptyState>
    );
  }
  if (couponSupport === false) {
    return (
      <EmptyState title="Coupon capability not available" tag={<Pill value="COUPON SUPPORT: NO" tone="blue" />}>
        {reason}
      </EmptyState>
    );
  }
  return <EmptyState title="No coupon data available">{reason}</EmptyState>;
}
NoCouponRecords.propTypes = { couponSupport: optionalBool, reason: optionalNode };

/* ── Tab ───────────────────────────────────────────────────────────────────── */

export function CampaignCouponsTab({ campaign, canRead }) {
  const enabled = Boolean(canRead && campaign.supplierCampaignRowId);
  const filters = useMemo(() => ({ supplierCampaignId: campaign.supplierCampaignRowId || undefined }), [campaign.supplierCampaignRowId]);
  const query = usePagedQuery(SUPPLIER_COUPONS_PATH, filters, { pageSize: PAGE_SIZE, enabled });
  const coupons = useMemo(() => query.rows.map(toCouponView).filter(Boolean), [query.rows]);
  const pagination = query.pagination || {};

  const settled = enabled && !query.loading && !query.error;
  const total = settled && typeof pagination.total === "number" ? pagination.total : null;
  const totalPages = pagination.totalPages ?? (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null);
  // Status / code counts are only exact when every record is on this page.
  const complete = settled && total != null && query.page === 1 && coupons.length >= total;

  const statusCounts = useMemo(() => {
    const counts = Object.fromEntries(COUPON_STATUSES.map((s) => [s, 0]));
    let missing = 0;
    for (const c of coupons) {
      if (c.couponStatus == null || c.couponStatus === "") missing += 1;
      else counts[c.couponStatus] = (counts[c.couponStatus] || 0) + 1;
    }
    return { counts, missing };
  }, [coupons]);
  const uniqueCodes = useMemo(() => new Set(coupons.map((c) => c.couponCode).filter((code) => code != null && code !== "")).size, [coupons]);

  return (
    <div className="space-y-3.5 text-[#101828]">
      {/* 1. Coupon Summary */}
      <Card
        title="Coupon Summary"
        subtitle={
          <>
            Coupon / voucher records for supplier campaign <span className="font-mono">{campaign.supplierCampaignId || campaign.supplierCampaignRowId || "—"}</span>
            {campaign.brandName || campaign.campaignName ? ` · ${[campaign.brandName, campaign.campaignName].filter(Boolean).join(" · ")}` : ""}.
          </>
        }
        action={<Pill value="INTERNAL ADMIN" tone="amber" title="Supplier coupon ids and links are internal" />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Coupon Support" hint="Capability flag on the campaign; not proof a record exists">
            {campaign.couponSupport == null ? <Pill value="UNKNOWN" tone="blue" /> : <Pill value={campaign.couponSupport ? "YES" : "NO"} />}
          </Metric>
          <Metric label="Coupon Records" hint={total != null ? "Backend total for this supplier campaign" : null}>
            {total != null ? total : <Muted>{query.loading && enabled ? "…" : "Not available"}</Muted>}
          </Metric>
          {complete ? (
            <>
              <Metric label="Active" hint="couponStatus ACTIVE">
                {statusCounts.counts.ACTIVE}
              </Metric>
              <Metric label="Expired" hint="couponStatus EXPIRED">
                {statusCounts.counts.EXPIRED}
              </Metric>
              <Metric label="Unique Codes" hint="Distinct coupon codes, exact match">
                {uniqueCodes}
              </Metric>
            </>
          ) : null}
        </div>
        {complete && coupons.length ? (
          <p className="mt-2 text-[10px] text-[#667085]">
            Status as stored: SCHEDULED {statusCounts.counts.SCHEDULED} · DISABLED {statusCounts.counts.DISABLED} · UNKNOWN {statusCounts.counts.UNKNOWN}
            {statusCounts.missing ? ` · not returned ${statusCounts.missing}` : ""}. Counts come from the backend coupon status; nothing is derived from dates.
          </p>
        ) : settled && total != null && !complete ? (
          <p className="mt-2 text-[10px] text-[#667085]">Status and code counts are not shown: records span more than one page.</p>
        ) : null}
      </Card>

      {/* 2. Coupon / Voucher Registry */}
      <Card
        title="Coupon / Voucher Registry"
        subtitle="One row per coupon / voucher record. Codes, discounts, dates and status exactly as returned; open Details for source evidence."
        action={
          enabled ? (
            <button type="button" className={ACTION_BUTTON} disabled={query.loading} onClick={() => query.reload().catch(() => {})}>
              Refresh
            </button>
          ) : null
        }
      >
        {!canRead ? (
          <Note>Your role does not include coupons:read, so coupon / voucher records are not shown.</Note>
        ) : !campaign.supplierCampaignRowId ? (
          <NoCouponRecords couponSupport={campaign.couponSupport} reason="This campaign has no supplier campaign record, so no coupon record can be linked to it." />
        ) : query.loading ? (
          <p className="py-3 text-[11px] text-[#667085]">Loading coupon / voucher records…</p>
        ) : query.error ? (
          <Note tone="danger">
            <b>Coupon records could not be loaded.</b> {redactCredentialText(query.error)}{" "}
            <button type="button" className={`${ACTION_BUTTON} ml-1`} onClick={() => query.reload().catch(() => {})}>
              Retry
            </button>
          </Note>
        ) : coupons.length ? (
          <>
            <CouponTable coupons={coupons} />
            {totalPages != null && totalPages > 1 ? (
              <div className="mt-2 flex items-center justify-between text-[10px] text-[#667085]">
                <span>
                  Page {query.page} of {totalPages} · {total} records
                </span>
                <span className="flex gap-1.5">
                  <button type="button" className={ACTION_BUTTON} disabled={query.page <= 1} onClick={() => query.setPage(query.page - 1)}>
                    Previous
                  </button>
                  <button type="button" className={ACTION_BUTTON} disabled={query.page >= totalPages} onClick={() => query.setPage(query.page + 1)}>
                    Next
                  </button>
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <NoCouponRecords couponSupport={campaign.couponSupport} reason="The backend has no coupon / voucher record for this supplier campaign." />
        )}
      </Card>

      <Note>
        <b>MBO rule:</b> <b>Coupon Support</b> on the campaign is only a capability flag. Actual coupon codes, dates, status and discounts
        live on these coupon / voucher records. Discount values are shown as returned: a fixed amount is never turned into a
        percentage, and status is never inferred from dates.
      </Note>
    </div>
  );
}
CampaignCouponsTab.propTypes = { campaign: optionalObject, canRead: optionalBool };
