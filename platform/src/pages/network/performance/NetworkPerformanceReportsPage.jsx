import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "../../../api";
import { optionalArray, optionalBool, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { statusSafeMessage } from "../../../utils/safeErrorText";
import {
  CHANNEL_FILTER_OPTIONS,
  DEFAULT_PAGE_SIZE,
  FACT_INGESTING_NETWORKS,
  FIELD_DESCRIPTIONS,
  FIELD_LABELS,
  FINANCIAL_STATE,
  MAX_PAGE_SIZE,
  MONEY_SUMMARY_STATE,
  NETWORK_FILTER_OPTIONS,
  PERFORMANCE_REPORT_PATH,
  buildPerformanceReportParams,
  financialStateOf,
  normalizePageSize,
  pickPerformanceReportFields,
  responseFinancialState,
  safeCountKpis,
  summarizeLoadedMoney,
} from "./performanceReportContract";

/**
 * Network Operations → Performance Reports, laid out to the v13 reference (.page-head, metric
 * boxes, .toolbar, .card registry, .note). INTERNAL admin only.
 *
 * Data: GET /ops/admin/performance?grain=network, one row per network performance fact. The full
 * response envelope is kept (data, pagination, kpis, includeFinancial), because usePagedQuery
 * drops kpis and includeFinancial. Every row passes through pickPerformanceReportFields; raw
 * backend rows are never rendered.
 *
 * Money:
 *   - Filter-wide totals: counts only (safeCountKpis). The backend's money KPIs add currencies
 *     together, so they are never shown.
 *   - Money summaries cover the LOADED ROWS only, and exist only when those rows share one
 *     currency. Nothing is converted.
 *   - Commission visibility comes from each row's backend `financial.state`. Order values are
 *     shown as returned.
 */

const LOAD_ERROR = "Performance reports could not be loaded.";

const EMPTY_FILTERS = { from: "", to: "", date: "", network: "", brand: "", channel: "", q: "", status: "" };

const PAGE_SIZE_OPTIONS = [25, 50, MAX_PAGE_SIZE];

const COMMISSION_KEYS = new Set([
  "grossCommission",
  "pendingCommission",
  "confirmedCommission",
  "cancelledCommission",
  "rejectedCommission",
  "payableCommission",
  "paidCommission",
  "netCommission",
  "mboReceivable",
  "mboActuallyReceived",
  "epc",
]);

const ORDER_VALUE_SUMMARY = ["grossOrderValue", "confirmedOrderValue", "netOrderValue"];
const COMMISSION_SUMMARY = ["grossCommission", "confirmedCommission", "netCommission"];

/* v13 .status pill tokens. Text always carries the meaning; colour is secondary. */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  grey: "border-[#e4e7ec] bg-[#f8fafc] text-[#475467]",
};

/* v13 .toolbar controls, th / td and button.action. */
const CONTROL =
  "h-[31px] rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff] disabled:bg-[#f8fafc] disabled:text-[#98a2b3]";
const LABEL = "flex flex-col gap-1 text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-2 align-middle text-[10.5px] text-[#101828]";
const ACTION_BUTTON =
  "rounded-[7px] border border-[#e4e7ec] bg-white px-2.5 py-[5px] text-[10px] font-extrabold text-[#101828] hover:bg-[#f8fafc] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2457d6] disabled:opacity-40";

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

function Pill({ value, tone = "grey", title }) {
  if (value == null || value === "") return <Muted />;
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[8px] font-black leading-none ${PILL_TONES[tone]}`}
    >
      {String(value)}
    </span>
  );
}
Pill.propTypes = { value: optionalStringOrNumber, tone: optionalString, title: optionalString };

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

function formatCount(value) {
  return hasNumber(value) ? Number(value).toLocaleString() : null;
}

/** Amount as returned, grouped for reading. Never rounded to fewer than the stored decimals. */
function formatAmount(value) {
  return hasNumber(value) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }) : null;
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Count({ value }) {
  const text = formatCount(value);
  return text == null ? <Muted title="Not returned" /> : <span className="tabular-nums">{text}</span>;
}
Count.propTypes = { value: optionalStringOrNumber };

/** An order value: shown as returned, whatever the commission state. */
function OrderValue({ value }) {
  const text = formatAmount(value);
  return text == null ? <Muted title="Not returned" /> : <span className="tabular-nums">{text}</span>;
}
OrderValue.propTypes = { value: optionalStringOrNumber };

/** A commission / receivable amount: gated by the row's backend financial state only. */
function CommissionValue({ row, field }) {
  const state = financialStateOf(row);
  if (state === FINANCIAL_STATE.REDACTED) {
    return (
      <span className="text-[10px] font-semibold text-[#b54708]" data-financial="restricted" title="Withheld by the backend for your access level">
        Restricted
      </span>
    );
  }
  if (state !== FINANCIAL_STATE.INCLUDED) {
    return <Muted title="The response carried no financial state">Not available</Muted>;
  }
  const text = formatAmount(row[field]);
  return text == null ? <Muted title="Not returned" /> : <span className="tabular-nums">{text}</span>;
}
CommissionValue.propTypes = { row: optionalObject, field: optionalString };

function Clip({ text, width = "max-w-[180px]", bold = false }) {
  if (text == null || text === "") return <Muted />;
  return (
    <span className={`block truncate ${width} ${bold ? "font-semibold" : ""}`} title={String(text)}>
      {String(text)}
    </span>
  );
}
Clip.propTypes = { text: optionalStringOrNumber, width: optionalString, bold: optionalBool };

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

// ── Loaded-row money summary ─────────────────────────────────────────────────

const SUMMARY_MESSAGES = {
  [MONEY_SUMMARY_STATE.REDACTED]: "Financial data restricted",
  [MONEY_SUMMARY_STATE.MIXED_CURRENCIES]: "Mixed currencies",
  [MONEY_SUMMARY_STATE.UNKNOWN_CURRENCY]: "Currency unavailable",
  [MONEY_SUMMARY_STATE.NO_DATA]: "No values on the loaded rows",
  [MONEY_SUMMARY_STATE.UNAVAILABLE]: "Not available",
};

function MoneyGroup({ title, summary, fields }) {
  const available = summary.state === MONEY_SUMMARY_STATE.AVAILABLE;
  return (
    <div className="min-w-0 flex-1 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-2.5" data-money-group={title} data-money-state={summary.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[9px] font-black uppercase text-[#98a2b3]">{title}</span>
        {available ? <Pill value={summary.currency} tone="blue" title="All loaded rows share this currency" /> : null}
      </div>
      {available ? (
        <dl className="mt-1.5 grid grid-cols-3 gap-2">
          {fields.map((field) => (
            <div key={field} className="min-w-0">
              <dt className="truncate text-[9.5px] text-[#667085]" title={FIELD_DESCRIPTIONS[field] || undefined}>
                {FIELD_LABELS[field]}
              </dt>
              <dd className="m-0 truncate text-[15px] font-bold tabular-nums">
                {summary.totals[field] == null ? <Muted title="No value on the loaded rows" /> : formatAmount(summary.totals[field])}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 mt-1.5 text-[12px] font-semibold text-[#344054]">
          {SUMMARY_MESSAGES[summary.state]}
          {summary.state === MONEY_SUMMARY_STATE.MIXED_CURRENCIES ? (
            <span className="ml-1.5 font-mono text-[11px] font-normal text-[#475467]" data-currencies={summary.currencies.join(",")}>
              {summary.currencies.join(", ")}
            </span>
          ) : null}
          {summary.state === MONEY_SUMMARY_STATE.MIXED_CURRENCIES ? (
            <span className="block text-[10px] font-normal text-[#667085]">No combined amount: currencies are never added together or converted.</span>
          ) : null}
        </p>
      )}
    </div>
  );
}
MoneyGroup.propTypes = { title: optionalString, summary: optionalObject, fields: optionalArray };

// ── Table ────────────────────────────────────────────────────────────────────

function label(key) {
  return FIELD_LABELS[key] || key;
}

function countCol(key) {
  return { key, label: label(key), help: FIELD_DESCRIPTIONS[key], align: "right", render: (r) => <Count value={r[key]} /> };
}

function orderValueCol(key) {
  return { key, label: label(key), help: FIELD_DESCRIPTIONS[key], align: "right", render: (r) => <OrderValue value={r[key]} /> };
}

function commissionCol(key) {
  return {
    key,
    label: label(key),
    help: FIELD_DESCRIPTIONS[key],
    align: "right",
    render: (r) => <CommissionValue row={r} field={key} />,
  };
}

function buildColumns(view, offset) {
  const rowNumber = { key: "#", label: "#", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> };
  const network = { key: "networkSource", label: label("networkSource"), render: (r) => <span className="font-mono text-[10px]">{r.networkSource || r.network || "—"}</span> };
  const brandCampaign = {
    key: "brandCampaign",
    label: `${label("brandName")} / ${label("campaignName")}`,
    render: (r) => (
      <span className="block max-w-[190px]">
        <Clip text={r.brandName} width="max-w-[190px]" bold />
        <span className="block truncate text-[10px] text-[#667085]" title={r.campaignName || undefined}>
          {r.campaignName || "No campaign name"}
        </span>
      </span>
    ),
  };
  const channel = {
    key: "campaignType",
    label: label("campaignType"),
    render: (r) => (r.campaignType ? <span title={r.campaignChannelType || undefined}>{r.campaignType}</span> : <Muted />),
  };
  const coupon = {
    key: "couponCode",
    label: label("couponCode"),
    render: (r) => (r.couponCode ? <span className="font-mono text-[10px]" title={r.couponSourceScope || undefined}>{r.couponCode}</span> : <Muted />),
  };
  const reportingStatus = {
    key: "reportingStatus",
    label: "Reporting Status",
    help: "Attribution / reconciliation status as returned. Not an order status.",
    render: (r) => {
      const title = [
        r.rawStatus ? `Network status: ${r.rawStatus}` : null,
        r.mboStandardStatus ? `MBO standard status: ${r.mboStandardStatus}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      if (!r.attributionStatus && !r.reconciliationStatus) return <Muted title={title || "Not returned"} />;
      return (
        <span className="flex flex-col items-start gap-0.5" title={title || undefined}>
          {r.attributionStatus ? <Pill value={`Attribution: ${r.attributionStatus}`} tone="blue" /> : null}
          {r.reconciliationStatus ? <Pill value={`Reconciliation: ${r.reconciliationStatus}`} tone="grey" /> : null}
        </span>
      );
    },
  };
  const country = { key: "country", label: label("country"), render: (r) => (r.country ? <span className="font-mono text-[10px]">{r.country}</span> : <Muted />) };
  const currency = { key: "currency", label: label("currency"), help: FIELD_DESCRIPTIONS.currency, render: (r) => (r.currency ? <span className="font-mono text-[10px] font-bold">{r.currency}</span> : <Muted title="Currency not returned" />) };
  const date = { key: "date", label: label("date"), render: (r) => (r.date ? <span className="font-mono text-[10px]">{r.date}</span> : <Muted />) };
  const lastSynced = {
    key: "lastSyncedAt",
    label: label("lastSyncedAt"),
    render: (r) => {
      const text = formatDateTime(r.lastSyncedAt);
      return text ? <span className="text-[10px] text-[#475467]">{text}</span> : <Muted />;
    },
  };

  if (view === "compact") {
    return [
      rowNumber,
      network,
      brandCampaign,
      countCol("linkClicks"),
      countCol("grossOrders"),
      orderValueCol("grossOrderValue"),
      countCol("netOrders"),
      commissionCol("netCommission"),
      currency,
      date,
    ];
  }

  const standard = [
    rowNumber,
    network,
    brandCampaign,
    channel,
    coupon,
    countCol("impressions"),
    countCol("linkClicks"),
    countCol("uniqueClicks"),
    countCol("grossOrders"),
    orderValueCol("grossOrderValue"),
    commissionCol("grossCommission"),
    countCol("confirmedOrders"),
    orderValueCol("confirmedOrderValue"),
    commissionCol("confirmedCommission"),
    countCol("cancelledOrders"),
    countCol("rejectedOrders"),
    countCol("netOrders"),
    orderValueCol("netOrderValue"),
    commissionCol("netCommission"),
  ];
  const tail = [reportingStatus, country, currency, date, lastSynced];
  if (view === "full") {
    return [
      ...standard,
      countCol("mboLinkClicks"),
      commissionCol("payableCommission"),
      commissionCol("paidCommission"),
      commissionCol("mboReceivable"),
      commissionCol("mboActuallyReceived"),
      ...tail,
    ];
  }
  return [...standard, ...tail];
}

function PerformanceTable({ rows, columns }) {
  return (
    <div className="max-h-[65vh] overflow-auto" tabIndex={0} aria-label="Performance records, scrollable">
      <table aria-label="Network performance facts" className="w-full min-w-[1080px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" title={col.help} className={`${TH} ${col.align === "right" ? "text-right" : ""} ${COMMISSION_KEYS.has(col.key) ? "bg-[#fbf8f1]" : ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `row-${index}`} className="hover:bg-[#fbfcff]">
              {columns.map((col) => (
                <td key={col.key} className={`${TD} ${col.align === "right" ? "text-right" : ""}`}>
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
PerformanceTable.propTypes = { rows: optionalArray, columns: optionalArray };

// ── Page ─────────────────────────────────────────────────────────────────────

export function NetworkPerformanceReportsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [view, setView] = useState("standard");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, envelope: null });
  const requestSeq = useRef(0);

  const debouncedBrand = useDebounced(filters.brand);
  const debouncedQ = useDebounced(filters.q);
  const debouncedStatus = useDebounced(filters.status);

  const params = useMemo(
    () =>
      buildPerformanceReportParams({
        from: filters.from,
        to: filters.to,
        date: filters.date,
        network: filters.network,
        channel: filters.channel,
        brand: debouncedBrand,
        q: debouncedQ,
        status: debouncedStatus,
      }),
    [filters.from, filters.to, filters.date, filters.network, filters.channel, debouncedBrand, debouncedQ, debouncedStatus],
  );
  const paramsKey = JSON.stringify(params);

  // The page belongs to one query: any change to the filters or page size starts again at page 1,
  // without first sending a request for the old page number.
  const queryKey = `${paramsKey}|${pageSize}`;
  const [pageState, setPageState] = useState({ key: queryKey, page: 1 });
  // Re-pin to the new query at page 1, so going back to an earlier query never restores its old page.
  if (pageState.key !== queryKey) setPageState({ key: queryKey, page: 1 });
  const page = pageState.key === queryKey ? pageState.page : 1;
  const setPage = useCallback((next) => setPageState({ key: queryKey, page: next }), [queryKey]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchApi(PERFORMANCE_REPORT_PATH, { ...params, page, pageSize: normalizePageSize(pageSize) })
      .then((envelope) => {
        if (seq !== requestSeq.current) return;
        setState({ loading: false, error: null, envelope: envelope && typeof envelope === "object" ? envelope : {} });
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        setState({ loading: false, error: statusSafeMessage(err?.status, LOAD_ERROR), envelope: null });
      });
    // params and pageSize are represented by queryKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, page, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const envelope = state.envelope;
  const rows = useMemo(() => {
    const data = Array.isArray(envelope?.data) ? envelope.data : [];
    return data.map(pickPerformanceReportFields).filter(Boolean);
  }, [envelope]);
  const pagination = envelope?.pagination || {};
  const total = hasNumber(pagination.total) ? Number(pagination.total) : null;
  const effectivePageSize = hasNumber(pagination.pageSize) ? Number(pagination.pageSize) : normalizePageSize(pageSize);
  const totalPages = hasNumber(pagination.totalPages)
    ? Number(pagination.totalPages)
    : total != null
      ? Math.max(1, Math.ceil(total / effectivePageSize))
      : null;
  const currentPage = hasNumber(pagination.page) ? Number(pagination.page) : page;
  const hasNext = Boolean(pagination.hasMore) || (totalPages != null && currentPage < totalPages);
  const offset = (currentPage - 1) * effectivePageSize;

  const kpis = useMemo(() => safeCountKpis(envelope?.kpis), [envelope]);
  const financialState = responseFinancialState({ rows, includeFinancial: envelope?.includeFinancial });
  const orderSummary = useMemo(() => summarizeLoadedMoney(rows, ORDER_VALUE_SUMMARY), [rows]);
  const commissionSummary = useMemo(
    () => summarizeLoadedMoney(rows, COMMISSION_SUMMARY, { financialState }),
    [rows, financialState],
  );
  const columns = useMemo(() => buildColumns(view, offset), [view, offset]);

  const settled = !state.loading && !state.error && envelope;
  const kpiValue = (key) => (settled ? formatCount(kpis[key]) ?? <Muted>Not returned</Muted> : "…");
  const filtersActive = Object.values(filters).some(Boolean);
  const set = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Performance Reports</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            Network-level performance facts reported by each network, aggregated per day, supplier campaign, coupon, currency and country.
            One row is one stored fact; nothing here is computed from individual orders.
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <Pill value="INTERNAL ADMIN" tone="amber" title="Supplier performance data. Internal admin only." />
          <Pill value="NETWORK PERFORMANCE" tone="blue" title="Network grain (NetworkPerformanceFact), not client reporting" />
        </span>
      </div>

      {/* filter-wide count KPIs */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-5" aria-label="Filter-wide counts">
        <Metric label="Performance Records" hint="Backend total for these filters">
          {settled ? (total != null ? total.toLocaleString() : <Muted>Not returned</Muted>) : "…"}
        </Metric>
        <Metric label={label("linkClicks")} hint="Network-reported clicks · all matching records">
          {kpiValue("linkClicks")}
        </Metric>
        <Metric label={label("mboLinkClicks")} hint="Independent of network clicks · all matching records">
          {kpiValue("mboLinkClicks")}
        </Metric>
        <Metric label={label("grossOrders")} hint="All matching records">
          {kpiValue("grossOrders")}
        </Metric>
        <Metric label="Confirmed (Net) Orders" hint="Net orders equal confirmed orders on this grain · all matching records">
          {kpiValue("confirmedOrders")}
        </Metric>
      </div>

      {/* loaded-row money summary */}
      <section className="mb-3 rounded-[10px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-2.5" aria-label="Loaded rows money summary">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Pill value="LOADED ROWS ONLY" tone="amber" title="Sums the rows on this page only. Never a total for all matching records." />
          <span className="text-[10px] text-[#667085]">
            {settled ? `${rows.length} row${rows.length === 1 ? "" : "s"} on this page${total != null ? ` of ${total.toLocaleString()} matching` : ""}. ` : ""}
            Amounts stay in the rows&apos; own currency and are never converted.
          </span>
        </div>
        {settled ? (
          <div className="flex flex-col gap-2.5 md:flex-row">
            <MoneyGroup title="Order values" summary={orderSummary} fields={ORDER_VALUE_SUMMARY} />
            <MoneyGroup title="Supplier commission" summary={commissionSummary} fields={COMMISSION_SUMMARY} />
          </div>
        ) : (
          <p className="m-0 px-1 py-2 text-[11px] text-[#667085]">{state.loading ? "Waiting for rows…" : "No rows loaded."}</p>
        )}
      </section>

      {/* .toolbar */}
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()} aria-label="Performance filters">
        <label className={LABEL}>
          Date from
          <input type="date" className={CONTROL} value={filters.from} disabled={Boolean(filters.date)} onChange={set("from")} />
        </label>
        <label className={LABEL}>
          Date to
          <input type="date" className={CONTROL} value={filters.to} disabled={Boolean(filters.date)} onChange={set("to")} />
        </label>
        <label className={LABEL} title="A single report date. When set, the date range is ignored.">
          Single date
          <input type="date" className={CONTROL} value={filters.date} onChange={set("date")} />
        </label>
        <label className={LABEL}>
          Network
          <select className={`${CONTROL} max-w-[200px]`} value={filters.network} onChange={set("network")}>
            <option value="">All networks</option>
            {NETWORK_FILTER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {FACT_INGESTING_NETWORKS.includes(n) ? n : `${n} (no performance ingestion in code)`}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Brand
          <input type="search" className={`${CONTROL} w-[150px]`} placeholder="Brand contains" value={filters.brand} onChange={set("brand")} />
        </label>
        <label className={LABEL}>
          Channel type
          <select className={CONTROL} value={filters.channel} onChange={set("channel")}>
            <option value="">All channels</option>
            {CHANNEL_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Search
          <input
            type="search"
            className={`${CONTROL} w-[210px]`}
            placeholder="Brand, campaign, coupon, report id"
            value={filters.q}
            onChange={set("q")}
          />
        </label>
        <label className={LABEL} title="Exact attribution or reconciliation status as stored. Not an order status.">
          Reporting status
          <input
            type="search"
            className={`${CONTROL} w-[150px]`}
            placeholder="Attribution / reconciliation"
            value={filters.status}
            onChange={set("status")}
          />
        </label>
        <label className={LABEL}>
          Columns
          <select className={CONTROL} value={view} onChange={(e) => setView(e.target.value)}>
            <option value="standard">Standard</option>
            <option value="compact">Compact</option>
            <option value="full">Full (all commission types)</option>
          </select>
        </label>
        <label className={LABEL}>
          Rows per page
          <select className={CONTROL} value={pageSize} onChange={(e) => setPageSize(normalizePageSize(e.target.value))}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {filtersActive ? (
          <button type="button" className={`${ACTION_BUTTON} h-[31px]`} onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset filters
          </button>
        ) : null}
      </form>

      {/* .card registry */}
      <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e7ec] px-4 py-2.5">
          <h2 className="m-0 text-sm font-bold">Network Performance Facts</h2>
          <span className="flex flex-wrap items-center gap-2 text-[10px] text-[#667085]">
            One row per stored fact · amounts in the row&apos;s currency
            {settled && financialState === FINANCIAL_STATE.REDACTED ? (
              <Pill value="COMMISSION RESTRICTED" tone="amber" title="The backend withheld commission and receivable amounts for your access level" />
            ) : null}
          </span>
        </div>

        {state.loading ? (
          <div className="px-4 py-8 text-center text-[11px] text-[#667085]" role="status" aria-live="polite">
            Loading performance records…
          </div>
        ) : state.error ? (
          <div className="px-4 py-6" role="alert">
            <Note tone="danger">
              <b>{state.error}</b>{" "}
              <button type="button" className={`${ACTION_BUTTON} ml-1`} onClick={retry}>
                Retry
              </button>
            </Note>
          </div>
        ) : !rows.length ? (
          <div className="px-4 py-8 text-center text-[11px] text-[#667085]" role="status">
            <b className="mb-1 block text-[#344054]">No performance records found for these filters.</b>
            {filtersActive ? "Try widening the date range or clearing a filter." : "No network has recorded a performance fact yet."}
          </div>
        ) : (
          <PerformanceTable rows={rows} columns={columns} />
        )}

        <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7ec] px-4 py-2.5 text-[10px] text-[#667085]" aria-label="Pagination">
          <span>
            Page {currentPage}
            {totalPages != null ? ` of ${totalPages}` : ""}
            {total != null ? ` · ${total.toLocaleString()} records` : ""}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className={ACTION_BUTTON} disabled={currentPage <= 1 || state.loading} onClick={() => setPage(Math.max(1, currentPage - 1))}>
              Previous
            </button>
            <button type="button" className={ACTION_BUTTON} disabled={state.loading || !hasNext} onClick={() => setPage(currentPage + 1)}>
              Next
            </button>
          </div>
        </nav>
      </div>

      <Note>
        <b>How to read this page.</b> Counts at the top cover all matching records. Money totals are never shown for all matching records,
        because the backend adds different currencies together; the dashed panel sums only the loaded rows, and only when they share one
        currency. Gross, confirmed, payable, paid and net commission are separate network figures, and MBO Receivable is supplier commission
        owed to MBO, not MBO margin. Filters available: dates, network, brand, channel type, search and reporting status. Country, currency,
        campaign, client and order-status filters are not supported by this endpoint.
      </Note>
    </div>
  );
}
