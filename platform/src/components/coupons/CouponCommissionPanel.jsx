import { useEffect, useMemo, useState } from "react";
import { fetchApi, patchApi, postApi } from "../../api";
import { agreementLineageFields, hasAgreementLineage } from "../../utils/commissionDisplay";
import { canViewCommission, hasPermission, PERMISSIONS } from "../../auth/permissions";
import { useAuth } from "../../context/AuthContext";
import { StatusBadge, formatDateShort } from "../../pages/helpers";

function deriveMbo(gross, client) {
  const g = Number(gross);
  const c = Number(client);
  if (Number.isNaN(g) || Number.isNaN(c)) return "—";
  return (g - c).toFixed(4);
}

/**
 * Commission management panel embedded in Coupon CMS.
 * Reuses existing /commission-rules APIs and ClientCommissionRule records.
 */
export function CouponCommissionPanel({ couponId }) {
  const { user } = useAuth();
  const showCommission = canViewCommission(user);
  const canManage = hasPermission(user, PERMISSIONS.COMMISSION_MANAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [context, setContext] = useState({ assignments: [], commissionRules: [] });
  const [form, setForm] = useState({
    assignmentId: "",
    grossCommission: "",
    clientCommission: "",
    commissionType: "PERCENT_OF_ACTUAL_SUPPLIER_COMMISSION",
    currency: "USD",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    activate: true,
    agreementRef: "",
    agreementApprovedAt: "",
    agreementApprovedBy: "",
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!couponId) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetchApi(`/admin/coupons/${couponId}/commercial`);
      const data = response.data ?? response;
      setContext({
        assignments: data.assignments || [],
        commissionRules: data.commissionRules || [],
      });
      if (!form.assignmentId && data.assignments?.[0]?.id) {
        setForm((prev) => ({ ...prev, assignmentId: data.assignments[0].id }));
      }
    } catch (err) {
      setError(err.message || "Failed to load commission context");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [couponId]);

  const assignmentOptions = useMemo(
    () =>
      (context.assignments || []).map((row) => ({
        value: row.id,
        label: `${row.client?.name || row.clientId} → ${row.canonicalCampaign?.displayName || row.canonicalCampaignId}`,
      })),
    [context.assignments],
  );

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManage) return;
    const agreement = agreementLineageFields(form);
    if (form.activate && !hasAgreementLineage(agreement)) {
      setError("Activation requires the agreement reference, approval date and approver.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await postApi("/commission-rules", {
        assignmentId: form.assignmentId,
        grossCommission: form.grossCommission,
        clientCommission: form.clientCommission,
        commissionType: form.commissionType,
        currency: form.currency || null,
        effectiveFrom: form.effectiveFrom,
        activate: form.activate,
        ...agreement,
      });
      await load();
    } catch (err) {
      setError(err.message || "Failed to create commission rule");
    } finally {
      setSaving(false);
    }
  }

  async function handleRuleAction(id, body) {
    if (!canManage) return;
    setError("");
    try {
      await patchApi(`/commission-rules/${id}`, body);
      await load();
    } catch (err) {
      setError(err.message || "Failed to update commission rule");
    }
  }

  if (!couponId) {
    return (
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        Save the campaign first, then manage commission rules after client allotment.
      </p>
    );
  }

  if (loading) return <p className="text-sm text-slate-600">Loading commission rules…</p>;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">Commission Rules</h3>
        <p className="mt-1 text-xs text-slate-500">
          Uses existing ClientCommissionRule records for client assignments linked to this campaign.
        </p>
      </div>

      {!showCommission && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Commission amounts are hidden for your role.
        </p>
      )}

      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!context.assignments.length ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
          No client assignments linked yet. Allot this campaign to a client to manage commission rules.
        </p>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Assignment</th>
                  <th className="px-3 py-2">Status</th>
                  {showCommission ? <th className="px-3 py-2">Gross</th> : null}
                  {showCommission ? <th className="px-3 py-2">Client</th> : null}
                  {showCommission ? <th className="px-3 py-2">MBO</th> : null}
                  <th className="px-3 py-2">Effective</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {context.commissionRules.map((row) => {
                  const assignment = context.assignments.find((a) => a.id === row.assignmentId);
                  return (
                    <tr key={row.id} className="border-t border-slate-200">
                      <td className="px-3 py-2">
                        {assignment?.client?.name || row.assignmentId?.slice(0, 8)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      {showCommission ? <td className="px-3 py-2">{row.grossCommission ?? "—"}</td> : null}
                      {showCommission ? <td className="px-3 py-2">{row.clientCommission ?? "—"}</td> : null}
                      {showCommission ? <td className="px-3 py-2">{row.mboCommission ?? "—"}</td> : null}
                      <td className="px-3 py-2">{formatDateShort(row.effectiveFrom)}</td>
                      <td className="px-3 py-2">
                        {canManage ? (
                          <div className="flex gap-2">
                            {row.status === "DRAFT" ? (
                              <button
                                className="text-xs text-indigo-600"
                                type="button"
                                onClick={() => handleRuleAction(row.id, { activate: true })}
                              >
                                Activate
                              </button>
                            ) : null}
                            {row.status === "EFFECTIVE" ? (
                              <button
                                className="text-xs text-rose-700"
                                type="button"
                                onClick={() => handleRuleAction(row.id, { supersede: true })}
                              >
                                Supersede
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!context.commissionRules.length ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-500" colSpan={showCommission ? 7 : 4}>
                      No commission rules yet for linked assignments.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {canManage ? (
            <form className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2" onSubmit={handleCreate}>
              <h4 className="sm:col-span-2 text-sm font-medium text-slate-900">Add commission rule</h4>
              <label className="sm:col-span-2 grid gap-1 text-sm">
                <span>Assignment</span>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  required
                  value={form.assignmentId}
                  onChange={(e) => setForm((p) => ({ ...p, assignmentId: e.target.value }))}
                >
                  <option value="">Select assignment</option>
                  {assignmentOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span>Gross Commission</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  required
                  value={form.grossCommission}
                  onChange={(e) => setForm((p) => ({ ...p, grossCommission: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Client Commission</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  required
                  value={form.clientCommission}
                  onChange={(e) => setForm((p) => ({ ...p, clientCommission: e.target.value }))}
                />
              </label>
              <div className="sm:col-span-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                MBO Commission (derived): <strong>{deriveMbo(form.grossCommission, form.clientCommission)}</strong>
              </div>
              <label className="grid gap-1 text-sm">
                <span>Type</span>
                <select
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  value={form.commissionType}
                  onChange={(e) => setForm((p) => ({ ...p, commissionType: e.target.value }))}
                >
                  <option value="PERCENT_OF_ACTUAL_SUPPLIER_COMMISSION">
                    Percent of actual supplier commission (recommended)
                  </option>
                  <option value="PERCENT">Percent (legacy alias)</option>
                  <option value="FIXED">Fixed (legacy — needs fixedAmount)</option>
                  <option value="UNKNOWN">Unknown</option>
                </select>
                <p className="text-xs text-slate-500">
                  Client TIERED bands are not implemented. For supplier-tiered campaigns, use percent of
                  actual confirmed supplier commission.
                </p>
              </label>
              <label className="grid gap-1 text-sm">
                <span>Effective From</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  type="date"
                  required
                  value={form.effectiveFrom}
                  onChange={(e) => setForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Agreement / IO / SOW reference{form.activate ? " *" : ""}</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  required={form.activate}
                  value={form.agreementRef}
                  onChange={(e) => setForm((p) => ({ ...p, agreementRef: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span>Agreement approved on{form.activate ? " *" : ""}</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  type="date"
                  required={form.activate}
                  value={form.agreementApprovedAt}
                  onChange={(e) => setForm((p) => ({ ...p, agreementApprovedAt: e.target.value }))}
                />
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span>Agreement approved by{form.activate ? " *" : ""}</span>
                <input
                  className="rounded-lg border border-slate-300 px-3 py-2"
                  required={form.activate}
                  value={form.agreementApprovedBy}
                  onChange={(e) => setForm((p) => ({ ...p, agreementApprovedBy: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.activate}
                  onChange={(e) => setForm((p) => ({ ...p, activate: e.target.checked }))}
                />
                Activate immediately (EFFECTIVE) — requires the agreement lineage above
              </label>
              <div className="sm:col-span-2">
                <button
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
                  disabled={saving}
                  type="submit"
                >
                  {saving ? "Saving…" : "Create rule"}
                </button>
              </div>
            </form>
          ) : null}
        </>
      )}
    </div>
  );
}
