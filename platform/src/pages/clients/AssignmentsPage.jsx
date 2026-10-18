import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { useMutation } from "../../hooks/useMutation";
import { useCommissionByAssignment } from "../../hooks/useCommissionByAssignment";
import { useAuth } from "../../context/AuthContext";
import { canViewCommission, hasPermission, PERMISSIONS } from "../../auth/permissions";
import { PageLayout } from "../../components/layout/PageLayout";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { ActionMenu } from "../../components/ui/ActionMenu";
import { Badge } from "../../components/ui/Badge";
import { StatusBadge } from "../helpers";
import { DateCell, Truncate } from "../../components/ui/TableCells";
import { commissionColumns, withAssignmentCommission } from "../../utils/commissionDisplay";

const STATUS_OPTIONS = [
  { value: "ASSIGNED", label: "Draft (Assigned)" },
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "REVOKED", label: "Archived" },
];

const FILTER_DEFS = [{ key: "status", label: "Status", options: STATUS_OPTIONS, allLabel: "All statuses" }];

function formatMoney(value, currency) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  const formatted = num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${formatted}` : formatted;
}

function formatOrders(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function AssignmentsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, PERMISSIONS.CLIENTS_MANAGE);
  const showCommission = canViewCommission(user);
  const [filters, setFilters] = useState({ status: "" });

  const { rulesByAssignmentId } = useCommissionByAssignment({ enabled: showCommission });

  // Master Catalog links here with ?clientId= to show one client's assignments.
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get("clientId") || "";

  const queryFilters = useMemo(
    () => Object.fromEntries(Object.entries({ ...filters, clientId }).filter(([, v]) => v)),
    [filters, clientId],
  );
  const { rows, loading, error, reload, page, setPage, pagination, meta } = usePagedQuery(
    "/client-assignments",
    queryFilters,
    { pageSize: 25 },
  );
  const totalCampaigns = meta?.totalCampaigns ?? pagination.total ?? rows.length;
  const displayRows = useMemo(
    () => rows.map((row) => withAssignmentCommission(row, rulesByAssignmentId)),
    [rows, rulesByAssignmentId],
  );

  const updateMutation = useMutation("PATCH", {
    successMessage: "Assignment updated.",
    onSuccess: () => reload(),
  });

  const columns = useMemo(
    () => [
      {
        key: "client",
        label: "Client",
        minWidth: 120,
        render: (row) => (
          <Truncate className="font-medium text-slate-900">{row.client?.name ?? row.clientId ?? "—"}</Truncate>
        ),
      },
      {
        key: "canonicalCampaign",
        label: "Campaign",
        minWidth: 220,
        render: (row) => (
          <Truncate>{row.canonicalCampaign?.displayName ?? row.canonicalCampaignId ?? "—"}</Truncate>
        ),
      },
      {
        key: "supplier",
        label: "Supplier",
        minWidth: 110,
        defaultHidden: true,
        render: (row) => {
          const suppliers = row.suppliers?.length
            ? row.suppliers
            : row.supplierLabel
              ? [row.supplierLabel]
              : [];
          if (!suppliers.length) return <span className="text-slate-400">—</span>;
          return <Truncate title={suppliers.join(", ")}>{suppliers.join(", ")}</Truncate>;
        },
      },
      {
        key: "status",
        label: "Status",
        minWidth: 150,
        render: (row) => (
          <div className="flex flex-nowrap items-center gap-1.5">
            <StatusBadge status={row.status} />
            {row.published ? <Badge variant="success">Live</Badge> : <Badge>Draft</Badge>}
          </div>
        ),
      },
      {
        key: "published",
        label: "Published",
        minWidth: 90,
        defaultHidden: true,
        render: (row) => (row.published ? <Badge variant="success">Yes</Badge> : <Badge>No</Badge>),
      },
      {
        key: "grossOrders",
        label: "Gross Orders",
        title: "Gross order count from attributed conversions or synced supplier performance",
        minWidth: 110,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatOrders(row.grossOrders),
      },
      {
        key: "netOrders",
        label: "Net Orders",
        title: "Net / validated order count from attributed conversions or synced supplier performance",
        minWidth: 110,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatOrders(row.netOrders),
      },
      {
        key: "grossOrderValue",
        label: "Gross Order $",
        title: "Gross order value",
        minWidth: 120,
        defaultHidden: true,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatMoney(row.grossOrderValue, row.ordersCurrency),
      },
      {
        key: "netOrderValue",
        label: "Net Order $",
        title: "Net order value",
        minWidth: 120,
        defaultHidden: true,
        className: "text-right tabular-nums",
        headerClassName: "text-right",
        render: (row) => formatMoney(row.netOrderValue, row.ordersCurrency),
      },
      ...commissionColumns(user),
      {
        key: "createdAt",
        label: "Created",
        minWidth: 130,
        render: (row) => <DateCell value={row.createdAt} />,
      },
      {
        key: "actions",
        label: "",
        minWidth: 48,
        render: (row) =>
          canManage ? (
            <ActionMenu
              items={[
                {
                  label: "Publish",
                  visible: !(row.published && row.status === "ACTIVE"),
                  onClick: () => updateMutation.mutate(`/client-assignments/${row.id}`, { lifecycle: "published" }),
                },
                {
                  label: "Pause",
                  visible: row.status === "ACTIVE",
                  onClick: () => updateMutation.mutate(`/client-assignments/${row.id}`, { lifecycle: "paused" }),
                },
                {
                  label: "Archive",
                  danger: true,
                  visible: row.status !== "REVOKED",
                  onClick: () => updateMutation.mutate(`/client-assignments/${row.id}`, { lifecycle: "archived" }),
                },
              ]}
            />
          ) : null,
      },
    ],
    [canManage, updateMutation, user],
  );

  return (
    <PageLayout
      title="Assignments"
      subtitle="Campaign allotments per client — publish, pause, or archive from the row menu."
      actions={
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm">
          <span className="text-slate-500">Campaigns</span>{" "}
          <span className="font-semibold tabular-nums text-slate-900">{totalCampaigns ?? "—"}</span>
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={displayRows}
        loading={loading}
        error={error}
        onRetry={reload}
        onRefresh={reload}
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        dense
        emptyTitle="No assignments"
        emptyDescription="Assignments created for clients will appear here."
        toolbar={
          <FilterBar
            compact
            filters={FILTER_DEFS}
            values={filters}
            onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
            onReset={() => setFilters({ status: "" })}
          />
        }
      />
    </PageLayout>
  );
}
