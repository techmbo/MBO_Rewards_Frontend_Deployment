import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { hasPermission, PERMISSIONS } from "../../../auth/permissions";
import { ErrorState } from "../../../components/ui/ErrorState";
import { LoadingState } from "../../../components/ui/LoadingState";
import { useAuth } from "../../../context/AuthContext";
import { useApi } from "../../../hooks/useApi";
import {
  optionalArray,
  optionalBool,
  optionalFunc,
  optionalNode,
  optionalObject,
  optionalString,
  optionalStringOrNumber,
} from "../../../utils/propValidators";
import { redactCredentialText } from "../networkAccountContract";
import { campaignDetailPath, classifyCampaignType, toCampaignView } from "./campaignContract";
import { BrandLogo } from "./campaignUi";
import { CampaignOverviewTab } from "./tabs/CampaignOverviewTab";
import { CampaignCommissionRulesTab } from "./tabs/CampaignCommissionRulesTab";
import { CampaignCouponsTab } from "./tabs/CampaignCouponsTab";
import { CampaignTrackingLinksTab } from "./tabs/CampaignTrackingLinksTab";
import { CampaignProductsTab } from "./tabs/CampaignProductsTab";
import { CampaignSourceEvidenceTab } from "./tabs/CampaignSourceEvidenceTab";

/**
 * Network Campaign detail — laid out to the MBO Rewards Network Operations v13 campaign workspace:
 * .campaign-hero (title card + .campaign-health-grid of .health-box), the sticky .campaign-tabs
 * bar, then one panel per related record type.
 *
 * Data: GET /ops/admin/campaigns/:id (unchanged), reduced by toCampaignView. The campaign is the
 * hub; coupon, tracking-link, commission-rule, product and raw-payload records stay separate and
 * each tab loads or reads its own. Canonical MBO values are primary; the network's own values
 * (sourceCampaignStatus, sourceRelationshipStatus, sourceCampaignType, originalCurrency) are shown
 * beneath them, only when they differ, as admin diagnostics.
 */

const CAMPAIGNS_LIST_ROUTE = "/network/campaigns";

// Keys are the ?tab= values already in use; labels follow the operator brief.
const TABS = [
  { key: "overview", label: "Overview" },
  { key: "rules", label: "Commission Rules" },
  { key: "coupons", label: "Coupons / Vouchers" },
  { key: "links", label: "Tracking Links" },
  { key: "products", label: "Products / Feeds" },
  { key: "evidence", label: "Source Evidence" },
];

/* v13 .status pill tokens. */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
};

/* v13 badge() colour rule, matched on the whole value (the campaign list's sets plus health states). */
const GREEN = new Set([
  "MAPPED",
  "ACTIVE",
  "JOINED",
  "APPROVED",
  "CONFIRMED",
  "MATCHED",
  "YES",
  "CERTIFIED",
  "SYNCED",
  "CONFIGURED",
  "AVAILABLE",
]);
const AMBER = new Set(["PENDING", "NEEDS_REVIEW", "VERIFY_LIVE", "CONDITIONAL", "NOT_RECONCILED", "REQUIRES_APPROVAL"]);
const RED = new Set(["REJECTED", "FAILED", "ERROR", "NO", "SUSPENDED", "NOT_APPLIED", "NOT_JOINED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

/* v13 button.action. */
const ACTION_BUTTON =
  "inline-flex items-center rounded-[7px] border border-[#e4e7ec] bg-white px-2.5 py-[7px] text-[10px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50";

function Muted({ children = "—", title }) {
  return (
    <span className="text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Muted.propTypes = { children: optionalNode, title: optionalString };

function Pill({ value, tone, title }) {
  if (value == null || value === "") return <Muted title={title ? `${title}: not returned` : "Not returned"} />;
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

/** Boolean flag as a v13 YES / NO pill. `null` means the backend could not determine it. */
function FlagPill({ value, title }) {
  if (value == null) return <Muted title={`${title || "Value"}: not determinable (no campaign source)`} />;
  return <Pill value={value ? "YES" : "NO"} title={title} />;
}
FlagPill.propTypes = { value: optionalBool, title: optionalString };

/**
 * The network's own value, printed under the canonical one only when it differs
 * (v13 .source-extra .keys). Shown as received; never validated or mapped here.
 */
function SourceValue({ value, canonical, label = "source" }) {
  if (value == null || value === "") return null;
  if (canonical != null && String(value).toUpperCase() === String(canonical).toUpperCase()) return null;
  return (
    <span className="mt-1 block font-mono text-[9px] leading-tight text-[#b54708]" title="Network value as received (diagnostic, not the MBO value)">
      {label}: {String(value)}
    </span>
  );
}
SourceValue.propTypes = { value: optionalStringOrNumber, canonical: optionalStringOrNumber, label: optionalString };

/** One labelled cell of the hero's canonical strip; the canonical key sits under the label as in v13. */
function HeroField({ label, field, children }) {
  return (
    <div className="min-w-0">
      <span className="block text-[8px] font-black uppercase tracking-[.035em] text-[#98a2b3]">{label}</span>
      <span className="block font-mono text-[8.5px] text-[#98a2b3]">{field}</span>
      <div className="mt-1 text-[11px] font-bold text-[#101828]">{children}</div>
    </div>
  );
}
HeroField.propTypes = { label: optionalString, field: optionalString, children: optionalNode };

/** v13 .health-box. */
function HealthBox({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#e4e7ec] p-[9px]">
      <span className="block text-[8px] font-black uppercase text-[#98a2b3]">{label}</span>
      <div className="mt-[3px] text-xs font-bold text-[#101828]">{children}</div>
      {hint ? <span className="mt-1 block text-[9.5px] leading-snug text-[#667085]">{hint}</span> : null}
    </div>
  );
}
HealthBox.propTypes = { label: optionalString, children: optionalNode, hint: optionalNode };

function CampaignTypeValue({ value }) {
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
CampaignTypeValue.propTypes = { value: optionalStringOrNumber };

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const isCount = (value) => typeof value === "number" && Number.isFinite(value);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Tab badges, only where the detail response carries the exact number of records the tab lists:
 * Commission Rules (commissionRuleCount) and Products / Feeds (the feeds the tab renders).
 * Coupons, Tracking Links and Source Evidence get no badge: their records are fetched by the tab
 * itself or span several record types, so no number is shown rather than an estimate.
 */
function tabCount(key, campaign) {
  if (key === "rules") return isCount(campaign.commissionRuleCount) ? campaign.commissionRuleCount : null;
  if (key === "products") return campaign.productFeeds.length;
  return null;
}

/** v13 .campaign-tabs: compact buttons, sticky under the 64px top bar. */
function CampaignTabs({ tabs, active, onChange }) {
  return (
    <div
      role="tablist"
      aria-label="Campaign records"
      className="sticky top-16 z-[3] -mx-4 mb-3 flex flex-wrap gap-[5px] border-b border-[#e4e7ec] bg-white px-4 py-2 lg:-mx-6 lg:px-6"
    >
      {tabs.map((tab) => {
        const selected = active === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(tab.key)}
            className={`rounded-[7px] border px-[9px] py-[7px] text-[9px] font-extrabold ${
              selected ? "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]" : "border-[#e4e7ec] bg-white text-[#475467] hover:bg-[#f8fafc]"
            }`}
          >
            {tab.label}
            {tab.count != null ? ` (${tab.count})` : ""}
          </button>
        );
      })}
    </div>
  );
}
CampaignTabs.propTypes = { tabs: optionalArray, active: optionalString, onChange: optionalFunc };

/** v13 .campaign-hero: title card with the canonical strip, and the health card. */
function CampaignHero({ campaign: c }) {
  const countries = Array.isArray(c.country) && c.country.length ? c.country.join(", ") : null;
  const originalDiffers = Boolean(c.originalCurrency) && c.originalCurrency !== c.currency;
  const tracking = c.tracking && typeof c.tracking === "object" ? c.tracking : null;
  const feedCount = c.productFeeds.length;
  const synced = formatDateTime(c.lastSyncedAt);

  return (
    <div className="mb-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]">
      {/* .campaign-title-card */}
      <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
        <div className="flex min-w-0 items-start gap-3">
          <BrandLogo url={c.brandLogoLink} name={c.brandName} size={40} />
          <div className="min-w-0">
            <h1 className="m-0 break-words text-[19px] font-bold leading-tight tracking-[-.01em]">
              {c.campaignName || <Muted>Campaign name not returned</Muted>}
            </h1>
            <p className="mt-[5px] text-[11px] leading-normal text-[#667085]">
              {[c.networkSource, c.brandName, countries, c.campaignType].filter(Boolean).join(" · ") || "No campaign summary returned"}
            </p>
            <p className="mt-0.5 break-all font-mono text-[9.5px] text-[#98a2b3]">
              {c.supplierCampaignId ? `supplierCampaignId ${c.supplierCampaignId}` : "No supplier campaign id"}
              {c.networkAccount ? ` · networkAccount ${c.networkAccount}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[#eef2f6] pt-3 sm:grid-cols-3 xl:grid-cols-5">
          <HeroField label="Brand" field="brandName">
            {!c.brandName ? (
              <Muted />
            ) : c.brandWebsiteLink ? (
              <a href={c.brandWebsiteLink} target="_blank" rel="noreferrer" className="text-[#2457d6] hover:underline" title={c.brandWebsiteLink}>
                {c.brandName}
              </a>
            ) : (
              c.brandName
            )}
          </HeroField>
          <HeroField label="Network Source" field="networkSource">
            {c.networkSource ? <span className="font-mono">{c.networkSource}</span> : <Muted />}
          </HeroField>
          <HeroField label="Country" field="country">
            {countries ? <span className="font-mono">{countries}</span> : <Muted />}
          </HeroField>
          <HeroField label="Currency" field="currency">
            {c.currency ? <span className="font-mono">{c.currency}</span> : <Muted />}
            {originalDiffers ? <SourceValue value={c.originalCurrency} label="originalCurrency" /> : null}
          </HeroField>
          <HeroField label="Campaign Type" field="campaignType">
            <CampaignTypeValue value={c.campaignType} />
            <SourceValue value={c.sourceCampaignType} canonical={c.campaignType} />
          </HeroField>
          <HeroField label="Campaign Status" field="campaignStatus">
            <Pill value={c.campaignStatus} title="Campaign Status" />
            <SourceValue value={c.sourceCampaignStatus} canonical={c.campaignStatus} />
          </HeroField>
          <HeroField label="Relationship" field="relationshipStatus">
            <Pill value={c.relationshipStatus} title="Relationship Status" />
            <SourceValue value={c.sourceRelationshipStatus} canonical={c.relationshipStatus} />
          </HeroField>
          <HeroField label="Assignable" field="isAssignable">
            <FlagPill value={c.isAssignable} title="Assignable (derived by the backend)" />
          </HeroField>
          <HeroField label="Mapping Status" field="mappingStatus">
            <Pill value={c.mappingStatus} title="Mapping Status" />
          </HeroField>
        </div>
      </div>

      {/* .campaign-health-card */}
      <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
        <div className="grid grid-cols-2 gap-2">
          <HealthBox label="Mapping" hint={c.mappingCertificationStatus ? `Certification ${c.mappingCertificationStatus}` : null}>
            <Pill value={c.mappingStatus} title="Mapping Status" />
          </HealthBox>
          <HealthBox label="Commission Rules" hint="Supplier rules on the campaign source">
            {isCount(c.commissionRuleCount) ? c.commissionRuleCount : <Muted title="Rule count not returned" />}
          </HealthBox>
          <HealthBox label="Coupon Support" hint="Capability only; coupon records are in the Coupons tab">
            <FlagPill value={c.couponSupport} title="Coupon Support" />
          </HealthBox>
          <HealthBox
            label="Link Support"
            hint={c.deeplinkSupport == null ? "Capability only" : `Deeplink ${c.deeplinkSupport ? "YES" : "NO"} · capability only`}
          >
            <FlagPill value={c.linkSupport} title="Link Support" />
          </HealthBox>
          <HealthBox label="Products / Feed" hint={plural(feedCount, "feed")}>
            <Pill value={c.productFeedAvailability} title="Product feed availability" />
          </HealthBox>
          <HealthBox label="Assignability" hint={isCount(c.assignmentCount) ? plural(c.assignmentCount, "client assignment") : null}>
            <FlagPill value={c.isAssignable} title="Assignable" />
          </HealthBox>
          <HealthBox
            label="MBO Tracking Links"
            hint={tracking && isCount(tracking.primaryLinkCount) ? `${plural(tracking.primaryLinkCount, "active MBO link")} on client assignments` : null}
          >
            <Pill value={tracking?.state} title="MBO tracking-link state" />
          </HealthBox>
          <HealthBox label="Sync" hint={synced ? `Last synced ${synced}` : "No sync time returned"}>
            <Pill value={c.health?.sync} title="Sync state" />
          </HealthBox>
        </div>
      </div>
    </div>
  );
}
CampaignHero.propTypes = { campaign: optionalObject };

export function CampaignDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { data, loading, error, reload } = useApi(campaignDetailPath(id));
  const campaign = useMemo(() => (data?.data ? toCampaignView(data.data) : null), [data]);

  const activeTab = TABS.some((t) => t.key === searchParams.get("tab")) ? searchParams.get("tab") : "overview";
  function selectTab(key) {
    const next = new URLSearchParams(searchParams);
    if (key === "overview") next.delete("tab");
    else next.set("tab", key);
    setSearchParams(next, { replace: true });
  }

  const permissions = {
    rules: hasPermission(user, PERMISSIONS.COMMISSION_READ),
    coupons: hasPermission(user, PERMISSIONS.COUPONS_READ),
    links: hasPermission(user, PERMISSIONS.TRACKING_READ),
    evidence: hasPermission(user, PERMISSIONS.OPS_READ),
  };

  const tabs = campaign ? TABS.map((t) => ({ ...t, count: tabCount(t.key, campaign) })) : TABS;

  return (
    <div className="text-[#101828]">
      {/* .page-head: breadcrumb + actions */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-[11px] text-[#667085]">
          <Link to={CAMPAIGNS_LIST_ROUTE} className="font-bold text-[#2457d6] hover:underline">
            Network Campaigns
          </Link>
          {" › "}
          {campaign?.campaignName || "Campaign"}
          {campaign?.networkSource ? <span className="font-mono text-[#98a2b3]"> · {campaign.networkSource}</span> : null}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={CAMPAIGNS_LIST_ROUTE} className={ACTION_BUTTON}>
            Back to Campaigns
          </Link>
          <button type="button" className={ACTION_BUTTON} disabled title="Client assignment happens in Master Catalog › Assign Campaigns (not built yet)">
            {campaign?.isAssignable ? "Assignable · assign in Master Catalog" : "Not assignable · Master Catalog"}
          </button>
        </div>
      </div>

      {loading ? <LoadingState label="Loading campaign…" /> : null}
      {error && !loading ? <ErrorState message={redactCredentialText(error)} onRetry={() => reload().catch(() => {})} /> : null}
      {!loading && !error && data && !campaign ? (
        <div className="rounded-[9px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-[18px] text-center text-[11px] text-[#667085]">
          <b className="mb-1 block text-[#344054]">No campaign returned</b>
          The detail endpoint answered without a campaign record.
        </div>
      ) : null}

      {campaign ? (
        <>
          <CampaignHero campaign={campaign} />

          {campaign.operationalWarnings.length ? (
            <div className="mb-3 rounded-r-[7px] border-l-[3px] border-[#b54708] bg-[#fffaeb] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467]">
              <b>Operational warnings from backend:</b> <span className="font-mono">{campaign.operationalWarnings.join(", ")}</span>
            </div>
          ) : null}

          <CampaignTabs tabs={tabs} active={activeTab} onChange={selectTab} />

          <div role="tabpanel" aria-label={TABS.find((t) => t.key === activeTab)?.label}>
            {activeTab === "overview" ? <CampaignOverviewTab campaign={campaign} onSelectTab={selectTab} /> : null}
            {activeTab === "rules" ? <CampaignCommissionRulesTab campaign={campaign} canRead={permissions.rules} /> : null}
            {activeTab === "coupons" ? <CampaignCouponsTab campaign={campaign} canRead={permissions.coupons} /> : null}
            {activeTab === "links" ? <CampaignTrackingLinksTab campaign={campaign} canRead={permissions.links} /> : null}
            {activeTab === "products" ? <CampaignProductsTab campaign={campaign} /> : null}
            {activeTab === "evidence" ? <CampaignSourceEvidenceTab campaign={campaign} canReadRawPayloads={permissions.evidence} /> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
