import {
  familyKey,
  LIFECYCLE,
  RULE_FAMILY,
  ruleFamily,
  ruleGroupKey,
  ruleLifecycle,
} from "./commissionRuleContract.js";

/**
 * Average commission — DISPLAY SUMMARY ONLY.
 *
 * Never a payout, never a client payable amount, never an MBO margin. The backend exposes no
 * average over SupplierCommissionRule rows on this contract (the `averageCommission` measure in
 * the workbook is an Optimise *reporting* figure over settled conversions, not a rule average),
 * so this is computed in the frontend and always labelled as a display summary.
 *
 * Rules, in order:
 *   1. Percentages average only with percentages.
 *   2. Fixed amounts average only with fixed amounts of the SAME currency.
 *   3. Percentage + fixed, or two currencies, are never collapsed into one number; the result
 *      is "Mixed" plus one separate average per comparable family.
 *   4. Only CURRENT rules feed the current average. Scheduled and expired rules are excluded.
 *   5. Persisted and projected rules are never silently combined: when a group holds both,
 *      the summary is built from the persisted rules and the projected ones are reported apart.
 *   6. No comparable rule means no average. Zero is never displayed as an average.
 *   7. Simple arithmetic mean. Never weighted by orders or revenue — the contract carries no
 *      weights, and a weighted figure would have to say so.
 */

export const AVERAGE_KIND = Object.freeze({
  SINGLE: "SINGLE",
  MIXED: "MIXED",
  NONE: "NONE",
});

export const AVERAGE_NOTE =
  "Display summary of supplier rule values. Not a payout, not client payable commission.";

function mean(values) {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round((total / values.length) * 100) / 100;
}

function familyLabel(key, average) {
  if (key === "PERCENT") return `${average}%`;
  const currency = key.slice("FIXED:".length);
  return `${currency} ${average}`;
}

/**
 * Summarizes one set of rules that already share a group.
 * Returns { kind, text, families[], counted, excluded }.
 */
export function summarizeRuleValues(rules = [], { now = Date.now() } = {}) {
  const list = Array.isArray(rules) ? rules.filter(Boolean) : [];
  const excluded = {
    notCurrent: 0,
    projected: 0,
    noComparableValue: 0,
  };

  const current = [];
  for (const rule of list) {
    if (ruleLifecycle(rule, now) !== LIFECYCLE.CURRENT) {
      excluded.notCurrent += 1;
      continue;
    }
    current.push(rule);
  }

  // Persisted rules are authoritative. Projected outcomes only stand in when there is
  // nothing persisted, and the caller is told which basis was used.
  const persisted = current.filter((rule) => !rule.projected);
  const projected = current.filter((rule) => rule.projected);
  const basis = persisted.length ? "PERSISTED" : "PROJECTED";
  const pool = persisted.length ? persisted : projected;
  if (persisted.length) excluded.projected = projected.length;

  const buckets = new Map();
  for (const rule of pool) {
    const key = familyKey(rule);
    if (!key) {
      excluded.noComparableValue += 1;
      continue;
    }
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(ruleFamily(rule).value);
  }

  if (buckets.size === 0) {
    return {
      kind: AVERAGE_KIND.NONE,
      text: null,
      families: [],
      counted: 0,
      basis,
      excluded,
      note: AVERAGE_NOTE,
    };
  }

  const families = [...buckets.entries()]
    .map(([key, values]) => {
      const average = mean(values);
      return {
        key,
        family: key === "PERCENT" ? RULE_FAMILY.PERCENT : RULE_FAMILY.FIXED,
        currency: key === "PERCENT" ? null : key.slice("FIXED:".length),
        count: values.length,
        average,
        text: familyLabel(key, average),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const counted = families.reduce((sum, family) => sum + family.count, 0);

  if (families.length === 1) {
    return {
      kind: AVERAGE_KIND.SINGLE,
      text: families[0].text,
      families,
      counted,
      basis,
      excluded,
      note: AVERAGE_NOTE,
    };
  }

  return {
    kind: AVERAGE_KIND.MIXED,
    text: "Mixed / not directly comparable",
    families,
    counted,
    basis,
    excluded,
    note: AVERAGE_NOTE,
  };
}

/**
 * Groups the rules of one loaded page and marks which groups are provably whole.
 *
 * The backend orders rows campaign-first (brand, campaign name, supplier campaign id, row id)
 * and then by display sequence, so one group's rows are contiguous. A group is therefore only
 * complete within the page when it neither starts at the first row of a later page nor ends at
 * the last row while more pages remain. Incomplete groups get no average at all rather than an
 * average over part of a campaign.
 */
export function groupPageRules(rows = [], { page = 1, hasMore = false, now = Date.now() } = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const groups = new Map();

  list.forEach((rule, index) => {
    const key = ruleGroupKey(rule);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, { key, rules: [], firstIndex: index, lastIndex: index });
    }
    const group = groups.get(key);
    group.rules.push(rule);
    group.lastIndex = index;
  });

  const lastIndex = list.length - 1;
  const result = new Map();
  for (const group of groups.values()) {
    const touchesPageStart = group.firstIndex === 0 && page > 1;
    const touchesPageEnd = group.lastIndex === lastIndex && hasMore;
    const complete = !touchesPageStart && !touchesPageEnd;
    result.set(group.key, {
      ...group,
      complete,
      incompleteReason: complete
        ? null
        : touchesPageStart && touchesPageEnd
          ? "This campaign's rules continue on the previous and next page"
          : touchesPageStart
            ? "This campaign's rules start on the previous page"
            : "This campaign's rules continue on the next page",
      summary: complete ? summarizeRuleValues(group.rules, { now }) : null,
    });
  }
  return result;
}
