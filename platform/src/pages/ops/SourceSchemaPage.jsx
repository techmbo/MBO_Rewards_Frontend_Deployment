import { useMemo, useState } from "react";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { PageLayout } from "../../components/layout/PageLayout";
import { DataTable } from "../../components/ui/DataTable";
import { Select } from "../../components/ui/FormControls";
import { StatusPill } from "../../components/ui/StatusPill";
import { displayDate, displayText } from "../../utils/display";
import { NETWORK_SOURCE_OPTIONS } from "./networkFieldCatalog";

const OUTCOME_OPTIONS = [
  { value: "", label: "All outcomes" },
  { value: "MAPPED", label: "Mapped" },
  { value: "SOURCE_PRESENT_MAPPING_MISSING", label: "Mapping missing" },
  { value: "SOURCE_ONLY", label: "Source only" },
  { value: "REVIEW_REQUIRED", label: "Review required" },
  { value: "VERIFY_LIVE", label: "Verify live" },
];

// GET /fields authorizes on `entity_type` and rejects a request without one, so the page always
// sends a record type. Values are the entity types the backend grants read access by.
const ENTITY_TYPE_OPTIONS = [
  { value: "campaign", label: "Campaigns" },
  { value: "coupon", label: "Coupons" },
  { value: "conversion", label: "Conversions" },
  { value: "performance", label: "Reporting" },
  { value: "payment", label: "Payments" },
];

function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return "—";
  return `${Math.round(rate * 100)}%`;
}

/**
 * Source Schema Registry — observed field/path/type layer from immutable raw payloads.
 */
export function SourceSchemaPage() {
  const [filters, setFilters] = useState({ network: "", entity_type: "campaign", mapping_status: "" });
  const queryFilters = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    [filters],
  );
  const { rows, loading, error, refresh, page, setPage, pagination } = usePagedQuery("/fields", queryFilters, {
    pageSize: 50,
  });

  const columns = useMemo(
    () => [
      {
        key: "networkSource",
        label: "Network",
        minWidth: 120,
        render: (r) => displayText(r.networkSource || r.source),
      },
      {
        key: "sourceObject",
        label: "Source Object",
        minWidth: 120,
        render: (r) => displayText(r.sourceObject || r.entityType),
      },
      {
        key: "sourcePath",
        label: "Source Path",
        minWidth: 180,
        render: (r) => displayText(r.sourcePath || r.fieldPath),
      },
      {
        key: "sourceType",
        label: "Type",
        minWidth: 90,
        render: (r) => displayText(r.sourceType || r.dataType),
      },
      {
        key: "sampleValue",
        label: "Sample",
        minWidth: 140,
        render: (r) => displayText(r.sampleValue || r.observedExample),
      },
      {
        key: "occurrenceRate",
        label: "Occurrence",
        minWidth: 100,
        render: (r) => displayText(formatRate(r.occurrenceRate)),
      },
      {
        key: "mboTarget",
        label: "MBO Target",
        minWidth: 140,
        render: (r) => displayText(r.mboTarget || "—"),
      },
      {
        key: "fieldMappingOutcome",
        label: "Outcome",
        minWidth: 150,
        render: (r) => (
          <StatusPill
            status={r.fieldMappingOutcome || r.mappingStatus || (r.mboTarget ? "MAPPED" : "SOURCE_ONLY")}
          />
        ),
      },
      {
        key: "lastSeenAt",
        label: "Last Seen",
        minWidth: 120,
        render: (r) => displayDate(r.lastSeenAt || r.updatedAt),
      },
      {
        key: "firstSeenAt",
        label: "First Seen",
        minWidth: 120,
        defaultHidden: true,
        render: (r) => displayDate(r.firstSeenAt),
      },
    ],
    [],
  );

  return (
    <PageLayout
      eyebrow="Data Integrity"
      title="Source Schema"
      subtitle="Observed API fields from immutable raw payloads. Field outcomes distinguish mapped paths, source-only evidence, and engineering defects."
    >
      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          label="Network Source"
          value={filters.network}
          onChange={(e) => setFilters((p) => ({ ...p, network: e.target.value }))}
          options={NETWORK_SOURCE_OPTIONS}
        />
        <Select
          label="Record Type"
          value={filters.entity_type}
          onChange={(e) => setFilters((p) => ({ ...p, entity_type: e.target.value }))}
          options={ENTITY_TYPE_OPTIONS}
        />
        <Select
          label="Outcome"
          value={filters.mapping_status}
          onChange={(e) => setFilters((p) => ({ ...p, mapping_status: e.target.value }))}
          options={OUTCOME_OPTIONS}
        />
      </div>
      <DataTable
        dense
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={refresh}
        onRefresh={refresh}
        page={page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        onPageChange={setPage}
        emptyTitle="No observed source fields"
        emptyDescription="Fields register automatically when network sync stores immutable raw payloads."
      />
    </PageLayout>
  );
}
