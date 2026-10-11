import { Fragment, useMemo, useState } from "react";
import { RULE_MAX_PAGES, RULE_PAGE_SIZE, useCampaignCommissionRules } from "../../../../hooks/useCampaignCommissionRules";
import {
  optionalArray,
  optionalBool,
  optionalNode,
  optionalObject,
  optionalString,
  optionalStringOrNumber,
} from "../../../../utils/propValidators";
import { COMMISSION_RULES_PATH, toCommissionRuleView } from "../campaignContract";

/**
 * Campaign › Supplier Commission Rules — laid out to the v13 campaign workspace (.metric summary,
 * .note, .related-table). Each supplier / network commission outcome is its own
 * SupplierCommissionRule record and is shown as its own row; the "#" column only numbers rows for
 * reading. The campaign-level Campaign Commission is a summary and never the rule itself.
 *
 * Lookup (unchanged): GET /ops/admin/supplier-commission-rules?network=&q=<supplierCampaignId>, every
 * match page (bounded), via useCampaignCommissionRules. Rows carrying this campaign's SupplierCampaign
 * row id or CampaignSource id are AUTHORITATIVE; rows that only share the supplier-side campaign id
 * are RELATED (another network row), shown apart and never counted. Without commission:read the
 * reduced rule subset embedded in the campaign detail is shown instead.
 *
 * Commission types are the backend's canonical values (PERCENT, FIXED, CPC, CPA, CPS, CPL, TIER,
 * HYBRID, OTHER), displayed as returned; the network's own wording (rawCommissionType / basis) is
 * secondary evidence. The average shown in the summary is computed for display only, per
 * compatible unit, and is never stored, sent or used for payout.
 */

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
  purple: "border-[#d9d6fe] bg-[#f4f3ff] text-[#6941c6]",
};
const GREEN = new Set(["ACTIVE", "MAPPED", "YES", "COMPLETE", "PERSISTED"]);
const AMBER = new Set(["NEEDS_REVIEW", "VERIFY_LIVE", "UNPROVEN", "PROJECTED", "LINKED_RULES_ONLY", "PENDING"]);
const RED = new Set(["ERROR", "FAILED", "NO", "EXPIRED", "REJECTED"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";
const ACTION_BUTTON =
  "whitespace-nowrap rounded-[7px] border border-[#e4e7ec] bg-white px-2 py-[4px] text-[9.5px] font-extrabold text-[#101828] hover:bg-[#f8fafc] disabled:opacity-50";

function Muted({ children = "—", title }) {
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

function Mono({ value, title }) {
  if (value == null || value === "") return <Muted />;
  return (
    <span className="whitespace-nowrap font-mono text-[10px]" title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString };

/** Network wording, shown as secondary evidence (v13 .source-extra .keys). */
function SourceText({ children, title = "Network value as received (diagnostic)" }) {
  return (
    <span className="block font-mono text-[9px] leading-tight text-[#b54708]" title={title}>
      {children}
    </span>
  );
}
SourceText.propTypes = { children: optionalNode, title: optionalString };

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function DateValue({ value, empty = "—", emptyTitle }) {
  const text = formatDate(value);
  return text ? <span className="whitespace-nowrap">{text}</span> : <Muted title={emptyTitle}>{empty}</Muted>;
}
DateValue.propTypes = { value: optionalString, empty: optionalString, emptyTitle: optionalString };

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

/** v13 .summary-chip. */
function Chip({ label, value, title }) {
  return (
    <span title={title} className="whitespace-nowrap rounded-full border border-[#e4e7ec] bg-white px-[9px] py-[6px] text-[9px] text-[#475467]">
      {label} <b className="text-[#101828]">{value}</b>
    </span>
  );
}
Chip.propTypes = { label: optionalString, value: optionalNode, title: optionalString };

/** v13 .note (tone: info | warn | danger). */
function Note({ tone = "info", children }) {
  const tones = { info: "border-[#2457d6] bg-[#f8fafc]", warn: "border-[#b54708] bg-[#fffaeb]", danger: "border-[#b42318] bg-[#fef3f2]" };
  return <div className={`rounded-r-[7px] border-l-[3px] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467] ${tones[tone]}`}>{children}</div>;
}
Note.propTypes = { tone: optionalString, children: optionalNode };

/** v13 .empty-state. */
function EmptyState({ title, children }) {
  return (
    <div className="rounded-[9px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-[18px] text-center text-[11px] text-[#667085]">
      <b className="mb-1 block text-[#344054]">{title}</b>
      {children}
    </div>
  );
}
EmptyState.propTypes = { title: optionalString, children: optionalNode };

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

/* ── Value helpers ─────────────────────────────────────────────────────────── */

const toNumber = (value) => {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const trimNumber = (n) => String(Math.round(n * 100) / 100);
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const distinct = (values) => [...new Set(values.filter((v) => v != null && v !== ""))];

/** Rule value as returned; the embedded subset carries no commissionValue, so its own fields are shown. */
function ruleValueText(rule) {
  if (rule.commissionValue != null && rule.commissionValue !== "") return String(rule.commissionValue);
  const rate = toNumber(rule.ratePercent);
  if (rate != null) return `${trimNumber(rate)}%`;
  const fixed = toNumber(rule.fixedAmount);
  if (fixed != null) return trimNumber(fixed);
  return null;
}

/**
 * Display-only average per compatible unit. A rule counts as a percentage when it returns only
 * ratePercent, and as a fixed amount when it returns only fixedAmount; fixed amounts are grouped by
 * currency and canonical commission type, because a fixed CPC and a fixed CPA are not the same
 * unit. Rules with both or neither value are left out. One group → one average; several → Mixed.
 * The result is never stored or sent anywhere and is not a payout figure.
 */
function averageCommission(rules) {
  const groups = new Map();
  let excluded = 0;
  for (const rule of rules) {
    const rate = toNumber(rule.ratePercent);
    const fixed = toNumber(rule.fixedAmount);
    let key = null;
    let group = null;
    if (rate != null && fixed == null) {
      key = "percent";
      group = { unit: "percent", label: "Percentage rules" };
    } else if (fixed != null && rate == null) {
      const currency = rule.currency || null;
      const type = rule.commissionType || null;
      key = `fixed|${currency}|${type}`;
      group = { unit: "fixed", currency, type, label: `Fixed ${type || "(type not returned)"} · ${currency || "currency not returned"}` };
    }
    if (!key) {
      excluded += 1;
      continue;
    }
    if (!groups.has(key)) groups.set(key, { ...group, values: [] });
    groups.get(key).values.push(key === "percent" ? rate : fixed);
  }
  const summaries = [...groups.values()].map((g) => {
    const sum = g.values.reduce((a, b) => a + b, 0);
    const avg = sum / g.values.length;
    const min = Math.min(...g.values);
    const max = Math.max(...g.values);
    const fmt = (n) => (g.unit === "percent" ? `${trimNumber(n)}%` : `${trimNumber(n)}${g.currency ? ` ${g.currency}` : ""}`);
    return { ...g, count: g.values.length, average: fmt(avg), range: min === max ? fmt(min) : `${fmt(min)} – ${fmt(max)}` };
  });
  return { summaries, excluded, mixed: summaries.length > 1 };
}

/* ── Rule table ────────────────────────────────────────────────────────────── */

function CommissionType({ rule }) {
  return <Pill value={rule.commissionType} tone="purple" title="Canonical commission type (normalized by the backend)" />;
}
CommissionType.propTypes = { rule: optionalObject };

function RawType({ rule }) {
  const raw = rule.rawCommissionType ?? rule.supplierRuleType ?? null;
  if (!raw && !rule.basis) return <Muted />;
  return (
    <span className="block">
      {raw ? <SourceText>{raw}</SourceText> : null}
      {rule.basis && rule.basis !== raw ? <SourceText title="Rule basis as stored">basis: {rule.basis}</SourceText> : null}
    </span>
  );
}
RawType.propTypes = { rule: optionalObject };

function ConditionLines({ conditions, part }) {
  if (!Array.isArray(conditions) || !conditions.length) return <Muted>None</Muted>;
  return (
    <span className="block space-y-0.5">
      {conditions.map((c, i) => (
        <span key={c.id || i} className="block whitespace-nowrap">
          {part === "type" ? <Mono value={c.conditionType || "?"} /> : `${c.operator || "="} ${c.value ?? ""}`.trim()}
        </span>
      ))}
    </span>
  );
}
ConditionLines.propTypes = { conditions: optionalArray, part: optionalString };

function EvidenceField({ label, children }) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-2 border-b border-[#eef2f6] py-1.5">
      <span className="text-[9px] font-extrabold text-[#667085]">{label}</span>
      <div className="min-w-0 break-words text-[10.5px]">{children}</div>
    </div>
  );
}
EvidenceField.propTypes = { label: optionalString, children: optionalNode };

/** Rule detail / evidence: lineage and network wording. No raw payload body is ever shown. */
function RuleEvidence({ rule }) {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  const sourceConditions = conditions.filter((c) => c.sourceConditionType || c.sourceConditionValue);
  return (
    <div className="grid gap-x-6 bg-[#fbfcff] px-3 py-2 md:grid-cols-2">
      <div>
        <EvidenceField label="MBO rule id">
          <Mono value={rule.id} />
        </EvidenceField>
        <EvidenceField label="Source rule">
          {rule.sourceRuleName || rule.sourceRuleId ? (
            <>
              {rule.sourceRuleName || null} <Mono value={rule.sourceRuleId} />
            </>
          ) : (
            <Muted />
          )}
        </EvidenceField>
        <EvidenceField label="Source group">
          {rule.sourceGroupName || rule.sourceGroupId ? (
            <>
              {rule.sourceGroupName || null} <Mono value={rule.sourceGroupId} />
            </>
          ) : (
            <Muted />
          )}
        </EvidenceField>
        <EvidenceField label="Raw commission type">{rule.rawCommissionType ?? rule.supplierRuleType ? <SourceText>{rule.rawCommissionType ?? rule.supplierRuleType}</SourceText> : <Muted />}</EvidenceField>
        <EvidenceField label="Basis">{rule.basis ? <SourceText title="Rule basis as stored">{rule.basis}</SourceText> : <Muted />}</EvidenceField>
        <EvidenceField label="Source conditions">
          {sourceConditions.length ? (
            sourceConditions.map((c, i) => (
              <SourceText key={c.id || i}>
                {c.sourceConditionType || "?"}: {c.sourceConditionValue ?? ""}
              </SourceText>
            ))
          ) : (
            <Muted>None returned</Muted>
          )}
        </EvidenceField>
        <EvidenceField label="Outcome key">
          <Mono value={rule.outcomeKey} />
        </EvidenceField>
      </div>
      <div>
        <EvidenceField label="Supplier campaign row id">
          <Mono value={rule.supplierCampaignId} />
        </EvidenceField>
        <EvidenceField label="Supplier-side campaign id">
          <Mono value={rule.sourceCampaignId} />
        </EvidenceField>
        <EvidenceField label="Campaign source id">
          <Mono value={rule.campaignSourceId} />
        </EvidenceField>
        <EvidenceField label="Mapping">
          <Pill value={rule.mappingStatus} title="Mapping status" /> {rule.fieldMappingOutcome ? <Mono value={rule.fieldMappingOutcome} /> : null}
        </EvidenceField>
        <EvidenceField label="Rule version">
          <Mono value={rule.ruleVersion} />
        </EvidenceField>
        <EvidenceField label="Finance ready">
          {rule.financeReady == null ? <Muted /> : <Pill value={rule.financeReady ? "YES" : "NO"} />}
          {Array.isArray(rule.reviewReasons) && rule.reviewReasons.length ? (
            <span className="ml-1 font-mono text-[9.5px] text-[#b54708]">{rule.reviewReasons.join(", ")}</span>
          ) : null}
        </EvidenceField>
        <EvidenceField label="Persisted">
          {rule.projected == null ? <Muted /> : <Pill value={rule.projected ? "PROJECTED" : "PERSISTED"} />}
          {rule.projectionNote ? <span className="ml-1 text-[#667085]">{rule.projectionNote}</span> : null}
        </EvidenceField>
        <EvidenceField label="Campaign countries (context)">
          {Array.isArray(rule.campaignCountries) && rule.campaignCountries.length ? <Mono value={rule.campaignCountries.join(", ")} /> : <Muted />}
        </EvidenceField>
      </div>
    </div>
  );
}
RuleEvidence.propTypes = { rule: optionalObject };

const REGISTRY_COLUMNS = [
  { label: "Rule ID", field: "sourceRuleId · id", render: (r) => (
      <span className="block">
        <Mono value={r.sourceRuleId || r.id} title={r.sourceRuleId ? "Network rule id" : "MBO rule id (no network rule id returned)"} />
        {r.displayLabel ? <span className="block text-[9px] text-[#98a2b3]">{r.displayLabel} (backend label)</span> : null}
      </span>
    ) },
  { label: "Network Source", field: "networkSource", render: (r) => (
      <span className="block">
        <Mono value={r.networkSource} />
        {r.sourceAccountLabel ? <span className="block font-mono text-[9px] text-[#98a2b3]">{r.sourceAccountLabel}</span> : null}
      </span>
    ) },
  { label: "Commission Type", field: "commissionType", render: (r) => <CommissionType rule={r} /> },
  { label: "Value", field: "commissionValue", render: (r) => (ruleValueText(r) ? <b className="whitespace-nowrap">{ruleValueText(r)}</b> : <Muted>Not available</Muted>) },
  { label: "Currency", field: "currency", render: (r) => <Mono value={r.currency} /> },
  { label: "Condition Type", field: "conditions[].conditionType", render: (r) => <ConditionLines conditions={r.conditions} part="type" /> },
  { label: "Condition Value", field: "conditions[].value", render: (r) => <ConditionLines conditions={r.conditions} part="value" /> },
  { label: "Country", field: "country", render: (r) => (r.country ? <Mono value={r.country} /> : <Muted title="No rule-scoped country" />) },
  { label: "Category / Product / Goal", field: "categoryProductGoal", render: (r) => r.categoryProductGoal || <Muted /> },
  { label: "Customer Type", field: "customerType", render: (r) => r.customerType || <Muted /> },
  { label: "Coupon / Tier", field: "couponOrTier", render: (r) => r.couponOrTier || <Muted /> },
  { label: "Valid From", field: "effectiveFrom", render: (r) => <DateValue value={r.effectiveFrom} /> },
  { label: "Valid To", field: "effectiveUntil", render: (r) => <DateValue value={r.effectiveUntil} empty="Open-ended" /> },
  { label: "Status", field: "ruleStatus", render: (r) => <Pill value={r.ruleStatus} title="Rule status" /> },
  { label: "Source / Raw Type", field: "rawCommissionType · basis", render: (r) => <RawType rule={r} /> },
  { label: "Last Updated", field: "lastModifiedAt", render: (r) => <DateValue value={r.lastModifiedAt} /> },
];

const EMBEDDED_COLUMNS = [
  { label: "Rule ID", field: "id", render: (r) => <Mono value={r.id} title="MBO rule id" /> },
  { label: "Commission Type", field: "commissionType", render: (r) => <CommissionType rule={r} /> },
  { label: "Value", field: "ratePercent · fixedAmount", render: (r) => (ruleValueText(r) ? <b className="whitespace-nowrap">{ruleValueText(r)}</b> : <Muted>Not available</Muted>) },
  { label: "Currency", field: "currency", render: (r) => <Mono value={r.currency} /> },
  { label: "Conditions", field: "conditions", render: (r) => (Array.isArray(r.conditions) && r.conditions.length ? <ConditionLines conditions={r.conditions} part="value" /> : <Muted>None</Muted>) },
  { label: "Valid From", field: "effectiveFrom", render: (r) => <DateValue value={r.effectiveFrom} /> },
  { label: "Valid To", field: "effectiveUntil", render: (r) => <DateValue value={r.effectiveUntil} empty="Open-ended" /> },
  { label: "Source / Raw Type", field: "supplierRuleType · basis", render: (r) => <RawType rule={r} /> },
];

const RELATED_COLUMNS = [
  { label: "Rule ID", field: "sourceRuleId · id", render: (r) => <Mono value={r.sourceRuleId || r.id} /> },
  { label: "Source Account", field: "sourceAccountLabel", render: (r) => <Mono value={r.sourceAccountLabel} /> },
  { label: "Supplier Campaign Row", field: "supplierCampaignId", render: (r) => <Mono value={r.supplierCampaignId} /> },
  { label: "Campaign Source", field: "campaignSourceId", render: (r) => (r.campaignSourceId ? <Mono value={r.campaignSourceId} /> : <Muted>Not linked</Muted>) },
  { label: "Commission Type", field: "commissionType", render: (r) => <CommissionType rule={r} /> },
  { label: "Value", field: "commissionValue", render: (r) => ruleValueText(r) || <Muted>Not available</Muted> },
  { label: "Currency", field: "currency", render: (r) => <Mono value={r.currency} /> },
  { label: "Status", field: "ruleStatus", render: (r) => <Pill value={r.ruleStatus} /> },
  { label: "Source / Raw Type", field: "rawCommissionType", render: (r) => <RawType rule={r} /> },
];

/** v13 .related-table with row numbers and an optional per-row evidence panel. */
function RuleTable({ label, rules, columns, withEvidence = false }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const span = columns.length + 1 + (withEvidence ? 1 : 0);
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#e4e7ec] bg-white">
      <table aria-label={label} className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr>
            <th className={TH} title="Row number for reading only; not a stored sequence">
              #
            </th>
            {columns.map((col) => (
              <th key={col.label} className={TH}>
                {col.label}
                {col.field ? <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span> : null}
              </th>
            ))}
            {withEvidence ? <th className={TH}>Evidence</th> : null}
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, index) => {
            const key = rule.id || `rule-${index}`;
            const expanded = open.has(key);
            return (
              <Fragment key={key}>
                <tr className={expanded ? "bg-[#fbfcff]" : "hover:bg-[#fbfcff]"}>
                  <td className={`${TD} font-mono text-[10px] text-[#667085]`}>{index + 1}</td>
                  {columns.map((col) => (
                    <td key={col.label} className={TD}>
                      {col.render(rule)}
                    </td>
                  ))}
                  {withEvidence ? (
                    <td className={TD}>
                      <button type="button" className={ACTION_BUTTON} aria-expanded={expanded} onClick={() => toggle(key)}>
                        {expanded ? "Hide" : "Details"}
                      </button>
                    </td>
                  ) : null}
                </tr>
                {expanded ? (
                  <tr>
                    <td colSpan={span} className="border-b border-[#e4e7ec] p-0">
                      <RuleEvidence rule={rule} />
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
RuleTable.propTypes = { label: optionalString, rules: optionalArray, columns: optionalArray, withEvidence: optionalBool };

function AverageValue({ average }) {
  if (!average.summaries.length) return <Muted title="No rule returns a single percentage or fixed amount">Not available</Muted>;
  if (!average.mixed) return average.summaries[0].average;
  return (
    <Pill value="MIXED" tone="amber" title="Rules use different units, currencies or models, so no single average is calculated" />
  );
}
AverageValue.propTypes = { average: optionalObject };

/* ── Tab ───────────────────────────────────────────────────────────────────── */

export function CampaignCommissionRulesTab({ campaign, canRead }) {
  const enabled = Boolean(canRead && campaign.networkSource && campaign.supplierCampaignId);
  const lookup = useCampaignCommissionRules(COMMISSION_RULES_PATH, campaign, { enabled, project: toCommissionRuleView });
  const rows = lookup.rows;
  const related = lookup.relatedRows;
  const coverage = lookup.coverage;

  const authoritativeCount = typeof campaign.commissionRuleCount === "number" ? campaign.commissionRuleCount : null;
  const loaded = coverage?.loadedExact ?? 0;
  const embedded = Array.isArray(campaign.supplierCommissionRules) ? campaign.supplierCommissionRules : [];
  const shortfall = authoritativeCount != null && !lookup.loading && coverage && loaded < authoritativeCount;
  const surplus = authoritativeCount != null && coverage && loaded > authoritativeCount;
  const unproven = Boolean(coverage && !coverage.complete);
  const noneLinked = Boolean(!lookup.loading && coverage && loaded === 0 && related.length > 0);
  const showEmbedded = !enabled || shortfall || unproven;

  // The rules the summary describes: the loaded authoritative records, or the embedded subset
  // when the registry cannot be read.
  const summaryRules = enabled ? rows : embedded;
  const summaryLabel = enabled ? "loaded rule records" : "embedded rules";
  const average = useMemo(() => averageCommission(summaryRules), [summaryRules]);
  const currencies = distinct(summaryRules.map((r) => r.currency));
  const accounts = distinct(summaryRules.map((r) => r.sourceAccountLabel));
  const types = distinct(summaryRules.map((r) => r.commissionType));

  const coverageStatus = lookup.loading
    ? null
    : !coverage
      ? null
      : coverage.complete && related.length
        ? "LINKED_RULES_ONLY"
        : coverage.complete
          ? "COMPLETE"
          : "UNPROVEN";

  return (
    <div className="space-y-3.5 text-[#101828]">
      {/* 1. Commission Summary */}
      <Card
        title="Commission Summary"
        subtitle="Supplier / network commission structure for this campaign. Each outcome is a separate Supplier Commission Rule record below."
        action={<Pill value="INTERNAL ADMIN · SUPPLIER-SIDE" tone="amber" title="Supplier commission, not client payable commission" />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Campaign Commission" hint="Summary only. Not a rule, not a payout figure.">
            <span className="text-[13px]">{campaign.campaignCommission || <Muted>Not available</Muted>}</span>
          </Metric>
          <Metric
            label="Rule Count"
            hint={
              enabled
                ? lookup.loading
                  ? "Loading rule records…"
                  : `${plural(loaded, "linked rule record")} loaded`
                : `${plural(embedded.length, "embedded rule")} in the campaign detail`
            }
          >
            {authoritativeCount != null ? authoritativeCount : <Muted>Not available</Muted>}
          </Metric>
          <Metric
            label="Average Commission"
            hint={
              average.summaries.length
                ? `Display only, over ${plural(average.summaries.reduce((n, s) => n + s.count, 0), "rule")} of the ${summaryLabel}${average.excluded ? `; ${average.excluded} without a single value left out` : ""}`
                : "Display only"
            }
          >
            <AverageValue average={average} />
          </Metric>
          <Metric label="Currency" hint={currencies.length > 1 ? currencies.join(", ") : "As returned on the rules"}>
            {currencies.length === 0 ? <Muted>Not returned</Muted> : currencies.length === 1 ? <span className="font-mono">{currencies[0]}</span> : <Pill value="MIXED" tone="amber" />}
          </Metric>
          <Metric label="Source / Network" hint={accounts.length ? `Account${accounts.length === 1 ? "" : "s"}: ${accounts.join(", ")}` : null}>
            {campaign.networkSource ? <span className="font-mono text-[13px]">{campaign.networkSource}</span> : <Muted>Not available</Muted>}
          </Metric>
        </div>

        {average.summaries.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {average.summaries.map((s) => (
              <Chip
                key={`${s.unit}-${s.currency}-${s.type}`}
                label={`${s.label} (${s.count}): avg`}
                value={`${s.average} · range ${s.range}`}
                title="Display-only average for rules with the same unit; never stored or used for payout"
              />
            ))}
            {types.length ? <Chip label="Commission types" value={types.join(", ")} title="Canonical commission types on these rules" /> : null}
          </div>
        ) : null}

        <div className="mt-2.5">
          <Note tone="danger">
            <b>Payout rule:</b> final client payable commission is based on the <b>network final actual commission</b> plus the{" "}
            <b>approved Client Commission Rule</b>. It is never taken from the Campaign Commission summary, the average above, or
            Commission 1 alone. This tab shows supplier-side rules only.
          </Note>
        </div>
      </Card>

      {!canRead ? (
        <Note tone="warn">Your role does not include commission:read. Showing the reduced rule subset embedded in the campaign detail.</Note>
      ) : !campaign.supplierCampaignId || !campaign.networkSource ? (
        <Note tone="warn">This campaign has no supplier campaign id or network source, so the rule registry cannot be searched.</Note>
      ) : null}

      {/* 2. Supplier Commission Rule Registry */}
      {enabled ? (
        <Card
          title="Supplier Commission Rule Registry"
          subtitle={
            <>
              Rules linked to supplier campaign row <span className="font-mono">{campaign.supplierCampaignRowId || "—"}</span> / campaign source{" "}
              <span className="font-mono">{campaign.campaignSourceId || "—"}</span>. One row per rule; open Details for lineage and network wording.
            </>
          }
          action={
            <button type="button" className={ACTION_BUTTON} disabled={lookup.loading} onClick={() => lookup.reload().catch(() => {})}>
              Refresh
            </button>
          }
        >
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <Chip label="Contract rule count" value={authoritativeCount ?? "—"} title="commissionRuleCount from the campaign detail (primary campaign source)" />
            <Chip label="Linked rows loaded" value={lookup.loading ? "…" : loaded} />
            <Chip label="Related rows (other network row)" value={lookup.loading ? "…" : related.length} title="Same supplier-side campaign id, different network row; never counted" />
            <Chip label="Search matches" value={coverage?.searchMatches ?? "—"} />
            <span className="inline-flex items-center gap-1 text-[9px] text-[#667085]">
              Coverage{" "}
              {coverageStatus ? (
                <Pill
                  value={coverageStatus}
                  title={
                    coverageStatus === "COMPLETE"
                      ? "All search pages fetched, the backend reported an untruncated set, and every linked rule was loaded"
                      : coverageStatus === "LINKED_RULES_ONLY"
                        ? "Every linked rule was loaded, but rows from another network row share the supplier id"
                        : "Completeness of the linked rules could not be proven with the current backend lookup"
                  }
                />
              ) : (
                <Muted>{lookup.loading ? "Loading…" : "Not available"}</Muted>
              )}
            </span>
          </div>
          {coverage ? (
            <p className="mb-2 text-[10px] text-[#667085]">
              Pages fetched {coverage.pagesFetched}
              {coverage.totalPages != null ? ` of ${coverage.totalPages}` : ""} (page size {RULE_PAGE_SIZE}, cap {RULE_MAX_PAGES} pages)
              {coverage.searchScope ? ` · backend search scope ${coverage.searchScope}` : ""}
              {coverage.truncated ? " · backend rule set truncated" : ""}
              {coverage.pageCapReached ? " · page cap reached" : ""}.
            </p>
          ) : null}

          <div className="space-y-2">
            {noneLinked ? (
              <Note tone="warn">
                No commission rule is linked to this campaign source. {plural(related.length, "rule")} share the supplier-side campaign id{" "}
                <span className="font-mono">{campaign.supplierCampaignId}</span> but belong to another network row; they are listed separately and
                not counted.
              </Note>
            ) : null}
            {shortfall ? (
              <Note tone="warn">
                Only {loaded} of {authoritativeCount} linked commission rules could be loaded
                {coverage.truncated ? " (the backend rule set was truncated)" : coverage.pageCapReached ? " (page cap reached)" : " (the search returned no further exact matches)"}.
                {embedded.length ? " The embedded rule subset from the campaign detail is shown below as a fallback." : ""}
              </Note>
            ) : null}
            {surplus ? (
              <Note>
                {loaded} linked rules loaded, but the campaign detail counts {authoritativeCount}: that count covers the primary campaign source only.
              </Note>
            ) : null}
            {!shortfall && unproven && !lookup.loading ? <Note tone="warn">Completeness of this rule list could not be proven; treat it as potentially incomplete.</Note> : null}
          </div>

          <div className="mt-2.5">
            {lookup.loading ? (
              <p className="py-3 text-[11px] text-[#667085]">Loading supplier commission rules…</p>
            ) : lookup.error ? (
              <Note tone="danger">
                <b>Supplier commission rules could not be loaded.</b> {lookup.error}{" "}
                <button type="button" className={`${ACTION_BUTTON} ml-1`} onClick={() => lookup.reload().catch(() => {})}>
                  Retry
                </button>
              </Note>
            ) : rows.length ? (
              <RuleTable label="Supplier commission rules" rules={rows} columns={REGISTRY_COLUMNS} withEvidence />
            ) : (
              <EmptyState title={authoritativeCount > 0 ? "Rules exist but none could be loaded" : "No commission rules linked to this campaign source"}>
                {authoritativeCount > 0
                  ? `The campaign detail counts ${authoritativeCount} rule(s), but the registry search returned no linked match for this campaign source.`
                  : "No Supplier Commission Rule record carries this campaign's supplier campaign row id or campaign source id."}
              </EmptyState>
            )}
          </div>
        </Card>
      ) : null}

      {enabled && related.length ? (
        <Card
          title="Related Rules From Another Network Row"
          subtitle="Same supplier-side campaign id, different supplier campaign row or campaign source. Shown for lineage only and never counted as this campaign's rules."
        >
          <RuleTable label="Related supplier-ID rules" rules={related} columns={RELATED_COLUMNS} />
        </Card>
      ) : null}

      {showEmbedded ? (
        <Card
          title="Embedded Rule Subset (campaign detail)"
          subtitle="Linked by campaign source, reduced fields, capped at 50 by the backend. No backend label, lineage or rule-scoped dimensions."
        >
          {embedded.length ? (
            <RuleTable label="Embedded rule subset" rules={embedded} columns={EMBEDDED_COLUMNS} />
          ) : (
            <EmptyState title="No embedded rules">The campaign detail carries no supplier commission rules for this campaign.</EmptyState>
          )}
        </Card>
      ) : null}
    </div>
  );
}
CampaignCommissionRulesTab.propTypes = { campaign: optionalObject, canRead: optionalBool };
