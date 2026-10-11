/** Format a commission amount for table display. */
export function formatCommission(value) {
  if (value === undefined || value === null || value === "") return "—";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
