import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { useMutation } from "../../hooks/useMutation";
import { useAuth } from "../../context/AuthContext";
import { hasPermission, PERMISSIONS } from "../../auth/permissions";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { COUNTRIES } from "../../utils/countries";
import { optionalBool, optionalNode, optionalString } from "../../utils/propValidators";
import { ClientSetupWizard } from "./ClientSetupWizard";

/**
 * Clients directory — laid out to the MBO Rewards Client Operations v5 reference (#clients):
 * .pagehead, five-across .kpis, a .filters bar inside the panel, the thirteen-column .data table
 * and .pagination.
 *
 * Every value is read from GET /clients. That endpoint already returns, per row, the client
 * record plus `opsSummary` and `setupProgress.checklist`, so the directory needs no second call
 * per client. It caps pageSize at 200, which covers the whole client set in one request; the KPIs
 * and filters are therefore computed over every client, not just the visible page.
 */
const FETCH_PAGE_SIZE = 200;
const PAGE_SIZE = 25;

const DELIVERY_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "API_ONLY", label: "API Only" },
  { value: "PORTAL_ONLY", label: "Portal Only" },
  { value: "API_AND_PORTAL", label: "API + Portal" },
];

const ACTIVATION_FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "setup", label: "Setup In Progress" },
];

const AGREEMENT_LABELS = {
  NONE: "None",
  DRAFT: "Draft",
  SENT: "Sent",
  PENDING: "Pending",
  SIGNED: "Signed",
};

/* .status pill and its tones, at the reference's exact tokens. */
const PILL_TONES = {
  good: "bg-[#eaf7ef] text-[#087a55]",
  warn: "bg-[#fff7e6] text-[#9a6700]",
  bad: "bg-[#fff1f0] text-[#b42318]",
  neutral: "bg-[#f2f4f7] text-[#475467]",
};

function Pill({ tone = "neutral", children }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-[7px] py-[3px] text-[11px] font-extrabold ${
        PILL_TONES[tone] || PILL_TONES.neutral
      }`}
    >
      {children}
    </span>
  );
}

function countryName(code) {
  if (!code) return "—";
  const match = COUNTRIES.find((c) => c.code === String(code).toUpperCase());
  return match ? match.name : String(code).toUpperCase();
}

function clientType(row) {
  const parts = [row.category, row.subCategory].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  return row.industry || "—";
}

/*
  Per-row derivations. Each one reads the backend's own flags — needsApi / needsPortal /
  apiKeyIssued / administratorConfigured come from setupProgress.checklist, which the server
  derives with the same rules the activation gate uses. Nothing here re-decides readiness.
*/
function apiCell(row) {
  const c = row.setupProgress?.checklist;
  const needsApi = c ? c.needsApi : row.deliveryMethod !== "PORTAL_ONLY";
  if (!needsApi) return { tone: "neutral", text: "Not Used" };
  // apiKeyIssued is production-specific (setupProgress.js: needsApi ? hasProductionKey : true).
  if (c?.apiKeyIssued) return { tone: "good", text: "Active" };
  return { tone: "warn", text: "Production Pending" };
}

function portalCell(row) {
  const c = row.setupProgress?.checklist;
  const needsPortal = c ? c.needsPortal : row.deliveryMethod !== "API_ONLY";
  if (!needsPortal) return { tone: "neutral", text: "Not Used" };
  if (c?.administratorConfigured) return { tone: "good", text: "Active" };
  return { tone: "warn", text: "Pending" };
}

function activationCell(row) {
  if (row.status === "ACTIVE") return { tone: "good", text: "Active" };
  return { tone: "warn", text: "Pending" };
}

function accountCell(row) {
  if (row.status === "ACTIVE") return { tone: "good", text: "Active" };
  if (row.status === "SUSPENDED") return { tone: "bad", text: "Suspended" };
  if (row.status === "OFFBOARDED") return { tone: "neutral", text: "Offboarded" };
  return { tone: "warn", text: "Setup" };
}

function isApiActive(row) {
  const c = row.setupProgress?.checklist;
  return Boolean(c?.needsApi && c?.apiKeyIssued);
}

/** Not yet live, and the backend's own readiness flag says prerequisites are still outstanding. */
function needsReview(row) {
  return row.status === "PROSPECT" && row.opsSummary?.readyForActivation !== true;
}

/* .kpi */
function Kpi({ label, value, hint, title }) {
  return (
    <div className="rounded-[9px] border border-[#dfe6ee] bg-white px-3.5 py-[13px]" title={title}>
      <span className="block text-[11px] font-extrabold uppercase text-[#667085]">{label}</span>
      <strong className="mt-[5px] block text-[21px] font-bold leading-tight text-[#101828]">{value}</strong>
      <small className="text-xs text-[#98a2b3]">{hint}</small>
    </div>
  );
}

/* .filter — uppercase 10px label over a 36px control. */
function FilterField({ label, grow = false, children }) {
  return (
    <div className={grow ? "min-w-[230px] flex-1" : "min-w-[145px]"}>
      <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[.05em] text-[#667085]">{label}</span>
      {children}
    </div>
  );
}

const CONTROL =
  "h-9 w-full rounded-[7px] border border-[#dfe6ee] bg-white px-[9px] text-sm text-[#101828] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";

const TH = "whitespace-nowrap border-b border-[#dfe6ee] bg-[#f8fafc] px-[11px] py-2.5 text-left text-[11px] font-semibold text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#edf1f5] px-[11px] py-2.5 align-middle text-xs text-[#101828]";

export function ClientsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSIONS.CLIENTS_MANAGE);
  const [filters, setFilters] = useState({ country: "", delivery: "", activation: "", search: "" });
  const [listPage, setListPage] = useState(1);
  const [setupClient, setSetupClient] = useState(null);
  const [setupStep, setSetupStep] = useState(1);
  const [searchParams, setSearchParams] = useSearchParams();

  // One request for the whole directory; filtering and paging happen over the full set below.
  const { rows, loading, error, reload, pagination } = usePagedQuery("/clients", {}, { pageSize: FETCH_PAGE_SIZE });
  const serverTotal = pagination?.total ?? rows.length;
  const complete = rows.length >= serverTotal;

  const updateMutation = useMutation("PATCH", {
    successMessage: "Client updated.",
    onSuccess: () => reload(),
  });

  const deleteMutation = useMutation("DELETE", {
    successMessage: "Client deleted.",
    onSuccess: () => reload(),
  });

  // Deep links (?client=<id>&step=<1-5>, ?create=1) — the old /clients/:id/* URLs redirect here.
  const deepLinkClientId = searchParams.get("client");
  const deepLinkStep = Number(searchParams.get("step")) || 1;
  const deepLinkCreate = searchParams.get("create") === "1";
  useEffect(() => {
    if (deepLinkCreate) {
      if (canManage) openSetup({}, 1);
      setSearchParams({}, { replace: true });
      return;
    }
    if (!deepLinkClientId || loading) return;
    // The wizard reloads the full record from GET /clients/:id/onboarding, so an id is enough
    // when the client is beyond the first page of the directory.
    // Same gate as the row's "Open Client" button; read-only users stay on the directory.
    if (canManage) {
      const match = rows.find((r) => String(r.id) === deepLinkClientId) || { id: deepLinkClientId };
      openSetup(match, Math.min(5, Math.max(1, deepLinkStep)));
    }
    setSearchParams({}, { replace: true });
  }, [deepLinkClientId, deepLinkStep, deepLinkCreate, loading, rows, canManage, setSearchParams]);

  function setFilter(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setListPage(1);
  }

  function openSetup(client, step = 1) {
    setSetupClient(client);
    setSetupStep(step);
  }

  function handleDelete(row) {
    const confirmed = window.confirm(
      `Delete client "${row.name}"? This removes them from the client list and offboards the account.`,
    );
    if (!confirmed) return;
    deleteMutation.mutate(`/clients/${row.id}`);
  }

  // .kpis — counted over every client returned, never over the visible page.
  const kpis = useMemo(
    () => ({
      total: serverTotal,
      active: rows.filter((r) => r.status === "ACTIVE").length,
      setup: rows.filter((r) => r.status === "PROSPECT").length,
      apiActive: rows.filter(isApiActive).length,
      needsReview: rows.filter(needsReview).length,
    }),
    [rows, serverTotal],
  );

  // Country options come from the clients that actually exist, not a fixed list.
  const countryOptions = useMemo(() => {
    const codes = [...new Set(rows.map((r) => r.country).filter(Boolean))];
    return [
      { value: "", label: "All" },
      ...codes
        .map((code) => ({ value: code, label: countryName(code) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  }, [rows]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.country && r.country !== filters.country) return false;
      if (filters.delivery && (r.deliveryMethod || "API_AND_PORTAL") !== filters.delivery) return false;
      if (filters.activation === "active" && r.status !== "ACTIVE") return false;
      if (filters.activation === "setup" && r.status !== "PROSPECT") return false;
      if (q && !String(r.name || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(listPage, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const firstShown = filtered.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(currentPage * PAGE_SIZE, filtered.length);

  if (setupClient) {
    return (
      <ClientSetupWizard
        client={setupClient}
        initialStep={setupStep}
        onClose={() => {
          setSetupClient(null);
          reload();
        }}
        onClientUpdated={(next) => setSetupClient(next)}
      />
    );
  }

  return (
    <div className="text-sm text-[#101828]">
      {/* .pagehead */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 text-2xl font-bold">Clients</h1>
          <p className="mt-[5px] text-[#667085]">
            Global client directory. Open a client to manage all client-specific information in one workspace.
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openSetup({}, 1)}
              className="rounded-lg border border-[#101828] bg-[#101828] px-3 py-[9px] font-bold text-white hover:bg-[#1d2939]"
            >
              + Add Client
            </button>
          </div>
        ) : null}
      </div>

      {/* .kpis */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Total Clients" value={kpis.total} hint="All accounts" />
        <Kpi label="Active" value={kpis.active} hint="Live clients" />
        <Kpi label="Setup In Progress" value={kpis.setup} hint="Not activated" />
        <Kpi
          label="API Active"
          value={kpis.apiActive}
          hint="Production access"
          title="API delivery clients holding an active Production credential."
        />
        <Kpi
          label="Needs Review"
          value={kpis.needsReview}
          hint="Activation blockers"
          title="Not yet active, and the backend reports activation prerequisites still outstanding."
        />
      </div>

      {!complete ? (
        <p className="mb-3 rounded-lg border border-[#fedf89] bg-[#fffaf0] px-3 py-2 text-xs text-[#7a5b00]">
          Showing the first {rows.length} of {serverTotal} clients. Counts and filters cover those {rows.length}.
        </p>
      ) : null}

      {/* .panel */}
      <div className="mb-4 overflow-hidden rounded-[9px] border border-[#dfe6ee] bg-white">
        {/* .filters */}
        <div className="flex flex-wrap gap-2.5 border-b border-[#dfe6ee] bg-[#fbfcfd] px-4 py-3">
          <FilterField label="Country">
            <select className={CONTROL} value={filters.country} onChange={(e) => setFilter("country", e.target.value)}>
              {countryOptions.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Delivery Mode">
            <select className={CONTROL} value={filters.delivery} onChange={(e) => setFilter("delivery", e.target.value)}>
              {DELIVERY_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Activation">
            <select
              className={CONTROL}
              value={filters.activation}
              onChange={(e) => setFilter("activation", e.target.value)}
            >
              {ACTIVATION_FILTER_OPTIONS.map((o) => (
                <option key={o.value || "all"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Search" grow>
            <input
              className={CONTROL}
              placeholder="Client name"
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
            />
          </FilterField>
        </div>

        {/* .table-wrap > table.data */}
        <div className="overflow-auto">
          <table className="w-full min-w-[1200px] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Client</th>
                <th className={TH}>Country</th>
                <th className={TH}>Client Type</th>
                <th className={TH}>Agreement</th>
                <th className={TH}>Commercials</th>
                <th className={TH}>Assigned Campaigns</th>
                <th className={TH}>Active Campaigns</th>
                <th className={TH}>API</th>
                <th className={TH}>Portal</th>
                <th className={TH}>Activation</th>
                <th className={TH}>Account</th>
                <th className={TH}>Last Updated</th>
                <th className={TH}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className={`${TD} text-[#667085]`} colSpan={13}>
                    Loading clients…
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className={TD} colSpan={13}>
                    <span className="text-rose-700">{error}</span>{" "}
                    <button type="button" className="font-bold text-[#2563eb]" onClick={() => reload()}>
                      Retry
                    </button>
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td className={`${TD} text-[#667085]`} colSpan={13}>
                    {rows.length === 0 ? "No clients yet. Use + Add Client to create one." : "No clients match these filters."}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const agreement = row.agreementStatus || "NONE";
                  const commercial = Boolean(row.opsSummary?.commercialConfigured ?? row.commercialModel);
                  const api = apiCell(row);
                  const portal = portalCell(row);
                  const activation = activationCell(row);
                  const account = accountCell(row);
                  return (
                    <tr key={row.id}>
                      <td className={TD}>
                        <b>{row.name}</b>
                      </td>
                      <td className={TD}>{countryName(row.country)}</td>
                      <td className={TD}>{clientType(row)}</td>
                      <td className={TD}>
                        <Pill tone={agreement === "SIGNED" ? "good" : "warn"}>{AGREEMENT_LABELS[agreement] || agreement}</Pill>
                      </td>
                      <td className={TD}>
                        <Pill tone={commercial ? "good" : "warn"}>{commercial ? "Configured" : "Pending"}</Pill>
                      </td>
                      <td className={TD}>{row.opsSummary?.assignedCount ?? 0}</td>
                      <td className={TD}>{row.opsSummary?.publishedCount ?? 0}</td>
                      <td className={TD}>
                        <Pill tone={api.tone}>{api.text}</Pill>
                      </td>
                      <td className={TD}>
                        <Pill tone={portal.tone}>{portal.text}</Pill>
                      </td>
                      <td className={TD}>
                        <Pill tone={activation.tone}>{activation.text}</Pill>
                      </td>
                      <td className={TD}>
                        <Pill tone={account.tone}>{account.text}</Pill>
                      </td>
                      {/* GET /clients does not return updatedAt yet (toClientSummaryDto omits it). */}
                      <td className={`${TD} text-[#98a2b3]`}>—</td>
                      <td className={TD}>
                        {canManage ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openSetup(row, 1)}
                              className="rounded-lg border border-[#dfe6ee] bg-white px-[9px] py-1.5 text-xs font-bold text-[#344054] hover:bg-[#f8fafc]"
                            >
                              Open Client
                            </button>
                            <ActionMenu
                              items={[
                                {
                                  label: "Suspend",
                                  visible: row.status === "ACTIVE",
                                  onClick: () => updateMutation.mutate(`/clients/${row.id}`, { status: "SUSPENDED" }),
                                },
                                {
                                  label: "Offboard",
                                  danger: true,
                                  visible: row.status !== "OFFBOARDED",
                                  onClick: () => updateMutation.mutate(`/clients/${row.id}`, { status: "OFFBOARDED" }),
                                },
                                {
                                  label: "Delete",
                                  danger: true,
                                  onClick: () => handleDelete(row),
                                },
                              ]}
                            />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* .pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe6ee] px-3.5 py-3 text-[#667085]">
          <span>
            Showing {firstShown}–{lastShown} of {filtered.length} client{filtered.length === 1 ? "" : "s"}
          </span>
          <div className="flex flex-wrap gap-[5px]">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setListPage(n)}
                aria-current={n === currentPage ? "page" : undefined}
                className={`rounded-md border px-2 py-[5px] ${
                  n === currentPage
                    ? "border-[#8db2ff] bg-[#eef4ff] text-[#1d4ed8]"
                    : "border-[#dfe6ee] bg-white text-[#344054] hover:bg-[#f8fafc]"
                }`}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => setListPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-md border border-[#dfe6ee] bg-white px-2 py-[5px] text-[#344054] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-45"
            >
              Next
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

Pill.propTypes = { tone: optionalString, children: optionalNode };
Kpi.propTypes = { label: optionalNode, value: optionalNode, hint: optionalNode, title: optionalString };
FilterField.propTypes = { label: optionalNode, grow: optionalBool, children: optionalNode };
