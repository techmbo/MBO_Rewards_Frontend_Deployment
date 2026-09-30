import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchApi, postApi } from "../../api";
import { usePagedQuery } from "../../hooks/usePagedQuery";
import { useApi } from "../../hooks/useApi";
import { useAuth } from "../../context/AuthContext";
import { PageLayout } from "../../components/layout/PageLayout";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { StatusPill } from "../../components/ui/StatusPill";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import {
  NetworkCampaignFilterBar,
  NETWORK_CAMPAIGN_EMPTY_FILTERS,
  updateNetworkCampaignFilter,
} from "../../components/ops/NetworkCampaignFilterBar";
import { buildImportedRecordsQuery } from "../ops/networkCampaignFilters";
import { countryListTitle, displayCountry, displayDate, displayText, humanizeFieldLabel, truncateWords, coerceDetailValue, isCreativeArray, isCountryFieldKey } from "../../utils/display";
import { UrlCell } from "../../components/ui/TableCells";
import { BrandIdentity, brandFromRow } from "../../components/brand/BrandIdentity";
import { PERMISSIONS, hasAnyPermission } from "../../auth/permissions";
import { Icon } from "../../components/ui/Icon";
import { ScrollableLongText } from "../../components/ui/ScrollableLongText";
import { KeyValueList, KeyValueRow } from "../../components/ui/KeyValueList";
import { CampaignCommissionCell } from "../../components/ops/CampaignCommissionCell";

function DetailField({ label, children, className = "" }) {
  return (
    <div className={className}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children ?? "—"}</dd>
    </div>
  );
}

function stageIcon(state) {
  if (state === "COMPLETED") return <Icon name="check" size={14} />;
  if (state === "NEEDS_REVIEW") return <Icon name="warning" size={14} />;
  if (state === "BLOCKED") return <Icon name="cancel" size={14} />;
  return <Icon name="radio_button_unchecked" size={14} />;
}

function stageClass(state) {
  if (state === "COMPLETED") return "text-emerald-700";
  if (state === "NEEDS_REVIEW") return "text-amber-700";
  if (state === "BLOCKED") return "text-rose-700";
  return "text-slate-400";
}

function MetricCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value == null ? "—" : value}
      </p>
    </div>
  );
}

function DetailFieldValue({ fieldKey, value, depth = 0 }) {
  const parsed = coerceDetailValue(value);
  if (parsed == null) return "—";

  if (fieldKey === "trackierFieldLineage" && typeof parsed === "object" && !Array.isArray(parsed)) {
    return (
      <dl className="space-y-1.5 text-xs">
        {Object.entries(parsed).map(([canonical, meta]) => (
          <div key={canonical} className="rounded border border-slate-200 bg-white px-2 py-1.5">
            <dt className="font-semibold text-slate-700">{canonical}</dt>
            <dd className="mt-0.5 text-slate-600">
              {meta?.sourceField ? (
                <span className="text-slate-500">from {meta.sourceField}: </span>
              ) : null}
              <DetailFieldValue fieldKey={canonical} value={meta?.value} depth={depth + 1} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (fieldKey === "creatives" || isCreativeArray(parsed)) {
    return <CreativeList items={parsed} />;
  }

  if (isCountryFieldKey(fieldKey)) {
    const label = displayCountry(parsed);
    const title = countryListTitle(parsed);
    return (
      <span title={title && title !== label ? title : undefined}>
        {label}
      </span>
    );
  }

  if (typeof parsed === "boolean") {
    return parsed ? "Yes" : "No";
  }

  if (typeof parsed === "number") {
    return String(parsed);
  }

  if (typeof parsed === "string") {
    if (/^https?:\/\//i.test(parsed.trim())) {
      return <TruncateLink href={parsed.trim()} />;
    }
    const text = displayText(parsed, "");
    if (!text) return "—";
    if (text.includes("\n")) {
      return <span className="whitespace-pre-wrap break-words">{text}</span>;
    }
    return <span className="break-words">{text}</span>;
  }

  if (Array.isArray(parsed)) {
    if (parsed.length === 0) return "—";
    if (parsed.every((item) => item == null || typeof item === "string" || typeof item === "number")) {
      return parsed.filter((item) => item != null && item !== "").join(", ");
    }
    return (
      <ul className="list-inside list-disc space-y-1 text-xs">
        {parsed.slice(0, 12).map((item, index) => (
          <li key={index} className="break-words">
            <DetailFieldValue fieldKey={fieldKey} value={item} depth={depth + 1} />
          </li>
        ))}
        {parsed.length > 12 ? (
          <li className="list-none text-slate-500">+{parsed.length - 12} more</li>
        ) : null}
      </ul>
    );
  }

  if (typeof parsed === "object") {
    if (depth >= 2) {
      return <span className="break-all font-mono text-xs text-slate-600">{JSON.stringify(parsed)}</span>;
    }
    return (
      <dl className="overflow-hidden rounded border border-slate-200 bg-white">
        {Object.entries(parsed)
          .slice(0, 24)
          .map(([key, nested]) => (
            <KeyValueRow key={key} label={humanizeFieldLabel(key)}>
              <DetailFieldValue fieldKey={key} value={nested} depth={depth + 1} />
            </KeyValueRow>
          ))}
      </dl>
    );
  }

  return String(parsed);
}

function CreativeList({ items }) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return "—";
  return (
    <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
      {list.slice(0, 24).map((item, index) => {
        const url = item?.full_url ?? item?.url ?? item?.image_url ?? null;
        const title = item?.title || item?.file_name || `Creative ${index + 1}`;
        const width = item?.dimensions?.width;
        const height = item?.dimensions?.height;
        const isImage = String(item?.mime_type || url || "").includes("image");
        return (
          <li
            key={`${url || title}-${index}`}
            className="flex gap-2 rounded-lg border border-slate-200 bg-white p-2"
          >
            {url && isImage ? (
              <img
                src={url}
                alt=""
                className="h-12 w-20 shrink-0 rounded border border-slate-100 object-contain bg-slate-50"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800" title={title}>
                {title}
              </p>
              {width && height ? (
                <p className="text-[11px] text-slate-500">
                  {width}×{height}
                  {item?.mime_type ? ` · ${item.mime_type}` : ""}
                </p>
              ) : null}
              {url ? <TruncateLink href={url} label="Open asset" /> : null}
            </div>
          </li>
        );
      })}
      {list.length > 24 ? (
        <li className="text-xs text-slate-500">+{list.length - 24} more creatives</li>
      ) : null}
    </ul>
  );
}

function KvViewer({ data }) {
  if (!data || typeof data !== "object") {
    return <p className="text-sm text-slate-500">No source data available.</p>;
  }
  const entries = Object.entries(data).slice(0, 80);
  if (!entries.length) {
    return <p className="text-sm text-slate-500">No source data available.</p>;
  }
  return (
    <KeyValueList>
      {entries.map(([key, value]) => (
        <KeyValueRow key={key} label={humanizeFieldLabel(key)}>
          <DetailFieldValue fieldKey={key} value={value} />
        </KeyValueRow>
      ))}
    </KeyValueList>
  );
}

const EMPTY_FILTERS = NETWORK_CAMPAIGN_EMPTY_FILTERS;

function CountryCell({ country }) {
  const label = displayCountry(country);
  const title = countryListTitle(country);
  return (
    <span className="block truncate whitespace-nowrap text-sm text-slate-700" title={title || undefined}>
      {label}
    </span>
  );
}

function TruncateLink({ href, label }) {
  if (!href) return "—";
  const text = label || href;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-block max-w-full break-all text-brand-800 hover:underline"
      title={href}
    >
      {text}
    </a>
  );
}

function AssetsBadges({ assets, assetsLabel }) {
  if (assetsLabel) {
    return (
      <span className="block truncate text-xs text-slate-700" title={assetsLabel}>
        {assetsLabel}
      </span>
    );
  }
  if (!assets) return "—";
  const labels = [];
  if (assets.link) labels.push("Link");
  if (assets.coupon) labels.push("Coupon");
  if (assets.deeplink) labels.push("Deeplink");
  if (assets.feed) labels.push("Feed");
  const text = labels.join(" · ");
  return labels.length ? (
    <span className="block truncate text-xs text-slate-700" title={text}>
      {text}
    </span>
  ) : (
    "—"
  );
}

function BoolOrDash({ value, yes = "Yes", no = "No" }) {
  if (value == null) return "—";
  return value ? yes : no;
}

/**
 * Operational workspace: imported supplier records → normalization pipeline.
 */
export function EntityExplorerPage() {
  const { user } = useAuth();
  const canReprocess = hasAnyPermission(user, [PERMISSIONS.SYNC_TRIGGER]);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [showSource, setShowSource] = useState(false);
  const [actionMsg, setActionMsg] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const recordType = filters.recordType || "campaign";
  const queryFilters = useMemo(() => buildImportedRecordsQuery(filters, { recordType }), [filters, recordType]);

  const { rows, loading, error, reload, page, setPage, pageSize, pagination } = usePagedQuery(
    "/ops/imported-records",
    queryFilters,
    { pageSize: 25 },
  );

  const summaryApi = useApi("/ops/imported-records/summary", { recordType });
  const summary = summaryApi.data?.data ?? null;

  const openDetail = useCallback(async (row) => {
    setDetailLoading(true);
    setDetailError("");
    setShowSource(false);
    setActionMsg("");
    try {
      const json = await fetchApi(`/ops/imported-records/${row.id}`);
      setDetail(json?.data ?? json);
    } catch (err) {
      setDetailError(err?.message || "Failed to load record");
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const updateFilter = (key, value) => {
    setFilters((prev) => updateNetworkCampaignFilter(prev, key, value));
  };

  const runReprocess = async (entityIds) => {
    if (!canReprocess) return;
    setActionBusy(true);
    setActionMsg("");
    try {
      const json = await postApi("/ops/imported-records/reprocess", { entityIds });
      const s = json?.data?.summary ?? json?.summary;
      setActionMsg(
        s
          ? `Reprocess: created ${s.created}, updated ${s.updated}, failed ${s.failed}, catalog linked ${s.catalogLinked ?? 0}`
          : "Reprocess completed",
      );
      await reload();
      await summaryApi.reload();
      if (detail?.id) {
        const refreshed = await fetchApi(`/ops/imported-records/${detail.id}`);
        setDetail(refreshed?.data ?? refreshed);
      }
    } catch (err) {
      setActionMsg(err?.message || "Reprocess failed");
    } finally {
      setActionBusy(false);
    }
  };

  const runRetry = async (mapperErrorId) => {
    if (!canReprocess || !mapperErrorId) return;
    setActionBusy(true);
    setActionMsg("");
    try {
      await postApi("/promotion/retry", { mapperErrorIds: [mapperErrorId] });
      setActionMsg("Retry submitted");
      await reload();
      await summaryApi.reload();
      if (detail?.id) {
        const refreshed = await fetchApi(`/ops/imported-records/${detail.id}`);
        setDetail(refreshed?.data ?? refreshed);
      }
    } catch (err) {
      setActionMsg(err?.message || "Retry failed");
    } finally {
      setActionBusy(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        key: "networkAccount",
        label: "Network",
        minWidth: 140,
        render: (row) => (
          <span className="block truncate font-medium text-slate-900" title={displayText(row.networkAccount)}>
            {displayText(row.network)}
          </span>
        ),
      },
      {
        key: "campaignSource",
        label: "Source",
        minWidth: 120,
        render: (row) => (
          <span className="block truncate font-mono text-xs text-slate-700" title={row.campaignSourceId || ""}>
            {displayText(row.campaignSourceId || row.supplierCampaignExtId || row.sourceRecordId)}
          </span>
        ),
      },
      {
        key: "brand",
        label: "Brand",
        minWidth: 200,
        render: (row) => {
          const b = brandFromRow({
            brandName: typeof row.brand === "string" ? row.brand : row.brandName,
            brand: typeof row.brand === "object" ? row.brand : null,
            brandLogoLink: row.brandLogoLink || row.logoUrl || row.campaignLogoUrl,
            brandWebsiteLink: row.brandWebsiteLink || row.brandWebsite,
          });
          return (
            <BrandIdentity
              name={b.name}
              logoUrl={b.logoUrl}
              truncate={false}
            />
          );
        },
      },
      {
        key: "campaign",
        label: "Campaign",
        minWidth: 220,
        maxWidth: 320,
        render: (row) => (
          <button
            type="button"
            className="block w-full max-w-[18rem] truncate text-left text-sm font-medium text-brand-800 hover:underline"
            onClick={() => openDetail(row)}
            title={row.campaign || row.sourceRecordId || ""}
          >
            {displayText(row.campaign) || row.sourceRecordId || "—"}
          </button>
        ),
      },
      {
        key: "category",
        label: "Category",
        minWidth: 120,
        render: (row) => (
          <span className="block truncate text-sm text-slate-700" title={displayText(row.category)}>
            {displayText(row.category)}
          </span>
        ),
      },
      {
        key: "country",
        label: "Country",
        minWidth: 100,
        render: (row) => <CountryCell country={row.country} />,
      },
      {
        key: "recordType",
        label: "Record Type",
        minWidth: 110,
        render: (row) => (
          <span className="block truncate text-sm text-slate-700" title={displayText(row.recordType || row.entityType)}>
            {displayText(row.recordType || row.entityType)}
          </span>
        ),
      },
      {
        key: "currency",
        label: "Currency",
        minWidth: 90,
        render: (row) => (
          <span className="block truncate text-sm text-slate-700" title={displayText(row.currency)}>
            {displayText(row.currency)}
          </span>
        ),
      },
      {
        key: "type",
        label: "Campaign Type",
        minWidth: 120,
        render: (row) => (
          <span className="block truncate text-sm text-slate-700" title={displayText(row.campaignType)}>
            {displayText(row.campaignType)}
          </span>
        ),
      },
      {
        key: "commission",
        label: "Commission",
        minWidth: 120,
        render: (row) => <CampaignCommissionCell row={row} />,
      },
      {
        key: "commissionAverageDisplay",
        label: "Avg. Commission",
        minWidth: 110,
        render: (row) =>
          row.commissionAverageDisplay ? (
            <span className="text-sm tabular-nums text-slate-800">{row.commissionAverageDisplay}</span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        key: "assets",
        label: "Assets",
        minWidth: 110,
        render: (row) => <AssetsBadges assets={row.assets} assetsLabel={row.assetsLabel} />,
      },
      {
        key: "relationship",
        label: "Relationship",
        minWidth: 120,
        render: (row) =>
          row.relationshipStatus != null ? (
            <StatusPill status={row.relationshipStatus} />
          ) : (
            "—"
          ),
      },
      {
        key: "campaignStatus",
        label: "Campaign Status",
        minWidth: 100,
        render: (row) =>
          row.campaignStatus != null ? <StatusPill status={row.campaignStatus} /> : "—",
      },
      {
        key: "mappingStatus",
        label: "Mapping Status",
        minWidth: 120,
        render: (row) =>
          row.mappingStatus != null ? <StatusPill status={row.mappingStatus} /> : "—",
      },
      {
        key: "isAssignable",
        label: "Is Assignable",
        minWidth: 110,
        render: (row) =>
          row.entityType === "campaign" ? (
            <Badge variant={row.isAssignable ? "success" : "default"}>
              {row.isAssignable ? "Yes" : "No"}
            </Badge>
          ) : (
            "—"
          ),
      },
      {
        key: "sourceStatus",
        label: "Source Status",
        minWidth: 110,
        render: (row) => <StatusPill status={row.sourceStatus} />,
      },
      {
        key: "importedAt",
        label: "Imported At",
        minWidth: 110,
        render: (row) => displayDate(row.importedAt),
      },
      {
        key: "lastUpdated",
        label: "Last Updated",
        minWidth: 110,
        render: (row) => displayDate(row.lastUpdated),
      },
      {
        key: "lastSyncedAt",
        label: "Last Synced",
        minWidth: 110,
        defaultHidden: true,
        render: (row) => displayDate(row.lastSyncedAt),
      },
      {
        key: "issue",
        label: "Issue",
        minWidth: 120,
        maxWidth: 160,
        render: (row) => {
          const full = row.issueCode ? `${row.issue || ""} (${row.issueCode})` : row.issue || "";
          return (
            <span
              className="block max-w-[10rem] truncate whitespace-nowrap text-sm text-slate-600"
              title={full || undefined}
            >
              {truncateWords(row.issue, 4)}
            </span>
          );
        },
      },
      {
        key: "action",
        label: "",
        minWidth: 88,
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => openDetail(row)}>
            Open
          </Button>
        ),
      },
    ],
    [openDetail],
  );

  return (
    <PageLayout
      eyebrow="Network Operation Portal"
      title="Network Campaigns"
      subtitle="Trace supplier imports through normalization. Truth over filled dashboards."
      actions={
        <Link
          to="/suppliers"
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Networks
        </Link>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Imported Records" value={summary?.importedRecords} />
        <MetricCard label="Normalized Campaigns" value={summary?.normalizedCampaigns} />
        <MetricCard label="Needs Review" value={summary?.needsReview} />
      </div>

      {summary?.byNetwork?.length ? (
        <div className="mb-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Network</th>
                <th className="px-3 py-2">Imported campaigns</th>
                <th className="px-3 py-2">Linked</th>
                <th className="px-3 py-2">Needs review</th>
              </tr>
            </thead>
            <tbody>
              {summary.byNetwork.map((n) => (
                <tr key={n.networkSource || n.network} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium">{n.network}</td>
                  <td className="px-3 py-2 tabular-nums">{n.importedCampaigns ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{n.linkedCampaigns ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{n.needsReview ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mb-4">
        <NetworkCampaignFilterBar
          values={filters}
          onChange={updateFilter}
          onReset={() => setFilters(EMPTY_FILTERS)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={reload}
        page={page}
        totalPages={pagination?.totalPages}
        total={pagination?.total}
        pageSize={pagination?.pageSize ?? pageSize}
        onPageChange={setPage}
        emptyTitle="No network campaigns"
        emptyDescription="No network campaigns match these filters."
        onRefresh={reload}
      />

      <Drawer
        open={Boolean(detail) || detailLoading || Boolean(detailError)}
        onClose={() => {
          setDetail(null);
          setDetailError("");
        }}
        title={detail?.campaign || detail?.sourceRecordId || "Imported record"}
        width="max-w-2xl"
      >
        {detailLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {detailError ? <p className="text-sm text-rose-600">{detailError}</p> : null}
        {detail ? (
          <div className="space-y-6">
            {actionMsg ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {actionMsg}
              </p>
            ) : null}

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Pipeline
              </h3>
              <ol className="space-y-2">
                {(detail.pipeline || []).map((stage) => (
                  <li key={stage.key} className={`flex gap-2 text-sm ${stageClass(stage.state)}`}>
                    <span className="w-4 font-semibold">{stageIcon(stage.state)}</span>
                    <div>
                      <p className="font-medium text-slate-800">{stage.label}</p>
                      {stage.detail ? <p className="text-xs text-slate-500">{stage.detail}</p> : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Identity
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Network">{detail.identity?.network || detail.network}</DetailField>
                <DetailField label="Network account">
                  {detail.identity?.networkAccount || detail.networkAccount || "—"}
                </DetailField>
                <DetailField label="Raw payload ID">
                  {detail.identity?.rawPayloadId || detail.rawPayloadId || "—"}
                </DetailField>
                <DetailField label="Supplier campaign ID">
                  {detail.identity?.supplierCampaignId || detail.supplierCampaignExtId || "—"}
                </DetailField>
                <DetailField label="Campaign source ID">
                  {detail.identity?.campaignSourceId || detail.campaignSourceId || "—"}
                </DetailField>
                <DetailField label="Network campaign ID">
                  {detail.identity?.networkCampaignId || detail.networkCampaignId || "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Brand
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Brand</dt>
                  <dd className="mt-1">
                    <BrandIdentity
                      name={detail.brandDetail?.brand || detail.brand}
                      logoUrl={detail.brandDetail?.brandLogoLink || detail.brandLogoLink}
                    />
                  </dd>
                </div>
                <DetailField label="Brand website">
                  <TruncateLink href={detail.brandDetail?.brandWebsite || detail.brandWebsiteLink} />
                </DetailField>
                <DetailField label="Campaign">
                  {detail.brandDetail?.campaign || detail.campaign || "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Source / tracking
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Network tracking link">
                  <TruncateLink href={detail.tracking?.networkTrackingLink || detail.networkTrackingLink} />
                </DetailField>
                <DetailField label="MBO tracking link">
                  <UrlCell
                    url={
                      detail.tracking?.mboTrackingLink ||
                      detail.mboTrackingLink ||
                      detail.normalized?.mboTrackingUrl ||
                      null
                    }
                    missingLabel="Not generated"
                  />
                </DetailField>
                <DetailField label="Tracking link ID">
                  {detail.tracking?.trackingLinkId || detail.trackingLinkId || "—"}
                </DetailField>
                <DetailField label="Network click ID">
                  {detail.tracking?.networkClickId ?? "—"}
                </DetailField>
                <DetailField label="MBO click ID">{detail.tracking?.mboClickId ?? "—"}</DetailField>
                <DetailField label="Sub IDs">
                  {[detail.tracking?.subId1, detail.tracking?.subId2, detail.tracking?.subId3]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Campaign
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Primary category">
                  {detail.campaignDetail?.category || detail.category || "—"}
                </DetailField>
                <DetailField label="Secondary category">
                  {detail.campaignDetail?.secondaryCategory || detail.secondaryCategory || "—"}
                </DetailField>
                <DetailField label="Country">
                  <CountryCell country={detail.campaignDetail?.country ?? detail.country} />
                </DetailField>
                <DetailField label="Currency">
                  {detail.campaignDetail?.currency || detail.currency || "—"}
                </DetailField>
                <DetailField label="Campaign type">
                  {detail.campaignDetail?.campaignType || detail.campaignType || "—"}
                </DetailField>
                <DetailField label="Commercial type">
                  {detail.campaignDetail?.commercialType || detail.commercialType || "—"}
                </DetailField>
                <DetailField label="Channel type">
                  {detail.campaignDetail?.channelType || detail.channelType || "—"}
                </DetailField>
                <DetailField label="Relationship status">
                  {detail.campaignDetail?.relationshipStatus || detail.relationshipStatus || "—"}
                </DetailField>
                <DetailField label="Campaign status">
                  {detail.campaignDetail?.campaignStatus || detail.campaignStatus || "—"}
                </DetailField>
                <DetailField label="Is Assignable">
                  <BoolOrDash
                    value={detail.campaignDetail?.isAssignable ?? detail.isAssignable}
                  />
                </DetailField>
                <DetailField label="Start date">
                  {displayDate(detail.campaignDetail?.startDate || detail.startDate)}
                </DetailField>
                <DetailField label="End date">
                  {displayDate(detail.campaignDetail?.endDate || detail.endDate)}
                </DetailField>
                <DetailField label="Discount %">
                  {detail.campaignDetail?.discountPercent != null
                    ? String(detail.campaignDetail.discountPercent)
                    : detail.discountPercent != null
                      ? String(detail.discountPercent)
                      : "—"}
                </DetailField>
                <DetailField label="Campaign description" className="col-span-2">
                  <ScrollableLongText
                    value={detail.campaignDetail?.campaignDescription || detail.campaignDescription}
                  />
                </DetailField>
                <DetailField label="Promotion description" className="col-span-2">
                  <ScrollableLongText
                    value={detail.campaignDetail?.promotionDescription || detail.promotionDescription}
                  />
                </DetailField>
                <DetailField label="Terms and conditions" className="col-span-2">
                  <ScrollableLongText
                    value={detail.campaignDetail?.termsAndConditions || detail.termsAndConditions}
                  />
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Commercial
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Commission" className="col-span-2">
                  <CampaignCommissionCell row={detail} />
                </DetailField>
                <DetailField label="Avg. commission">
                  {detail.commercial?.commissionAverageDisplay ||
                  detail.commissionAverageDisplay ||
                  "—"}
                </DetailField>
                <DetailField label="Commission type">
                  {detail.commercial?.commissionType || detail.commissionType || "—"}
                </DetailField>
                <DetailField label="Commission rate">
                  {detail.commercial?.commissionRate != null
                    ? String(detail.commercial.commissionRate)
                    : "—"}
                </DetailField>
                <DetailField label="Commission rule count">
                  {detail.commercial?.commissionRuleCount ?? detail.commissionRuleCount ?? "—"}
                </DetailField>
                <DetailField label="Currency">
                  {detail.commercial?.commissionCurrency || "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Assets
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Link">
                  <BoolOrDash value={detail.assetsDetail?.link ?? detail.assets?.link} yes="Available" no="—" />
                </DetailField>
                <DetailField label="Coupon">
                  <BoolOrDash value={detail.assetsDetail?.coupon ?? detail.assets?.coupon} yes="Available" no="—" />
                </DetailField>
                <DetailField label="Deeplink">
                  <BoolOrDash
                    value={detail.assetsDetail?.deeplink ?? detail.assets?.deeplink}
                    yes="Available"
                    no="—"
                  />
                </DetailField>
                <DetailField label="Feed">
                  <BoolOrDash value={detail.assetsDetail?.feed ?? detail.assets?.feed} yes="Available" no="—" />
                </DetailField>
                <DetailField label="Coupon count">
                  {detail.ingestion?.couponCount ?? detail.couponCount ?? "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Ingestion
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Source status">
                  <StatusPill status={detail.ingestion?.sourceStatus || detail.sourceStatus} />
                </DetailField>
                <DetailField label="Mapping status">
                  <StatusPill status={detail.ingestion?.mappingStatus || detail.mappingStatus} />
                </DetailField>
                <DetailField label="Certification">
                  {detail.ingestion?.certificationStatus || detail.certificationStatus || "—"}
                </DetailField>
                <DetailField label="Is Assignable">
                  {detail.entityType === "campaign" ? (
                    <BoolOrDash value={detail.ingestion?.isAssignable ?? detail.isAssignable} />
                  ) : (
                    "—"
                  )}
                </DetailField>
                <DetailField label="Last synced">
                  {displayDate(detail.ingestion?.lastSyncedAt || detail.lastSyncedAt)}
                </DetailField>
                <DetailField label="Last updated">
                  {displayDate(detail.ingestion?.lastUpdated || detail.lastUpdated)}
                </DetailField>
                <DetailField label="Imported at">
                  {displayDate(detail.ingestion?.importedAt || detail.importedAt)}
                </DetailField>
                <DetailField label="Issue">
                  {(() => {
                    const full =
                      detail.ingestion?.issueCode && (detail.ingestion?.issue || detail.issue)
                        ? `${detail.ingestion?.issue || detail.issue} (${detail.ingestion.issueCode})`
                        : detail.ingestion?.issue || detail.issue || "";
                    return (
                      <span className="text-sm text-slate-700" title={full || undefined}>
                        {truncateWords(full, 4)}
                      </span>
                    );
                  })()}
                </DetailField>
                <DetailField label="Source endpoint">
                  {detail.source?.sourceEndpoint || "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Source
              </h3>
              <dl className="grid grid-cols-2 gap-3">
                <DetailField label="Network">{detail.source?.network}</DetailField>
                <DetailField label="Record type">{detail.source?.recordType}</DetailField>
                <DetailField label="Source record ID">{detail.source?.sourceRecordId}</DetailField>
                <DetailField label="Raw payload ref">
                  {detail.source?.rawPayloadReference?.id || "—"}
                </DetailField>
              </dl>
            </section>

            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Detected information
              </h3>
              {Object.keys(detail.detected || {}).length === 0 ? (
                <p className="text-sm text-slate-500">No detected fields on this record.</p>
              ) : (
                <KeyValueList>
                  {Object.entries(detail.detected).map(([key, value]) => (
                    <KeyValueRow key={key} label={humanizeFieldLabel(key)}>
                      <DetailFieldValue fieldKey={key} value={value} />
                    </KeyValueRow>
                  ))}
                </KeyValueList>
              )}
            </section>


            <section className="flex flex-wrap gap-2">
              {canReprocess ? (
                <Button size="sm" disabled={actionBusy} onClick={() => runReprocess([detail.id])}>
                  Reprocess
                </Button>
              ) : null}
              {canReprocess && detail.openMapperErrorId ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={actionBusy}
                  onClick={() => runRetry(detail.openMapperErrorId)}
                >
                  Retry
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setShowSource((v) => !v)}>
                {showSource ? "Hide source data" : "View source data"}
              </Button>
            </section>

            {showSource ? (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Source data
                </h3>
                <KvViewer data={detail.sourceData} />
              </section>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </PageLayout>
  );
}
