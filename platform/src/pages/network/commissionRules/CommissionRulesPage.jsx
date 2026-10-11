import { useEffect, useMemo, useState } from "react";
import { hasPermission, PERMISSIONS } from "../../../auth/permissions";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";
import { usePagedQuery } from "../../../hooks/usePagedQuery";
import {
  optionalArray,
  optionalBool,
  optionalFunc,
  optionalNode,
  optionalObject,
  optionalString,
  optionalStringOrNumber,
} from "../../../utils/propValidators";
import { AVERAGE_KIND, groupPageRules } from "./commissionRuleAverage";
import {
  BACKEND_FILTER_GAPS,
  BACKEND_UNAVAILABLE_FIELDS,
  COMMISSION_RULES_PATH,
  COMMISSION_VOCABULARY_PATH,
  LIFECYCLE,
  NETWORK_SOURCE_OPTIONS,
  REVIEW_STATE,
  buildRuleListParams,
  formatRuleValue,
  needsReview,
  reviewReasonLabel,
  reviewState,
  ruleGroupKey,
  ruleLifecycle,
  toCommissionRuleView,
} from "./commissionRuleContract";
import { CommissionRuleDrawer } from "./CommissionRuleDrawer";

/**
 * Supplier Commission Rules — laid out to the MBO Rewards Network Operations v13 reference
 * (.page-head, .grid4 metrics, .toolbar, one .card holding the dense registry, .note).
 *
 * The supplier-side rule registry across every network and campaign. Each SupplierCommissionRule
 * record is one row; the "#" column and the backend's "Commission N" label only number rows for
 * reading and are never storage. Read-only: nothing here edits, approves or calculates a payout,
 * and no row is client payable commission or MBO margin.
 *
 * Data (unchanged): GET /ops/admin/supplier-commission-rules (commission:read), reduced by
 * toCommissionRuleView. The server applies only `network` and a contains `q`; the list is
 * paginated, so every other refinement is labelled as applying to the loaded page only.
 * Commission types are the backend's canonical values, shown as returned; the stored `basis` is
 * the source-side wording available on this contract and is shown as secondary evidence.
 */

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { q: "", network: "" };

/** Page-scoped view refinements. These never claim to filter the whole result set. */
const PAGE_VIEWS = [
  { value: "ALL", label: "All loaded rows" },
  { value: "CURRENT", label: "Current only" },
  { value: "REVIEW", label: "Needs review only" },
];

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["ACTIVE", "MAPPED", "CURRENT", "PERSISTED"]);
const AMBER = new Set(["NEEDS_REVIEW", "REVIEW_REQUIRED", "SCHEDULED", "PROJECTED", "VERIFY_LIVE", "PENDING", "MIXED"]);
const RED = new Set(["EXPIRED", "ERROR", "FAILED", "UNMAPPED", "REJECTED"]);

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

/** Source-side wording or identifier as secondary evidence (v13 .source-extra .keys). */
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

function Clip({ text, width = "max-w-[180px]" }) {
  if (!text) return <Muted>Not available</Muted>;
  return (
    <span className={`block truncate ${width}`} title={text}>
      {text}
    </span>
  );
}
Clip.propTypes = { text: optionalString, width: optionalString };

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function DateValue({ value, empty = "—" }) {
  const text = formatDate(value);
  return text ? <span>{text}</span> : <Muted>{empty}</Muted>;
}
DateValue.propTypes = { value: optionalString, empty: optionalString };

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

function RuleValueCell({ rule }) {
  const value = formatRuleValue(rule);
  if (!value.available) return <Muted title="No numeric commission outcome on this rule">Not available</Muted>;
  return (
    <span className="whitespace-nowrap">
      <b>{value.text}</b>
      {value.currencyMissing ? <SourceText title="Fixed payout with no currency returned">currency missing</SourceText> : null}
    </span>
  );
}
RuleValueCell.propTypes = { rule: optionalObject };

function ConditionLines({ conditions, part }) {
  if (!Array.isArray(conditions) || !conditions.length) return <Muted>None</Muted>;
  return (
    <span className="block space-y-0.5">
      {conditions.map((c, i) => (
        <span key={c.id || i} className="block">
          {part === "type" ? <Mono value={c.conditionType || "?"} /> : `${c.operator || "="} ${c.value ?? ""}`.trim()}
        </span>
      ))}
    </span>
  );
}
ConditionLines.propTypes = { conditions: optionalArray, part: optionalString };

function StatusCell({ rule }) {
  const lifecycle = ruleLifecycle(rule);
  return (
    <span className="block">
      <Pill value={rule.ruleStatus} title="Rule status (backend)" empty="Not available" />
      {lifecycle === LIFECYCLE.SCHEDULED ? (
        <Sub title="The backend reports ACTIVE, but the effective window has not opened yet">not yet in effect</Sub>
      ) : null}
      {rule.projected ? <Sub title={rule.projectionNote || "Projected outcome, not a persisted canonical rule"}>projected</Sub> : null}
    </span>
  );
}
StatusCell.propTypes = { rule: optionalObject };

function MappingCell({ rule }) {
  const state = reviewState(rule);
  const reasons = Array.isArray(rule.reviewReasons) ? rule.reviewReasons : [];
  return (
    <span className="block">
      <Pill value={rule.mappingStatus} title="Mapping status (backend)" empty="Not available" />
      {state === REVIEW_STATE.REVIEW_REQUIRED ? (
        <span className="mt-1 block">
          <Pill value="REVIEW REQUIRED" tone="amber" title={reasons.map(reviewReasonLabel).join(", ") || "Flagged by the backend mapping outcome"} />
        </span>
      ) : null}
    </span>
  );
}
MappingCell.propTypes = { rule: optionalObject };

/** Display-only average for the rule's campaign group, never across incompatible units. */
function GroupAverage({ group }) {
  if (!group) return <Muted title="No campaign linkage to group by">No group</Muted>;
  if (!group.complete) return <Muted title={group.incompleteReason || "Group is not whole on this page"}>Spans pages</Muted>;
  const summary = group.summary;
  if (!summary || summary.kind === AVERAGE_KIND.NONE) return <Muted title="No current rule in this group carries a comparable value">Not available</Muted>;
  const title = `Display only · simple mean of ${summary.counted} current comparable rule(s). ${summary.note}${summary.basis === "PROJECTED" ? " Projected outcomes only." : ""}`;
  if (summary.kind === AVERAGE_KIND.SINGLE) {
    return (
      <span title={title}>
        <b>{summary.text}</b>
        {summary.basis === "PROJECTED" ? <Sub>projected basis</Sub> : null}
      </span>
    );
  }
  return (
    <span className="block" title={title} data-average-mixed="true">
      <Pill value="MIXED" tone="amber" />
      <Sub>{summary.families.map((f) => `${f.text} (${f.count})`).join(" · ")}</Sub>
    </span>
  );
}
GroupAverage.propTypes = { group: optionalObject };

function buildColumns({ groups, onOpen, offset }) {
  return [
    { label: "#", field: "row", render: (rule, index) => <span className="font-mono text-[10px] text-[#667085]">{offset + index + 1}</span> },
    {
      label: "Rule ID",
      field: "sourceRuleId · id",
      render: (rule) => (
        <span className="block">
          <Mono value={rule.sourceRuleId || rule.id} title={rule.sourceRuleId ? "Network rule id" : "MBO rule id (no network rule id returned)"} />
          <Sub title="Display label assigned by the backend listing; not a stored column">{rule.displayLabel || "unsequenced"}</Sub>
        </span>
      ),
    },
    {
      label: "Network Source",
      field: "networkSource",
      render: (rule) => (
        <span className="block">
          <Mono value={rule.networkSource} />
          {rule.sourceAccountLabel ? <Sub title="Source account label">{rule.sourceAccountLabel}</Sub> : null}
        </span>
      ),
    },
    { label: "Brand", field: "brandName", render: (rule) => <Clip text={rule.brandName} width="max-w-[140px]" /> },
    { label: "Campaign", field: "campaignName", render: (rule) => <Clip text={rule.campaignName} /> },
    {
      label: "Supplier Campaign ID",
      field: "sourceCampaignId",
      render: (rule) => (
        <span className="block">
          <Mono value={rule.sourceCampaignId} title="Supplier-side campaign id; not unique across MBO rows" />
          {rule.supplierCampaignId ? <Sub title="MBO SupplierCampaign row id">row {rule.supplierCampaignId}</Sub> : null}
        </span>
      ),
    },
    { label: "Commission Type", field: "commissionType", render: (rule) => <Pill value={rule.commissionType} tone="purple" title="Canonical commission type (backend)" empty="Not available" /> },
    { label: "Value", field: "ratePercent · fixedAmount", render: (rule) => <RuleValueCell rule={rule} /> },
    { label: "Currency", field: "currency", render: (rule) => (rule.currency ? <Mono value={rule.currency} /> : <Muted />) },
    { label: "Condition Type", field: "conditions[].conditionType", render: (rule) => <ConditionLines conditions={rule.conditions} part="type" /> },
    { label: "Condition Value", field: "conditions[].value", render: (rule) => <ConditionLines conditions={rule.conditions} part="value" /> },
    { label: "Country", field: "country", render: (rule) => (rule.country ? <Mono value={rule.country} /> : <Muted title="No rule-scoped country" />) },
    { label: "Category / Product / Goal", field: "categoryProductGoal", render: (rule) => (rule.categoryProductGoal ? <Clip text={rule.categoryProductGoal} width="max-w-[150px]" /> : <Muted />) },
    { label: "Customer Type", field: "customerType", render: (rule) => rule.customerType || <Muted /> },
    { label: "Coupon / Tier", field: "couponOrTier", render: (rule) => rule.couponOrTier || <Muted /> },
    { label: "Valid From", field: "effectiveFrom", render: (rule) => <DateValue value={rule.effectiveFrom} /> },
    { label: "Valid To", field: "effectiveUntil", render: (rule) => <DateValue value={rule.effectiveUntil} empty="Open-ended" /> },
    { label: "Rule Status", field: "ruleStatus", render: (rule) => <StatusCell rule={rule} /> },
    { label: "Mapping Status", field: "mappingStatus · review", render: (rule) => <MappingCell rule={rule} /> },
    {
      label: "Raw / Source Type",
      field: "basis",
      render: (rule) => (rule.basis ? <SourceText title="Rule basis as stored (source-side wording on this contract)">{rule.basis}</SourceText> : <Muted />),
    },
    {
      label: "Avg (Campaign Group)",
      field: "display only",
      render: (rule) => <GroupAverage group={groups.get(ruleGroupKey(rule))} />,
    },
    { label: "Last Updated", field: "lastModifiedAt", render: (rule) => <DateValue value={rule.lastModifiedAt} /> },
    {
      label: "Action",
      field: "",
      sticky: true,
      render: (rule) => (
        <button
          type="button"
          className={ACTION_BUTTON}
          onClick={(e) => {
            e.stopPropagation();
            onOpen(rule.id);
          }}
        >
          Details
        </button>
      ),
    },
  ];
}

function VocabularyPanel({ vocabulary, loading }) {
  if (loading) return <p className="text-[11px] text-[#98a2b3]">Loading commission vocabulary…</p>;
  const data = vocabulary?.data ?? vocabulary ?? null;
  if (!data) return <p className="text-[11px] text-[#98a2b3]">Commission vocabulary is not available.</p>;
  const supported = Array.isArray(data.supportedClientTypes) ? data.supportedClientTypes : [];
  const legacy = Array.isArray(data.legacy) ? data.legacy : [];
  const notImplemented = Array.isArray(data.notImplemented) ? data.notImplemented : [];
  return (
    <div className="space-y-2 text-[11px] text-[#475467]">
      <Note tone="warn">
        This endpoint returns the CLIENT commission rule vocabulary, not a supplier rule vocabulary. It is reference only and is never
        used to label, map or filter the supplier rules above.
      </Note>
      <p>
        <b>Supported client rule types:</b> <span className="font-mono">{supported.length ? supported.join(", ") : "—"}</span>
      </p>
      <p>
        <b>Legacy aliases:</b> <span className="font-mono">{legacy.length ? legacy.join(", ") : "—"}</span>
      </p>
      <p>
        <b>Not implemented:</b>{" "}
        <span className="font-mono">{notImplemented.length ? notImplemented.map((entry) => entry.label || entry.commissionType).join(", ") : "—"}</span>
      </p>
      {data.guidance ? <p className="text-[#667085]">{data.guidance}</p> : null}
    </div>
  );
}
VocabularyPanel.propTypes = { vocabulary: optionalObject, loading: optionalBool };

function RegistryTable({ rules, columns, onRowClick }) {
  return (
    <div className="max-h-[65vh] overflow-auto">
      <table aria-label="Supplier commission rules" className="w-full min-w-[2100px] border-collapse">
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
          {rules.map((rule, index) => (
            <tr key={rule.id || `rule-${index}`} className="cursor-pointer hover:bg-[#fbfcff]" onClick={() => onRowClick(rule.id)}>
              {columns.map((col) => (
                <td
                  key={col.label}
                  className={`${TD} ${col.sticky ? "sticky right-0 bg-white shadow-[-8px_0_12px_-10px_rgba(16,24,40,.25)]" : ""}`}
                >
                  {col.render(rule, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
RegistryTable.propTypes = { rules: optionalArray, columns: optionalArray, onRowClick: optionalFunc };

export function CommissionRulesPage() {
  const { user } = useAuth();
  const canReadCatalog = hasPermission(user, PERMISSIONS.CATALOG_READ);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [pageView, setPageView] = useState("ALL");
  const [selectedId, setSelectedId] = useState(null);
  const debouncedQ = useDebounced(filters.q);

  const params = useMemo(() => buildRuleListParams({ q: debouncedQ, network: filters.network }), [debouncedQ, filters.network]);
  const query = usePagedQuery(COMMISSION_RULES_PATH, params, { pageSize: PAGE_SIZE });
  const vocabulary = useApi(COMMISSION_VOCABULARY_PATH);

  const rows = useMemo(() => query.rows.map(toCommissionRuleView).filter(Boolean), [query.rows]);
  const hasMore = Boolean(query.pagination?.hasMore);
  const groups = useMemo(() => groupPageRules(rows, { page: query.page, hasMore }), [rows, query.page, hasMore]);

  const visibleRows = useMemo(() => {
    if (pageView === "CURRENT") return rows.filter((rule) => ruleLifecycle(rule) === LIFECYCLE.CURRENT);
    if (pageView === "REVIEW") return rows.filter((rule) => needsReview(rule));
    return rows;
  }, [rows, pageView]);

  const selected = useMemo(() => rows.find((rule) => rule.id === selectedId) || null, [rows, selectedId]);
  const selectedGroup = selected ? groups.get(ruleGroupKey(selected)) || null : null;

  const meta = query.meta;
  const truncated = Boolean(meta?.truncated || meta?.totalIsPartial);
  const searchIncomplete = Boolean(params.q) && meta?.searchComplete === false;
  const total = typeof query.pagination?.total === "number" ? query.pagination.total : null;
  const totalPages = query.pagination?.totalPages ?? (total != null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : null);
  const page = query.page;
  const settled = !query.loading && !query.error;
  // Page counts describe the whole result only when every rule is on this one page.
  const wholeResult = settled && !truncated && page === 1 && !hasMore && total != null && rows.length >= total;
  const scope = wholeResult ? "All matching rules" : `This page (${rows.length} rows)`;

  const activeCount = rows.filter((r) => String(r.ruleStatus || "").toUpperCase() === "ACTIVE").length;
  const networks = new Set(rows.map((r) => r.networkSource).filter(Boolean)).size;
  const campaigns = new Set(rows.map((r) => ruleGroupKey(r)).filter(Boolean)).size;
  const reviewCount = rows.filter((r) => needsReview(r)).length;

  const columns = useMemo(() => buildColumns({ groups, onOpen: setSelectedId, offset: (page - 1) * PAGE_SIZE }), [groups, page]);
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const filtersActive = Boolean(filters.q || filters.network);

  let body;
  if (query.loading) {
    body = <p className="px-4 py-8 text-center text-[11px] text-[#667085]">Loading supplier commission rules…</p>;
  } else if (query.error) {
    body = (
      <div className="px-4 py-6">
        <Note tone="danger">
          <b>Supplier commission rules could not be loaded.</b> {String(query.error)}{" "}
          <button type="button" className={`${ACTION_BUTTON} ml-1`} onClick={() => query.reload().catch(() => {})}>
            Retry
          </button>
        </Note>
      </div>
    );
  } else if (!rows.length) {
    body = (
      <div className="px-4 py-8 text-center text-[11px] text-[#667085]">
        <b className="mb-1 block text-[#344054]">No supplier commission rules</b>
        {filtersActive
          ? "No rule matched these filters."
          : "No SupplierCommissionRule row exists yet. Rules appear once a network sync has mapped commission evidence."}
      </div>
    );
  } else if (!visibleRows.length) {
    body = (
      <div className="px-4 py-8 text-center text-[11px] text-[#667085]">
        <b className="mb-1 block text-[#344054]">No loaded rule matches this page view</b>
        The page view only refines the rows already loaded on this page.
      </div>
    );
  } else {
    body = <RegistryTable rules={visibleRows} columns={columns} onRowClick={setSelectedId} />;
  }

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Supplier Commission Rules</h1>
          <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
            The supplier-side rule registry across every network and campaign. Each row is one SupplierCommissionRule: one distinct
            commercial outcome the network advertises. &quot;Commission N&quot; is a display label, not storage.
          </p>
        </div>
        <Pill value="INTERNAL ADMIN · SUPPLIER-SIDE" tone="amber" title="Supplier commission rules; not client payable commission" />
      </div>

      {/* .grid4 metrics */}
      <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <Metric label="Total Rules" hint={truncated ? "Backend loaded a capped rule set" : "Backend total for this query"}>
          {total != null && settled ? total : <Muted>{query.loading ? "…" : "Not available"}</Muted>}
        </Metric>
        <Metric label="Active Rules" hint={scope}>
          {settled ? activeCount : "…"}
        </Metric>
        <Metric label="Networks" hint={scope}>
          {settled ? networks : "…"}
        </Metric>
        <Metric label="Campaigns" hint={`${scope} · by supplier campaign row`}>
          {settled ? campaigns : "…"}
        </Metric>
        <Metric label="Needs Review" hint={`${scope} · backend mapping outcome or review reasons`}>
          {settled ? reviewCount : "…"}
        </Metric>
      </div>

      {/* .toolbar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search rules"
          className={`${CONTROL} min-w-[240px] flex-1 sm:max-w-[360px]`}
          placeholder="Search brand, campaign, supplier ids, lineage, value"
          value={filters.q}
          onChange={(e) => setFilter("q", e.target.value)}
        />
        <select aria-label="Network Source" className={CONTROL} value={filters.network} onChange={(e) => setFilter("network", e.target.value)}>
          <option value="">All Network Sources</option>
          {NETWORK_SOURCE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {filtersActive ? (
          <button type="button" className={ACTION_BUTTON} onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset
          </button>
        ) : null}
        <span className="mx-1 h-5 w-px bg-[#e4e7ec]" aria-hidden="true" />
        <span className="text-[9px] font-extrabold uppercase text-[#98a2b3]">Page view</span>
        {PAGE_VIEWS.map((view) => (
          <button
            key={view.value}
            type="button"
            aria-pressed={pageView === view.value}
            onClick={() => setPageView(view.value)}
            className={`rounded-[7px] border px-[9px] py-[6px] text-[9.5px] font-extrabold ${
              pageView === view.value ? "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]" : "border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f8fafc]"
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="mb-3.5 space-y-2">
        {truncated ? (
          <Note tone="warn">
            The backend loaded a capped rule set for this query, so the total and any search cover the loaded rows only
            {meta?.limits?.maxRules ? ` (cap ${meta.limits.maxRules} rules)` : ""}. Narrow by network to reduce the risk of missing rules.
          </Note>
        ) : null}
        {searchIncomplete ? (
          <Note tone="warn">
            The search ran over the loaded rows only ({meta?.searchScope || "LOADED_ROWS_ONLY"}), so matches outside that set are not shown.
          </Note>
        ) : null}
      </div>

      {/* .card registry */}
      <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e4e7ec] px-4 py-3">
          <h2 className="m-0 text-sm font-bold">Rule Registry</h2>
          <span className="text-[10px] text-[#667085]">
            {settled ? `Showing ${visibleRows.length} of ${rows.length} loaded rows` : ""}
            {pageView !== "ALL" ? " · page view applies to this page only" : ""}
          </span>
        </div>
        {body}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7ec] px-4 py-2.5 text-[10px] text-[#667085]">
          <span>
            Page {page}
            {totalPages != null ? ` of ${totalPages}` : ""}
            {total != null ? ` · ${total} rules` : ""}
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

      {/* .note: payout rule */}
      <div className="mb-3.5">
        <Note tone="danger">
          <b>Payout rule:</b> final client payable commission is based on the <b>network final actual commission</b> plus the{" "}
          <b>approved Client Commission Rule</b>. It is never taken from the Campaign Commission summary, the average commission, or
          Commission 1 alone. Rules here are supplier-side rate structure, not money earned; the Avg (Campaign Group) column is a
          display-only summary over one campaign&apos;s current rules and never mixes percentages, fixed amounts or currencies.
        </Note>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e4e7ec] bg-white p-4">
          <h2 className="m-0 text-sm font-bold">What this registry can and cannot filter</h2>
          <div className="mt-2 space-y-1.5 text-[11px] leading-[1.55] text-[#475467]">
            <p>
              <b>Applied by the backend:</b> network, and a contains search over brand, campaign, supplier ids, lineage, country, category,
              customer type, coupon or tier, value, currency and condition values.
            </p>
            <p>
              <b>Not supported by the backend:</b> {BACKEND_FILTER_GAPS.join(", ")}.
            </p>
            <p>
              <b>Not returned by this contract:</b> <span className="font-mono">{BACKEND_UNAVAILABLE_FIELDS.join(", ")}</span>.
            </p>
            <p>
              <b>Rules loaded for this query:</b> {meta?.loadedRows ?? "—"}
            </p>
          </div>
        </div>
        <details className="rounded-xl border border-[#e4e7ec] bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold">Commission vocabulary (reference)</summary>
          <p className="mb-2 mt-1 text-[10px] text-[#667085]">GET /ops/admin/commission-vocabulary, read back exactly as the backend defines it.</p>
          <VocabularyPanel vocabulary={vocabulary.data} loading={vocabulary.loading} />
        </details>
      </div>

      <CommissionRuleDrawer
        rule={selected}
        group={selectedGroup}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        canReadCatalog={canReadCatalog}
      />
    </div>
  );
}
