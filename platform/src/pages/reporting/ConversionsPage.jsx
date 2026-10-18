import { useMemo, useState } from "react";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { useAuth } from "../../context/AuthContext";
import { canViewCommission } from "../../auth/permissions";
import { PageLayout } from "../../components/layout/PageLayout";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { StatusBadge, formatDate } from "../helpers";
import { formatCommission } from "../../utils/commissionDisplay";

function buildColumns(showCommission) {
  const cols = [
    { key: "supplier", label: "Supplier" },
    { key: "supplierConversionId", label: "External ID" },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.status} /> },
    { key: "currency", label: "Currency" },
    { key: "conversionDate", label: "Converted", render: (row) => formatDate(row.conversionDate) },
  ];
  if (showCommission) {
    cols.push(
      {
        key: "supplierCommission",
        label: "Gross Commission",
        render: (row) => formatCommission(row.approvedCommission ?? row.supplierCommission),
      },
      {
        key: "clientCommission",
        label: "Client Commission",
        render: (row) => formatCommission(row.clientCommission),
      },
      {
        key: "mboCommission",
        label: "MBO Commission",
        render: (row) => formatCommission(row.mboCommission),
      },
    );
  }
  return cols;
}

const FILTER_DEFS = [
  {
    key: "status",
    label: "Status",
    options: [
      { value: "PENDING", label: "Pending" },
      { value: "APPROVED", label: "Approved" },
      { value: "REJECTED", label: "Rejected" },
    ],
  },
  {
    key: "supplier",
    label: "Supplier",
    options: [
      { value: "OPTIMISE", label: "Optimise" },
      { value: "BOOSTINY", label: "Boostiny" },
      { value: "TRACKIER", label: "Trackier" },
    ],
  },
];

export function ConversionsPage() {
  const { user } = useAuth();
  const showCommission = canViewCommission(user);
  const [filters, setFilters] = useState({ status: "", supplier: "" });
  const queryFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    [filters],
  );
  const columns = useMemo(() => buildColumns(showCommission), [showCommission]);
  const { rows, loading, error, reload, page, setPage, pagination } = usePagedQuery(
    "/conversions",
    queryFilters,
    { pageSize: 25 },
  );

  return (
    <PageLayout title="Conversions" subtitle="Attributed conversion events">
      <FilterBar
        filters={FILTER_DEFS}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onReset={() => setFilters({ status: "", supplier: "" })}
      />
      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        onRefresh={reload}
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        emptyTitle="No conversions"
        emptyDescription="Conversions are ingested from supplier networks."
      />
    </PageLayout>
  );
}
