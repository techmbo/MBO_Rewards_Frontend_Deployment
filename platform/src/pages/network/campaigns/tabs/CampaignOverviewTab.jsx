import { ExpandableText } from "../../../../components/ui/TableCells";
import { optionalBool, optionalFunc, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../../utils/propValidators";
import { BACKEND_UNAVAILABLE_FIELDS, classifyCampaignType } from "../campaignContract";
import { htmlToReadableText } from "../campaignText";

/**
 * Campaign › Overview — a summary of the canonical MBO campaign, laid out to the v13 campaign
 * workspace (.field rows with the canonical key under each label, .status pills).
 *
 * It summarizes; it does not repeat the related-record tabs. Coupon codes, supplier / MBO URLs,
 * commission rules, product feeds and raw payloads live in their own tabs; this tab only states
 * what the detail response proves about them, with a button to open the tab.
 *
 * Canonical values are primary. The network's own values are secondary diagnostics. Summary text
 * (description, terms, promotion) arrives as basic HTML and is converted to plain text at render
 * time; it is never injected as HTML.
 */

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
};
const GREEN = new Set(["MAPPED", "ACTIVE", "JOINED", "APPROVED", "YES", "CERTIFIED", "SYNCED", "CONFIGURED", "AVAILABLE"]);
const AMBER = new Set(["PENDING", "NEEDS_REVIEW", "VERIFY_LIVE"]);
const RED = new Set(["REJECTED", "FAILED", "ERROR", "NO", "SUSPENDED", "NOT_APPLIED", "NOT_JOINED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

function Muted({ children = "Not available", title }) {
  return (
    <span className="font-normal text-[#98a2b3]" title={title}>
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

/** Yes / No / Unknown from a boolean flag; `null` means the backend could not determine it. */
function Flag({ value, title }) {
  if (value == null) return <Pill value="UNKNOWN" tone="blue" title={`${title || "Value"}: not determinable (no campaign source)`} />;
  return <Pill value={value ? "YES" : "NO"} title={title} />;
}
Flag.propTypes = { value: optionalBool, title: optionalString };

function Mono({ value }) {
  if (value == null || value === "") return <Muted />;
  return <span className="break-all font-mono text-[10.5px]">{String(value)}</span>;
}
Mono.propTypes = { value: optionalStringOrNumber };

/** The network's own value, under the canonical one and only when it differs (v13 .source-extra). */
function SourceValue({ value, canonical, label = "source" }) {
  if (value == null || value === "") return null;
  if (canonical != null && String(value).toUpperCase() === String(canonical).toUpperCase()) return null;
  return (
    <span className="mt-1 block font-mono text-[9px] font-normal leading-tight text-[#b54708]" title="Network value as received (diagnostic, not the MBO value)">
      {label}: {String(value)}
    </span>
  );
}
SourceValue.propTypes = { value: optionalStringOrNumber, canonical: optionalStringOrNumber, label: optionalString };

/** v13 .field: label, canonical key underneath, value. */
function Field({ label, field, children, wide = false }) {
  return (
    <div className={`min-w-0 border-b border-[#eef2f6] py-2 ${wide ? "col-span-full" : ""}`}>
      <span className="block text-[9px] font-extrabold text-[#667085]">{label}</span>
      {field ? <span className="block font-mono text-[8.5px] text-[#98a2b3]">{field}</span> : null}
      <div className="mt-1 text-[11px] font-semibold text-[#101828]">{children}</div>
    </div>
  );
}
Field.propTypes = { label: optionalString, field: optionalString, children: optionalNode, wide: optionalBool };

/** Compact v13 card section. */
function Card({ title, subtitle, children }) {
  return (
    <section className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 pb-2 pt-3">
      <h3 className="m-0 text-[13px] font-bold text-[#101828]">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-[10px] leading-snug text-[#667085]">{subtitle}</p> : null}
      <div className="mt-1.5">{children}</div>
    </section>
  );
}
Card.propTypes = { title: optionalString, subtitle: optionalNode, children: optionalNode };

function CampaignTypeValue({ value }) {
  const type = classifyCampaignType(value);
  if (type.missing) return <Muted />;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
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

/** Date-only values (YYYY-MM-DD) are shown as written, never shifted by the viewer's time zone. */
function formatDate(value, withTime) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
  return date.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime && !dateOnly ? { hour: "2-digit", minute: "2-digit" } : {}),
    ...(dateOnly ? { timeZone: "UTC" } : {}),
  });
}

function DateValue({ value, withTime = false, missingTitle }) {
  const text = formatDate(value, withTime);
  return text ? <span className="whitespace-nowrap">{text}</span> : <Muted title={missingTitle} />;
}
DateValue.propTypes = { value: optionalString, withTime: optionalBool, missingTitle: optionalString };

const declaredUnavailable = (field) => (BACKEND_UNAVAILABLE_FIELDS.includes(field) ? "Declared unavailable by the backend contract" : undefined);

/** Source summary text as readable plain text; neutral "Not available" when absent or markup only. */
function SummaryText({ value, field }) {
  if (value == null || value === "") return <Muted title={declaredUnavailable(field) || "Not provided by the source"} />;
  const readable = htmlToReadableText(value);
  if (readable == null) return <Muted title="The source value contains markup only, with no readable text" />;
  return <ExpandableText text={readable} maxWidthClass="max-w-full" charThreshold={160} />;
}
SummaryText.propTypes = { value: optionalString, field: optionalString };

const isCount = (value) => typeof value === "number" && Number.isFinite(value);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** v13 button.action that opens a related-record tab. */
function OpenTab({ tab, label, onSelectTab }) {
  if (!onSelectTab) return null;
  return (
    <button
      type="button"
      onClick={() => onSelectTab(tab)}
      className="whitespace-nowrap rounded-[7px] border border-[#e4e7ec] bg-white px-2 py-[4px] text-[9.5px] font-extrabold text-[#2457d6] hover:bg-[#f8fafc]"
    >
      {label} →
    </button>
  );
}
OpenTab.propTypes = { tab: optionalString, label: optionalString, onSelectTab: optionalFunc };

/** One row of the related-data summary: what it is, its state, a short fact, and the tab. */
function RelatedRow({ label, state, fact, action = null }) {
  return (
    <div className="grid grid-cols-[minmax(96px,140px)_minmax(64px,auto)_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[#eef2f6] py-2 text-[10.5px]">
      <span className="text-[9px] font-extrabold text-[#667085]">{label}</span>
      <span>{state}</span>
      <span className="min-w-0 text-[#475467]">{fact}</span>
      <span>{action}</span>
    </div>
  );
}
RelatedRow.propTypes = { label: optionalString, state: optionalNode, fact: optionalNode, action: optionalNode };

export function CampaignOverviewTab({ campaign, onSelectTab }) {
  const c = campaign;
  const countries = Array.isArray(c.country) && c.country.length ? c.country.join(", ") : null;
  const originalDiffers = Boolean(c.originalCurrency) && c.originalCurrency !== c.currency;
  const feeds = Array.isArray(c.productFeeds) ? c.productFeeds : [];
  const tracking = c.tracking && typeof c.tracking === "object" ? c.tracking : null;
  const mboLinkCount = tracking && isCount(tracking.primaryLinkCount) ? tracking.primaryLinkCount : null;
  const ruleCount = isCount(c.commissionRuleCount) ? c.commissionRuleCount : null;
  const hasDiscount = c.discountPercent != null && c.discountPercent !== "" && Number.isFinite(Number(c.discountPercent));

  return (
    <div className="space-y-3 text-[#101828]">
      {/* 1. Campaign Identity */}
      <Card title="Campaign Identity" subtitle="Canonical MBO values, normalized by the backend. The network's own value appears in amber underneath when it differs.">
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3 xl:grid-cols-6">
          <Field label="Brand" field="brandName">
            {!c.brandName ? (
              <Muted />
            ) : c.brandWebsiteLink ? (
              <a href={c.brandWebsiteLink} target="_blank" rel="noreferrer noopener" title="Brand website" className="text-[#2457d6] hover:underline">
                {c.brandName}
              </a>
            ) : (
              c.brandName
            )}
          </Field>
          <Field label="Campaign Name" field="campaignName">
            {c.campaignName || <Muted />}
          </Field>
          <Field label="Network Source" field="networkSource">
            <Mono value={c.networkSource} />
          </Field>
          <Field label="Primary Category" field="primaryCategory">
            {c.primaryCategory || <Muted />}
          </Field>
          <Field label="Secondary Category" field="secondaryCategory">
            {c.secondaryCategory || <Muted title={declaredUnavailable("secondaryCategory")} />}
          </Field>
          <Field label="Country" field="country">
            {countries ? <span className="font-mono">{countries}</span> : <Muted />}
          </Field>
          <Field label="Currency" field="currency">
            <Mono value={c.currency} />
            {originalDiffers ? <SourceValue value={c.originalCurrency} label="originalCurrency" /> : null}
          </Field>
          <Field label="Campaign Type" field="campaignType">
            <CampaignTypeValue value={c.campaignType} />
            <SourceValue value={c.sourceCampaignType} canonical={c.campaignType} />
          </Field>
          <Field label="Campaign Status" field="campaignStatus">
            <Pill value={c.campaignStatus} title="Campaign Status" />
            <SourceValue value={c.sourceCampaignStatus} canonical={c.campaignStatus} />
          </Field>
          <Field label="Relationship Status" field="relationshipStatus">
            <Pill value={c.relationshipStatus} title="Relationship Status" />
            <SourceValue value={c.sourceRelationshipStatus} canonical={c.relationshipStatus} />
          </Field>
          <Field label="Assignable" field="isAssignable">
            <Flag value={c.isAssignable} title="Assignable (derived by the backend)" />
          </Field>
        </div>
      </Card>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        {/* 2. Commercial Summary */}
        <Card
          title="Commercial Summary"
          subtitle="Supplier-side display values only. Supplier Commission Rules are authoritative; nothing here is client payable commission."
        >
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Campaign Commission" field="campaignCommission" wide>
              {c.campaignCommission || <Muted title="No commission summary returned" />}
            </Field>
            <Field label="Commission Rule Count" field="commissionRuleCount">
              {ruleCount != null ? ruleCount : <Muted />}
            </Field>
            <Field label="Discount %" field="discountPercent">
              {hasDiscount ? `${Number(c.discountPercent)}%` : <Muted title="No explicit percentage from the source" />}
            </Field>
          </div>
          {c.commissionDisplayNote ? <p className="mt-2 text-[10px] leading-snug text-[#667085]">{c.commissionDisplayNote}</p> : null}
        </Card>

        {/* 3. Campaign Details */}
        <Card title="Campaign Details" subtitle="Text from the network source, shown as readable plain text.">
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Description" field="campaignDescription" wide>
              <SummaryText value={c.campaignDescription} field="campaignDescription" />
            </Field>
            <Field label="Terms & Conditions" field="campaignTermsAndCondition" wide>
              <SummaryText value={c.campaignTermsAndCondition} field="campaignTermsAndCondition" />
            </Field>
            <Field label="Promotion Description" field="campaignPromotionDescription" wide>
              <SummaryText value={c.campaignPromotionDescription} field="campaignPromotionDescription" />
            </Field>
            <Field label="Start Date" field="campaignStartDate">
              <DateValue value={c.campaignStartDate} />
            </Field>
            <Field label="End Date" field="campaignEndDate">
              <DateValue value={c.campaignEndDate} missingTitle={declaredUnavailable("campaignEndDate") || "No end date returned (ongoing or unknown)"} />
            </Field>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        {/* 4. Capability / Related Data Summary */}
        <Card title="Capability / Related Data" subtitle="Support flags say what the campaign can have, not that records exist. Records live in their own tabs.">
          <RelatedRow
            label="Coupon Support"
            state={<Flag value={c.couponSupport} title="Coupon Support" />}
            fact="Capability only; coupon codes are coupon records."
            action={<OpenTab tab="coupons" label="Coupons" onSelectTab={onSelectTab} />}
          />
          <RelatedRow label="Link Support" state={<Flag value={c.linkSupport} title="Link Support" />} fact="Capability only." />
          <RelatedRow label="Deeplink Support" state={<Flag value={c.deeplinkSupport} title="Deeplink Support" />} fact="Capability only." />
          <RelatedRow
            label="Products / Feed"
            state={<Pill value={c.productFeedAvailability} title="Product feed availability" />}
            fact={plural(feeds.length, "product feed")}
            action={<OpenTab tab="products" label="Products" onSelectTab={onSelectTab} />}
          />
          <RelatedRow
            label="Commission Rules"
            state={ruleCount != null ? <Pill value={ruleCount > 0 ? "RECORDED" : "NONE"} tone={ruleCount > 0 ? "green" : "amber"} /> : <Muted />}
            fact={ruleCount != null ? plural(ruleCount, "supplier commission rule") : "Rule count not returned"}
            action={<OpenTab tab="rules" label="Rules" onSelectTab={onSelectTab} />}
          />
          <RelatedRow
            label="Tracking Links"
            state={<Pill value={tracking?.state} title="MBO tracking-link state" />}
            fact={
              <span className="block leading-snug">
                <span className="block">
                  Supplier / source links: <span className="text-[#98a2b3]">unknown here, see Tracking Links</span>
                </span>
                <span className="block">
                  MBO client links:{" "}
                  {mboLinkCount != null ? (
                    <>
                      <b className="text-[#101828]">{mboLinkCount}</b> GENERATED / ACTIVE on client assignments
                    </>
                  ) : (
                    <Muted />
                  )}
                </span>
              </span>
            }
            action={<OpenTab tab="links" label="Tracking" onSelectTab={onSelectTab} />}
          />
          <RelatedRow
            label="Client Assignments"
            state={<Flag value={c.isAssignable} title="Assignable" />}
            fact={isCount(c.assignmentCount) ? plural(c.assignmentCount, "client assignment") : "Assignment count not returned"}
          />
        </Card>

        {/* 5. Source Diagnostics */}
        <Card title="Source Diagnostics" subtitle="Internal admin only. Network values as received and source keys; the canonical values above remain primary.">
          <div className="grid grid-cols-2 gap-x-4">
            <Field label="Source Campaign Status" field="sourceCampaignStatus">
              <Mono value={c.sourceCampaignStatus} />
            </Field>
            <Field label="Source Relationship Status" field="sourceRelationshipStatus">
              <Mono value={c.sourceRelationshipStatus} />
            </Field>
            <Field label="Source Campaign Type" field="sourceCampaignType">
              <Mono value={c.sourceCampaignType} />
            </Field>
            <Field label="Original Currency" field="originalCurrency">
              <Mono value={c.originalCurrency} />
            </Field>
            <Field label="Supplier Campaign ID" field="supplierCampaignId">
              <Mono value={c.supplierCampaignId} />
            </Field>
            <Field label="Campaign Source ID" field="campaignSourceId">
              <Mono value={c.campaignSourceId} />
            </Field>
            <Field label="Network Account" field="networkAccount">
              <Mono value={c.networkAccount} />
            </Field>
            <Field label="Mapping Status" field="mappingStatus">
              <Pill value={c.mappingStatus} title="Mapping Status" />
            </Field>
            <Field label="Last Synced" field="lastSyncedAt">
              <DateValue value={c.lastSyncedAt} withTime />
            </Field>
            <Field label="Canonical Campaign ID" field="id">
              <Mono value={c.id} />
            </Field>
          </div>
        </Card>
      </div>
    </div>
  );
}
CampaignOverviewTab.propTypes = { campaign: optionalObject, onSelectTab: optionalFunc };
