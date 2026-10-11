import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "../../../api";
import { optionalArray, optionalBool, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { statusSafeMessage } from "../../../utils/safeErrorText";
import {
  BACKEND_GAPS,
  COLUMN_PRESETS,
  DEFAULT_PAGE_SIZE,
  FIELD_DESCRIPTIONS,
  FIELD_LABELS,
  FINANCIAL_GATED_FIELDS,
  FINANCIAL_STATE,
  MAX_PAGE_SIZE,
  MONEY_GROUPS,
  MONEY_SUMMARY_STATE,
  NETWORK_COVERAGE,
  NETWORK_FILTER_OPTIONS,
  NETWORK_ORDER_COVERAGE,
  ORDERS_PATH,
  PAID_ONLY_SUPPLIER_PAYMENT_STATUSES,
  STATUS_KIND,
  SUPPLIER_PAYMENT_STATUS_LABELS,
  SUPPLIER_PAYMENT_STATUS_OPTIONS,
  VALIDATION_STATUS_LABELS,
  VALIDATION_STATUS_OPTIONS,
  buildOrdersParams,
  financialStateOf,
  isSyntheticOrderId,
  matchingOrderCount,
  networkOrderCoverage,
  normalizePageSize,
  pickOrderRows,
  responseFinancialState,
  statusLabel,
  summarizeLoadedMoney,
} from "./orderConversionContract";

/**
 * Network Operations → Orders / Conversions, laid out to the v13 reference (.page-head, metric
 * boxes, .toolbar, .card registry, .note). INTERNAL admin only. First release: the Orders registry
 * only — no conversions, clicks or client-confirmed orders.
 *
 * Data: GET /ops/admin/orders, one row per backend Order. The full response envelope is kept
 * (data, pagination, includeFinancial). Request params come only from buildOrdersParams, and every
 * row passes through pickOrderRows (pickOrderFields); raw backend rows are never rendered.
 *
 * Money:
 *   - The only filter-wide figure is the backend's matching record count. There are no backend
 *     money totals.
 *   - Money summaries cover the LOADED ROWS only, and exist only when those rows share one
 *     currency: order value in `currency`, commission in `commissionCurrency`. Nothing is
 *     converted, and the receipt amount is never totalled.
 *   - Commission and receipt visibility comes from each row's backend financial state.
 */

const LOAD_ERROR = "Order records could not be loaded.";

const EMPTY_FILTERS = {
  from: "",
  to: "",
  network: "",
  clientId: "",
  validationStatus: "",
  supplierPaymentStatus: "",
  confirmedOnly: false,
  paidOnly: false,
  q: "",
};

const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, 50, MAX_PAGE_SIZE];

const VIEW_OPTIONS = [
  { value: "COMPACT", label: "Compact" },
  { value: "STANDARD", label: "Standard" },
  { value: "FULL", label: "Full" },
];

const GATED = new Set(FINANCIAL_GATED_FIELDS);
const PERCENT_FIELDS = new Set(["clientSharePercent", "mboSharePercent"]);
const RIGHT_ALIGNED = new Set(["orderValue", "supplierActualCommission", "clientCommission", "mboCommissionMargin", "clientSharePercent", "mboSharePercent", "mboReceivedAmount", "exceptionCount"]);

const COVERAGE_GROUPS = [
  { coverage: NETWORK_COVERAGE.ACTIVE_PARTIAL, title: "Active / partial" },
  { coverage: NETWORK_COVERAGE.STAGED_NOT_PROMOTED, title: "Staged, not currently promoted" },
  { coverage: NETWORK_COVERAGE.UNSUPPORTED, title: "Unsupported" },
];

const NETWORK_OPTION_SUFFIX = {
  [NETWORK_COVERAGE.STAGED_NOT_PROMOTED]: " (staged, not promoted)",
  [NETWORK_COVERAGE.UNSUPPORTED]: " (not supported)",
};

/* v13 .status pill tokens. Text always carries the meaning; colour is secondary. */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  grey: "border-[#e4e7ec] bg-[#f8fafc] text-[#475467]",
};

/* Tone per status value. Only colour; the label is always the contract's text. */
const STATUS_TONES = {
  [STATUS_KIND.ORDER]: { CONFIRMED: "green", PENDING: "amber", REJECTED: "red", CANCELLED: "red", REVERSED: "red" },
  [STATUS_KIND.VALIDATION]: { VALIDATION_APPROVED: "green", VALIDATION_PENDING: "grey", VALIDATION_REJECTED: "red", VALIDATION_NEEDS_REVIEW: "amber" },
  [STATUS_KIND.SUPPLIER_PAYMENT]: { PAYMENT_RECEIVED: "green", PAYMENT_PAYABLE: "blue", PAYMENT_INVOICED: "blue", PAYMENT_ON_HOLD: "red" },
  [STATUS_KIND.CLIENT_PAYMENT]: { CLIENT_PAYMENT_PAID: "green", CLIENT_PAYMENT_PAYABLE: "blue", CLIENT_PAYMENT_ON_HOLD: "red" },
  [STATUS_KIND.PAYMENT_LIFECYCLE]: { PAID: "green", PAYABLE: "blue", ADVERTISER_INVOICED: "blue", REJECTED: "red", NOT_PAYABLE: "red" },
  [STATUS_KIND.ATTRIBUTION]: { ATTRIBUTED: "green", REATTRIBUTED: "green", ORPHAN: "red", REVIEW_REQUIRED: "amber" },
};

/* v13 .toolbar controls, th / td and button.action. */
const CONTROL =
  "h-[31px] rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff] disabled:bg-[#f8fafc] disabled:text-[#98a2b3]";
const LABEL = "flex flex-col gap-1 text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const CHECK_LABEL =
  "flex h-[31px] cursor-pointer items-center gap-1.5 rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[10.5px] font-semibold text-[#344054] focus-within:ring-2 focus-within:ring-[#2457d6]";
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

function networkName(code) {
  if (!code) return "";
  const text = String(code);
  return text.length <= 2 ? text : text.charAt(0) + text.slice(1).toLowerCase();
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
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[8px] font-black leading-none ${PILL_TONES[tone] || PILL_TONES.grey}`}
    >
      {String(value)}
    </span>
  );
}
Pill.propTypes = { value: optionalStringOrNumber, tone: optionalString, title: optionalString };

function hasNumber(value) {
  return value != null && value !== "" && Number.isFinite(Number(value));
}

/** Amount as returned, grouped for reading. Never rounded to fewer than the stored decimals. */
function formatAmount(value) {
  return hasNumber(value) ? Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 }) : null;
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Clip({ text, width = "max-w-[180px]", bold = false, mono = false }) {
  if (text == null || text === "") return <Muted />;
  return (
    <span className={`block truncate ${width} ${bold ? "font-semibold" : ""} ${mono ? "font-mono text-[10px]" : ""}`} title={String(text)}>
      {String(text)}
    </span>
  );
}
Clip.propTypes = { text: optionalStringOrNumber, width: optionalString, bold: optionalBool, mono: optionalBool };

/** A status of one kind, labelled by the contract. The stored code stays in the tooltip. */
function Status({ kind, value }) {
  if (value == null || value === "") return <Muted title="Not returned" />;
  const text = statusLabel(kind, value);
  const tone = STATUS_TONES[kind]?.[value] || "grey";
  return <Pill value={text} tone={tone} title={`${FIELD_LABELS[fieldForKind(kind)] || kind}: ${value}`} />;
}
Status.propTypes = { kind: optionalString, value: optionalStringOrNumber };

function fieldForKind(kind) {
  return {
    [STATUS_KIND.ORDER]: "orderStatus",
    [STATUS_KIND.VALIDATION]: "validationStatus",
    [STATUS_KIND.SUPPLIER_PAYMENT]: "supplierPaymentStatus",
    [STATUS_KIND.CLIENT_PAYMENT]: "clientPaymentStatus",
    [STATUS_KIND.PAYMENT_LIFECYCLE]: "paymentStatus",
    [STATUS_KIND.ATTRIBUTION]: "attributionStatus",
    [STATUS_KIND.RECONCILIATION]: "reconciliationStatus",
    [STATUS_KIND.RAW]: "networkRawStatus",
  }[kind];
}

/** A commission / receipt field: gated by the row's backend financial state only. */
function GatedValue({ row, field }) {
  const state = financialStateOf(row);
  if (state === FINANCIAL_STATE.REDACTED) {
    return (
      <span className="text-[10px] font-semibold text-[#b54708]" data-financial="restricted" title="Withheld by the backend for your access level">
        Restricted
      </span>
    );
  }
  if (state !== FINANCIAL_STATE.INCLUDED) {
    return <Muted title="The response carried no recognisable financial state">Not available</Muted>;
  }
  const value = row[field];
  if (field === "bankReceivedAt") {
    const text = formatDateTime(value);
    return text ? <span className="text-[10px]">{text}</span> : <Muted title="No bank receipt evidence" />;
  }
  if (field === "mboReceivedDateTime") {
    return value ? <span className="font-mono text-[10px]">{String(value)}</span> : <Muted title="No bank receipt evidence" />;
  }
  const text = formatAmount(value);
  if (text == null) return <Muted title="Not returned" />;
  return <span className="tabular-nums">{PERCENT_FIELDS.has(field) ? `${text}%` : text}</span>;
}
GatedValue.propTypes = { row: optionalObject, field: optionalString };

// ── Cells ────────────────────────────────────────────────────────────────────

const CELLS = {
  network: (r) => (r.network ? <span className="font-mono text-[10px]">{r.network}</span> : <Muted />),
  networkAccount: (r) => <Clip text={r.networkAccount} width="max-w-[140px]" />,
  supplierOrderId: (r) =>
    r.supplierOrderId ? (
      <span className="flex items-center gap-1.5">
        <Clip text={r.supplierOrderId} width="max-w-[170px]" mono />
        {isSyntheticOrderId(r.supplierOrderId) ? (
          <Pill value="Synthetic" tone="grey" title="The network sent no order id; the conversion id is used as the order id" />
        ) : null}
      </span>
    ) : (
      <Muted />
    ),
  networkConversionId: (r) => <Clip text={r.networkConversionId} width="max-w-[160px]" mono />,
  clientName: (r) => <Clip text={r.clientName} width="max-w-[160px]" />,
  brandName: (r) => <Clip text={r.brandName} width="max-w-[170px]" bold />,
  campaignName: (r) => <Clip text={r.campaignName} width="max-w-[190px]" />,
  campaignType: (r) => <Clip text={r.campaignType} width="max-w-[130px]" />,
  orderValue: (r) => {
    const text = formatAmount(r.orderValue);
    return text == null ? <Muted title="Not returned" /> : <span className="tabular-nums">{text}</span>;
  },
  currency: (r) => (r.currency ? <span className="font-mono text-[10px] font-bold">{r.currency}</span> : <Muted title="Currency not returned" />),
  commissionCurrency: (r) =>
    r.commissionCurrency ? <span className="font-mono text-[10px] font-bold">{r.commissionCurrency}</span> : <Muted title="Commission currency not returned" />,
  networkRawStatus: (r) =>
    r.networkRawStatus != null && r.networkRawStatus !== "" ? (
      <span className="font-mono text-[10px] text-[#344054]" title="The network's own status, as sent">
        {String(r.networkRawStatus)}
      </span>
    ) : (
      <Muted title="The network sent no status" />
    ),
  orderStatus: (r) => <Status kind={STATUS_KIND.ORDER} value={r.orderStatus} />,
  validationStatus: (r) => <Status kind={STATUS_KIND.VALIDATION} value={r.validationStatus} />,
  supplierPaymentStatus: (r) => <Status kind={STATUS_KIND.SUPPLIER_PAYMENT} value={r.supplierPaymentStatus} />,
  clientPaymentStatus: (r) => <Status kind={STATUS_KIND.CLIENT_PAYMENT} value={r.clientPaymentStatus} />,
  paymentStatus: (r) => <Status kind={STATUS_KIND.PAYMENT_LIFECYCLE} value={r.paymentStatus} />,
  attributionStatus: (r) => <Status kind={STATUS_KIND.ATTRIBUTION} value={r.attributionStatus} />,
  reconciliationStatus: (r) => <Status kind={STATUS_KIND.RECONCILIATION} value={r.reconciliationStatus} />,
  attributionEvidenceLabel: (r) => <Clip text={r.attributionEvidenceLabel} width="max-w-[140px]" />,
  couponCode: (r) =>
    r.couponCode ? (
      <span className="font-mono text-[10px]">{r.couponCode}</span>
    ) : r.couponType === "LINK" ? (
      <Muted title="The source marks this as a link-type offer. No link is shown here.">Link-type offer</Muted>
    ) : (
      <Muted />
    ),
  couponType: (r) => <Clip text={r.couponType} width="max-w-[80px]" />,
  exceptionCount: (r) => (hasNumber(r.exceptionCount) ? <span className="tabular-nums">{Number(r.exceptionCount)}</span> : <Muted />),
  orderDate: (r) => {
    const text = formatDate(r.orderDate);
    return text ? <span className="text-[10px]">{text}</span> : <Muted title="No order date" />;
  },
  confirmedDate: (r) => {
    const text = formatDate(r.confirmedDate);
    return text ? <span className="text-[10px]">{text}</span> : <Muted />;
  },
  lastSyncedAt: (r) => {
    const text = formatDateTime(r.lastSyncedAt);
    return text ? <span className="text-[10px] text-[#475467]">{text}</span> : <Muted />;
  },
};

function renderCell(key, row) {
  if (GATED.has(key)) return <GatedValue row={row} field={key} />;
  const cell = CELLS[key];
  return cell ? cell(row) : <Clip text={row[key]} />;
}

function buildColumns(view, offset) {
  const preset = COLUMN_PRESETS[view] || COLUMN_PRESETS.STANDARD;
  return [
    { key: "#", label: "#", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> },
    ...preset.map((key) => ({
      key,
      label: FIELD_LABELS[key] || key,
      help: FIELD_DESCRIPTIONS[key],
      align: RIGHT_ALIGNED.has(key) ? "right" : "left",
      gated: GATED.has(key),
      render: (r) => renderCell(key, r),
    })),
  ];
}

function OrdersTable({ rows, columns }) {
  return (
    <div className="max-h-[65vh] overflow-auto" tabIndex={0} aria-label="Order records, scrollable">
      <table aria-label="Network order records" className="w-full min-w-[1080px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" title={col.help} className={`${TH} ${col.align === "right" ? "text-right" : ""} ${col.gated ? "bg-[#fbf8f1]" : ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.orderId || `row-${index}`} className="hover:bg-[#fbfcff]" data-order-row="">
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
OrdersTable.propTypes = { rows: optionalArray, columns: optionalArray };

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

// ── Network coverage ─────────────────────────────────────────────────────────

function CoverageNotice() {
  return (
    <section className="mb-3" aria-label="Order ingestion coverage">
      <Note tone="warn">
        <b>Current order ingestion is partial across networks.</b> This is implementation coverage read from the sync code, not a confirmation of
        production data for any network.
        <dl className="mt-1.5 grid gap-x-4 gap-y-1 md:grid-cols-3">
          {COVERAGE_GROUPS.map((group) => {
            const names = Object.keys(NETWORK_ORDER_COVERAGE).filter((n) => NETWORK_ORDER_COVERAGE[n].coverage === group.coverage);
            return (
              <div key={group.coverage} className="min-w-0" data-coverage={group.coverage}>
                <dt className="text-[9px] font-black uppercase text-[#344054]">{group.title}</dt>
                <dd className="m-0 text-[11px]" title={names.map((n) => `${networkName(n)}: ${NETWORK_ORDER_COVERAGE[n].note}`).join("\n")}>
                  {names.map(networkName).join(", ")}
                </dd>
              </div>
            );
          })}
        </dl>
      </Note>
    </section>
  );
}

// ── Loaded-row money summary ─────────────────────────────────────────────────

const SUMMARY_MESSAGES = {
  [MONEY_SUMMARY_STATE.REDACTED]: "Financial data restricted",
  [MONEY_SUMMARY_STATE.MIXED_CURRENCIES]: "Mixed currencies",
  [MONEY_SUMMARY_STATE.UNKNOWN_CURRENCY]: "Currency unavailable",
  [MONEY_SUMMARY_STATE.NO_DATA]: "No values on the loaded rows",
  [MONEY_SUMMARY_STATE.UNAVAILABLE]: "Not available",
};

const SUMMARY_LABELS = { orderValue: "Loaded Order Value" };

function MoneyGroup({ title, summary, fields, currencyNote }) {
  const available = summary.state === MONEY_SUMMARY_STATE.AVAILABLE;
  return (
    <div className="min-w-0 flex-1 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-2.5" data-money-group={title} data-money-state={summary.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[9px] font-black uppercase text-[#98a2b3]" title={currencyNote}>
          {title}
        </span>
        {available ? <Pill value={summary.currency} tone="blue" title={`All loaded rows share this currency (${currencyNote})`} /> : null}
      </div>
      {available ? (
        <dl className={`mt-1.5 grid gap-2 ${fields.length > 1 ? "grid-cols-3" : "grid-cols-1"}`}>
          {fields.map((field) => (
            <div key={field} className="min-w-0">
              <dt className="truncate text-[9.5px] text-[#667085]" title={FIELD_DESCRIPTIONS[field] || undefined}>
                {SUMMARY_LABELS[field] || FIELD_LABELS[field]}
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
            <>
              <span className="ml-1.5 font-mono text-[11px] font-normal text-[#475467]" data-currencies={summary.currencies.join(",")}>
                {summary.currencies.join(", ")}
              </span>
              <span className="block text-[10px] font-normal text-[#667085]">No combined amount: currencies are never added together or converted.</span>
            </>
          ) : null}
        </p>
      )}
      {available && summary.sources?.length ? (
        <small className="mt-1 block text-[9.5px] text-[#667085]">
          Source: {summary.sources.map((s) => (s === "financial_transaction" ? "ledger" : s === "conversion" ? "conversion rule split" : s)).join(", ")}
        </small>
      ) : null}
    </div>
  );
}
MoneyGroup.propTypes = { title: optionalString, summary: optionalObject, fields: optionalArray, currencyNote: optionalString };

// ── Page ─────────────────────────────────────────────────────────────────────

export function NetworkOrdersPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [view, setView] = useState("STANDARD");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, envelope: null });
  const requestSeq = useRef(0);

  const debouncedQ = useDebounced(filters.q);
  const debouncedClientId = useDebounced(filters.clientId);

  const queryFilters = useMemo(
    () => ({
      from: filters.from,
      to: filters.to,
      network: filters.network,
      clientId: debouncedClientId,
      validationStatus: filters.validationStatus,
      supplierPaymentStatus: filters.supplierPaymentStatus,
      confirmedOnly: filters.confirmedOnly,
      paidOnly: filters.paidOnly,
      q: debouncedQ,
      pageSize,
    }),
    [
      filters.from,
      filters.to,
      filters.network,
      debouncedClientId,
      filters.validationStatus,
      filters.supplierPaymentStatus,
      filters.confirmedOnly,
      filters.paidOnly,
      debouncedQ,
      pageSize,
    ],
  );

  // The page belongs to one query: any change to the filters or page size starts again at page 1,
  // without first sending a request for the old page number. The key is built by the contract.
  const queryKey = useMemo(() => {
    const params = buildOrdersParams({ ...queryFilters, page: 1 });
    delete params.page;
    return JSON.stringify(params);
  }, [queryFilters]);
  const [pageState, setPageState] = useState({ key: queryKey, page: 1 });
  // Re-pin to the new query at page 1, so going back to an earlier query never restores its old page.
  if (pageState.key !== queryKey) setPageState({ key: queryKey, page: 1 });
  const page = pageState.key === queryKey ? pageState.page : 1;
  const setPage = useCallback((next) => setPageState({ key: queryKey, page: next }), [queryKey]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchApi(ORDERS_PATH, buildOrdersParams({ ...queryFilters, page }))
      .then((envelope) => {
        if (seq !== requestSeq.current) return;
        setState({ loading: false, error: null, envelope: envelope && typeof envelope === "object" ? envelope : {} });
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        setState({ loading: false, error: statusSafeMessage(err?.status, LOAD_ERROR), envelope: null });
      });
    // queryFilters is represented by queryKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, page, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const envelope = state.envelope;
  const rows = useMemo(() => pickOrderRows(envelope?.data), [envelope]);
  const pagination = envelope?.pagination || {};
  const { count: total } = matchingOrderCount(pagination);
  const effectivePageSize = hasNumber(pagination.pageSize) ? Number(pagination.pageSize) : normalizePageSize(pageSize);
  const totalPages = hasNumber(pagination.totalPages)
    ? Number(pagination.totalPages)
    : total != null
      ? Math.max(1, Math.ceil(total / effectivePageSize))
      : null;
  const currentPage = hasNumber(pagination.page) ? Number(pagination.page) : page;
  const hasNext = Boolean(pagination.hasMore) || (totalPages != null && currentPage < totalPages);
  const offset = (currentPage - 1) * effectivePageSize;

  const financialState = responseFinancialState({ rows, includeFinancial: envelope?.includeFinancial });
  const orderSummary = useMemo(() => summarizeLoadedMoney(rows, "ORDER_VALUE"), [rows]);
  const commissionSummary = useMemo(() => summarizeLoadedMoney(rows, "COMMISSION", { financialState }), [rows, financialState]);
  const columns = useMemo(() => buildColumns(view, offset), [view, offset]);

  const settled = !state.loading && !state.error && envelope;
  const filtersActive = Object.values(filters).some(Boolean);
  const set = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const toggle = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.checked }));
  const selectedCoverage = networkOrderCoverage(filters.network);

  const financialMetric = !settled
    ? "…"
    : financialState === FINANCIAL_STATE.INCLUDED
      ? "Included"
      : financialState === FINANCIAL_STATE.REDACTED
        ? "Restricted"
        : "Not available";

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Orders / Conversions</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            Network order records built from supplier conversion and order ingestion. One row is one stored order. This first release shows the order
            registry only; conversion- and click-level views are not part of it.
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <Pill value="INTERNAL ADMIN" tone="amber" title="Supplier order data. Internal admin only." />
          <Pill value="ORDER REGISTRY" tone="blue" title="Order grain: one backend Order per row" />
        </span>
      </div>

      <CoverageNotice />

      {/* summary: backend count only */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-4" aria-label="Order summary">
        <Metric label="Matching Orders" hint="Backend total for these filters">
          {settled ? (total != null ? total.toLocaleString() : <Muted>Not returned</Muted>) : "…"}
        </Metric>
        <Metric label="Rows on this page" hint="Loaded rows only">
          {settled ? rows.length.toLocaleString() : "…"}
        </Metric>
        <Metric label="Page" hint="Server-side pagination">
          {settled ? `${currentPage}${totalPages != null ? ` / ${totalPages}` : ""}` : "…"}
        </Metric>
        <Metric label="Financial data" hint="As returned by the backend for your access">
          {financialMetric}
        </Metric>
      </div>

      {/* loaded-row money summary */}
      <section className="mb-3 rounded-[10px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-2.5" aria-label="Loaded rows money summary">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Pill value="LOADED ROWS ONLY" tone="amber" title="Sums the rows on this page only. Never a total for all matching orders." />
          <span className="text-[10px] text-[#667085]">
            {settled ? `${rows.length} row${rows.length === 1 ? "" : "s"} on this page${total != null ? ` of ${total.toLocaleString()} matching` : ""}. ` : ""}
            Order value is summed in the order currency and commission in the commission currency; nothing is converted. MBO Received Amount is never
            totalled.
          </span>
        </div>
        {settled ? (
          <div className="flex flex-col gap-2.5 md:flex-row">
            <MoneyGroup title="Order value" summary={orderSummary} fields={MONEY_GROUPS.ORDER_VALUE.fields} currencyNote="order currency" />
            <MoneyGroup title="Commission" summary={commissionSummary} fields={MONEY_GROUPS.COMMISSION.fields} currencyNote="commission currency" />
          </div>
        ) : (
          <p className="m-0 px-1 py-2 text-[11px] text-[#667085]">{state.loading ? "Waiting for rows…" : "No rows loaded."}</p>
        )}
      </section>

      {/* .toolbar */}
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()} aria-label="Order filters">
        <label className={LABEL}>
          Date from
          <input type="date" className={CONTROL} value={filters.from} onChange={set("from")} />
        </label>
        <label className={LABEL}>
          Date to
          <input type="date" className={CONTROL} value={filters.to} onChange={set("to")} />
        </label>
        <label className={LABEL}>
          Network
          <select className={`${CONTROL} max-w-[220px]`} value={filters.network} onChange={set("network")}>
            <option value="">All networks</option>
            {NETWORK_FILTER_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {networkName(n)}
                {NETWORK_OPTION_SUFFIX[NETWORK_ORDER_COVERAGE[n]?.coverage] || ""}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Client ID
          <input type="search" className={`${CONTROL} w-[150px] font-mono`} placeholder="Exact client id" value={filters.clientId} onChange={set("clientId")} />
        </label>
        <label className={LABEL} title={filters.confirmedOnly ? "Ignored while Confirmed only is on" : undefined}>
          Validation status
          <select className={CONTROL} value={filters.validationStatus} disabled={filters.confirmedOnly} onChange={set("validationStatus")}>
            <option value="">All</option>
            {VALIDATION_STATUS_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {VALIDATION_STATUS_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL} title={filters.paidOnly ? "Ignored while Paid only is on" : undefined}>
          Supplier payment status
          <select className={CONTROL} value={filters.supplierPaymentStatus} disabled={filters.paidOnly} onChange={set("supplierPaymentStatus")}>
            <option value="">All</option>
            {SUPPLIER_PAYMENT_STATUS_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {SUPPLIER_PAYMENT_STATUS_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <div className={LABEL}>
          <span id="orders-confirmed-help">Backend confirmed filter</span>
          <label className={CHECK_LABEL} title="Validation approved only. Order status mapping is incomplete today, so this may return few or no rows.">
            <input type="checkbox" checked={filters.confirmedOnly} onChange={toggle("confirmedOnly")} aria-describedby="orders-confirmed-help" />
            Confirmed only
          </label>
        </div>
        <div className={LABEL}>
          <span id="orders-paid-help">Supplier payment: {PAID_ONLY_SUPPLIER_PAYMENT_STATUSES.map((s) => SUPPLIER_PAYMENT_STATUS_LABELS[s]).join(" / ")}</span>
          <label className={CHECK_LABEL} title="Supplier payment lifecycle states Payable, Received or Invoiced. Not an order status and not client payment.">
            <input type="checkbox" checked={filters.paidOnly} onChange={toggle("paidOnly")} aria-describedby="orders-paid-help" />
            Paid only
          </label>
        </div>
        <label className={LABEL}>
          Search
          <input type="search" className={`${CONTROL} w-[240px]`} placeholder="Order ID, brand, or campaign" value={filters.q} onChange={set("q")} />
        </label>
        <label className={LABEL}>
          Columns
          <select className={CONTROL} value={view} onChange={(e) => setView(e.target.value)}>
            {VIEW_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Page size
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
          <h2 className="m-0 text-sm font-bold">Order Registry</h2>
          <span className="flex flex-wrap items-center gap-2 text-[10px] text-[#667085]">
            One row per order · order value in the order currency · commission in the commission currency
            {settled && financialState === FINANCIAL_STATE.REDACTED ? (
              <Pill value="FINANCIAL RESTRICTED" tone="amber" title="The backend withheld commission and receipt fields for your access level" />
            ) : null}
          </span>
        </div>

        {state.loading ? (
          <div className="px-4 py-8 text-center text-[11px] text-[#667085]" role="status" aria-live="polite">
            Loading order records…
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
            <b className="mb-1 block text-[#344054]">No order records found for these filters.</b>
            {selectedCoverage && selectedCoverage.coverage !== NETWORK_COVERAGE.ACTIVE_PARTIAL
              ? `${networkName(filters.network)}: ${selectedCoverage.note} `
              : ""}
            {filtersActive ? "Try widening the date range or clearing a filter." : "Order ingestion is partial across networks; see the coverage note above."}
          </div>
        ) : (
          <OrdersTable rows={rows} columns={columns} />
        )}

        <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7ec] px-4 py-2.5 text-[10px] text-[#667085]" aria-label="Pagination">
          <span>
            Page {currentPage}
            {totalPages != null ? ` of ${totalPages}` : ""}
            {total != null ? ` · ${total.toLocaleString()} matching order${total === 1 ? "" : "s"}` : ""}
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
        <b>How to read this page.</b> Matching Orders is the backend&apos;s record count for the filters; there are no backend money totals, and the
        dashed panel sums only the loaded rows when they share one currency. Supplier Actual Commission is the network-side amount, Client Commission is
        the client payable (ledger or rule split), and MBO Margin is MBO&apos;s split; none of them is the other. MBO Order Status, Validation Status,
        Supplier Payment Status, Attribution Status and Reconciliation Status are separate and shown as returned — Payment pending is not an order
        status. Coupon links, tracking URLs, click ids and sub ids are never shown.
      </Note>

      <details className="mt-3 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-2.5 text-[11px] text-[#475467]" data-backend-gaps="">
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[.035em] text-[#344054] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2457d6]">
          Known backend limitations ({BACKEND_GAPS.length})
        </summary>
        <ul className="m-0 mt-2 list-disc space-y-1 pl-4 leading-[1.5]">
          {BACKEND_GAPS.map((gap) => (
            <li key={gap}>{gap}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

export default NetworkOrdersPage;
