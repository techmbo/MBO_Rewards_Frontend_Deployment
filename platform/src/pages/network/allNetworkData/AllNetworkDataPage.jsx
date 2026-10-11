import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "../../../api";
import { optionalArray, optionalBool, optionalNode, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { statusSafeMessage } from "../../../utils/safeErrorText";
import {
  CAMPAIGN_STATUS_FILTER_OPTIONS,
  COLUMN_PRESET_KEYS,
  DEFAULT_PAGE_SIZE,
  DEFAULT_RECORD_TYPE,
  FIELD_DESCRIPTIONS,
  IMPORTED_RECORDS_PATH,
  ISSUE_FILTER_OPTIONS,
  MAPPING_STATUS_FILTER_OPTIONS,
  MAX_PAGE_SIZE,
  NETWORK_FILTER_OPTIONS,
  PRESET_OPTIONS,
  RECORD_TYPES,
  RECORD_TYPE_META,
  RELATIONSHIP_STATUS_FILTER_OPTIONS,
  SOURCE_STATUS_FILTER_OPTIONS,
  STATUS_KIND,
  buildImportedRecordsParams,
  columnsForType,
  fieldLabel,
  filtersForType,
  issueLabel,
  matchingRecordCount,
  normalizePageSize,
  normalizeRecordType,
  paginationState,
  pickImportedRecordRows,
  statusLabel,
} from "./allNetworkDataContract";

/**
 * Network Operations → All Network Data, laid out to the v13 reference (.page-head, metric boxes,
 * .toolbar, .card registry, .note). INTERNAL admin only. First release: a read-only registry of
 * staged SOURCE records, one record type at a time.
 *
 * Data: GET /ops/imported-records only. Every request carries a record type, params come only from
 * buildImportedRecordsParams, and every row passes through pickImportedRecordRows; raw backend
 * rows are never rendered. No /summary, /facets, /columns or /:id calls.
 *
 * No money and no URLs: the page shows identity, display, capability and mapping-state fields.
 * `currency` is campaign metadata, never an amount.
 */

const LOAD_ERROR = "Source records could not be loaded.";

const EMPTY_FILTERS = {
  network: "",
  q: "",
  brand: "",
  campaign: "",
  mappingStatus: "",
  sourceStatus: "",
  preset: "",
  issue: "",
  from: "",
  to: "",
  country: "",
  campaignStatus: "",
  relationshipStatus: "",
  campaignType: "",
  category: "",
  currency: "",
};

const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, 50, MAX_PAGE_SIZE];

const PRESET_LABELS = { COMPACT: "Compact", STANDARD: "Standard", FULL: "Full" };

/* Which contract status kind each column is read with. Kinds are never merged. */
const STATUS_KIND_BY_FIELD = {
  mappingStatus: STATUS_KIND.MAPPING,
  sourceStatus: STATUS_KIND.SOURCE,
  certificationStatus: STATUS_KIND.CERTIFICATION,
  campaignStatus: STATUS_KIND.CAMPAIGN,
  relationshipStatus: STATUS_KIND.RELATIONSHIP,
  couponStatus: STATUS_KIND.COUPON,
  channelType: STATUS_KIND.CHANNEL,
  linkSupportState: STATUS_KIND.CAPABILITY,
  couponSupportState: STATUS_KIND.CAPABILITY,
  deeplinkSupportState: STATUS_KIND.CAPABILITY,
  feedSupportState: STATUS_KIND.CAPABILITY,
  commissionRulesState: STATUS_KIND.CAPABILITY,
};

const ID_FIELDS = new Set(["sourceRecordId", "supplierCampaignId", "supplierCampaignExtId", "networkCampaignId", "campaignSourceId", "canonicalCampaignId", "merchantId", "networkSource"]);
const BOOLEAN_FIELDS = new Set(["mboReady", "isAssignable", "linkSupport", "couponSupport", "deeplinkSupport", "feedSupport"]);
const COUNT_FIELDS = new Set(["couponCount", "commissionRuleCount"]);
const DATE_FIELDS = new Set(["importedAt", "lastUpdated", "lastSyncedAt"]);

/* v13 .status pill tokens. Text always carries the meaning; colour is secondary. */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  grey: "border-[#e4e7ec] bg-[#f8fafc] text-[#475467]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#5925dc]",
};

/* Tone per status value (colour only; the label is always the contract's text). */
const STATUS_TONES = {
  [STATUS_KIND.MAPPING]: { MAPPED: "green", NEEDS_REVIEW: "amber", ERROR: "red", NOT_AVAILABLE: "grey" },
  [STATUS_KIND.SOURCE]: { PROCESSED: "green", IMPORTED: "blue", FAILED: "red", SKIPPED: "grey" },
  [STATUS_KIND.CERTIFICATION]: { CERTIFIED: "green", PENDING: "amber", REVOKED: "red" },
  [STATUS_KIND.CAMPAIGN]: { ACTIVE: "green", PAUSED: "amber", EXPIRED: "red", INACTIVE: "grey", NOTAPPLIED: "grey" },
  [STATUS_KIND.RELATIONSHIP]: { JOINED: "green", APPROVED: "green", PENDING: "amber", REJECTED: "red", SUSPENDED: "red", NOT_APPLIED: "grey" },
  [STATUS_KIND.COUPON]: { ACTIVE: "green", SCHEDULED: "blue", EXPIRED: "red", DISABLED: "grey" },
  [STATUS_KIND.CAPABILITY]: { SUPPORTED: "green", SUPPORTED_DATA_NOT_SYNCED: "amber", NOT_SUPPORTED: "grey" },
  [STATUS_KIND.CHANNEL]: {},
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
const TAB_BUTTON = "rounded-[7px] px-3 py-[6px] text-[11px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2457d6]";

/** Typing is debounced; a cleared value (type switch, Reset, emptied field) applies at once. */
function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    if (value === "") {
      setDebounced("");
      return undefined;
    }
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
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[8px] font-black leading-none ${PILL_TONES[tone] || PILL_TONES.grey}`}
    >
      {String(value)}
    </span>
  );
}
Pill.propTypes = { value: optionalStringOrNumber, tone: optionalString, title: optionalString };

function Clip({ text, width = "max-w-[180px]", bold = false, mono = false }) {
  if (text == null || text === "") return <Muted />;
  return (
    <span className={`block truncate ${width} ${bold ? "font-semibold" : ""} ${mono ? "font-mono text-[10px]" : ""}`} title={String(text)}>
      {String(text)}
    </span>
  );
}
Clip.propTypes = { text: optionalStringOrNumber, width: optionalString, bold: optionalBool, mono: optionalBool };

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

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ── Cells ────────────────────────────────────────────────────────────────────

function StatusCell({ field, value }) {
  const kind = STATUS_KIND_BY_FIELD[field];
  if (value == null || value === "") return <Muted title="Not returned" />;
  const label = statusLabel(kind, value);
  return <Pill value={label} tone={STATUS_TONES[kind]?.[value] || "grey"} title={`${fieldLabel(field)}: ${value}`} />;
}
StatusCell.propTypes = { field: optionalString, value: optionalStringOrNumber };

function renderCell(field, row) {
  const value = row[field];
  if (field === "network") return value ? <span className="font-semibold">{value}</span> : <Muted />;
  if (field === "recordType") return <Clip text={RECORD_TYPE_META[row.entityType]?.label ?? value} width="max-w-[140px]" />;
  if (STATUS_KIND_BY_FIELD[field]) return <StatusCell field={field} value={value} />;
  if (field === "hasMapperError") {
    if (value === true) return <Pill value="Mapper issue" tone="red" title="An open mapper error exists. Details are under Data Integrity → Exceptions." />;
    if (value === false) return <Pill value="No mapper issue" tone="grey" />;
    return <Muted />;
  }
  if (field === "issue") {
    const label = issueLabel(row.issueCode) ?? value;
    return label ? <Clip text={label} width="max-w-[200px]" /> : <Muted />;
  }
  if (field === "issueCode") return <Clip text={value} width="max-w-[180px]" mono />;
  if (field === "country") return Array.isArray(value) && value.length ? <Clip text={value.join(", ")} width="max-w-[140px]" /> : <Muted />;
  if (BOOLEAN_FIELDS.has(field)) {
    if (value === true) return <span>Yes</span>;
    if (value === false) return <span className="text-[#667085]">No</span>;
    return <Muted />;
  }
  if (COUNT_FIELDS.has(field)) return typeof value === "number" ? <span className="tabular-nums">{value.toLocaleString()}</span> : <Muted />;
  if (DATE_FIELDS.has(field)) {
    const text = formatDateTime(value);
    return text ? <span className="text-[10px] text-[#475467]">{text}</span> : <Muted />;
  }
  if (field === "currency") return value ? <span className="font-mono text-[10px] font-bold" title="Campaign currency metadata; no amounts on this page">{value}</span> : <Muted />;
  if (field === "couponCode") return value ? <span className="font-mono text-[10px]">{value}</span> : <Muted />;
  if (ID_FIELDS.has(field)) return <Clip text={value} width="max-w-[170px]" mono />;
  if (field === "brand") return <Clip text={value} width="max-w-[170px]" bold />;
  if (field === "campaign") return <Clip text={value} width="max-w-[200px]" />;
  return <Clip text={value} width="max-w-[160px]" />;
}

function buildColumns(recordType, preset, offset) {
  return [
    { key: "#", label: "#", align: "left", render: (r, i) => <span className="font-mono text-[10px] text-[#98a2b3]">{offset + i + 1}</span> },
    ...columnsForType(recordType, preset).map((field) => ({
      key: field,
      label: fieldLabel(field),
      help: FIELD_DESCRIPTIONS[field],
      align: COUNT_FIELDS.has(field) ? "right" : "left",
      emphasis: field === "mappingStatus",
      render: (r) => renderCell(field, r),
    })),
  ];
}

function RecordsTable({ rows, columns, recordType }) {
  return (
    <div className="max-h-[65vh] overflow-auto" tabIndex={0} aria-label="Source records, scrollable">
      <table aria-label={`${RECORD_TYPE_META[recordType]?.label ?? "Source"} records`} className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.key} scope="col" title={col.help} className={`${TH} ${col.align === "right" ? "text-right" : ""} ${col.emphasis ? "bg-[#eef4ff] text-[#2457d6]" : ""}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || `row-${index}`} className="hover:bg-[#fbfcff]" data-source-row="">
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
RecordsTable.propTypes = { rows: optionalArray, columns: optionalArray, recordType: optionalString };

// ── Filters ──────────────────────────────────────────────────────────────────

const optionsFor = (options, type) => options.filter((o) => !o.types || o.types.includes(type));

/** Keeps only filters that apply to `type`, with status values the contract accepts for it. */
function filtersForRecordType(filters, type) {
  const applicable = new Set(filtersForType(type).map((f) => f.key));
  const next = { ...EMPTY_FILTERS };
  for (const key of Object.keys(EMPTY_FILTERS)) if (applicable.has(key)) next[key] = filters[key];
  const keepOption = (key, options) => {
    if (next[key] && !optionsFor(options, type).some((o) => o.value === next[key])) next[key] = "";
  };
  keepOption("mappingStatus", MAPPING_STATUS_FILTER_OPTIONS);
  keepOption("sourceStatus", SOURCE_STATUS_FILTER_OPTIONS);
  keepOption("preset", PRESET_OPTIONS);
  keepOption("issue", ISSUE_FILTER_OPTIONS);
  return next;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AllNetworkDataPage() {
  const [recordType, setRecordType] = useState(DEFAULT_RECORD_TYPE);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [preset, setPreset] = useState("STANDARD");
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: null, envelope: null, recordType: null });
  const requestSeq = useRef(0);

  const debouncedQ = useDebounced(filters.q);
  const debouncedBrand = useDebounced(filters.brand);
  const debouncedCampaign = useDebounced(filters.campaign);
  const debouncedCategory = useDebounced(filters.category);
  const debouncedCountry = useDebounced(filters.country);
  const debouncedCurrency = useDebounced(filters.currency);
  const debouncedCampaignType = useDebounced(filters.campaignType);

  const queryFilters = useMemo(
    () => ({
      recordType,
      network: filters.network,
      q: debouncedQ,
      brand: debouncedBrand,
      campaign: debouncedCampaign,
      mappingStatus: filters.mappingStatus,
      sourceStatus: filters.sourceStatus,
      preset: filters.preset,
      issue: filters.issue,
      from: filters.from,
      to: filters.to,
      country: debouncedCountry,
      campaignStatus: filters.campaignStatus,
      relationshipStatus: filters.relationshipStatus,
      campaignType: debouncedCampaignType,
      category: debouncedCategory,
      currency: debouncedCurrency,
      pageSize,
    }),
    [
      recordType,
      filters.network,
      debouncedQ,
      debouncedBrand,
      debouncedCampaign,
      filters.mappingStatus,
      filters.sourceStatus,
      filters.preset,
      filters.issue,
      filters.from,
      filters.to,
      debouncedCountry,
      filters.campaignStatus,
      filters.relationshipStatus,
      debouncedCampaignType,
      debouncedCategory,
      debouncedCurrency,
      pageSize,
    ],
  );

  // The page belongs to one query: any change to the type, filters or page size starts again at
  // page 1, without first sending a request for the old page number. The key is contract-built.
  const queryKey = useMemo(() => {
    const params = buildImportedRecordsParams({ ...queryFilters, page: 1 });
    delete params.page;
    return JSON.stringify(params);
  }, [queryFilters]);
  const [pageState, setPageState] = useState({ key: queryKey, page: 1 });
  if (pageState.key !== queryKey) setPageState({ key: queryKey, page: 1 });
  const page = pageState.key === queryKey ? pageState.page : 1;
  const setPage = useCallback((next) => setPageState({ key: queryKey, page: next }), [queryKey]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const params = buildImportedRecordsParams({ ...queryFilters, page });
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchApi(IMPORTED_RECORDS_PATH, params)
      .then((envelope) => {
        if (seq !== requestSeq.current) return;
        setState({ loading: false, error: null, envelope: envelope && typeof envelope === "object" ? envelope : {}, recordType: params.recordType });
      })
      .catch((err) => {
        if (seq !== requestSeq.current) return;
        setState({ loading: false, error: statusSafeMessage(err?.status, LOAD_ERROR), envelope: null, recordType: params.recordType });
      });
    // queryFilters is represented by queryKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, page, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // Rows are only ever those of the selected type; a response for another type is never shown.
  const envelope = state.recordType === recordType ? state.envelope : null;
  const rows = useMemo(() => pickImportedRecordRows(envelope?.data, recordType), [envelope, recordType]);
  const pagination = paginationState(envelope, { page, pageSize });
  const { count: total } = matchingRecordCount(envelope, recordType);
  const settled = !state.loading && !state.error && Boolean(envelope);

  // A page beyond the last one (the total shrank) falls back to the last page, once.
  useEffect(() => {
    if (settled && pagination.totalPages != null && pagination.totalPages >= 1 && page > pagination.totalPages) setPage(pagination.totalPages);
  }, [settled, pagination.totalPages, page, setPage]);

  const columns = useMemo(() => buildColumns(recordType, preset, pagination.rowOffset), [recordType, preset, pagination.rowOffset]);
  const applicable = useMemo(() => new Set(filtersForType(recordType).map((f) => f.key)), [recordType]);
  const filtersActive = Object.keys(EMPTY_FILTERS).some((key) => filters[key]);
  const typeMeta = RECORD_TYPE_META[recordType];
  const networkLabel = NETWORK_FILTER_OPTIONS.find((o) => o.value === filters.network)?.label ?? "All Networks";

  const set = (key) => (e) => setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  const resetFilters = () => setFilters(EMPTY_FILTERS);
  const changeRecordType = (next) => {
    const type = normalizeRecordType(next);
    if (type === recordType) return;
    setRecordType(type);
    setFilters((prev) => filtersForRecordType(prev, type));
  };

  const mappingOptions = optionsFor(MAPPING_STATUS_FILTER_OPTIONS, recordType);
  const sourceOptions = optionsFor(SOURCE_STATUS_FILTER_OPTIONS, recordType);
  const presetOptions = optionsFor(PRESET_OPTIONS, recordType).filter((o) => !(o.mappingPreset && filters.mappingStatus));
  const isCampaign = recordType === "campaign";

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">All Network Data</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            Source-layer records from the connected supplier networks, with their mapping and readiness state before canonical promotion. One
            row is one staged record of the selected type.
          </p>
        </div>
        <span className="flex flex-wrap gap-1.5">
          <Pill value="INTERNAL ADMIN" tone="amber" title="Staged supplier data. Internal admin only." />
          <Pill value="SOURCE REGISTRY" tone="purple" title="Source + mapping state. Not raw payloads, not the canonical registries." />
        </span>
      </div>

      {/* pipeline context */}
      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[10px] text-[#667085]" aria-label="Pipeline position">
        {["Network API", "Raw", "Source", "Mapping", "MBO Canonical"].map((stage, i) => {
          const here = stage === "Source" || stage === "Mapping";
          return (
            <span key={stage} className="flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden="true">→</span> : null}
              <span className={`rounded-[6px] border px-1.5 py-[3px] font-bold ${here ? "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]" : "border-[#e4e7ec] bg-white"}`}>
                {stage}
              </span>
            </span>
          );
        })}
        <span className="ml-1">All Network Data = Source + mapping state.</span>
      </div>

      {/* record type selector */}
      <div className="mb-3 flex flex-wrap gap-1 rounded-[10px] border border-[#e4e7ec] bg-white p-1" role="tablist" aria-label="Record type">
        {RECORD_TYPES.map((type) => {
          const active = type === recordType;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={active}
              className={`${TAB_BUTTON} ${active ? "bg-[#101828] text-white" : "text-[#475467] hover:bg-[#f8fafc]"}`}
              onClick={() => changeRecordType(type)}
              title={RECORD_TYPE_META[type].description}
            >
              {RECORD_TYPE_META[type].label}
            </button>
          );
        })}
      </div>

      {/* metrics: list envelope only */}
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-4" aria-label="Registry summary">
        <Metric label="Matching Records" hint="Backend total for this type and these filters">
          {settled ? (total != null ? total.toLocaleString() : <Muted>Not returned</Muted>) : "…"}
        </Metric>
        <Metric label="Loaded Rows" hint="Rows on this page">
          {settled ? rows.length.toLocaleString() : "…"}
        </Metric>
        <Metric label="Record Type" hint={typeMeta.description}>
          {typeMeta.label}
        </Metric>
        <Metric label="Network" hint="Current network filter">
          {networkLabel}
        </Metric>
      </div>

      {/* .toolbar */}
      <form className="mb-3 flex flex-wrap items-end gap-2" onSubmit={(e) => e.preventDefault()} aria-label="Source record filters">
        <label className={LABEL}>
          Network
          <select className={`${CONTROL} max-w-[200px]`} value={filters.network} onChange={set("network")}>
            <option value="">All networks</option>
            {NETWORK_FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} title={o.note}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Search
          <input type="search" className={`${CONTROL} w-[220px]`} placeholder="Search source records…" value={filters.q} onChange={set("q")} />
        </label>
        <label className={LABEL}>
          Brand
          <input type="search" className={`${CONTROL} w-[140px]`} placeholder="Brand contains" value={filters.brand} onChange={set("brand")} />
        </label>
        <label className={LABEL}>
          Campaign
          <input type="search" className={`${CONTROL} w-[170px]`} placeholder="Campaign contains" value={filters.campaign} onChange={set("campaign")} />
        </label>
        {mappingOptions.length ? (
          <label className={LABEL}>
            Mapping status
            <select className={CONTROL} value={filters.mappingStatus} onChange={set("mappingStatus")}>
              <option value="">All</option>
              {mappingOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {sourceOptions.length ? (
          <label className={LABEL}>
            Source status
            <select className={CONTROL} value={filters.sourceStatus} onChange={set("sourceStatus")}>
              <option value="">All</option>
              {sourceOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {presetOptions.length ? (
          <label className={LABEL} title={filters.mappingStatus ? "Mapping presets are unavailable while a mapping status is selected." : undefined}>
            Preset
            <select className={CONTROL} value={presetOptions.some((o) => o.value === filters.preset) ? filters.preset : ""} onChange={set("preset")}>
              <option value="">None</option>
              {presetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className={LABEL} title="Import date (when the record was staged), not the network's event date.">
          Imported from
          <input type="date" className={CONTROL} value={filters.from} onChange={set("from")} />
        </label>
        <label className={LABEL} title="Import date (when the record was staged), not the network's event date.">
          Imported to
          <input type="date" className={CONTROL} value={filters.to} onChange={set("to")} />
        </label>
        {isCampaign && applicable.has("issue") ? (
          <label className={LABEL}>
            Issue
            <select className={CONTROL} value={filters.issue} onChange={set("issue")}>
              <option value="">All</option>
              {optionsFor(ISSUE_FILTER_OPTIONS, recordType).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {isCampaign ? (
          <>
            <label className={LABEL}>
              Campaign status
              <select className={CONTROL} value={filters.campaignStatus} onChange={set("campaignStatus")}>
                <option value="">All</option>
                {CAMPAIGN_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Relationship
              <select className={CONTROL} value={filters.relationshipStatus} onChange={set("relationshipStatus")}>
                <option value="">All</option>
                {RELATIONSHIP_STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Campaign type
              <input type="search" className={`${CONTROL} w-[100px]`} placeholder="e.g. CPS" value={filters.campaignType} onChange={set("campaignType")} />
            </label>
            <label className={LABEL}>
              Category
              <input type="search" className={`${CONTROL} w-[160px]`} placeholder="Category contains" value={filters.category} onChange={set("category")} />
            </label>
            <label className={LABEL}>
              Country
              <input type="search" className={`${CONTROL} w-[70px] uppercase`} placeholder="AE" maxLength={2} value={filters.country} onChange={set("country")} />
            </label>
            <label className={LABEL} title="Campaign currency metadata. This page shows no amounts.">
              Currency
              <input type="search" className={`${CONTROL} w-[70px] uppercase`} placeholder="AED" maxLength={3} value={filters.currency} onChange={set("currency")} />
            </label>
          </>
        ) : null}
        <label className={LABEL}>
          Columns
          <select className={CONTROL} value={preset} onChange={(e) => setPreset(e.target.value)}>
            {COLUMN_PRESET_KEYS.map((key) => (
              <option key={key} value={key}>
                {PRESET_LABELS[key]}
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
          <button type="button" className={`${ACTION_BUTTON} h-[31px]`} onClick={resetFilters}>
            Reset
          </button>
        ) : null}
      </form>

      {/* .card registry */}
      <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e7ec] px-4 py-2.5">
          <h2 className="m-0 text-sm font-bold">{typeMeta.label} · Source Records</h2>
          <span className="text-[10px] text-[#667085]">One row per staged record · mapping state shown as returned · no amounts, no links</span>
        </div>

        {state.loading ? (
          <div className="px-4 py-8 text-center text-[11px] text-[#667085]" role="status" aria-live="polite">
            Loading source records…
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
            <b className="mb-1 block text-[#344054]">
              {filtersActive ? "No source records match the current filters." : "No source records are available for this record type."}
            </b>
            {filtersActive ? (
              <button type="button" className={`${ACTION_BUTTON} mt-1`} onClick={resetFilters}>
                Reset filters
              </button>
            ) : (
              "Staged records appear here once a network sync has imported them."
            )}
          </div>
        ) : (
          <RecordsTable rows={rows} columns={columns} recordType={recordType} />
        )}

        <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7ec] px-4 py-2.5 text-[10px] text-[#667085]" aria-label="Pagination">
          <span>
            Page {pagination.page}
            {pagination.totalPages != null ? ` of ${pagination.totalPages}` : ""}
            {total != null ? ` · ${total.toLocaleString()} matching record${total === 1 ? "" : "s"}` : ""}
          </span>
          <div className="flex gap-1.5">
            <button type="button" className={ACTION_BUTTON} disabled={pagination.page <= 1 || state.loading} onClick={() => setPage(Math.max(1, pagination.page - 1))}>
              Previous
            </button>
            <button type="button" className={ACTION_BUTTON} disabled={state.loading || !pagination.hasMore} onClick={() => setPage(pagination.page + 1)}>
              Next
            </button>
          </div>
        </nav>
      </div>

      <Note>
        <b>How to read this page.</b> Rows are staged source records, shown one record type at a time with the mapping state the backend
        returns. Matching Records is the backend count for the current type and filters. Search covers operational fields such as record ids,
        brand and campaign names. Raw payloads, source schema, mapping rules and mapper-error details belong under Data Integrity.
      </Note>
    </div>
  );
}

export default AllNetworkDataPage;
