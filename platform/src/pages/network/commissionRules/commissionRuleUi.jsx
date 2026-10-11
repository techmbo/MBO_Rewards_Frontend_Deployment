import { Badge } from "../../../components/ui/Badge";
import { MonoChip, Truncate } from "../../../components/ui/TableCells";
import {
  optionalArray,
  optionalBool,
  optionalObject,
  optionalString,
  optionalStringOrNumber,
} from "../../../utils/propValidators";
import { AVERAGE_KIND } from "./commissionRuleAverage";
import {
  FINANCE_READY_UNAVAILABLE,
  formatRuleValue,
  LIFECYCLE_LABELS,
  REVIEW_STATE,
  reviewReasonLabel,
  ruleLifecycle,
  reviewState,
} from "./commissionRuleContract";

/**
 * Supplier commission rule value. Unit semantics always survive: a percentage keeps its %,
 * a fixed amount keeps its currency, and a fixed amount with no currency is flagged instead of
 * being shown as a bare number that could be read as either.
 */
export function RuleValue({ rule }) {
  const value = formatRuleValue(rule);
  if (!value.available) {
    return (
      <span className="text-xs text-slate-400" title="The backend carries no numeric commission outcome for this rule">
        No numeric outcome
      </span>
    );
  }
  if (value.currencyMissing) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" data-rule-currency-missing="true">
        <span className="font-medium tabular-nums text-slate-900">{value.text}</span>
        <Badge variant="warning">
          <span title="Fixed payout with no currency on the source record. Currency is never guessed from country.">
            Currency unavailable · review required
          </span>
        </Badge>
      </span>
    );
  }
  return <span className="font-medium tabular-nums text-slate-900">{value.text}</span>;
}
RuleValue.propTypes = { rule: optionalObject };

const LIFECYCLE_VARIANTS = {
  CURRENT: "success",
  SCHEDULED: "info",
  EXPIRED: "default",
  UNKNOWN: "warning",
};

/** Backend rule status, verbatim. */
export function RuleStatusChip({ value }) {
  if (!value) return <span className="text-xs text-slate-400">Not available</span>;
  const text = String(value).toUpperCase();
  return (
    <Badge variant={text === "EXPIRED" ? "default" : text === "ACTIVE" ? "success" : "warning"}>
      <span title="Rule status exactly as the backend reports it">{text}</span>
    </Badge>
  );
}
RuleStatusChip.propTypes = { value: optionalString };

/** Effective-date refinement of the backend status. Never contradicts it. */
export function LifecycleChip({ rule }) {
  const state = ruleLifecycle(rule);
  const backend = rule?.ruleStatus ? String(rule.ruleStatus).toUpperCase() : "no status";
  return (
    <Badge variant={LIFECYCLE_VARIANTS[state] || "default"}>
      <span title={`Derived from the effective dates; the backend reports ${backend}`}>{LIFECYCLE_LABELS[state]}</span>
    </Badge>
  );
}
LifecycleChip.propTypes = { rule: optionalObject };

/**
 * Finance readiness is its own business concept and this contract does not return it. It is
 * never inferred from the mapping outcome, the review reasons, the persisted flag or the rule
 * status — each of those is shown separately in its own column.
 */
export function FinanceReadyCell() {
  return (
    <span
      className="text-xs text-slate-400"
      data-finance-ready="unavailable"
      title="The supplier commission rule contract returns no financeReady field. It is not derived from mapping outcome, review reasons, persisted state or rule status."
    >
      {FINANCE_READY_UNAVAILABLE}
    </span>
  );
}

/** Review state exactly as the backend reports it. Says nothing about finance readiness. */
export function ReviewStateChip({ rule }) {
  const state = reviewState(rule);
  if (state === REVIEW_STATE.REVIEW_REQUIRED) {
    return (
      <Badge variant="warning">
        <span title="Backend field mapping outcome REVIEW_REQUIRED, or review reasons are present">Review required</span>
      </Badge>
    );
  }
  if (state === REVIEW_STATE.NO_REVIEW_FLAGGED) {
    return (
      <Badge variant="default">
        <span title="Backend field mapping outcome MAPPED with no review reasons. This is not a finance-readiness decision.">
          No review flagged
        </span>
      </Badge>
    );
  }
  return (
    <span className="text-xs text-slate-400" title="The contract returned no field mapping outcome for this rule">
      Not available
    </span>
  );
}
ReviewStateChip.propTypes = { rule: optionalObject };

export function PersistedChip({ projected }) {
  return projected ? (
    <Badge variant="purple">
      <span title="Transitional projection built from campaign commission evidence, not a persisted canonical rule">
        Projected
      </span>
    </Badge>
  ) : (
    <Badge variant="default">
      <span title="Persisted canonical SupplierCommissionRule row">Persisted</span>
    </Badge>
  );
}
PersistedChip.propTypes = { projected: optionalBool };

export function ReviewReasons({ reasons, className = "" }) {
  const list = Array.isArray(reasons) ? reasons : [];
  if (!list.length) return <span className="text-xs text-slate-400">None</span>;
  const text = list.map(reviewReasonLabel).join(", ");
  return (
    <Truncate className={`text-xs text-amber-800 ${className}`} title={text}>
      {text}
    </Truncate>
  );
}
ReviewReasons.propTypes = { reasons: optionalArray, className: optionalString };

/** One condition rendered from scalar fields only. Raw supplier condition JSON never reaches here. */
export function ConditionList({ conditions }) {
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.length) return <span className="text-xs text-slate-400">No conditions recorded</span>;
  return (
    <ul className="space-y-1">
      {list.map((condition, index) => (
        <li key={condition.id || `${condition.conditionType}-${index}`} className="text-xs text-slate-700">
          <span className="font-medium">{reviewReasonLabel(condition.conditionType) || "Condition"}</span>{" "}
          <span className="text-slate-500">{condition.operator || "="}</span>{" "}
          <span className="font-mono">{condition.value ?? "—"}</span>
          {condition.sourceConditionType ? (
            <span className="ml-1 text-slate-400">(source: {condition.sourceConditionType})</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
ConditionList.propTypes = { conditions: optionalArray };

export function ConditionSummary({ conditions }) {
  const list = Array.isArray(conditions) ? conditions : [];
  if (!list.length) return <span className="text-xs text-slate-400">None</span>;
  const text = list
    .map((c) => `${c.conditionType || "?"} ${c.operator || "="} ${c.value ?? ""}`.trim())
    .join("; ");
  return <Truncate title={text}>{text}</Truncate>;
}
ConditionSummary.propTypes = { conditions: optionalArray };

/**
 * Average commission for one campaign group. A display summary only, never a payout figure,
 * and never one number across incomparable payout families.
 */
export function AverageCommission({ group, compact = false }) {
  if (!group) return <span className="text-xs text-slate-400">No group context</span>;
  if (!group.complete) {
    return (
      <span className="text-xs text-slate-400" title={group.incompleteReason || "Group is not whole on this page"}>
        Group spans pages
      </span>
    );
  }
  const summary = group.summary;
  if (!summary || summary.kind === AVERAGE_KIND.NONE) {
    return (
      <span className="text-xs text-slate-400" title="No current rule in this group carries a comparable value">
        Not available
      </span>
    );
  }
  const basisNote = summary.basis === "PROJECTED" ? " Built from projected outcomes only." : "";
  if (summary.kind === AVERAGE_KIND.SINGLE) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        <span
          className="font-medium tabular-nums text-slate-900"
          title={`Simple mean of ${summary.counted} current comparable rule(s). ${summary.note}${basisNote}`}
        >
          {summary.text}
        </span>
        {summary.basis === "PROJECTED" ? <Badge variant="purple">Projected</Badge> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-average-mixed="true">
      <Badge variant="warning">
        <span title={`Incomparable payout families in this group. ${summary.note}${basisNote}`}>
          Mixed / not directly comparable
        </span>
      </Badge>
      {compact ? null : (
        <span className="text-xs text-slate-600">
          {summary.families.map((family) => `${family.text} (${family.count})`).join(" · ")}
        </span>
      )}
    </span>
  );
}
AverageCommission.propTypes = { group: optionalObject, compact: optionalBool };

export function WarningList({ warnings }) {
  const list = Array.isArray(warnings) ? warnings : [];
  if (!list.length) return <span className="text-xs text-slate-400">None</span>;
  return (
    <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-800">
      {list.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}
WarningList.propTypes = { warnings: optionalArray };

export function SequenceLabel({ rule }) {
  const label = rule?.displayLabel;
  if (label) {
    return (
      <span className="font-medium text-slate-900" title="Display sequence assigned by the backend listing, not a database column">
        {label}
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-400" title="The backend assigned no display sequence to this row">
      Unsequenced
    </span>
  );
}
SequenceLabel.propTypes = { rule: optionalObject };

export function IdChip({ value, title }) {
  if (value == null || value === "") return <span className="text-xs text-slate-400">Not available</span>;
  return (
    <span title={title}>
      <MonoChip value={value} />
    </span>
  );
}
IdChip.propTypes = { value: optionalStringOrNumber, title: optionalString };
