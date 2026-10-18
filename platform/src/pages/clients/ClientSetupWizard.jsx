import { Fragment, useEffect, useMemo, useState } from "react";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { fetchApi, patchApi, postApi, putApi } from "../../api";
import { PageLayout } from "../../components/layout/PageLayout";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/FormControls";
import { Badge } from "../../components/ui/Badge";
import { DataTable } from "../../components/ui/DataTable";
import { StatusBadge, formatDateShort } from "../helpers";
import { ExpandableText, Truncate, UrlCell } from "../../components/ui/TableCells";
import { COUNTRY_OPTIONS } from "../../utils/countries";
import {
  optionalArray,
  optionalBool,
  optionalFunc,
  optionalNode,
  optionalNumber,
  optionalObject,
  optionalString,
} from "../../utils/propValidators";

/**
 * Enum options mirrored from the backend zod schemas (clientAgreementStatusSchema,
 * clientDeliveryMethodSchema, clientPaymentCycleSchema, clientPaymentTriggerSchema) at
 * 05e629c. PATCH /clients/:id is strict, so an option that is not one of these is a 400.
 */
const AGREEMENT_STATUS_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "DRAFT", label: "Draft" },
  { value: "SENT", label: "Sent" },
  { value: "PENDING", label: "Pending" },
  { value: "SIGNED", label: "Signed" },
];

const DELIVERY_METHOD_OPTIONS = [
  { value: "API_AND_PORTAL", label: "API + Portal" },
  { value: "API_ONLY", label: "API Only" },
  { value: "PORTAL_ONLY", label: "Portal Only" },
];

const PAYMENT_CYCLE_OPTIONS = [
  { value: "", label: "—" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "QUARTERLY", label: "Quarterly" },
];

const PAYMENT_TRIGGER_OPTIONS = [
  { value: "", label: "—" },
  { value: "AFTER_NETWORK_PAYMENT", label: "After network payment" },
  { value: "CONTRACT_SPECIFIC", label: "Contract specific" },
];

/** The backend stores these as DateTime; an empty box must clear the field, not send "". */
function dateInputValue(value) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Client portal set-password entry point — where an invitation link must land. */
const PORTAL_SET_PASSWORD_URL =
  "https://mbo-rewards-frontend.vercel.app/mbointegratedPlatform/set-password";

const SETUP_STEPS = [
  { id: 1, label: "Client Setup" },
  { id: 2, label: "Commercials" },
  { id: 3, label: "Campaigns" },
  { id: 4, label: "Review" },
  { id: 5, label: "Access & Go Live" },
];

/**
 * Short requirement names for the activation codes the backend emits.
 *
 * Presentation only. The gate still decides what is listed and how severe it is; this map only
 * gives each returned row a heading, and an unrecognised code falls back to its own name rather
 * than being dropped — a new backend blocker must never render as nothing.
 */
const ACTIVATION_REQUIREMENT_LABELS = {
  AGREEMENT_MISSING: "Agreement",
  COMMERCIAL_MISSING: "Commercials",
  ALLOTMENT_MISSING: "Campaigns",
  PUBLISH_MISSING: "Publishing",
  API_KEY_MISSING: "Production API",
  SANDBOX_RECOMMENDED: "Sandbox testing",
  PORTAL_ADMIN_REQUIRED: "Portal administrator",
  PROVISION_INCOMPLETE: "Provisioning",
  ACTIVATION_BLOCKED: "Activation",
};

/** Severities the gate reports as advisory rather than blocking. */
const ADVISORY_SEVERITIES = new Set(["needs_review", "recommendation", "warning"]);

function isMandatoryBlocker(detail) {
  return !ADVISORY_SEVERITIES.has(detail?.severity);
}

function requirementLabel(code) {
  if (!code) return "Requirement";
  if (ACTIVATION_REQUIREMENT_LABELS[code]) return ACTIVATION_REQUIREMENT_LABELS[code];
  const words = String(code).toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The client-safe field dictionary from the reference's Guide page, kept as operator-facing
 * reference text. It documents the disclosure boundary; it does not drive any behaviour.
 */
const CLIENT_SAFE_FIELDS = [
  ["Campaign ID", "Published client-specific campaign identifier"],
  ["Brand Name", "Canonical MBO brand name"],
  ["Brand Logo", "MBO Brand Master logo"],
  ["Campaign Name", "Final campaign title"],
  ["Campaign Type", "Coupon Offer / Affiliate Link / Product Campaign"],
  ["Customer Offer", "Short display value of the customer offer"],
  ["Offer Description", "Client-ready explanatory copy"],
  ["Coupon Code", "Only when applicable"],
  ["Terms & Conditions", "Only when applicable"],
  ["Valid From", "When available"],
  ["Expiry", "When available"],
  ["Valid Countries", "Final normalized applicability"],
  ["MBO Tracking Link", "Stable client-specific tracking URL"],
  ["Client Commission", "Final client commission"],
  ["Campaign Status", "Client-safe status"],
  ["Last Updated", "Final record update timestamp"],
];

const COMMERCIAL_OPTIONS = [
  {
    value: "OFFERS_ONLY",
    title: "Offers Only",
    description: "Client receives campaign offers with no commission share.",
    editable: false,
    defaultClientShare: 0,
  },
  {
    value: "OFFERS_PLUS_COMMISSION",
    title: "Offers + Commission",
    description: "Client receives offers plus a share of approved supplier commission. Set the client share below.",
    editable: true,
    defaultClientShare: 70,
  },
];

function couponField(coupon, key) {
  const display = coupon?.cmsMeta?.displayFields || {};
  const allotment = coupon?.allotment || {};
  const raw = coupon?.rawData && typeof coupon.rawData === "object" ? coupon.rawData : {};
  const nestedCampaign = raw.campaign && typeof raw.campaign === "object" ? raw.campaign : {};

  switch (key) {
    case "brandName":
      return (
        allotment.brandName ||
        display.brandName ||
        coupon.advertiserName ||
        nestedCampaign.name ||
        (typeof raw.campaign === "string" ? raw.campaign : null) ||
        raw.companyName ||
        coupon.campaignName ||
        "Unknown brand"
      );
    case "campaignName":
      return display.campaignName || coupon.campaignName || "Untitled campaign";
    case "categoryName":
      return display.categoryName || "—";
    case "couponCode":
      return display.couponCode || coupon.code || raw.coupon || "";
    case "couponLink":
      return allotment.offerLink || display.couponLink || "";
    case "codeType":
      return display.codeType || coupon.entitySubType || "—";
    case "discountPercentage": {
      const value =
        allotment.discountPercentage ||
        display.discountPercentage ||
        raw.ad_set ||
        raw.discount_percentage ||
        (isPercentLike(raw.discount) ? raw.discount : null) ||
        (isPercentLike(coupon.discount) ? coupon.discount : null) ||
        "";
      return value ? String(value).trim() : "";
    }
    case "offerText":
      return allotment.offerText || "";
    case "websiteUrl":
      return allotment.websiteUrl || "";
    case "trackingUrl":
      return allotment.trackingUrl || "";
    case "campaignStatus":
      return display.campaignStatus || allotment.campaignStatus || "Active";
    case "termsAndConditions":
      return allotment.termsAndConditions || "";
    case "commission":
      return allotment.commission || "";
    case "brandLogo":
      return allotment.brandLogo || nestedCampaign.logo || raw.logo || raw.logo_url || "";
    case "startDate":
      return formatDateShort(display.startDate || raw.start_date || raw.activationDate);
    case "expiryDate":
      return formatDateShort(allotment.expiryDate || display.expiryDate || coupon.eventDate || raw.expiryDate);
    case "couponStatus":
      return display.couponStatus || coupon.entityStatus || "—";
    case "grossOrders":
      return coupon.grossOrders ?? allotment.grossOrders ?? display.grossOrders ?? 0;
    case "netOrders":
      return coupon.netOrders ?? allotment.netOrders ?? display.netOrders ?? 0;
    case "grossOrderValue":
      return coupon.grossOrderValue ?? allotment.grossOrderValue ?? 0;
    case "netOrderValue":
      return coupon.netOrderValue ?? allotment.netOrderValue ?? 0;
    case "ordersCurrency":
      return coupon.ordersCurrency ?? allotment.ordersCurrency ?? null;
    default:
      return display[key] ?? allotment[key] ?? "—";
  }
}

function isPercentLike(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return true;
  return /^\s*\d+(\.\d+)?\s*%?\s*$/.test(String(value));
}

function formatOrders(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatOrderMoney(value, currency) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function cellText(value) {
  if (value == null || value === "" || value === "—") return "—";
  return String(value);
}

function campaignStatusBadgeInline(status) {
  const normalized = String(status || "Active").trim().toLowerCase();
  if (normalized === "paused") {
    return <Badge variant="warning">Paused</Badge>;
  }
  return <Badge variant="success">Active</Badge>;
}

async function copyText(value) {
  if (!value || !navigator?.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * The activation gate's own output, rendered as-is.
 *
 * `blockers` are the backend's activationBlockDetails ({code,message,severity}); when a 409 comes
 * back from POST /onboarding/activate its details carry the same shape, so the same component
 * shows both the pre-flight state and the refusal.
 */
/**
 * One-time display of an invitation.
 *
 * The token lives in the parent's component state and nowhere else. It is deliberately NOT
 * written to localStorage, sessionStorage, a query cache, a log line or an analytics event, and
 * it does not survive a reload — the operator either copies the link now or reissues, which the
 * warning says invalidates the previous one.
 */
function InviteReveal({ result, onDismiss }) {
  const [copied, setCopied] = useState("");
  const inviteUrl = result.token
    ? `${PORTAL_SET_PASSWORD_URL}?token=${encodeURIComponent(result.token)}`
    : "";

  async function copy(value, key) {
    if (!value || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? "" : c)), 1500);
    } catch {
      // clipboard unavailable — the operator can still select the text
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-indigo-950">
          {result.reused ? "Invitation reissued" : "Invitation created"} for {result.email}
        </p>
        <Button variant="secondary" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>

      <p className="text-xs text-indigo-900">
        Expires {result.expiresAt ? formatDateShort(result.expiresAt) : "—"}
        {result.reused ? " · the previous invitation link no longer works" : ""}
      </p>

      {inviteUrl ? (
        <>
          <div className="flex items-center gap-2 rounded-md border border-indigo-200 bg-white px-2 py-1">
            <code className="min-w-0 flex-1 truncate font-mono text-xs" title={inviteUrl}>
              {inviteUrl}
            </code>
            <Button variant="secondary" size="sm" onClick={() => copy(inviteUrl, "url")}>
              {copied === "url" ? "Copied" : "Copy invite link"}
            </Button>
          </div>
          <p className="text-xs font-medium text-indigo-950">
            Copy this now — it is shown once and is gone if you leave or reload this screen. Reissuing an
            invitation invalidates the previous invitation link.
          </p>
        </>
      ) : (
        <p className="text-xs text-indigo-900">
          No token was returned. The invitation is pending; reissue to obtain a fresh link.
        </p>
      )}
    </div>
  );
}

/** Status pill. The reference screens use one pill vocabulary across every surface. */
/* .status / .good / .warn / .bad / .neutral / .bluep — the reference's pill vocabulary and tokens. */
const CHIP_TONES = {
  ready: "bg-[#eaf7ef] text-[#087a55]",
  pending: "bg-[#fff7e6] text-[#9a6700]",
  bad: "bg-[#fff1f0] text-[#b42318]",
  neutral: "bg-[#f2f4f7] text-[#475467]",
  info: "bg-[#eef4ff] text-[#1d4ed8]",
};

function StatusChip({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-[7px] py-[3px] text-[11px] font-extrabold ${
        CHIP_TONES[tone] || CHIP_TONES.neutral
      }`}
    >
      {children}
    </span>
  );
}

/*
  .btn.dark — the reference's primary action. Same contract as the shared Button (loading,
  disabled, passthrough props, default submit inside a form); only the colour differs, and it is
  local so the shared component stays untouched.
*/
function PrimaryButton({ children, loading = false, disabled, className = "", ...props }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#101828] bg-[#101828] px-3.5 py-2 text-sm font-bold text-white transition hover:bg-[#1d2939] disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? "Loading..." : children}
    </button>
  );
}

/* .formgrid — two columns of label-left / value-right rows, hairline separated. */
function FormGrid({ children }) {
  return <div className="grid grid-cols-1 md:grid-cols-2">{children}</div>;
}

/* .formrow — 190px label column, control or value on the right. */
function FormRow({ label, children, mono = false, full = false }) {
  return (
    <div
      className={`grid gap-x-3 gap-y-1 border-b border-[#edf1f5] px-[15px] py-[11px] last:border-b-0 sm:grid-cols-[190px_minmax(0,1fr)] sm:items-center md:odd:border-r md:odd:border-r-[#edf1f5] ${
        full ? "md:col-span-2 md:odd:border-r-0" : ""
      }`}
    >
      <div className="text-[#667085]">{label}</div>
      <div className={`min-w-0 ${mono ? "font-mono text-[11px] text-[#475467]" : "font-[650]"}`}>{children}</div>
    </div>
  );
}

/* .kpis / .kpi — the reference's five-across metric strip. */
function KpiStrip({ items }) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="rounded-[9px] border border-[#dfe6ee] bg-white px-3.5 py-3">
          <span className="block text-[11px] font-extrabold uppercase text-[#667085]">{item.label}</span>
          <strong className="mt-1.5 block text-[21px] font-bold leading-tight">{item.value}</strong>
          {item.hint ? <small className="text-[#98a2b3]">{item.hint}</small> : null}
        </div>
      ))}
    </div>
  );
}

/* .assignment-summary / .summary — four tiles above the review panel. */
function SummaryTiles({ items }) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-[9px] border border-[#dfe6ee] bg-white px-3.5 py-3">
          <span className="block text-[10px] font-extrabold uppercase tracking-[.03em] text-[#667085]">
            {item.label}
          </span>
          <strong className="mt-1.5 block text-[21px] font-bold leading-tight">{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

/* .footer-actions — muted explanation on the left, the panel's one primary action on the right. */
function FooterActions({ note, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe6ee] px-4 py-3.5">
      <span className="text-xs text-[#667085]">{note}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* .notice — the amber blocked callout. */
function Notice({ children }) {
  return (
    <div className="mx-4 mb-3.5 rounded-lg border border-[#fedf89] bg-[#fffaf0] px-3 py-2.5 text-xs text-[#7a5b00]">
      {children}
    </div>
  );
}

/*
  .secretbox / .secret — masked credential. Only the server-returned keyPrefix is shown; the
  reference's trailing characters are decoration we cannot reproduce, because the secret is
  hash-stored and genuinely unrecoverable after creation.
*/
function SecretBox({ keyPrefix, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-md border border-[#dfe6ee] bg-[#f8fafc] px-2.5 py-1.5 font-mono text-xs text-[#667085]">
        {keyPrefix}
        {"••••••••"}
      </span>
      {children}
    </div>
  );
}

/** A titled white panel — the reference layout groups every form and table into one of these. */
function SectionCard({ title, description, actions, children, className = "", flush = false }) {
  return (
    <section className={`overflow-hidden rounded-[9px] border border-[#dfe6ee] bg-white ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe6ee] px-4 py-3.5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[#101828]">{title}</h2>
          {description ? <p className="mt-0.5 text-xs text-[#667085]">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {flush ? children : <div className="p-4">{children}</div>}
    </section>
  );
}

/** Label / value row for the read-only summary panels. */
function SummaryRow({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-2 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900">{children}</span>
    </div>
  );
}

const REQUIREMENT_TONES = {
  Ready: "border-emerald-200 bg-emerald-50",
  "Needs Attention": "border-amber-200 bg-amber-50",
  Recommendation: "border-sky-200 bg-sky-50",
  "Not Required": "border-slate-200 bg-slate-50",
};

const REQUIREMENT_CHIP = {
  Ready: "ready",
  "Needs Attention": "pending",
  Recommendation: "info",
  "Not Required": "neutral",
};

/** One activation requirement as a card: name, status, one-line reason. */
function RequirementCard({ label, status, detail, code }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${REQUIREMENT_TONES[status] || REQUIREMENT_TONES["Not Required"]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        <StatusChip tone={REQUIREMENT_CHIP[status] || "neutral"}>{status}</StatusChip>
      </div>
      {detail ? <p className="mt-1 text-xs text-slate-700">{detail}</p> : null}
      {code ? <p className="mt-1 font-mono text-[10px] uppercase text-slate-400">{code}</p> : null}
    </div>
  );
}

/**
 * Client identity bar.
 *
 * Every chip below is read from data already on screen — the client record, the backend checklist
 * and the assignment rows. Nothing here is computed as an independent opinion about readiness.
 */
function ClientIdentityBar({ client, checklist, needsApi, needsPortal, allottedCount, publishedCount }) {
  const name = client?.name || "Client";
  const initials = name.trim().slice(0, 2).toUpperCase() || "CL";
  const agreementStatus = client?.agreementStatus || "NONE";
  const agreementLabel =
    AGREEMENT_STATUS_OPTIONS.find((o) => o.value === agreementStatus)?.label || agreementStatus;
  const deliveryLabel =
    DELIVERY_METHOD_OPTIONS.find((o) => o.value === client?.deliveryMethod)?.label || "API + Portal";

  const channelChip = (required, ready, label) => {
    if (!required) return { tone: "neutral", text: `${label}: Not Required` };
    if (ready) return { tone: "ready", text: `${label}: Ready` };
    return { tone: "pending", text: `${label}: Required` };
  };
  const portalChip = channelChip(needsPortal, checklist.administratorConfigured, "Portal");
  const apiChip = channelChip(needsApi, checklist.apiKeyIssued, "API");

  return (
    <section className="mb-3.5 flex flex-wrap items-center justify-between gap-3.5 rounded-[9px] border border-[#dfe6ee] bg-white p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[9px] border border-[#dfe6ee] bg-[#f8fafc] text-sm font-extrabold text-[#475467]">
          {initials}
        </div>
        <div className="min-w-0">
          <h2 className="mb-1 truncate text-xl font-semibold">{name}</h2>
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone={client?.status === "ACTIVE" ? "ready" : "pending"}>
              {client?.status === "ACTIVE" ? "Account Active" : `Account ${client?.status || "PROSPECT"}`}
            </StatusChip>
            <StatusChip tone={agreementStatus === "SIGNED" ? "ready" : "pending"}>
              Agreement {agreementLabel}
            </StatusChip>
            <StatusChip tone={checklist.commercialConfigured ? "ready" : "pending"}>
              {checklist.commercialConfigured ? "Commercials Configured" : "Commercials Pending"}
            </StatusChip>
            <StatusChip tone={portalChip.tone}>{portalChip.text}</StatusChip>
            <StatusChip tone={apiChip.tone}>{apiChip.text}</StatusChip>
          </div>
        </div>
      </div>
      <div className="text-right text-xs text-[#667085]">
        <div>{client?.country || "Country not set"}</div>
        <div className="mt-0.5 font-[650] text-[#344054]">{deliveryLabel}</div>
        <div className="mt-0.5">
          {allottedCount} assigned · {publishedCount} published
        </div>
      </div>
    </section>
  );
}

function ActivationReadiness({
  blockers,
  recommendations,
  activated,
  needsApi,
  needsPortal,
  activateBusy,
  disabled,
  onActivate,
}) {
  const mandatory = blockers || [];
  const advisory = recommendations || [];

  // Channels the delivery method excludes render as "Not Required", exactly as the reference does,
  // so "does not apply" reads differently from "missing". needsApi/needsPortal mirror the backend's
  // own derivation; they are not a second opinion about activation.
  const notRequired = [];
  if (!needsApi) {
    notRequired.push({ label: "API access", detail: "Not required by this delivery method." });
  }
  if (!needsPortal) {
    notRequired.push({ label: "Portal access", detail: "Not required by this delivery method." });
  }

  const headline = activated
    ? { tone: "ready", text: "Active" }
    : mandatory.length === 0
      ? { tone: "ready", text: "Ready to activate" }
      : { tone: "pending", text: `${mandatory.length} blocker${mandatory.length === 1 ? "" : "s"}` };

  return (
    <SectionCard
      flush
      title="Activation Review"
      description="Final go-live checks. Requirements change automatically based on Delivery Method."
      actions={<StatusChip tone={headline.tone}>{headline.text}</StatusChip>}
    >
      <div className="grid gap-2.5 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {activated ? (
          <RequirementCard label="Client status" status="Ready" detail="Client is ACTIVE." />
        ) : mandatory.length === 0 ? (
          <RequirementCard
            label="All requirements"
            status="Ready"
            detail="Every prerequisite the activation gate requires is satisfied."
          />
        ) : null}

        {mandatory.map((blocker) => (
          <RequirementCard
            key={`block:${blocker.code}:${blocker.message}`}
            label={requirementLabel(blocker.code)}
            status="Needs Attention"
            detail={blocker.message}
            code={blocker.code}
          />
        ))}

        {advisory.map((item) => (
          <RequirementCard
            key={`rec:${item.code}:${item.message}`}
            label={requirementLabel(item.code)}
            status="Recommendation"
            detail={item.message}
            code={item.code}
          />
        ))}

        {notRequired.map((item) => (
          <RequirementCard key={`na:${item.label}`} label={item.label} status="Not Required" detail={item.detail} />
        ))}
      </div>

      {!activated && mandatory.length > 0 ? (
        <Notice>
          <b>Activation blocked:</b> {mandatory.map((blocker) => blocker.message).join(" ")}
        </Notice>
      ) : null}

      {advisory.length > 0 && mandatory.length === 0 ? (
        <div className="mx-4 mb-3.5 rounded-lg border border-[#a9e7c7] bg-[#f2fbf6] px-3 py-2.5 text-xs text-[#05603a]">
          <b>
            {advisory.length} recommendation{advisory.length === 1 ? "" : "s"} outstanding.
          </b>{" "}
          Recommendations do not block activation.
        </div>
      ) : null}

      <FooterActions note="All required checks must pass before account activation.">
        <PrimaryButton
          loading={activateBusy}
          disabled={disabled}
          onClick={onActivate}
          title={mandatory.length > 0 ? `Blocked: ${mandatory.map((b) => b.message).join(" ")}` : undefined}
        >
          {activated ? "Client active" : "Activate Client"}
        </PrimaryButton>
      </FooterActions>
    </SectionCard>
  );
}

/** Provision returns three buckets. A partial run must never read as a clean success. */
function ProvisionOutcome({ result }) {
  const buckets = result?.provisionResults;
  if (!buckets) return null;
  const groups = [
    { key: "provisioned", label: "Provisioned", rows: buckets.provisioned || [], tone: "emerald" },
    { key: "trackingPending", label: "Tracking pending", rows: buckets.trackingPending || [], tone: "amber" },
    { key: "failures", label: "Failed", rows: buckets.failures || [], tone: "rose" },
  ];
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
  };

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Provisioning result</h3>
        {groups.map((g) => (
          <span key={g.key} className={`rounded-full border px-2 py-0.5 text-xs ${tones[g.tone]}`}>
            {g.label}: {g.rows.length}
          </span>
        ))}
      </div>

      {(buckets.failures?.length > 0 || buckets.trackingPending?.length > 0) && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          This run did not fully succeed. Campaigns below that failed or are tracking-pending are
          <strong> not published</strong>.
        </p>
      )}

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <div key={g.key}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</h4>
            <ul className="mt-1 space-y-1">
              {g.rows.map((row) => (
                <li
                  key={`${g.key}:${row.assignmentId}`}
                  className={`rounded-lg border px-3 py-2 text-sm ${tones[g.tone]}`}
                >
                  <div className="font-medium">
                    {row.canonicalCampaignId || row.assignmentId}
                  </div>
                  <div className="text-xs">
                    {row.outcome ? <span className="font-mono">{row.outcome}</span> : null}
                    {row.trackingStatus ? <span className="ml-2">tracking: {row.trackingStatus}</span> : null}
                    {row.published != null ? (
                      <span className="ml-2">published: {String(row.published)}</span>
                    ) : null}
                  </div>
                  {row.message ? <div className="mt-1 text-xs">{row.message}</div> : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}

function ApiKeyReveal({ apiKey, warning }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const ok = await copyText(apiKey);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
      {warning ? <p className="font-medium">{warning}</p> : null}
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs" title={apiKey}>
          {apiKey}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function SetupStepper({ setupStep, setSetupStep, checklist, locked = false }) {
  const doneFor = (stepId) => {
    if (stepId === 1) return checklist.clientCreated;
    if (stepId === 2) return checklist.commercialConfigured;
    if (stepId === 3) return checklist.campaignsAllotted;
    if (stepId === 4) return checklist.campaignsAllotted && checklist.commercialConfigured;
    if (stepId === 5) return checklist.activated;
    return false;
  };

  return (
    <nav aria-label="Setup steps" className="mb-4 rounded-[9px] border border-[#dfe6ee] bg-white">
      <ol className="flex flex-wrap gap-1.5 px-4 py-3.5">
        {SETUP_STEPS.map((step) => {
          const done = doneFor(step.id);
          const active = setupStep === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                disabled={locked && step.id !== 1}
                title={locked && step.id !== 1 ? "Save the client setup first." : undefined}
                onClick={() => setSetupStep(step.id)}
                aria-current={active ? "step" : undefined}
                className={`rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${
                  active
                    ? "border-[#8db2ff] bg-[#eef4ff] text-[#1d4ed8]"
                    : done
                      ? "border-[#a9e7c7] bg-[#f2fbf6] text-[#05603a]"
                      : "border-[#dfe6ee] bg-white text-[#475467] hover:border-[#8db2ff]"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {step.id} {step.label}
                {done && !active ? " ✓" : ""}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ClientSetupWizard({ client, initialStep = 1, onClose, onClientUpdated }) {
  const [setupStep, setSetupStep] = useState(initialStep);
  const [setupClient, setSetupClient] = useState(client);
  const [onboarding, setOnboarding] = useState(null);
  // A new client (no id yet) has no onboarding state to load until step 1 creates it.
  const [stateLoading, setStateLoading] = useState(Boolean(client?.id));
  const [stateError, setStateError] = useState("");

  const [orgForm, setOrgForm] = useState({
    name: client?.name || "",
    industry: client?.industry || "",
    category: client?.category || "",
    subCategory: client?.subCategory || "",
    country: client?.country || "",
    currency: client?.currency || "",
    timezone: client?.timezone || "",
    deliveryMethod: client?.deliveryMethod || "API_AND_PORTAL",
    agreementStatus: client?.agreementStatus || "NONE",
    agreementEffectiveAt: dateInputValue(client?.agreementEffectiveAt),
    agreementRenewalAt: dateInputValue(client?.agreementRenewalAt),
    agreementDocumentUrl: client?.agreementDocumentUrl || "",
    paymentCycle: client?.paymentCycle || "",
    paymentTrigger: client?.paymentTrigger || "",
  });
  const [orgBusy, setOrgBusy] = useState(false);
  const [orgError, setOrgError] = useState("");

  const [commercialBusy, setCommercialBusy] = useState(false);
  const [commercialError, setCommercialError] = useState("");
  const [selectedCommercial, setSelectedCommercial] = useState(client?.commercialModel || "OFFERS_ONLY");
  const [clientShareInput, setClientShareInput] = useState(() => {
    if (client?.clientSharePercent != null && client?.commercialModel === "OFFERS_PLUS_COMMISSION") {
      return String(Number(client.clientSharePercent));
    }
    return "70";
  });

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [allotFilters, setAllotFilters] = useState({
    search: "",
    codeType: "all",
    campaignStatus: "Active",
  });
  /** Reference's .campaign-tabs — "available" | "assigned". */
  const [campaignTab, setCampaignTab] = useState("available");
  const [allotBusy, setAllotBusy] = useState(false);
  const [allotError, setAllotError] = useState("");
  const [allotSuccess, setAllotSuccess] = useState("");

  const [provisionBusy, setProvisionBusy] = useState(false);
  const [activateBusy, setActivateBusy] = useState(false);
  const [provisionError, setProvisionError] = useState("");
  const [provisionResult, setProvisionResult] = useState(null);

  const [apiKeyForm, setApiKeyForm] = useState({ name: "Default" });
  const [apiKeyResult, setApiKeyResult] = useState(null);
  /** false, or the environment currently being created — so only that button shows a spinner. */
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyError, setApiKeyError] = useState("");

  const [activateBlockers, setActivateBlockers] = useState(null);
  /** Transient only — the raw invite token must not outlive this component instance. */
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteForm, setInviteForm] = useState({ email: "", name: "", password: "", confirmPassword: "" });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [portalCredentials, setPortalCredentials] = useState(null);
  const [credentialsCopied, setCredentialsCopied] = useState("");

  const checklist = onboarding?.checklist || {
    clientCreated: Boolean(setupClient?.id),
    commercialConfigured: Boolean(setupClient?.commercialModel),
    administratorConfigured: false,
    campaignsAllotted: false,
    couponAssignmentsPrepared: false,
    commissionRulesPrepared: false,
    trackingLinksGenerated: false,
    assignmentsPublished: false,
    apiKeyIssued: false,
    provisioned: false,
    activated: setupClient?.status === "ACTIVE",
  };

  // deliveryChannelRequirements, mirrored: needsApi unless PORTAL_ONLY, needsPortal unless API_ONLY.
  const deliveryMethod = setupClient?.deliveryMethod || onboarding?.deliveryMethod || "API_AND_PORTAL";
  const needsApi = deliveryMethod !== "PORTAL_ONLY";
  const needsPortal = deliveryMethod !== "API_ONLY";

  // The backend's list is authoritative. activateBlockers holds a 409's details when one arrives,
  // so a refusal replaces the pre-flight list rather than sitting beside it as a bare message.
  const activationDetails =
    activateBlockers ??
    onboarding?.activationBlockDetails ??
    (onboarding?.activationBlocks || []).map((message) => ({ code: "ACTIVATION_BLOCKED", message }));

  /*
    The gate reports two kinds of row. `severity: "blocked"` refuses activation; `needs_review`
    (today: SANDBOX_RECOMMENDED) does not. Treating both as blockers disabled Activate for a
    client the backend would have activated, so advisory rows are split out and rendered as
    recommendations instead.

    One exception, and it is the backend's call rather than this screen's: if POST /activate
    actually refused and the details it returned are all advisory, then the endpoint did block for
    those reasons — so they are treated as mandatory. This never relaxes a real gate; the gate is
    still the only thing that decides whether activation succeeds.
  */
  const activateRefused = activateBlockers != null;
  const hasMandatoryDetail = activationDetails.some(isMandatoryBlocker);
  const treatAllAsBlocking = activateRefused && !hasMandatoryDetail && activationDetails.length > 0;
  const activationBlockers = treatAllAsBlocking
    ? activationDetails
    : activationDetails.filter(isMandatoryBlocker);
  const activationRecommendations = treatAllAsBlocking
    ? []
    : activationDetails.filter((detail) => !isMandatoryBlocker(detail));

  const portalUsers = onboarding?.portalUsers || [];
  const activePortalUser = portalUsers.find((user) => user.isActive) || portalUsers[0] || null;
  const apiKeys = onboarding?.apiKeys || [];
  const activeApiKeys = apiKeys.filter((key) => key.isActive);
  const productionKeys = activeApiKeys.filter((key) => !key.environment || key.environment === "PRODUCTION");
  const sandboxKeys = activeApiKeys.filter((key) => key.environment === "SANDBOX");
  // provision only ever returns a production credential, so it is tagged as one here.
  const revealedApiKey =
    apiKeyResult ||
    (provisionResult?.newApiCredential
      ? { ...provisionResult.newApiCredential, environment: "PRODUCTION" }
      : null) ||
    null;
  const revealedProductionKey = revealedApiKey?.environment === "SANDBOX" ? null : revealedApiKey;
  const revealedSandboxKey = revealedApiKey?.environment === "SANDBOX" ? revealedApiKey : null;
  /*
    Production-specific on purpose, and derived from the server's own credential list so it
    survives a reload.

    The previous expression was `apiKeys.some((key) => key.isActive)`, which is true for a client
    holding only a SANDBOX key — that hid the production form from a client that still needed a
    production key. (The backend's checklist.apiKeyIssued is NOT the culprit: setupProgress.js
    derives it as `needsApi ? hasProductionKey : true`, so it is already production-specific.)

    revealedProductionKey contributes only so the form stays hidden between a successful POST and
    the refetch that follows it; it is transient component state, never persisted, and after a
    reload this reduces to productionKeys alone.
  */
  const hasActiveApiKey = productionKeys.length > 0 || Boolean(revealedProductionKey?.apiKey);
  const hasSandboxKey = sandboxKeys.length > 0 || Boolean(revealedSandboxKey?.apiKey);

  const couponQueryEnabled = setupStep === 3;
  const {
    rows: couponRows,
    loading: couponsLoading,
    error: couponsError,
    reload: reloadCoupons,
    page: couponPage,
    setPage: setCouponPage,
    pagination: couponPagination,
  } = usePagedQuery(
    "/admin/coupons",
    {
      search: allotFilters.search,
      codeType: allotFilters.codeType === "all" ? undefined : allotFilters.codeType,
      campaignStatus: allotFilters.campaignStatus === "all" ? undefined : allotFilters.campaignStatus,
      allottableOnly: allotFilters.campaignStatus === "Active" ? "true" : undefined,
    },
    { pageSize: 50, enabled: couponQueryEnabled },
  );

  async function loadOnboarding(clientId, preferSuggested = false) {
    setStateLoading(true);
    setStateError("");
    try {
      // skipCache: the onboarding state must be read fresh every time the wizard opens.
      const response = await fetchApi(`/clients/${clientId}/onboarding`, {}, { skipCache: true });
      const state = response.data ?? response;
      setOnboarding(state);
      if (state.client) {
        setSetupClient(state.client);
        onClientUpdated?.(state.client);
        setOrgForm({
          name: state.client.name || "",
          industry: state.client.industry || "",
          category: state.client.category || "",
          subCategory: state.client.subCategory || "",
          country: state.client.country || "",
          currency: state.client.currency || "",
          timezone: state.client.timezone || "",
          deliveryMethod: state.client.deliveryMethod || "API_AND_PORTAL",
          agreementStatus: state.client.agreementStatus || "NONE",
          agreementEffectiveAt: dateInputValue(state.client.agreementEffectiveAt),
          agreementRenewalAt: dateInputValue(state.client.agreementRenewalAt),
          agreementDocumentUrl: state.client.agreementDocumentUrl || "",
          paymentCycle: state.client.paymentCycle || "",
          paymentTrigger: state.client.paymentTrigger || "",
        });
        if (state.client.commercialModel) {
          setSelectedCommercial(state.client.commercialModel);
        }
        if (state.client.commercialModel === "OFFERS_PLUS_COMMISSION") {
          const share = state.client.clientSharePercent ?? state.clientSharePercent ?? 70;
          setClientShareInput(String(Number(share)));
        } else if (state.client.commercialModel === "OFFERS_ONLY") {
          setClientShareInput("0");
        }
      }
      if (preferSuggested && state.suggestedStep) {
        setSetupStep(state.suggestedStep);
      }
      return state;
    } catch (err) {
      setStateError(err.message || "Failed to load onboarding state.");
      return null;
    } finally {
      setStateLoading(false);
    }
  }

  useEffect(() => {
    setSetupClient(client);
    setProvisionResult(null);
    setApiKeyResult(null);
    setApiKeyError("");
    setApiKeyForm({ name: "Default" });
    setSelectedIds(new Set());
    if (client?.id) {
      loadOnboarding(client.id, true).then((state) => {
        if (!state) setSetupStep(initialStep);
      });
    }
  }, [client?.id]);

  const selectedCount = selectedIds.size;
  const activeAssignments = (onboarding?.assignments || []).filter((a) => a.status !== "REVOKED");
  const allottedCount = activeAssignments.length;
  const publishedCount = activeAssignments.filter((a) => a.published === true).length;
  const trackingLinkCount = activeAssignments.filter((a) =>
    (a.trackingLinks || []).some((t) => t.mboTrackingUrl),
  ).length;
  const allPageSelected = couponRows.length > 0 && couponRows.every((row) => selectedIds.has(row.id));

  function toggleCampaign(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible(selectAll) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of couponRows) {
        if (selectAll) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  const allotmentColumns = useMemo(
    () => [
      {
        key: "select",
        label: "Select",
        title: "Select campaign",
        minWidth: 52,
        render: (row) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.id)}
            onChange={() => toggleCampaign(row.id)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${couponField(row, "campaignName")}`}
          />
        ),
      },
      {
        key: "brand",
        label: "Brand",
        minWidth: 140,
        render: (row) => {
          const logo = couponField(row, "brandLogo");
          const brand = couponField(row, "brandName");
          return (
            <div className="flex min-w-0 items-center gap-2">
              {logo ? (
                <img
                  src={logo}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5"
                />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-dashed border-slate-200 bg-slate-50 text-[9px] text-slate-400">
                  —
                </div>
              )}
              <Truncate className="font-medium text-slate-900">{brand}</Truncate>
            </div>
          );
        },
      },
      {
        key: "campaignName",
        label: "Campaign",
        minWidth: 200,
        render: (row) => <Truncate title={couponField(row, "campaignName")}>{couponField(row, "campaignName")}</Truncate>,
      },
      {
        key: "categoryName",
        label: "Category",
        minWidth: 110,
        defaultHidden: true,
        render: (row) => cellText(couponField(row, "categoryName")),
      },
      {
        key: "codeType",
        label: "Type",
        minWidth: 80,
        render: (row) => <Badge>{couponField(row, "codeType")}</Badge>,
      },
      {
        key: "campaignStatus",
        label: "Assignment Ready",
        title: "Only Active campaigns can be assigned to a client.",
        minWidth: 120,
        render: (row) => campaignStatusBadgeInline(couponField(row, "campaignStatus")),
      },
      {
        key: "couponCode",
        label: "Code",
        minWidth: 100,
        render: (row) => {
          const code = couponField(row, "couponCode");
          return code ? <span className="font-mono text-xs font-semibold text-slate-800">{code}</span> : "—";
        },
      },
      {
        key: "discountPercentage",
        label: "Discount",
        minWidth: 120,
        maxWidth: 260,
        render: (row) => {
          const discount = couponField(row, "discountPercentage");
          const offerText = couponField(row, "offerText");
          if (discount) return <span className="font-medium text-emerald-800">{discount}</span>;
          if (offerText) return <ExpandableText text={offerText} />;
          return "—";
        },
      },
      {
        key: "websiteUrl",
        label: "Brand Website",
        minWidth: 150,
        defaultHidden: true,
        render: (row) => {
          const website = couponField(row, "websiteUrl");
          return website ? <UrlCell url={website} tone="indigo" showCopy={false} /> : "—";
        },
      },
      {
        key: "commission",
        label: "Supplier Commission",
        title:
          "Commission published by the supplier network for this campaign. This is NOT the client-payable commission — that is derived from the client's commercial model.",
        minWidth: 130,
        className: "tabular-nums",
        render: (row) => cellText(couponField(row, "commission")),
      },
      {
        key: "grossOrders",
        label: "Gross Orders",
        minWidth: 100,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatOrders(couponField(row, "grossOrders")),
      },
      {
        key: "netOrders",
        label: "Net Orders",
        minWidth: 100,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatOrders(couponField(row, "netOrders")),
      },
      {
        key: "grossOrderValue",
        label: "Gross Order $",
        minWidth: 110,
        defaultHidden: true,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatOrderMoney(couponField(row, "grossOrderValue"), couponField(row, "ordersCurrency")),
      },
      {
        key: "netOrderValue",
        label: "Net Order $",
        minWidth: 110,
        defaultHidden: true,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatOrderMoney(couponField(row, "netOrderValue"), couponField(row, "ordersCurrency")),
      },
      {
        key: "offer",
        label: "Offer",
        minWidth: 160,
        maxWidth: 280,
        render: (row) => {
          const offerText = couponField(row, "offerText");
          const offerLink = couponField(row, "couponLink");
          if (offerText) return <ExpandableText text={offerText} />;
          // The raw offer URL is a supplier artefact; the operator only needs to know one exists.
          if (offerLink) return <Badge variant="info">Offer link</Badge>;
          return "—";
        },
      },
      {
        key: "trackingUrl",
        label: "Tracking",
        title: "The MBO tracking link is generated by the backend when the campaign is assigned.",
        minWidth: 120,
        render: (row) => {
          const tracking = couponField(row, "trackingUrl");
          return tracking ? (
            <Badge variant="success">Supported</Badge>
          ) : (
            <span className="text-xs text-slate-400">After assign</span>
          );
        },
      },
      {
        key: "termsAndConditions",
        label: "Terms",
        minWidth: 180,
        maxWidth: 280,
        render: (row) => {
          const terms = couponField(row, "termsAndConditions");
          return terms ? <ExpandableText text={terms} /> : "—";
        },
      },
      {
        key: "startDate",
        label: "Start",
        minWidth: 100,
        defaultHidden: true,
        render: (row) => cellText(couponField(row, "startDate")),
      },
      {
        key: "expiryDate",
        label: "Expiry",
        minWidth: 100,
        render: (row) => cellText(couponField(row, "expiryDate")),
      },
      {
        key: "couponStatus",
        label: "Coupon Status",
        minWidth: 110,
        defaultHidden: true,
        render: (row) => <StatusBadge status={couponField(row, "couponStatus")} />,
      },
    ],
    [allPageSelected, couponRows, selectedIds],
  );

  async function handleSaveOrganisation(event) {
    event.preventDefault();
    setOrgBusy(true);
    setOrgError("");
    try {
      // Every key here is on updateClientBodySchema. That schema is STRICT: one unrecognised key
      // rejects the whole request, so nothing speculative may be added.
      const body = {
        name: orgForm.name.trim(),
        industry: orgForm.industry.trim() || null,
        category: orgForm.category.trim() || null,
        subCategory: orgForm.subCategory.trim() || null,
        country: orgForm.country.trim() ? orgForm.country.trim().toUpperCase() : null,
        currency: orgForm.currency.trim() ? orgForm.currency.trim().toUpperCase() : null,
        timezone: orgForm.timezone.trim() || null,
        deliveryMethod: orgForm.deliveryMethod,
        agreementStatus: orgForm.agreementStatus,
        agreementEffectiveAt: orgForm.agreementEffectiveAt || null,
        agreementRenewalAt: orgForm.agreementRenewalAt || null,
        agreementDocumentUrl: orgForm.agreementDocumentUrl.trim() || null,
        paymentCycle: orgForm.paymentCycle || null,
        paymentTrigger: orgForm.paymentTrigger || null,
      };
      // A new client is created here, from the same fields. Always PROSPECT: a client becomes
      // ACTIVE only through POST /clients/:id/onboarding/activate, which checks the prerequisites.
      const response = setupClient?.id
        ? await patchApi(`/clients/${setupClient.id}`, body)
        : await postApi("/clients", { ...body, status: "PROSPECT" });
      const updated = response.data ?? response;
      setSetupClient(updated);
      onClientUpdated?.(updated);
      await loadOnboarding(updated.id);
      setSetupStep(2);
    } catch (err) {
      setOrgError(err.message || "Failed to save organisation.");
    } finally {
      setOrgBusy(false);
    }
  }

  async function handleSelectCommercial(model, shareOverride) {
    if (!setupClient?.id) return;
    setCommercialBusy(true);
    setCommercialError("");
    try {
      const body = { commercialModel: model };
      if (model === "OFFERS_PLUS_COMMISSION") {
        const raw = shareOverride != null ? shareOverride : clientShareInput;
        const share = Number(raw);
        if (!Number.isFinite(share) || share < 0 || share > 100) {
          throw new Error("Client share must be a number between 0 and 100.");
        }
        body.clientSharePercent = Math.round(share * 100) / 100;
      } else {
        body.clientSharePercent = 0;
      }
      const response = await putApi(`/clients/${setupClient.id}/onboarding/commercial-model`, body);
      const updated = response.data ?? response;
      setSetupClient(updated);
      onClientUpdated?.(updated);
      setSelectedCommercial(updated.commercialModel || model);
      if (updated.clientSharePercent != null) {
        setClientShareInput(String(Number(updated.clientSharePercent)));
      }
      await loadOnboarding(setupClient.id);
      setSetupStep(3);
    } catch (err) {
      setCommercialError(err.message || "Failed to save commercial model.");
    } finally {
      setCommercialBusy(false);
    }
  }

  async function handleAllotSelected() {
    if (!setupClient?.id || selectedIds.size === 0) return;
    setAllotBusy(true);
    setAllotError("");
    setAllotSuccess("");
    try {
      const response = await postApi(`/clients/${setupClient.id}/onboarding/allot`, {
        couponEntityIds: [...selectedIds],
      });
      const result = response.data ?? response;
      setAllotSuccess(`Allotted ${result.meta?.total ?? selectedIds.size} campaign(s). Client remains ${result.clientStatus}.`);
      setSelectedIds(new Set());
      await loadOnboarding(setupClient.id);
      setCampaignTab("assigned");
    } catch (err) {
      setAllotError(err.message || "Failed to allot campaigns.");
    } finally {
      setAllotBusy(false);
    }
  }

  async function handleProvision() {
    if (!setupClient?.id) return;
    setProvisionBusy(true);
    setProvisionError("");
    try {
      const response = await postApi(`/clients/${setupClient.id}/onboarding/provision`);
      const result = response.data ?? response;
      setProvisionResult(result);
      setActivateBlockers(null);
      if (result?.newApiCredential?.apiKey) {
        setApiKeyResult(result.newApiCredential);
      }
      await loadOnboarding(setupClient.id);
    } catch (err) {
      setProvisionError(err.message || "Provisioning failed.");
    } finally {
      setProvisionBusy(false);
    }
  }

  async function handleCreateApiKey(event, environment = "PRODUCTION") {
    event?.preventDefault?.();
    if (!setupClient?.id) return;
    if (environment === "PRODUCTION" && hasActiveApiKey) return;
    if (environment === "SANDBOX" && hasSandboxKey) return;
    setApiKeyLoading(environment);
    setApiKeyError("");
    try {
      const response = await postApi(`/clients/${setupClient.id}/api-keys`, {
        name: environment === "SANDBOX" ? "Sandbox" : apiKeyForm.name.trim() || "Default",
        environment,
      });
      const created = response.data ?? response;
      setApiKeyResult({ ...created, environment: created.environment || environment });
      await loadOnboarding(setupClient.id);
    } catch (err) {
      setApiKeyError(err.message || "Failed to create API key.");
    } finally {
      setApiKeyLoading(false);
    }
  }

  /**
   * Issue or refresh the portal invitation.
   *
   * The raw token is a one-time bearer secret: whoever holds it can set the password on this
   * client's portal account. It is therefore kept in component state ONLY — never localStorage,
   * never sessionStorage, never a query cache, never logged. Leaving or reloading the screen
   * drops it, which is why the warning below tells the operator to copy it now.
   */
  async function handleSendInvite(event) {
    event?.preventDefault?.();
    if (!setupClient?.id) return;
    const email = (inviteForm.email.trim() || activePortalUser?.email || "").trim();
    if (!email) {
      setInviteError("Email is required to send an invitation.");
      return;
    }
    setInviteBusy(true);
    setInviteError("");
    try {
      const body = { email };
      const name = inviteForm.name.trim();
      if (name) body.name = name;
      const response = await postApi(`/clients/${setupClient.id}/onboarding/admin`, body);
      const result = response.data ?? response;
      setInviteResult({
        token: result.inviteToken,
        expiresAt: result.inviteExpiresAt,
        reused: result.reused === true,
        email: result.user?.email || email,
        name: result.user?.name || name || null,
        invitePending: result.user?.invitePending !== false,
      });
      setInviteForm((prev) => ({ ...prev, password: "", confirmPassword: "" }));
      await loadOnboarding(setupClient.id);
    } catch (err) {
      setInviteError(err.message || "Failed to send invitation.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleCreatePortalLogin(event) {
    event?.preventDefault?.();
    if (!setupClient?.id) return;
    const email = (inviteForm.email.trim() || activePortalUser?.email || "").trim();
    const password = inviteForm.password;
    if (!email) {
      setInviteError("Email is required for portal login.");
      return;
    }
    if (!password || password.length < 8) {
      setInviteError("Password must be at least 8 characters.");
      return;
    }
    if (password !== inviteForm.confirmPassword) {
      setInviteError("Passwords do not match.");
      return;
    }
    setInviteBusy(true);
    setInviteError("");
    try {
      const response = await postApi(`/clients/${setupClient.id}/portal-users`, {
        email,
        password,
        name: inviteForm.name.trim() || undefined,
      });
      const result = response.data ?? response;
      setPortalCredentials({
        email: result.credentials?.email || email,
        password: result.credentials?.password || password,
        created: result.created !== false,
      });
      setInviteForm((prev) => ({
        ...prev,
        email: result.credentials?.email || email,
        password: "",
        confirmPassword: "",
      }));
      await loadOnboarding(setupClient.id);
    } catch (err) {
      setInviteError(err.message || "Failed to create portal login.");
    } finally {
      setInviteBusy(false);
    }
  }

  async function copyCredential(value, key) {
    if (!value || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(value);
      setCredentialsCopied(key);
      setTimeout(() => setCredentialsCopied((current) => (current === key ? "" : current)), 1500);
    } catch {
      // ignore
    }
  }

  async function handleActivate() {
    if (!setupClient?.id) return;
    setActivateBusy(true);
    setProvisionError("");
    try {
      const response = await postApi(`/clients/${setupClient.id}/onboarding/activate`);
      const result = response.data ?? response;
      setProvisionResult(result);
      setActivateBlockers(null);
      if (result.client) {
        setSetupClient(result.client);
        onClientUpdated?.(result.client);
      }
      await loadOnboarding(setupClient.id);
    } catch (err) {
      // A 409 from the gate carries details.activationBlockDetails — render those rather than the
      // joined one-line message, which is all the caller used to get.
      const details = err?.details?.activationBlockDetails || null;
      const plain = err?.details?.activationBlocks || null;
      if (details?.length) {
        setActivateBlockers(details);
      } else if (plain?.length) {
        setActivateBlockers(plain.map((message) => ({ code: "ACTIVATION_BLOCKED", message })));
      }
      setProvisionError(err.message || "Activation failed.");
    } finally {
      setActivateBusy(false);
    }
  }

  return (
    <PageLayout
      title={setupClient?.id ? `Setup — ${setupClient?.name || "Client"}` : "Add Client"}
      subtitle="Client setup, commercials, campaign assignment, review, then access and go-live."
      actions={
        <Button variant="secondary" onClick={onClose}>
          ← Back to clients
        </Button>
      }
    >
      <ClientIdentityBar
        client={setupClient}
        checklist={checklist}
        needsApi={needsApi}
        needsPortal={needsPortal}
        allottedCount={allottedCount}
        publishedCount={publishedCount}
      />

      <SetupStepper setupStep={setupStep} setSetupStep={setSetupStep} checklist={checklist} locked={!setupClient?.id} />

      {stateLoading && <p className="mb-4 text-sm text-slate-500">Loading onboarding state…</p>}
      {stateError && (
        <p className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{stateError}</p>
      )}

      {setupClient?.status === "PROSPECT" && setupStep >= 3 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Client stays <strong>PROSPECT</strong> until you provision and activate in the final step.
        </div>
      )}

      {setupStep === 1 && (
        <form className="space-y-4" onSubmit={handleSaveOrganisation}>
          {orgError && (
            <p className="rounded-[9px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{orgError}</p>
          )}

          <SectionCard
            flush
            title="Profile"
            description="Client ID is generated internally after save and is not shown in the main Clients directory."
          >
            <FormGrid>
              <FormRow label="Client Name">
                <Input required value={orgForm.name} onChange={(e) => setOrgForm((p) => ({ ...p, name: e.target.value }))} />
              </FormRow>
              <FormRow label="Industry">
                <Input value={orgForm.industry} onChange={(e) => setOrgForm((p) => ({ ...p, industry: e.target.value }))} />
              </FormRow>
              <FormRow label="Country">
                <Select
                  value={orgForm.country}
                  onChange={(e) => setOrgForm((p) => ({ ...p, country: e.target.value }))}
                  options={[{ value: "", label: "Select…" }, ...COUNTRY_OPTIONS]}
                />
              </FormRow>
              <FormRow label="Client Type">
                <Input
                  value={orgForm.category}
                  placeholder="Category"
                  onChange={(e) => setOrgForm((p) => ({ ...p, category: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Sub-category">
                <Input
                  value={orgForm.subCategory}
                  onChange={(e) => setOrgForm((p) => ({ ...p, subCategory: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Currency">
                <Input value={orgForm.currency} onChange={(e) => setOrgForm((p) => ({ ...p, currency: e.target.value }))} />
              </FormRow>
              <FormRow label="Timezone">
                <Input value={orgForm.timezone} onChange={(e) => setOrgForm((p) => ({ ...p, timezone: e.target.value }))} />
              </FormRow>
              <FormRow label="Account Status">
                <StatusChip tone={setupClient?.status === "ACTIVE" ? "ready" : "pending"}>
                  {setupClient?.status || "PROSPECT"}
                </StatusChip>
              </FormRow>
            </FormGrid>
          </SectionCard>

          <SectionCard
            flush
            title="Agreement"
            actions={
              <StatusChip tone={orgForm.agreementStatus === "SIGNED" ? "ready" : "pending"}>
                {AGREEMENT_STATUS_OPTIONS.find((o) => o.value === orgForm.agreementStatus)?.label || "None"}
              </StatusChip>
            }
          >
            <FormGrid>
              <FormRow label="Agreement Status">
                <Select
                  value={orgForm.agreementStatus}
                  onChange={(e) => setOrgForm((p) => ({ ...p, agreementStatus: e.target.value }))}
                  options={AGREEMENT_STATUS_OPTIONS}
                />
              </FormRow>
              <FormRow label="Effective Date">
                <Input
                  type="date"
                  value={orgForm.agreementEffectiveAt}
                  onChange={(e) => setOrgForm((p) => ({ ...p, agreementEffectiveAt: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Renewal Date">
                <Input
                  type="date"
                  value={orgForm.agreementRenewalAt}
                  onChange={(e) => setOrgForm((p) => ({ ...p, agreementRenewalAt: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Document">
                <Input
                  type="url"
                  placeholder="https://…"
                  value={orgForm.agreementDocumentUrl}
                  onChange={(e) => setOrgForm((p) => ({ ...p, agreementDocumentUrl: e.target.value }))}
                />
              </FormRow>
            </FormGrid>
            {orgForm.agreementStatus !== "SIGNED" && (
              <Notice>
                Activation requires agreement status <strong>Signed</strong>.
              </Notice>
            )}
          </SectionCard>

          <SectionCard flush title="Delivery Method">
            <FormGrid>
              <FormRow label="Delivery Mode">
                <Select
                  value={orgForm.deliveryMethod}
                  onChange={(e) => setOrgForm((p) => ({ ...p, deliveryMethod: e.target.value }))}
                  options={DELIVERY_METHOD_OPTIONS}
                />
              </FormRow>
              <FormRow label="Required Access">
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip tone={orgForm.deliveryMethod !== "PORTAL_ONLY" ? "info" : "neutral"}>
                    API {orgForm.deliveryMethod !== "PORTAL_ONLY" ? "Required" : "Not Required"}
                  </StatusChip>
                  <StatusChip tone={orgForm.deliveryMethod !== "API_ONLY" ? "info" : "neutral"}>
                    Portal {orgForm.deliveryMethod !== "API_ONLY" ? "Required" : "Not Required"}
                  </StatusChip>
                </div>
              </FormRow>
            </FormGrid>
          </SectionCard>

          {/*
            Payment cycle and trigger sit here rather than under Commercials as the reference has
            them, because they are written by PATCH /clients/:id together with the fields above,
            while the commercial model is written by a different endpoint in the next step.
          */}
          <SectionCard
            flush
            title="Payment Terms"
            description="Saved with the client profile. Commission share is configured in step 2."
          >
            <FormGrid>
              <FormRow label="Payment Cycle">
                <Select
                  value={orgForm.paymentCycle}
                  onChange={(e) => setOrgForm((p) => ({ ...p, paymentCycle: e.target.value }))}
                  options={PAYMENT_CYCLE_OPTIONS}
                />
              </FormRow>
              <FormRow label="Payment Trigger">
                <Select
                  value={orgForm.paymentTrigger}
                  onChange={(e) => setOrgForm((p) => ({ ...p, paymentTrigger: e.target.value }))}
                  options={PAYMENT_TRIGGER_OPTIONS}
                />
              </FormRow>
            </FormGrid>
            <FooterActions note="Client stays PROSPECT until the activation gate is satisfied.">
              <PrimaryButton loading={orgBusy}>
                Save Setup
              </PrimaryButton>
            </FooterActions>
          </SectionCard>
        </form>
      )}

      {setupStep === 2 && (
        <div className="space-y-4">
          {commercialError && (
            <p className="rounded-[9px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {commercialError}
            </p>
          )}

          <SectionCard
            flush
            title="Commercials"
            description="The client share applies to approved supplier commission, not customer order value."
            actions={
              <StatusChip tone={checklist.commercialConfigured ? "ready" : "pending"}>
                {checklist.commercialConfigured ? "Configured" : "Not configured"}
              </StatusChip>
            }
          >
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {COMMERCIAL_OPTIONS.map((option) => {
                const selected = selectedCommercial === option.value;
                const clientShare =
                  option.value === "OFFERS_ONLY"
                    ? 0
                    : Number.isFinite(Number(clientShareInput))
                      ? Number(clientShareInput)
                      : option.defaultClientShare;
                return (
                  <div
                    key={option.value}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedCommercial(option.value);
                      if (option.value === "OFFERS_ONLY") {
                        setClientShareInput("0");
                      } else if (clientShareInput === "0" || !clientShareInput) {
                        setClientShareInput(String(option.defaultClientShare));
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedCommercial(option.value);
                      }
                    }}
                    className={`rounded-lg border p-4 text-left transition ${
                      selected ? "border-[#8db2ff] bg-[#eef4ff]" : "border-[#dfe6ee] bg-white hover:border-[#8db2ff]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold">{option.title}</h3>
                      {selected ? <StatusChip tone="info">Selected</StatusChip> : null}
                    </div>
                    <p className="mt-1.5 text-xs text-[#667085]">{option.description}</p>
                    {/*
                      Client share only. The MBO side is derived internally by the backend and is
                      neither displayed nor persisted from this screen.
                    */}
                    <div className="mt-3 rounded-md border border-[#dfe6ee] bg-white px-2.5 py-2">
                      <div className="text-[10px] font-extrabold uppercase tracking-[.03em] text-[#667085]">
                        Client Share
                      </div>
                      <div className="mt-1">
                        {option.editable && selected ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.01}
                              value={clientShareInput}
                              disabled={commercialBusy}
                              onChange={(e) => setClientShareInput(e.target.value)}
                              className="h-9 w-full rounded-[7px] border border-[#dfe6ee] bg-white px-2 text-sm font-semibold focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                              aria-label="Client share percent"
                            />
                            <span className="shrink-0 font-semibold text-[#344054]">%</span>
                          </div>
                        ) : (
                          <span className="text-[21px] font-bold leading-tight">{clientShare}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <FormGrid>
              <FormRow label="Payment Cycle">
                {PAYMENT_CYCLE_OPTIONS.find((o) => o.value === (setupClient?.paymentCycle || ""))?.label || "—"}
              </FormRow>
              <FormRow label="Payment Trigger">
                {PAYMENT_TRIGGER_OPTIONS.find((o) => o.value === (setupClient?.paymentTrigger || ""))?.label || "—"}
              </FormRow>
            </FormGrid>

            <FooterActions note="Commission rules are re-synced for existing assignments when the model changes.">
              <PrimaryButton
                loading={commercialBusy}
                onClick={() => handleSelectCommercial(selectedCommercial)}
              >
                Save Commercials
              </PrimaryButton>
            </FooterActions>
          </SectionCard>
        </div>
      )}

      {setupStep === 3 && (
        <div className="space-y-3.5">
          {/* .clientbar — which client is being distributed to, and whether it is eligible. */}
          <div className="rounded-[9px] border border-[#dfe6ee] bg-white px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0">
                <span className="block text-[10px] font-extrabold uppercase tracking-[.05em] text-[#667085]">
                  Client
                </span>
                <span className="text-sm font-[650]">{setupClient?.name || "—"}</span>
              </div>
              <div className="flex flex-wrap gap-2 pb-0.5">
                <StatusChip tone={setupClient?.agreementStatus === "SIGNED" ? "ready" : "pending"}>
                  {setupClient?.agreementStatus === "SIGNED" ? "Agreement Signed" : "Agreement Pending"}
                </StatusChip>
                <StatusChip tone={checklist.commercialConfigured ? "ready" : "pending"}>
                  {checklist.commercialConfigured ? "Commercials Configured" : "Commercials Pending"}
                </StatusChip>
                <StatusChip tone={setupClient?.status === "OFFBOARDED" ? "bad" : "ready"}>
                  {setupClient?.status === "OFFBOARDED" ? "Account Ineligible" : "Account Eligible"}
                </StatusChip>
              </div>
            </div>
          </div>

          {/* .campaign-tabs */}
          <div className="flex flex-wrap gap-1.5">
            {[
              ["available", "Available Campaigns"],
              ["assigned", `Assigned Campaigns (${allottedCount})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setCampaignTab(key)}
                className={`rounded-[7px] border px-3 py-2.5 text-sm font-bold transition ${
                  campaignTab === key
                    ? "border-[#8db2ff] bg-[#eef4ff] text-[#1d4ed8]"
                    : "border-[#dfe6ee] bg-white text-[#475467] hover:border-[#8db2ff]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {campaignTab === "available" ? (
            <div className="space-y-3.5">
              <SectionCard
                flush
                title="Available Campaigns"
                description="Only assignment-ready campaigns are selectable. Supplier identity, source selection and raw supplier URLs stay internal to MBO."
                actions={
                  <PrimaryButton
                    loading={allotBusy}
                    disabled={selectedCount === 0}
                    onClick={handleAllotSelected}
                  >
                    Assign Selected ({selectedCount})
                  </PrimaryButton>
                }
              >
                {/* .filters — sits inside the panel, above the table. */}
                <div className="flex flex-wrap gap-2.5 border-b border-[#dfe6ee] bg-[#fbfcfd] px-4 py-3">
                  <div className="min-w-[145px] flex-1">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[.05em] text-[#667085]">
                      Campaign Type
                    </span>
                    <Select
                      value={allotFilters.codeType}
                      onChange={(e) => setAllotFilters((p) => ({ ...p, codeType: e.target.value }))}
                      options={[
                        { value: "all", label: "All types" },
                        { value: "code", label: "Code" },
                        { value: "link", label: "Link" },
                        { value: "both", label: "Both" },
                      ]}
                    />
                  </div>
                  <div className="min-w-[145px] flex-1">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[.05em] text-[#667085]">
                      Assignment Ready
                    </span>
                    <Select
                      value={allotFilters.campaignStatus}
                      onChange={(e) => setAllotFilters((p) => ({ ...p, campaignStatus: e.target.value }))}
                      options={[
                        { value: "Active", label: "Ready only" },
                        { value: "Paused", label: "Paused only" },
                        { value: "all", label: "All statuses" },
                      ]}
                    />
                  </div>
                  <div className="min-w-[230px] flex-[2]">
                    <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[.05em] text-[#667085]">
                      Search
                    </span>
                    <Input
                      value={allotFilters.search}
                      onChange={(e) => setAllotFilters((p) => ({ ...p, search: e.target.value }))}
                      placeholder="Brand or campaign"
                    />
                  </div>
                </div>

                <div className="px-4 py-3 text-xs text-[#667085]">
                  <strong>Client commission</strong> for every campaign assigned here is derived from this
                  client&apos;s commercial model
                  {setupClient?.commercialModel === "OFFERS_PLUS_COMMISSION"
                    ? ` — ${Number(setupClient?.clientSharePercent ?? onboarding?.clientSharePercent ?? 0)}% of approved supplier commission.`
                    : setupClient?.commercialModel === "OFFERS_ONLY"
                      ? " — Offers Only, no commission share."
                      : " — not configured yet."}{" "}
                  The <em>Supplier Commission</em> column is the network&apos;s own rate, not the client-payable
                  amount.
                </div>

                {allotError && (
                  <p className="mx-4 mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {allotError}
                  </p>
                )}
                {allotSuccess && (
                  <p className="mx-4 mb-3 rounded-lg border border-[#a9e7c7] bg-[#f2fbf6] px-3 py-2 text-sm text-[#05603a]">
                    {allotSuccess}
                  </p>
                )}

                <DataTable
                  columns={allotmentColumns}
                  rows={couponRows}
                  loading={couponsLoading}
                  error={couponsError}
                  onRetry={reloadCoupons}
                  onRefresh={reloadCoupons}
                  page={couponPage}
                  totalPages={couponPagination.totalPages || 1}
                  total={couponPagination.total ?? couponRows.length}
                  onPageChange={setCouponPage}
                  dense
                  emptyTitle="No available campaigns"
                  emptyDescription="No campaigns match these filters."
                  rowClassName={(row) => (selectedIds.has(row.id) ? "bg-[#eef4ff]" : "")}
                  toolbar={
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-[#667085]">
                        {couponRows.length} available campaign{couponRows.length === 1 ? "" : "s"}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={!couponRows.length}
                        onClick={() => toggleAllVisible(!allPageSelected)}
                      >
                        {allPageSelected ? "Clear page" : "Select all on page"}
                      </Button>
                    </div>
                  }
                />

                <FooterActions
                  note={`${selectedCount} campaign${selectedCount === 1 ? "" : "s"} selected. Assigning creates draft assignments; nothing is published until you provision.`}
                >
                  <Button variant="secondary" onClick={() => setCampaignTab("assigned")} disabled={allottedCount === 0}>
                    View Assigned Campaigns ({allottedCount})
                  </Button>
                </FooterActions>
              </SectionCard>
            </div>
          ) : (
            <SectionCard
              flush
              title="Assigned Campaigns"
              description="Draft and published assignments for this client. Internal source and coupon-pool logic is not client-facing."
            >
              {allottedCount === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[#667085]">
                  No campaigns assigned yet. Select campaigns in Available Campaigns and click Assign Selected.
                </p>
              ) : (
                <div className="overflow-auto">
                  {/* .data — 11px uppercase headers, 12px nowrap cells. */}
                  <table className="w-full min-w-[1100px] border-collapse">
                    <thead>
                      <tr>
                        {[
                          "Brand",
                          "Campaign",
                          "Coupon Code",
                          "MBO Tracking Link",
                          "Link Status",
                          "Gross Orders",
                          "Net Orders",
                          "Publish Status",
                          "Visibility",
                        ].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap border-b border-[#dfe6ee] bg-[#f8fafc] px-2.5 py-2.5 text-left text-[11px] font-semibold text-[#475467]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeAssignments.map((row) => {
                        const coupon = row.couponAssignments?.[0];
                        const link = row.trackingLinks?.find((t) => t.isPrimary) || row.trackingLinks?.[0];
                        return (
                          <tr key={row.id}>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5 text-xs">
                              {row.canonicalCampaign?.merchant?.displayName || row.canonicalCampaign?.merchantId || "—"}
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5 text-xs font-[650]">
                              {row.canonicalCampaign?.displayName ?? row.canonicalCampaignId}
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5 font-mono text-[11px] text-[#475467]">
                              {coupon?.clientCouponCode || "—"}
                            </td>
                            <td className="max-w-[280px] border-b border-[#edf1f5] px-2.5 py-2.5">
                              {link?.mboTrackingUrl ? (
                                <UrlCell url={link.mboTrackingUrl} tone="indigo" />
                              ) : (
                                <span className="text-xs text-[#98a2b3]">Generated on provision</span>
                              )}
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5">
                              <StatusChip tone={link?.mboTrackingUrl ? "ready" : "pending"}>
                                {link?.mboTrackingUrl ? link.status || "Active" : "Pending"}
                              </StatusChip>
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5 text-xs tabular-nums">
                              {formatOrders(row.grossOrders)}
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5 text-xs tabular-nums">
                              {formatOrders(row.netOrders)}
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5">
                              <StatusChip tone={row.published ? "ready" : "neutral"}>
                                {row.published ? "Published" : "Draft"}
                              </StatusChip>
                            </td>
                            <td className="whitespace-nowrap border-b border-[#edf1f5] px-2.5 py-2.5">
                              <StatusChip tone={row.published ? "ready" : "neutral"}>
                                {row.published ? "Visible" : "Hidden"}
                              </StatusChip>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <FooterActions note="Assignments stay in draft until the client is provisioned in step 5.">
                <Button variant="secondary" onClick={() => setCampaignTab("available")}>
                  Back to available
                </Button>
                <PrimaryButton disabled={allottedCount === 0} onClick={() => setSetupStep(4)}>
                  Continue to Review
                </PrimaryButton>
              </FooterActions>
            </SectionCard>
          )}
        </div>
      )}

      {setupStep === 4 && (
        <div className="space-y-3.5">
          {/* .assignment-summary — four tiles over the review panel, all counted from real rows. */}
          <SummaryTiles
            items={[
              { label: "Assigned Campaigns", value: allottedCount },
              { label: "Draft Assignments", value: allottedCount - publishedCount },
              { label: "MBO Links Created", value: trackingLinkCount },
              { label: "Blocking Issues", value: activationBlockers.length },
            ]}
          />

          <SectionCard
            flush
            title="Review"
            description="Confirm the client-facing setup before provisioning. Nothing on this step issues a key or sends an invitation."
          >
            <FormGrid>
              <FormRow label="Client Name">{setupClient?.name || "—"}</FormRow>
              <FormRow label="Country">{setupClient?.country || "—"}</FormRow>
              <FormRow label="Delivery Mode">
                {DELIVERY_METHOD_OPTIONS.find((o) => o.value === deliveryMethod)?.label || deliveryMethod}
              </FormRow>
              <FormRow label="Account Status">
                <StatusChip tone={setupClient?.status === "ACTIVE" ? "ready" : "pending"}>
                  {setupClient?.status || "PROSPECT"}
                </StatusChip>
              </FormRow>
              <FormRow label="Agreement Status">
                <StatusChip tone={setupClient?.agreementStatus === "SIGNED" ? "ready" : "pending"}>
                  {AGREEMENT_STATUS_OPTIONS.find((o) => o.value === (setupClient?.agreementStatus || "NONE"))?.label ||
                    "None"}
                </StatusChip>
              </FormRow>
              <FormRow label="Effective Date">
                {setupClient?.agreementEffectiveAt ? formatDateShort(setupClient.agreementEffectiveAt) : "—"}
              </FormRow>
              <FormRow label="Commercial Model">
                {setupClient?.commercialModel === "OFFERS_PLUS_COMMISSION"
                  ? "Offers + Commission"
                  : setupClient?.commercialModel === "OFFERS_ONLY"
                    ? "Offers Only"
                    : "Not configured"}
              </FormRow>
              <FormRow label="Client Share">
                {setupClient?.commercialModel
                  ? `${Number(setupClient?.clientSharePercent ?? onboarding?.clientSharePercent ?? 0)}%`
                  : "—"}
              </FormRow>
              <FormRow label="Payment Cycle">
                {PAYMENT_CYCLE_OPTIONS.find((o) => o.value === (setupClient?.paymentCycle || ""))?.label || "—"}
              </FormRow>
              <FormRow label="Payment Trigger">
                {PAYMENT_TRIGGER_OPTIONS.find((o) => o.value === (setupClient?.paymentTrigger || ""))?.label || "—"}
              </FormRow>
            </FormGrid>
          </SectionCard>

          {/* .checks — the reference's validation grid, driven by the backend checklist. */}
          <SectionCard
            flush
            title="Pre-Provision Validation"
            description="Reported by the backend onboarding state. Provisioning in step 5 is what resolves the pending rows."
          >
            <div className="grid gap-2.5 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
              <RequirementCard
                label="Campaigns"
                status={checklist.campaignsAllotted ? "Ready" : "Needs Attention"}
                detail={`${allottedCount} campaign${allottedCount === 1 ? "" : "s"} assigned to this client.`}
              />
              <RequirementCard
                label="Coupon / Asset"
                status={checklist.couponAssignmentsPrepared ? "Ready" : "Needs Attention"}
                detail="Required coupon assignments prepared."
              />
              <RequirementCard
                label="Commercial"
                status={checklist.commissionRulesPrepared ? "Ready" : "Needs Attention"}
                detail="Client commission rules resolved for every assignment."
              />
              <RequirementCard
                label="Tracking"
                status={checklist.trackingLinksGenerated ? "Ready" : "Needs Attention"}
                detail="MBO tracking link created for every assignment."
              />
              <RequirementCard
                label="Publishing"
                status={checklist.assignmentsPublished ? "Ready" : "Needs Attention"}
                detail="At least one assignment published and client-visible."
              />
              <RequirementCard
                label="API access"
                status={needsApi ? (checklist.apiKeyIssued ? "Ready" : "Needs Attention") : "Not Required"}
                detail={
                  needsApi
                    ? "A Production API key is required for this delivery method."
                    : "Not required by this delivery method."
                }
              />
              <RequirementCard
                label="Portal access"
                status={needsPortal ? (checklist.administratorConfigured ? "Ready" : "Needs Attention") : "Not Required"}
                detail={
                  needsPortal
                    ? "An active portal administrator is required for this delivery method."
                    : "Not required by this delivery method."
                }
              />
            </div>
            <FooterActions note="Provisioning and activation happen in the next step.">
              <Button variant="secondary" onClick={() => setSetupStep(3)}>
                Back to Campaigns
              </Button>
              <PrimaryButton disabled={allottedCount === 0} onClick={() => setSetupStep(5)}>
                Continue to Access &amp; Go Live
              </PrimaryButton>
            </FooterActions>
          </SectionCard>

          {/*
            .safegrid — the reference's client-safe field dictionary, kept as a collapsed reference
            so an operator can check the disclosure boundary without leaving the wizard.
          */}
          <details className="rounded-[9px] border border-[#dfe6ee] bg-white">
            <summary className="cursor-pointer px-4 py-3.5 text-base font-semibold">
              Client-safe campaign fields
            </summary>
            <div className="border-t border-[#dfe6ee]">
              <p className="px-4 py-3 text-xs text-[#667085]">
                After publication the client receives only these fields. Network identity, source selection, coupon-pool
                inventory, raw supplier links and MBO margin are never delivered.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr]">
                {CLIENT_SAFE_FIELDS.map(([field, meaning]) => (
                  <Fragment key={field}>
                    <div className="border-b border-[#edf1f5] bg-[#fbfcfd] px-3 py-2.5 text-xs text-[#667085]">
                      {field}
                    </div>
                    <div className="border-b border-[#edf1f5] px-3 py-2.5 text-xs">{meaning}</div>
                  </Fragment>
                ))}
              </div>
            </div>
          </details>
        </div>
      )}

      {setupStep === 5 && (
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Access &amp; Go Live</h2>
            <p className="mt-1 text-sm text-slate-500">
              Prepare the access the delivery method requires, provision the assigned campaigns, then activate.
            </p>
          </div>

          {provisionError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {provisionError}
            </p>
          )}

          {/* A — PORTAL ACCESS. API_ONLY clients need no portal administrator, so the section is
              hidden rather than shown as a step that cannot be satisfied. */}
          {needsPortal && (
            <section className="space-y-4">
              <SectionCard
                title="Portal access"
                description="Invite the client administrator to set their own password on the client portal."
                actions={
                  <StatusChip
                    tone={
                      activePortalUser && !activePortalUser.invitePending
                        ? "ready"
                        : activePortalUser
                          ? "pending"
                          : "neutral"
                    }
                  >
                    {activePortalUser && !activePortalUser.invitePending
                      ? "Accepted"
                      : activePortalUser
                        ? "Invite pending"
                        : "Not invited"}
                  </StatusChip>
                }
              >
                {activePortalUser ? (
                  <div className="mb-4 grid gap-x-6 sm:grid-cols-2">
                    <SummaryRow label="Administrator">{activePortalUser.name || "—"}</SummaryRow>
                    <SummaryRow label="Email">{activePortalUser.email}</SummaryRow>
                    <SummaryRow label="Invite status">
                      {activePortalUser.invitePending ? "Pending — not yet accepted" : "Accepted"}
                    </SummaryRow>
                    <SummaryRow label="Access status">
                      {activePortalUser.isActive ? "Active" : "Inactive"}
                    </SummaryRow>
                  </div>
                ) : (
                  <p className="mb-4 text-sm text-slate-500">
                    No portal administrator yet. Send an invitation below.
                  </p>
                )}

                <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleSendInvite}>
                  <Input
                    label="Invite email *"
                    type="email"
                    value={inviteForm.email || activePortalUser?.email || ""}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="Administrator email"
                  />
                  <Input
                    label="Invite name"
                    value={inviteForm.name}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Administrator name"
                  />
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                    <PrimaryButton loading={inviteBusy}>
                      {activePortalUser ? "Reissue Invitation" : "Send Invitation"}
                    </PrimaryButton>
                    <span className="text-xs text-amber-800">
                      Reissuing an invitation invalidates the previous invitation link.
                    </span>
                  </div>
                  {inviteError ? <p className="sm:col-span-2 text-sm text-rose-600">{inviteError}</p> : null}
                </form>

                {inviteResult ? (
                  <div className="mt-4">
                    <InviteReveal result={inviteResult} onDismiss={() => setInviteResult(null)} />
                  </div>
                ) : null}

                {/*
                  Legacy compatibility only. The backend still exposes POST /clients/:id/portal-users,
                  where the operator chooses the password instead of the client. It is kept so the
                  capability is not removed, but it is collapsed and visually secondary — the invite
                  above is the supported route.
                */}
                <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-600">
                    Advanced / Legacy access
                  </summary>
                  <div className="border-t border-slate-200 p-3">
                    <p className="mb-3 text-xs text-slate-500">
                      Sets a password on the client&apos;s behalf rather than inviting them to choose one. Use only
                      when an invitation cannot be delivered.
                    </p>
                    <form className="grid gap-3 sm:grid-cols-2" onSubmit={handleCreatePortalLogin}>
                      <Input
                        label="Portal login email *"
                        type="email"
                        required={!activePortalUser}
                        value={inviteForm.email || activePortalUser?.email || ""}
                        onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                        placeholder="Administrator email"
                        className="sm:col-span-2"
                      />
                      <Input
                        label="Name (optional)"
                        value={inviteForm.name}
                        onChange={(e) => setInviteForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Contact name"
                        className="sm:col-span-2"
                      />
                      <Input
                        label="Password *"
                        type="password"
                        required
                        minLength={8}
                        value={inviteForm.password}
                        onChange={(e) => setInviteForm((prev) => ({ ...prev, password: e.target.value }))}
                        placeholder="Min. 8 characters"
                      />
                      <Input
                        label="Confirm password *"
                        type="password"
                        required
                        minLength={8}
                        value={inviteForm.confirmPassword}
                        onChange={(e) => setInviteForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                        placeholder="Re-enter password"
                      />
                      <div className="sm:col-span-2">
                        <Button type="submit" variant="secondary" loading={inviteBusy}>
                          {checklist.administratorConfigured && !activePortalUser?.invitePending
                            ? "Reset portal password"
                            : "Save portal login"}
                        </Button>
                      </div>
                    </form>

                    {portalCredentials?.email && portalCredentials?.password ? (
                      <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                        <p className="font-medium">
                          Give these credentials to the client. The password is shown once on this screen.
                        </p>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-16 shrink-0 text-xs font-medium text-amber-800">Email</span>
                          <code className="min-w-0 flex-1 truncate font-mono text-xs">{portalCredentials.email}</code>
                          <button
                            type="button"
                            onClick={() => copyCredential(portalCredentials.email, "email")}
                            className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                          >
                            {credentialsCopied === "email" ? "Copied" : "Copy"}
                          </button>
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-16 shrink-0 text-xs font-medium text-amber-800">Password</span>
                          <code className="min-w-0 flex-1 truncate font-mono text-xs">{portalCredentials.password}</code>
                          <button
                            type="button"
                            onClick={() => copyCredential(portalCredentials.password, "password")}
                            className="shrink-0 rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                          >
                            {credentialsCopied === "password" ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </details>
              </SectionCard>
            </section>
          )}

          {/* B — API ACCESS. PORTAL_ONLY clients need no API credential and the gate does not ask
              for one, so the section is hidden entirely. */}
          {needsApi && (
            <section className="space-y-4">
              <SectionCard
                title="Sandbox API"
                description="Integration testing environment. Credentials are separate from Production."
                actions={
                  <>
                    <StatusChip tone="info">Recommended</StatusChip>
                    <StatusChip tone={hasSandboxKey ? "ready" : "neutral"}>
                      {hasSandboxKey ? "Active" : "Not created"}
                    </StatusChip>
                  </>
                }
              >
                <p className="mb-3 text-xs text-slate-600">
                  Sandbox integration testing is recommended before go-live. It is <strong>not</strong> an activation
                  blocker — the activation gate reports it as a recommendation only.
                </p>

                {revealedSandboxKey?.apiKey ? (
                  <ApiKeyReveal
                    apiKey={revealedSandboxKey.apiKey}
                    warning={revealedSandboxKey.warning || "Sandbox key — shown once. Copy it now."}
                  />
                ) : null}

                {sandboxKeys.length > 0 ? (
                  <FormGrid>
                    <FormRow label="Environment Status">
                      <StatusChip tone="ready">Active</StatusChip>
                    </FormRow>
                    <FormRow label="API Key Status">
                      <StatusChip tone="ready">Active</StatusChip>
                    </FormRow>
                    {sandboxKeys.map((key) => (
                      <FormRow key={key.id} label={key.name || "Sandbox API Key"} full>
                        <SecretBox keyPrefix={key.keyPrefix} />
                      </FormRow>
                    ))}
                  </FormGrid>
                ) : (
                  <div className="px-4 pb-4">
                    <Button
                      variant="secondary"
                      loading={apiKeyLoading === "SANDBOX"}
                      onClick={(event) => handleCreateApiKey(event, "SANDBOX")}
                    >
                      Create Sandbox Key
                    </Button>
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Production API"
                description="Live client API over published, client-safe campaigns."
                actions={
                  <StatusChip tone={hasActiveApiKey ? "ready" : "pending"}>
                    {hasActiveApiKey ? "Active" : "Not issued"}
                  </StatusChip>
                }
              >
                <p className="mb-3 text-xs text-slate-500">
                  Serves this client&apos;s published campaigns (<code className="text-[11px]">GET /partner/v1/campaigns</code>).
                  The full key is shown once, at creation — it can never be read back.
                </p>

                {revealedProductionKey?.apiKey ? (
                  <ApiKeyReveal apiKey={revealedProductionKey.apiKey} warning={revealedProductionKey.warning} />
                ) : null}

                {productionKeys.length > 0 ? (
                  <>
                    <FormGrid>
                      <FormRow label="Environment Status">
                        <StatusChip tone="ready">Active</StatusChip>
                      </FormRow>
                      <FormRow label="API Key Status">
                        <StatusChip tone="ready">Active</StatusChip>
                      </FormRow>
                      {productionKeys.map((key) => (
                        <FormRow key={key.id} label={key.name || "Production API Key"} full>
                          <SecretBox keyPrefix={key.keyPrefix} />
                        </FormRow>
                      ))}
                    </FormGrid>
                    {!revealedProductionKey?.apiKey ? (
                      <p className="px-4 py-3 text-xs text-[#667085]">
                        The full secret cannot be shown again — create a new key only after revoking the current one.
                      </p>
                    ) : null}
                  </>
                ) : null}

                {!hasActiveApiKey ? (
                  <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={handleCreateApiKey}>
                    <Input
                      label="Key name"
                      value={apiKeyForm.name}
                      onChange={(e) => setApiKeyForm((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder="Default"
                    />
                    <Button type="submit" variant="secondary" loading={apiKeyLoading === "PRODUCTION"}>
                      Create production key
                    </Button>
                  </form>
                ) : null}

                {apiKeyError ? <p className="mt-2 text-sm text-rose-600">{apiKeyError}</p> : null}
              </SectionCard>
            </section>
          )}

          {/* C — PROVISIONING */}
          <SectionCard
            flush
            title="Provisioning"
            description="Prepares coupon assignments, commission rules and MBO tracking links, then publishes."
            actions={
              <StatusChip tone={checklist.provisioned && checklist.assignmentsPublished ? "ready" : "pending"}>
                {checklist.provisioned && checklist.assignmentsPublished ? "Provisioned" : "Not provisioned"}
              </StatusChip>
            }
          >
            <div className="grid gap-2.5 px-4 py-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [`Campaigns assigned (${allottedCount})`, checklist.campaignsAllotted],
                ["Coupon assignments prepared", checklist.couponAssignmentsPrepared],
                ["Commission rules prepared", checklist.commissionRulesPrepared],
                ["Tracking links generated", checklist.trackingLinksGenerated],
                ["Assignments published", checklist.assignmentsPublished],
              ].map(([label, done]) => (
                <div
                  key={label}
                  className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-xs ${
                    done ? "border-[#a9e7c7] bg-[#f2fbf6]" : "border-[#dfe6ee] bg-white"
                  }`}
                >
                  <span className="font-[650]">{label}</span>
                  <StatusChip tone={done ? "ready" : "neutral"}>{done ? "Passed" : "Pending"}</StatusChip>
                </div>
              ))}
            </div>
            <FooterActions note="Provisioning is idempotent — re-running it only fills the gaps.">
              <PrimaryButton
                loading={provisionBusy}
                disabled={checklist.provisioned && checklist.assignmentsPublished}
                onClick={handleProvision}
              >
                {checklist.provisioned ? "Re-run provision (idempotent)" : "Provision Access"}
              </PrimaryButton>
            </FooterActions>

          </SectionCard>

          <ProvisionOutcome result={provisionResult} />

          {/*
            D — ACTIVATION REVIEW. Rendered from the backend gate: activationBlockDetails is what
            the gate itself evaluates, so a blocker can never be missing here the way a hand-written
            list could. Advisory rows (SANDBOX_RECOMMENDED) are separated out by severity and do not
            disable the button below.
          */}
          <ActivationReadiness
            blockers={activationBlockers}
            recommendations={activationRecommendations}
            activated={checklist.activated}
            needsApi={needsApi}
            needsPortal={needsPortal}
            activateBusy={activateBusy}
            disabled={checklist.activated || activationBlockers.length > 0}
            onActivate={handleActivate}
          />
        </div>
      )}

    </PageLayout>
  );
}


// Props for the components introduced by this change, declared with the repository's
// dependency-free validators. `client` is declared too because the agreement, payment and
// delivery fields read from it here are new reads of an already-passed prop.
ActivationReadiness.propTypes = {
  blockers: optionalArray,
  recommendations: optionalArray,
  activated: optionalBool,
  needsApi: optionalBool,
  needsPortal: optionalBool,
  activateBusy: optionalBool,
  disabled: optionalBool,
  onActivate: optionalFunc,
};

FormGrid.propTypes = { children: optionalNode };
PrimaryButton.propTypes = {
  children: optionalNode,
  loading: optionalBool,
  disabled: optionalBool,
  className: optionalString,
};
FormRow.propTypes = { label: optionalNode, children: optionalNode, mono: optionalBool, full: optionalBool };
KpiStrip.propTypes = { items: optionalArray };
SummaryTiles.propTypes = { items: optionalArray };
FooterActions.propTypes = { note: optionalNode, children: optionalNode };
Notice.propTypes = { children: optionalNode };
SecretBox.propTypes = { keyPrefix: optionalString, children: optionalNode };

StatusChip.propTypes = { tone: optionalString, children: optionalNode };

SectionCard.propTypes = {
  title: optionalNode,
  description: optionalNode,
  actions: optionalNode,
  children: optionalNode,
  className: optionalString,
  flush: optionalBool,
};

SummaryRow.propTypes = { label: optionalNode, children: optionalNode };

RequirementCard.propTypes = {
  label: optionalNode,
  status: optionalString,
  detail: optionalNode,
  code: optionalString,
};

ClientIdentityBar.propTypes = {
  client: optionalObject,
  checklist: optionalObject,
  needsApi: optionalBool,
  needsPortal: optionalBool,
  allottedCount: optionalNumber,
  publishedCount: optionalNumber,
};

ProvisionOutcome.propTypes = { result: optionalObject };

InviteReveal.propTypes = { result: optionalObject, onDismiss: optionalFunc };

ClientSetupWizard.propTypes = {
  client: optionalObject,
  initialStep: optionalNumber,
  onClose: optionalFunc,
  onClientUpdated: optionalFunc,
};
