import { Link } from "react-router-dom";
import { Badge } from "../../../components/ui/Badge";
import { humanize } from "../networkAccountFormat";
import { classifyCampaignType } from "./campaignContract";
import { optionalArray, optionalBool, optionalFunc, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";

// Campaign-domain enumerations rendered verbatim; variants only colour them.
const VARIANTS = {
  // campaignStatus
  ACTIVE: "success",
  PAUSED: "warning",
  PENDING: "warning",
  EXPIRED: "default",
  INACTIVE: "default",
  // relationshipStatus
  JOINED: "success",
  APPROVED: "success",
  NOT_APPLIED: "default",
  NOT_JOINED: "default",
  REQUIRES_APPROVAL: "warning",
  REJECTED: "danger",
  SUSPENDED: "danger",
  // mappingStatus / certification
  MAPPED: "success",
  NEEDS_REVIEW: "warning",
  ERROR: "danger",
  CERTIFIED: "success",
  REVOKED: "warning",
  // catalog / visibility
  PUBLISHED: "success",
  DRAFT: "default",
  ARCHIVED: "default",
  ASSIGNABLE: "success",
  NOT_ASSIGNABLE: "default",
  INTERNAL: "default",
  HIDDEN: "default",
  // coupons / links / feeds / payloads
  SCHEDULED: "info",
  DISABLED: "default",
  VERIFY_LIVE: "warning",
  UNMAPPED: "default",
  ASSIGNED: "success",
  UNASSIGNED: "default",
  AVAILABLE: "success",
  NOT_CONFIGURED: "default",
  CONFIGURED: "success",
  SYNCED: "success",
  RECEIVED: "info",
  PROCESSED: "success",
  FAILED: "danger",
  UNKNOWN: "default",
};

export function StatusChip({ value, emptyLabel = "—", title }) {
  if (value == null || value === "") return <span className="text-xs text-slate-400">{emptyLabel}</span>;
  const key = String(value).toUpperCase();
  return (
    <Badge variant={VARIANTS[key] || "default"} className={title ? "cursor-help" : ""}>
      <span title={title}>{humanize(key)}</span>
    </Badge>
  );
}
StatusChip.propTypes = { value: optionalStringOrNumber, emptyLabel: optionalString, title: optionalString };

/** Boolean support flag. `null` means the backend could not determine it (no campaign source). */
export function SupportChip({ value, yes = "Yes", no = "No" }) {
  if (value == null) return <span className="text-xs text-slate-400" title="Not determinable: no campaign source">Not available</span>;
  return <Badge variant={value ? "success" : "default"}>{value ? yes : no}</Badge>;
}
SupportChip.propTypes = { value: optionalBool, yes: optionalString, no: optionalString };

function initials(name) {
  const text = String(name || "").trim();
  if (!text) return "?";
  return text
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/** Brand logo (canonical merchant first, campaign logo fallback — the backend already orders these); initial avatar when blank. */
export function BrandLogo({ url, name, size = 28 }) {
  const dimension = { width: size, height: size };
  if (url) {
    return (
      <img
        src={url}
        alt={name ? `${name} logo` : "Brand logo"}
        style={dimension}
        className="shrink-0 rounded-md border border-slate-200 bg-white object-contain"
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      style={dimension}
      className="inline-flex shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-600"
      title="No logo provided"
    >
      {initials(name)}
    </span>
  );
}
BrandLogo.propTypes = { url: optionalString, name: optionalString, size: optionalStringOrNumber };

export function BrandCell({ name, logoUrl, websiteUrl }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BrandLogo url={logoUrl} name={name} />
      <div className="min-w-0">
        <span className="block truncate font-medium text-slate-800">{name || <span className="text-slate-400">Not available</span>}</span>
        {websiteUrl ? (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noreferrer"
            title={`Brand website: ${websiteUrl}`}
            className="block truncate text-[11px] text-indigo-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        ) : (
          <span className="block text-[11px] text-slate-400">No website link</span>
        )}
      </div>
    </div>
  );
}
BrandCell.propTypes = { name: optionalString, logoUrl: optionalString, websiteUrl: optionalString };

export function CountryList({ codes }) {
  if (!Array.isArray(codes) || codes.length === 0) return <span className="text-xs text-slate-400">Not available</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {codes.map((code) => (
        <span key={code} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${String(code).toUpperCase() === "GLOBAL" ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-700"}`}>
          {code}
        </span>
      ))}
    </span>
  );
}
CountryList.propTypes = { codes: optionalArray };

/** Commission summary at campaign level: display only, never payout truth. */
export function CommissionSummary({ summary, ruleCount, campaignId }) {
  if (!summary && !ruleCount) return <span className="text-xs text-slate-400" title="No commission summary or rules recorded">Not available</span>;
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-sm text-slate-800" title="Display summary only. SupplierCommissionRule records are authoritative.">
        {summary || `${ruleCount} rule${ruleCount === 1 ? "" : "s"}`}
      </span>
      {campaignId && ruleCount > 0 ? (
        <Link
          to={`/network/campaigns/${encodeURIComponent(campaignId)}?tab=rules`}
          className="text-[11px] font-medium text-indigo-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          View rules
        </Link>
      ) : null}
    </span>
  );
}
CommissionSummary.propTypes = { summary: optionalString, ruleCount: optionalStringOrNumber, campaignId: optionalString };

/**
 * Campaign Type per the Sheet contract. Non-contract backend values (e.g. TIERED) are shown
 * verbatim with a needs-review marker — never remapped to CPS / HYBRID / UNKNOWN.
 */
export function CampaignTypeChip({ value }) {
  const type = classifyCampaignType(value);
  if (type.missing) return <span className="text-xs text-slate-400">Not available</span>;
  if (type.standard) {
    return <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-700">{type.value}</span>;
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-campaign-type-nonstandard={type.value}>
      <span className="inline-block rounded-md bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] text-amber-900 ring-1 ring-amber-200">{type.value}</span>
      <Badge variant="warning">
        <span title="Value returned by the backend but not part of the MBO Campaign Type contract (CPS/CPA/CPL/CPI/CPC/HYBRID/UNKNOWN). Shown verbatim, not remapped.">
          Non-standard · needs review
        </span>
      </Badge>
    </span>
  );
}
CampaignTypeChip.propTypes = { value: optionalStringOrNumber };

export function Percent({ value }) {
  if (value == null) return <span className="text-xs text-slate-400" title="No explicit percentage from source">—</span>;
  return <span className="tabular-nums">{Number(value)}%</span>;
}
Percent.propTypes = { value: optionalStringOrNumber };

export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
            active === tab.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {tab.label}
          {tab.count != null ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{tab.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
TabBar.propTypes = { tabs: optionalArray, active: optionalString, onChange: optionalFunc };
