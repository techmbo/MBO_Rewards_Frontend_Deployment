import { useMemo, useState } from "react";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { PageLayout } from "../../components/layout/PageLayout";
import { DataTable } from "../../components/ui/DataTable";
import { FilterBar } from "../../components/ui/FilterBar";
import { formatDate } from "../helpers";

const COLUMNS = [
  { key: "subId", label: "Sub ID" },
  { key: "trackingLinkId", label: "Tracking Link" },
  { key: "country", label: "Country" },
  { key: "device", label: "Device" },
  { key: "clickedAt", label: "Clicked", render: (row) => formatDate(row.clickedAt) },
];

const FILTER_DEFS = [
  { key: "search", type: "search", label: "Search", placeholder: "Sub ID..." },
  { key: "country", type: "search", label: "Country", placeholder: "Country code..." },
];

export function ClicksPage() {
  const [filters, setFilters] = useState({ search: "", country: "" });
  const queryFilters = useMemo(() => {
    const next = {};
    if (filters.search) next.search = filters.search;
    // Backend clickListQuerySchema requires an ISO-3166 alpha-2 code; only send it once complete.
    const country = String(filters.country || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) next.country = country;
    return next;
  }, [filters]);
  const { rows, loading, error, reload, page, setPage, pagination } = usePagedQuery(
    "/clicks",
    queryFilters,
    { pageSize: 25 },
  );

  return (
    <PageLayout title="Clicks" subtitle="Attributed click events">
      <FilterBar
        filters={FILTER_DEFS}
        values={filters}
        onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}
        onReset={() => setFilters({ search: "", country: "" })}
      />
      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        onRefresh={reload}
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        emptyTitle="No clicks"
        emptyDescription="Click events are recorded via tracking links."
      />
    </PageLayout>
  );
}
