import { useEffect } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "../../../components/ui/DataTable";
import { Drawer } from "../../../components/ui/Drawer";
import { DateCell, UrlCell } from "../../../components/ui/TableCells";
import { CAMPAIGN_RESOLVE_ERROR, RESOLVER_STATE, useCampaignResolver } from "../../../hooks/useCampaignResolver";
import { usePagedQuery } from "../../../hooks/usePagedQuery";
import { optionalBool, optionalFunc, optionalObject, optionalString } from "../../../utils/propValidators";
import { FieldGrid, NoticeBar, NumberCell, Section } from "../networkAccountUi";
import {
  CAMPAIGNS_PATH,
  CLIENT_TRACKING_LINKS_PATH,
  SLUG_DISCLAIMER,
  SUPPLIER_LINK_ID_HELP,
  URL_HELP,
  URL_LABELS,
  toClientLinkView,
  trackingWarnings,
} from "./trackingLinkContract";
import {
  AttributionParam,
  AttributionSummary,
  DeeplinkSupportChip,
  IdChip,
  LinkStatusChip,
  MappingChip,
  SupplierSlugChip,
  SupplierUrl,
  WarningList,
} from "./trackingLinkUi";

function textOrMissing(value, missingLabel = "Not available") {
  if (value == null || value === "") return <span className="text-xs text-slate-400">{missingLabel}</span>;
  return <span className="text-slate-800">{value}</span>;
}

function unavailable(title) {
  return (
    <span className="text-xs text-slate-400" title={title}>
      Not available (backend)
    </span>
  );
}

/**
 * Real client-assignment tracking links for the resolved canonical campaign.
 *
 * These are TrackingLink records, a different canonical object from the registry row. They can
 * only be listed once the campaign has been resolved by ID, because the registry carries no
 * canonical campaign id and the client endpoint filters by one.
 */
function ClientLinks({ canonicalCampaignId, enabled }) {
  const query = usePagedQuery(
    CLIENT_TRACKING_LINKS_PATH,
    { canonicalCampaignId: canonicalCampaignId || undefined },
    {
      pageSize: 25,
      enabled: Boolean(enabled && canonicalCampaignId),
      safeErrorMessage: "Client tracking links could not be loaded.",
    },
  );
  const rows = (query.rows || []).map(toClientLinkView).filter(Boolean);

  if (!enabled) {
    return (
      <NoticeBar tone="info">
        Client tracking links are not shown for this role: listing them needs tracking:read, which this page requires, and
        a resolved canonical campaign, which needs catalog:read.
      </NoticeBar>
    );
  }
  if (!canonicalCampaignId) {
    return (
      <NoticeBar tone="info">
        Client tracking links can only be listed once this row&apos;s canonical campaign is resolved by ID. The registry
        contract carries no canonical campaign id, and nothing is matched by brand or campaign name.
      </NoticeBar>
    );
  }
  return (
    <DataTable
      columns={[
        { key: "clientName", label: "Client", minWidth: 140, render: (r) => textOrMissing(r.clientName) },
        { key: "mboTrackingUrl", label: "Client MBO tracking link", minWidth: 240, render: (r) => <UrlCell url={r.mboTrackingUrl} missingLabel="None" tone="indigo" /> },
        { key: "slug", label: "Slug", minWidth: 140, render: (r) => <IdChip value={r.slug} /> },
        { key: "status", label: "Link status", minWidth: 110, render: (r) => <LinkStatusChip value={r.status} /> },
        { key: "isPrimary", label: "Primary", minWidth: 80, render: (r) => (r.isPrimary ? "Yes" : "No") },
        { key: "assignmentId", label: "Assignment ID", minWidth: 190, render: (r) => <IdChip value={r.assignmentId} /> },
        { key: "campaignSourceId", label: "Campaign source ID", minWidth: 190, defaultHidden: true, render: (r) => <IdChip value={r.campaignSourceId} /> },
        { key: "clickCount", label: "Clicks", minWidth: 80, defaultHidden: true, render: (r) => <NumberCell value={r.clickCount} /> },
        { key: "createdAt", label: "Created", minWidth: 130, defaultHidden: true, render: (r) => <DateCell value={r.createdAt} /> },
      ]}
      rows={rows}
      loading={query.loading}
      error={query.error}
      onRetry={() => query.reload().catch(() => {})}
      page={query.page}
      totalPages={query.pagination?.totalPages}
      total={query.pagination?.total}
      onPageChange={query.setPage}
      dense
      showColumnPicker={false}
      emptyTitle="No client tracking links"
      emptyDescription="No ClientCampaignAssignment tracking link exists for this canonical campaign."
    />
  );
}
ClientLinks.propTypes = { canonicalCampaignId: optionalString, enabled: optionalBool };

function CampaignLink({ row, canReadCatalog, onResolved }) {
  const target = {
    networkSource: row?.networkSource || row?.supplier || null,
    supplierCampaignId: row?.supplierLinkId || null,
    // The registry's `id` IS the MBO SupplierCampaign row id.
    supplierCampaignRowId: row?.id || null,
    campaignSourceId: null,
  };
  const link = useCampaignResolver(CAMPAIGNS_PATH, target, { enabled: canReadCatalog });
  const resolvedId = link.state === RESOLVER_STATE.RESOLVED ? link.campaign?.id ?? null : null;

  // Reported to the drawer after render, never during it.
  useEffect(() => {
    if (onResolved) onResolved(resolvedId);
  }, [onResolved, resolvedId]);

  if (!canReadCatalog) {
    return (
      <span className="text-xs text-slate-500" data-campaign-link="unavailable-for-role">
        Campaign link unavailable for this role. Resolving the campaign needs catalog:read, which this page does not require.
      </span>
    );
  }
  if (link.state === RESOLVER_STATE.LOADING || link.state === RESOLVER_STATE.IDLE) {
    return <span className="text-xs text-slate-400">Resolving campaign…</span>;
  }
  if (resolvedId) {
    return (
      <Link to={`/network/campaigns/${encodeURIComponent(resolvedId)}`} className="text-sm font-medium text-indigo-700 hover:underline">
        View campaign{link.campaign?.campaignName ? ` · ${link.campaign.campaignName}` : ""}
      </Link>
    );
  }
  if (link.state === RESOLVER_STATE.AMBIGUOUS) {
    return <span className="text-xs text-amber-800">Several campaigns carry these identifiers, so no single campaign can be linked.</span>;
  }
  if (link.state === RESOLVER_STATE.ERROR) {
    // Fixed text only: no part of the backend error body is rendered.
    return (
      <span className="text-xs text-rose-700" data-campaign-link="lookup-error">
        {CAMPAIGN_RESOLVE_ERROR}
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-500">
      No canonical campaign matches this registry row&apos;s SupplierCampaign row id. Nothing is linked by brand or name.
    </span>
  );
}
CampaignLink.propTypes = { row: optionalObject, canReadCatalog: optionalBool, onResolved: optionalFunc };

/**
 * Read-only audit detail for one registry row. Nothing here creates, regenerates or edits a link,
 * and no redirect is performed.
 */
export function TrackingLinkDrawer({ row, open, onClose, canReadCatalog, canReadTracking, resolvedCampaignId, onResolved }) {
  if (!row) return null;
  const warnings = trackingWarnings(row);

  return (
    <Drawer open={open} onClose={onClose} title={row.campaignName || row.brandName || "Supplier tracking link"} width="max-w-3xl">
      <div className="space-y-5">
        <NoticeBar tone="info">
          A registry row is a supplier campaign that carries a link, not a TrackingLink record. Supplier URLs are internal;
          the client-facing MBO links are separate records shown in their own section below.
        </NoticeBar>

        <Section title="Link" subtitle="What kind of link this supplier campaign offers">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Network", render: () => <IdChip value={row.networkSource || row.supplier} /> },
              { label: "Network label", render: () => textOrMissing(row.networkSourceLabel) },
              { label: "Link type", render: () => textOrMissing(row.linkType) },
              { label: "Link status", render: () => <LinkStatusChip value={row.linkStatus} /> },
              { label: "Mapping status", render: () => <MappingChip value={row.mappingStatus} /> },
              { label: "Campaign status", render: () => textOrMissing(row.campaignStatus) },
              { label: "Deeplink supported", render: () => <DeeplinkSupportChip row={row} /> },
              { label: "Link kind", render: () => textOrMissing(row.linkKind) },
              { label: "Record updated", render: () => <DateCell value={row.updatedAt} /> },
            ]}
          />
        </Section>

        <Section
          title="Campaign linkage"
          subtitle="A supplier-side campaign id is not a unique campaign identity: the same string can exist on several network rows."
        >
          <FieldGrid
            columns={3}
            fields={[
              { label: "Brand", render: () => textOrMissing(row.brandName) },
              { label: "Campaign", render: () => textOrMissing(row.campaignName) },
              { label: "Supplier campaign ID (supplier side)", render: () => <IdChip value={row.supplierLinkId} title={SUPPLIER_LINK_ID_HELP} /> },
              { label: "Supplier campaign row ID (MBO)", render: () => <IdChip value={row.id} title="MBO SupplierCampaign row id; the registry keys its rows by it" /> },
              { label: "Campaign source ID (MBO)", render: () => unavailable("The registry contract returns no campaign source id") },
              { label: "Network account", render: () => unavailable("The registry contract returns no network account label") },
            ]}
          />
          <div className="mt-3">
            <CampaignLink row={row} canReadCatalog={canReadCatalog} onResolved={onResolved} />
          </div>
        </Section>

        <Section title="Supplier URLs" subtitle="Each URL keeps its own meaning. None of them is collapsed into one tracking link.">
          <FieldGrid
            columns={1}
            fields={[
              { label: URL_LABELS.supplierTrackingLink, render: () => <SupplierUrl field="supplierTrackingLink" url={row.supplierTrackingLink} /> },
              { label: URL_LABELS.landingPageUrl, render: () => <SupplierUrl field="landingPageUrl" url={row.landingPageUrl} /> },
              { label: URL_LABELS.supplierDeeplinkUrl, render: () => <SupplierUrl field="supplierDeeplinkUrl" url={row.supplierDeeplinkUrl} /> },
              { label: "Supplier deeplink tracking URL", render: () => unavailable("The registry contract returns no deeplink tracking URL") },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">{URL_HELP.supplierTrackingLink}</p>
          <p className="mt-1 text-xs text-slate-500">{URL_HELP.landingPageUrl}</p>
          <p className="mt-1 text-xs text-slate-500">{URL_HELP.supplierDeeplinkUrl}</p>
        </Section>

        <Section title="MBO link state" subtitle="A supplier-level slug and a client tracking link are different things.">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Supplier-level MBO slug", render: () => <SupplierSlugChip row={row} /> },
              { label: URL_LABELS.mboTrackingLink, render: () => <SupplierUrl field="mboTrackingLink" url={row.mboTrackingLink} /> },
            ]}
          />
          <NoticeBar tone="warning">{SLUG_DISCLAIMER} The slug is generated on the supplier campaign at sync time.</NoticeBar>
          <div className="mt-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Client MBO tracking links via client assignments
            </p>
            <ClientLinks canonicalCampaignId={resolvedCampaignId} enabled={Boolean(canReadTracking && canReadCatalog)} />
          </div>
        </Section>

        <Section title="Attribution" subtitle="Parameter names only. No attribution value is ever shown.">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Attribution parameter", render: () => <AttributionParam row={row} /> },
              { label: "Parameter mapping", render: () => <AttributionSummary row={row} /> },
              { label: "Redirect chain", render: () => textOrMissing(row.redirectChainSummary) },
              { label: "Source field path", render: () => textOrMissing(row.sourceFieldPath) },
            ]}
          />
          {row.note ? <p className="mt-2 text-xs text-slate-500">{row.note}</p> : null}
        </Section>

        <Section title="Source lineage" subtitle="Where the registry read this row from">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Supplier", render: () => <IdChip value={row.supplier} /> },
              { label: "Registry row ID", render: () => <IdChip value={row.trackingLinkId || row.id} /> },
              { label: "Last synced", render: () => unavailable("The registry contract returns updatedAt only") },
            ]}
          />
        </Section>

        <Section title="Raw evidence reference" subtitle="Reference only. No payload body is rendered here.">
          <NoticeBar tone="info">
            No raw payload reference is returned by this contract for a tracking-link registry row. The campaign&apos;s own
            evidence is available on the Campaign detail page.
          </NoticeBar>
        </Section>

        <Section title="Operational warnings" subtitle="Only states the contract actually proves">
          <WarningList warnings={warnings} />
        </Section>
      </div>
    </Drawer>
  );
}
TrackingLinkDrawer.propTypes = {
  row: optionalObject,
  open: optionalBool,
  onClose: optionalFunc,
  canReadCatalog: optionalBool,
  canReadTracking: optionalBool,
  resolvedCampaignId: optionalString,
  onResolved: optionalFunc,
};
