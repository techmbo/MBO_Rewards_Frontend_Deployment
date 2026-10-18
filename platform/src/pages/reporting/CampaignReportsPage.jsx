import { useMemo, useState } from "react";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { useAuth } from "../../context/AuthContext";
import { canViewCommission } from "../../auth/permissions";
import { PageLayout } from "../../components/layout/PageLayout";
import { DataTable } from "../../components/ui/DataTable";
import { Input } from "../../components/ui/FormControls";

function buildColumns(showCommission) {
  const cols = [
    { key: "dimensionId", label: "Campaign ID" },
    { key: "clickCount", label: "Clicks" },
    { key: "conversionCount", label: "Conversions" },
    { key: "conversionRate", label: "CVR" },
    { key: "epc", label: "EPC" },
  ];
  if (showCommission) {
    cols.push(
      { key: "grossCommission", label: "Gross Commission" },
      { key: "clientCommission", label: "Client Commission" },
      { key: "mboCommission", label: "MBO Commission" },
    );
  }
  return cols;
}

export function CampaignReportsPage() {
  const { user } = useAuth();
  const showCommission = canViewCommission(user);
  const [filters, setFilters] = useState({ fromDate: "", toDate: "" });
  const queryFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    [filters],
  );
  const columns = useMemo(() => buildColumns(showCommission), [showCommission]);
  const { rows, loading, error, reload, page, setPage, pagination } = usePagedQuery(
    "/reports/campaign",
    queryFilters,
    { pageSize: 25 },
  );

  return (
    <PageLayout title="Campaign Reports" subtitle="Performance aggregated by campaign">
      <div className="mb-4 flex flex-wrap gap-3">
        <Input label="From" type="date" value={filters.fromDate} onChange={(e) => setFilters((p) => ({ ...p, fromDate: e.target.value }))} />
        <Input label="To" type="date" value={filters.toDate} onChange={(e) => setFilters((p) => ({ ...p, toDate: e.target.value }))} />
      </div>
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
        emptyTitle="No campaign reports"
        emptyDescription="Campaign-level reports appear after aggregation."
      />
    </PageLayout>
  );
}
