import { canViewCommission } from "../auth/permissions";

/** Format a commission amount for table display. */
export function formatCommission(value) {
  if (value === undefined || value === null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Standard Gross / Client / MBO commission columns for admin views.
 */
export function commissionColumns(user, { includeGross = true } = {}) {
  if (!canViewCommission(user)) return [];
  const cols = [];
  if (includeGross) {
    cols.push({
      key: "grossCommission",
      label: "Gross",
      title: "Gross commission",
      minWidth: 88,
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (row) => formatCommission(row.grossCommission),
    });
  }
  cols.push(
    {
      key: "clientCommission",
      label: "Client $",
      title: "Client commission",
      minWidth: 88,
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (row) => formatCommission(row.clientCommission),
    },
    {
      key: "mboCommission",
      label: "MBO $",
      title: "MBO commission",
      minWidth: 88,
      className: "text-right tabular-nums",
      headerClassName: "text-right",
      render: (row) => formatCommission(row.mboCommission),
    },
  );
  return cols;
}

/**
 * Agreement lineage accepted by POST /commission-rules (createCommissionRuleBodySchema).
 * The backend refuses to activate a rule without agreementRef + agreementApprovedAt + agreementApprovedBy
 * (assertCommercialActivationReady), so the form must pass them through when it activates.
 */
export function agreementLineageFields(form = {}) {
  const out = {};
  const ref = String(form.agreementRef ?? "").trim();
  const approvedBy = String(form.agreementApprovedBy ?? "").trim();
  const approvedAt = String(form.agreementApprovedAt ?? "").trim();
  if (ref) out.agreementRef = ref;
  if (approvedAt) out.agreementApprovedAt = approvedAt;
  if (approvedBy) out.agreementApprovedBy = approvedBy;
  return out;
}

export function hasAgreementLineage(fields = {}) {
  return Boolean(fields.agreementRef && fields.agreementApprovedAt && fields.agreementApprovedBy);
}

/** Merge commission fields from an assignment → rule map onto a row that has assignmentId. */
export function withAssignmentCommission(row, rulesByAssignmentId = {}) {
  const rule = rulesByAssignmentId[row.assignmentId] || rulesByAssignmentId[row.id];
  if (!rule) return row;
  return {
    ...row,
    grossCommission: row.grossCommission ?? rule.grossCommission,
    clientCommission: row.clientCommission ?? rule.clientCommission,
    mboCommission: row.mboCommission ?? rule.mboCommission,
  };
}
