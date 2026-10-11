import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ActionMenu } from "../../../components/ui/ActionMenu";
import { usePagedQuery } from "../../../hooks/usePagedQuery";
import {
  optionalArray,
  optionalBool,
  optionalFunc,
  optionalNode,
  optionalString,
  optionalStringOrNumber,
} from "../../../utils/propValidators";
import { redactCredentialText } from "../networkAccountContract";
import {
  CAMPAIGNS_PATH,
  CAMPAIGN_STATUS_OPTIONS,
  MAPPING_STATUS_FILTER_OPTIONS,
  NETWORK_SOURCE_OPTIONS,
  RELATIONSHIP_STATUS_OPTIONS,
  buildCampaignListParams,
  classifyCampaignType,
  toCampaignView,
} from "./campaignContract";
import { BrandLogo } from "./campaignUi";

/**
 * Network Campaigns — laid out to the MBO Rewards Network Operations v13 reference
 * (Daily Operations › Campaigns): .page-head with h1 + .subtitle, a compact .toolbar, one .card
 * holding the dense campaign table (9px uppercase headers with the field key underneath), v13
 * .status pills, and the operational-rule .note.
 *
 * Data: GET /ops/admin/campaigns (unchanged), reduced by toCampaignView. Every filter below is a
 * query param the backend already reads (buildCampaignListParams); the list is paginated
 * server-side, so nothing is filtered in the browser.
 *
 * The campaign row is a summary. Coupon codes, supplier tracking URLs, raw payloads and the
 * supplier commission rules themselves are separate records and are not shown here.
 */
const PAGE_SIZE = 25;

const EMPTY_FILTERS = {
  q: "",
  networkSource: "",
  campaignStatus: "",
  relationshipStatus: "",
  mappingStatus: "",
  isAssignable: "",
};

/* v13 .status pill tokens. */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
};

/*
 * v13 badge() colour rule, matched on the whole value (v13 matches substrings, which paints
 * UNKNOWN red because it contains "NO"). SUSPENDED and NOT_APPLIED (plus the older REQUIRES_APPROVAL /
 * NOT_JOINED, kept for rows cached before the backend normalized them) are values
 * the backend returns today; they are only coloured here and are displayed exactly as returned.
 */
const GREEN = new Set(["MAPPED", "ACTIVE", "JOINED", "APPROVED", "CONFIRMED", "MATCHED", "YES", "PAYABLE", "CERTIFIED"]);
const AMBER = new Set(["PENDING", "NEEDS_REVIEW", "VERIFY_LIVE", "CONDITIONAL", "NOT_RECONCILED", "REQUIRES_APPROVAL"]);
const RED = new Set(["REJECTED", "FAILED", "ERROR", "NO", "OPEN", "CANCELLED", "SUSPENDED", "NOT_APPLIED", "NOT_JOINED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

function Muted({ children = "—", title }) {
  return (
    <span className="text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Muted.propTypes = { children: optionalNode, title: optionalString };

function Pill({ value, tone, title }) {
  if (value == null || value === "") return <Muted title={title ? `${title}: not returned` : undefined} />;
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

/** Capability flag. `null` means the backend could not determine it (no campaign source). */
function Capability({ value }) {
  if (value == null) return <Muted title="Not determinable: campaign has no campaign source" />;
  return value ? <b className="font-extrabold text-[#101828]">YES</b> : <span className="text-[#667085]">NO</span>;
}
Capability.propTypes = { value: optionalBool };

function CampaignType({ value }) {
  const type = classifyCampaignType(value);
  if (type.missing) return <Muted />;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono">{type.value}</span>
      {type.standard ? null : (
        <Pill
          value="NON-STANDARD"
          tone="amber"
          title="Returned by the backend but not in the MBO Campaign Type list (CPS/CPA/CPL/CPI/CPC/HYBRID/UNKNOWN). Shown as returned."
        />
      )}
    </span>
  );
}
CampaignType.propTypes = { value: optionalStringOrNumber };

function formatSync(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/* v13 .toolbar controls. */
const CONTROL =
  "h-[31px] rounded-[7px] border border-[#e4e7ec] bg-white px-[9px] text-[11px] text-[#101828] focus:border-[#2457d6] focus:outline-none focus:ring-2 focus:ring-[#eef4ff]";

function ToolbarSelect({ label, value, onChange, allLabel, options = [] }) {
  return (
    <select aria-label={label} className={CONTROL} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
ToolbarSelect.propTypes = {
  label: optionalString,
  value: optionalString,
  onChange: optionalFunc,
  allLabel: optionalString,
  options: optionalArray,
};

const rawOptions = (values) => values.map((v) => ({ value: v, label: v }));
const ASSIGNABLE_OPTIONS = [
  { value: "true", label: "Assignable: YES" },
  { value: "false", label: "Assignable: NO" },
];

/* v13 th / td / button.action. */
const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";
const ACTION_BUTTON =
  "rounded-[7px] border border-[#e4e7ec] bg-white px-2.5 py-[5px] text-[10px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:opacity-40";

/*
 * Column order is the operator brief; `field` is the campaign-contract key the cell reads and is
 * printed under the heading, as v13 prints the canonical key.
 */
const COLUMNS = [
  { label: "Network Source", field: "networkSource" },
  { label: "Brand", field: "brandName" },
  { label: "Campaign", field: "campaignName" },
  { label: "Primary Category", field: "primaryCategory" },
  { label: "Country", field: "country" },
  { label: "Currency", field: "currency" },
  { label: "Campaign Type", field: "campaignType" },
  { label: "Campaign Commission", field: "campaignCommission · supplier summary" },
  { label: "Relationship", field: "relationshipStatus" },
  { label: "Campaign Status", field: "campaignStatus" },
  { label: "Assignable", field: "isAssignable" },
  { label: "Coupon Support", field: "couponSupport" },
  { label: "Link Support", field: "linkSupport" },
  { label: "Deeplink Support", field: "deeplinkSupport" },
  { label: "Commission Rules", field: "commissionRuleCount" },
  { label: "Mapping Status", field: "mappingStatus" },
  { label: "Last Sync", field: "lastSyncedAt" },
  { label: "Action", field: null },
];

const campaignPath = (id, tab) => `/network/campaigns/${encodeURIComponent(id)}${tab ? `?tab=${tab}` : ""}`;

function StateRow({ children, className = "text-[#667085]" }) {
  return (
    <tr>
      <td className={`px-2 py-[22px] text-center text-[11px] ${className}`} colSpan={COLUMNS.length}>
        {children}
      </td>
    </tr>
  );
}
StateRow.propTypes = { children: optionalNode, className: optionalString };

export function CampaignsPage() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const debouncedQ = useDebounced(filters.q);

  const params = useMemo(() => buildCampaignListParams({ ...filters, q: debouncedQ }), [filters, debouncedQ]);
  const query = usePagedQuery(CAMPAIGNS_PATH, params, { pageSize: PAGE_SIZE });
  const rows = useMemo(() => query.rows.map(toCampaignView).filter(Boolean), [query.rows]);

  const pagination = query.pagination || {};
  const page = query.page;
  const totalPages = pagination.totalPages ?? null;
  const total = pagination.total ?? null;
  const filtered = Object.keys(params).length > 0;
  const canPrev = page > 1 && !query.loading;
  const canNext = (totalPages != null ? page < totalPages : Boolean(pagination.hasMore)) && !query.loading;

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const reload = () => query.reload().catch(() => {});

  let body;
  if (query.loading) {
    body = <StateRow>Loading campaigns…</StateRow>;
  } else if (query.error) {
    body = (
      <StateRow className="">
        <span className="text-[#b42318]">{redactCredentialText(query.error)}</span>{" "}
        <button type="button" className="font-extrabold text-[#2457d6] hover:underline" onClick={reload}>
          Retry
        </button>
      </StateRow>
    );
  } else if (rows.length === 0) {
    body = (
      <StateRow>
        {filtered
          ? "No campaigns match these filters."
          : "No campaigns yet. Campaigns appear here once supplier campaigns are promoted into the MBO catalog."}
      </StateRow>
    );
  } else {
    body = rows.map((c) => (
      <tr key={c.id} className="cursor-pointer hover:bg-[#fbfcff]" onClick={() => navigate(campaignPath(c.id))}>
        <td className={TD}>{c.networkSource ? <b className="font-extrabold">{c.networkSource}</b> : <Muted />}</td>
        <td className={TD}>
          <span className="flex max-w-[220px] items-center gap-2">
            <BrandLogo url={c.brandLogoLink} name={c.brandName} size={22} />
            <span className="truncate font-semibold" title={c.brandName || ""}>
              {c.brandName || <Muted />}
            </span>
          </span>
        </td>
        <td className={TD}>
          <Link
            to={campaignPath(c.id)}
            onClick={(e) => e.stopPropagation()}
            title={c.campaignName || ""}
            className="block max-w-[240px] truncate font-semibold text-[#2457d6] hover:underline"
          >
            {c.campaignName || "Unnamed campaign"}
          </Link>
        </td>
        <td className={TD}>
          {c.primaryCategory ? (
            <span className="block max-w-[160px] truncate" title={c.primaryCategory}>
              {c.primaryCategory}
            </span>
          ) : (
            <Muted />
          )}
        </td>
        <td className={TD}>
          {c.country?.length ? (
            <span className="block max-w-[140px] truncate font-mono" title={c.country.join(", ")}>
              {c.country.join(", ")}
            </span>
          ) : (
            <Muted />
          )}
        </td>
        <td className={TD}>
          {c.currency ? (
            <span className="font-mono" title="MBO regional campaign currency (India → INR, other regions → USD)">
              {c.currency}
            </span>
          ) : (
            <Muted />
          )}
          {c.originalCurrency && c.originalCurrency !== c.currency ? (
            <span className="ml-1 font-mono text-[#98a2b3]" title="Original network currency, kept for finance and reconciliation">
              ({c.originalCurrency})
            </span>
          ) : null}
        </td>
        <td className={TD}>
          <CampaignType value={c.campaignType} />
        </td>
        <td className={TD}>
          {c.campaignCommission ? (
            <span
              className="block max-w-[200px] truncate"
              title={`${c.campaignCommission} — supplier-side display summary, not client payable commission. Supplier Commission Rules are separate records.`}
            >
              {c.campaignCommission}
            </span>
          ) : (
            <Muted title="No supplier commission summary returned" />
          )}
        </td>
        <td className={TD}>
          <Pill value={c.relationshipStatus} title="Relationship status" />
        </td>
        <td className={TD}>
          <Pill value={c.campaignStatus} title="Campaign status" />
        </td>
        <td className={TD}>
          {c.isAssignable == null ? (
            <Muted title="Assignability not returned" />
          ) : (
            <Pill value={c.isAssignable ? "YES" : "NO"} title="Assignability as derived by the backend" />
          )}
        </td>
        <td className={TD}>
          <Capability value={c.couponSupport} />
        </td>
        <td className={TD}>
          <Capability value={c.linkSupport} />
        </td>
        <td className={TD}>
          <Capability value={c.deeplinkSupport} />
        </td>
        <td className={`${TD} tabular-nums`}>{c.commissionRuleCount == null ? <Muted /> : c.commissionRuleCount}</td>
        <td className={TD}>
          <Pill value={c.mappingStatus} title="Mapping status" />
        </td>
        <td className={TD}>{formatSync(c.lastSyncedAt) || <Muted />}</td>
        <td className={TD} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => navigate(campaignPath(c.id))} className={ACTION_BUTTON}>
              Open
            </button>
            <ActionMenu
              items={[
                { label: "Commission rules", visible: (c.commissionRuleCount ?? 0) > 0, onClick: () => navigate(campaignPath(c.id, "rules")) },
                { label: "Source evidence", onClick: () => navigate(campaignPath(c.id, "evidence")) },
              ]}
            />
          </div>
        </td>
      </tr>
    ));
  }

  return (
    <div className="text-[#101828]">
      {/* .page-head */}
      <div className="mb-3.5">
        <h1 className="m-0 text-[28px] font-bold tracking-[-.03em]">Network Campaigns</h1>
        <p className="mt-[5px] max-w-[900px] text-xs leading-[1.55] text-[#667085]">
          The normalized MBO campaign view across every network source. Each row is one MBO campaign with its network source,
          brand, commercial summary and readiness. Open a campaign to see its separate records: Supplier Commission Rules,
          Coupon / Voucher, Tracking Links, Products / Feeds and Source Evidence.
        </p>
      </div>

      {/* .toolbar */}
      <div className="mb-3.5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          aria-label="Search campaigns"
          className={`${CONTROL} min-w-[220px] flex-1 sm:max-w-[320px]`}
          placeholder="Search brand or campaign"
          value={filters.q}
          onChange={(e) => setFilter("q", e.target.value)}
        />
        <ToolbarSelect
          label="Network Source"
          allLabel="All Network Sources"
          value={filters.networkSource}
          onChange={(v) => setFilter("networkSource", v)}
          options={rawOptions(NETWORK_SOURCE_OPTIONS)}
        />
        <ToolbarSelect
          label="Campaign Status"
          allLabel="All Campaign Statuses"
          value={filters.campaignStatus}
          onChange={(v) => setFilter("campaignStatus", v)}
          options={rawOptions(CAMPAIGN_STATUS_OPTIONS)}
        />
        <ToolbarSelect
          label="Relationship Status"
          allLabel="All Relationships"
          value={filters.relationshipStatus}
          onChange={(v) => setFilter("relationshipStatus", v)}
          options={rawOptions(RELATIONSHIP_STATUS_OPTIONS)}
        />
        <ToolbarSelect
          label="Mapping Status"
          allLabel="All Mapping Statuses"
          value={filters.mappingStatus}
          onChange={(v) => setFilter("mappingStatus", v)}
          options={rawOptions(MAPPING_STATUS_FILTER_OPTIONS)}
        />
        <ToolbarSelect
          label="Assignable"
          allLabel="Assignable: Any"
          value={filters.isAssignable}
          onChange={(v) => setFilter("isAssignable", v)}
          options={ASSIGNABLE_OPTIONS}
        />
        {filtered || filters.q ? (
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className={`${ACTION_BUTTON} h-[31px] text-[#475467]`}>
            Reset
          </button>
        ) : null}
      </div>

      {/* .card */}
      <div className="mb-3.5 overflow-hidden rounded-xl border border-[#e4e7ec] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4e7ec] px-4 py-3.5">
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-sm font-bold">Admin Campaign Tab</h2>
            <Pill value="MBO NAMING" tone="blue" />
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[#667085]">
            <span>
              {query.loading
                ? "Loading…"
                : total != null
                  ? `${Number(total).toLocaleString()} campaign${Number(total) === 1 ? "" : "s"}`
                  : `${rows.length} on this page`}
            </span>
            <button type="button" onClick={reload} disabled={query.loading} className={ACTION_BUTTON}>
              Refresh
            </button>
          </div>
        </div>

        {/* .table-wrap */}
        <div className="max-h-[65vh] overflow-auto">
          <table className="w-full min-w-[1600px] border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.label} className={TH}>
                    {col.label}
                    {col.field ? (
                      <div className="mt-0.5 font-mono text-[9px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{body}</tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e4e7ec] px-4 py-2.5 text-[10px] text-[#667085]">
          <span>
            Page {page}
            {totalPages != null ? ` of ${totalPages}` : ""}
          </span>
          <div className="flex gap-1.5">
            <button type="button" disabled={!canPrev} onClick={() => query.setPage(page - 1)} className={ACTION_BUTTON}>
              Previous
            </button>
            <button type="button" disabled={!canNext} onClick={() => query.setPage(page + 1)} className={ACTION_BUTTON}>
              Next
            </button>
          </div>
        </div>
      </div>

      {/* .note */}
      <div className="rounded-r-[7px] border-l-[3px] border-[#2457d6] bg-[#f8fafc] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467]">
        <b>Operational rule:</b> <b>Coupon Support</b>, <b>Link Support</b> and <b>Deeplink Support</b> say what a campaign
        can have, not that records exist. Actual coupon codes are separate Coupon / Voucher records and actual supplier URLs
        are separate Tracking Link records. This list does not carry per-campaign coupon or tracking-link record counts, so it
        shows capability only; open the campaign to see the synced records. <b>Campaign Commission</b> is the supplier-side
        display summary, not client payable commission. <b>Assignable</b> is derived by the backend.
      </div>
    </div>
  );
}
