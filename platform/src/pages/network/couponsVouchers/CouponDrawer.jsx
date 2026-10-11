import { Link } from "react-router-dom";
import { Drawer } from "../../../components/ui/Drawer";
import { CODE_STATE, URL_AS_CODE_HELP, couponCodeState, safeCouponTitle } from "./couponCodeSafety";
import { DateCell } from "../../../components/ui/TableCells";
import { CAMPAIGN_RESOLVE_ERROR, RESOLVER_STATE, useCampaignResolver } from "../../../hooks/useCampaignResolver";
import { optionalBool, optionalFunc, optionalObject } from "../../../utils/propValidators";
import { FieldGrid, NoticeBar, Section } from "../networkAccountUi";
import { CAMPAIGNS_PATH, couponWarnings } from "./couponContract";
import {
  AttributionConfirmation,
  CouponCode,
  CouponDiscount,
  CouponLifecycleChip,
  CouponLink,
  CouponStatusChip,
  FlagChip,
  IdChip,
  LifecycleConflict,
  ReadableText,
  WarningList,
} from "./couponUi";

function textOrMissing(value, missingLabel = "Not available") {
  if (value == null || value === "") return <span className="text-xs text-slate-400">{missingLabel}</span>;
  return <span className="text-slate-800">{value}</span>;
}

function CampaignLink({ coupon, canReadCatalog }) {
  const target = {
    networkSource: coupon?.networkSource || coupon?.supplier || null,
    supplierCampaignId: coupon?.campaign?.supplierCampaignId || null,
    supplierCampaignRowId: coupon?.supplierCampaignId || null,
    campaignSourceId: null,
  };
  const link = useCampaignResolver(CAMPAIGNS_PATH, target, { enabled: canReadCatalog });

  if (!canReadCatalog) {
    // No request is made: the resolver stays disabled for a role without catalog:read.
    return (
      <span className="text-xs text-slate-500" data-campaign-link="unavailable-for-role">
        Campaign link unavailable for this role. Resolving the campaign needs catalog:read, which this page does not require.
      </span>
    );
  }
  if (link.state === RESOLVER_STATE.LOADING || link.state === RESOLVER_STATE.IDLE) {
    return <span className="text-xs text-slate-400">Resolving campaign…</span>;
  }
  if (link.state === RESOLVER_STATE.RESOLVED && link.campaign?.id) {
    return (
      <Link
        to={`/network/campaigns/${encodeURIComponent(link.campaign.id)}`}
        className="text-sm font-medium text-indigo-700 hover:underline"
      >
        View campaign{link.campaign.campaignName ? ` · ${link.campaign.campaignName}` : ""}
      </Link>
    );
  }
  if (link.state === RESOLVER_STATE.AMBIGUOUS) {
    return (
      <span className="text-xs text-amber-800">
        Several campaigns carry these identifiers, so no single campaign can be linked.
      </span>
    );
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
      No canonical campaign matches this coupon&apos;s SupplierCampaign row. The coupon contract carries no canonical
      campaign id, so nothing is linked by brand or name.
    </span>
  );
}
CampaignLink.propTypes = { coupon: optionalObject, canReadCatalog: optionalBool };

/**
 * Read-only audit detail for one supplier coupon. Nothing here creates, edits, approves or
 * publishes a coupon, and no client coupon assignment is shown or implied.
 */
export function CouponDrawer({ coupon, open, onClose, canReadCatalog }) {
  if (!coupon) return null;
  const warnings = couponWarnings(coupon);

  return (
    <Drawer open={open} onClose={onClose} title={safeCouponTitle(coupon)} width="max-w-3xl">
      <div className="space-y-5">
        <NoticeBar tone="info">
          A supplier coupon is the network&apos;s own record. It is not a client coupon assignment and not the Coupon CMS;
          those are separate objects under Client Operations.
        </NoticeBar>

        {couponCodeState(coupon).state === CODE_STATE.URL_SUPPLIED ? (
          <NoticeBar tone="warning">
            <span data-coupon-code-notice="url-supplied">{URL_AS_CODE_HELP}</span>
          </NoticeBar>
        ) : null}
        <Section title="Coupon" subtitle="What the network published, shown as supplied">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Coupon code", render: () => <CouponCode value={coupon.couponCode} /> },
              { label: "Coupon type", render: () => textOrMissing(coupon.couponType) },
              { label: "Discount", render: () => <CouponDiscount coupon={coupon} /> },
              { label: "Discount type (source)", render: () => textOrMissing(coupon.discountType) },
              { label: "Exclusive", render: () => <FlagChip value={coupon.couponIsExclusive} yes="Exclusive" no="Not exclusive" /> },
              {
                label: "Affiliate specific",
                render: () => (
                  <span className="text-xs text-slate-400" title="The supplier coupon contract returns no affiliate-specific flag">
                    Not available (backend)
                  </span>
                ),
              },
              { label: "Customer type", render: () => textOrMissing(coupon.customerType) },
              { label: "Country / geo", render: () => textOrMissing(coupon.country) },
              { label: "Supplier coupon ID", render: () => <IdChip value={coupon.supplierCouponId} /> },
            ]}
          />
          <div className="mt-3 space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Title</p>
              <ReadableText value={coupon.title} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Description</p>
              <ReadableText value={coupon.couponDescription} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Promotion description</p>
              <ReadableText value={coupon.promotionDescription} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Terms</p>
              <span className="text-xs text-slate-400" title="The supplier coupon contract returns no terms field">
                Not available (backend)
              </span>
            </div>
          </div>
        </Section>

        <Section
          title="Campaign linkage"
          subtitle="A supplier-side campaign id is not a unique campaign identity: the same string can exist on several network rows."
        >
          <FieldGrid
            columns={3}
            fields={[
              { label: "Brand", render: () => textOrMissing(coupon.brandName) },
              { label: "Campaign", render: () => textOrMissing(coupon.campaignName) },
              { label: "Network", render: () => <IdChip value={coupon.networkSource || coupon.supplier} /> },
              {
                label: "Supplier campaign ID (supplier side)",
                render: () => <IdChip value={coupon.campaign?.supplierCampaignId} title="The id the network uses; not unique across MBO rows" />,
              },
              {
                label: "Supplier campaign row ID (MBO)",
                render: () => <IdChip value={coupon.supplierCampaignId} title="MBO SupplierCampaign row id" />,
              },
              {
                label: "Campaign source ID (MBO)",
                render: () => (
                  <span className="text-xs text-slate-400" title="The supplier coupon contract returns no campaign source id">
                    Not available (backend)
                  </span>
                ),
              },
            ]}
          />
          <div className="mt-3">
            <CampaignLink coupon={coupon} canReadCatalog={canReadCatalog} />
          </div>
        </Section>

        <Section title="URLs and attribution" subtitle="Each URL keeps its own meaning; none is merged into a generic link.">
          <FieldGrid
            columns={2}
            fields={[
              { label: "Coupon link (supplier)", render: () => <CouponLink url={coupon.couponLink} /> },
              {
                label: "Supplier deeplink URL",
                render: () => (
                  <span className="text-xs text-slate-400" title="The supplier coupon contract returns no separate deeplink URL">
                    Not available (backend)
                  </span>
                ),
              },
              {
                label: "Supplier deeplink tracking URL",
                render: () => (
                  <span className="text-xs text-slate-400" title="The supplier coupon contract returns no deeplink tracking URL">
                    Not available (backend)
                  </span>
                ),
              },
              { label: "Coupon attribution confirmation", render: () => <AttributionConfirmation /> },
            ]}
          />
          <NoticeBar tone="warning">
            A coupon-only campaign is not automatically attributable or payable. This contract returns no attribution
            evidence, so confirmation is reported as unavailable and is never inferred from the presence of a coupon code.
          </NoticeBar>
        </Section>

        <Section title="Lifecycle" subtitle="The network status and the date-derived state are reported separately.">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Start date", render: () => <DateCell value={coupon.couponStartDate} withTime={false} /> },
              {
                label: "End date",
                render: () =>
                  coupon.couponEndDate ? <DateCell value={coupon.couponEndDate} withTime={false} /> : <span className="text-xs text-slate-400">Open-ended</span>,
              },
              { label: "Coupon status (network)", render: () => <CouponStatusChip value={coupon.couponStatus} /> },
              { label: "Lifecycle (from dates)", render: () => <CouponLifecycleChip coupon={coupon} /> },
              { label: "First seen", render: () => <DateCell value={coupon.firstSeenAt} /> },
              { label: "Last synced", render: () => <DateCell value={coupon.lastSyncedAt} /> },
            ]}
          />
          <div className="mt-2">
            <LifecycleConflict coupon={coupon} />
          </div>
        </Section>

        <Section title="Source lineage" subtitle="Where this coupon came from inside the network payload">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Source object", render: () => <IdChip value={coupon.sourceObject} /> },
              { label: "Source path", render: () => <IdChip value={coupon.sourcePath} /> },
              { label: "Mapping status", render: () => textOrMissing(coupon.mappingStatus) },
              { label: "Field mapping outcome", render: () => textOrMissing(coupon.fieldMappingOutcome) },
              { label: "Mapping version", render: () => <IdChip value={coupon.mappingVersion} /> },
              { label: "Record updated", render: () => <DateCell value={coupon.updatedAt} /> },
            ]}
          />
        </Section>

        <Section title="Raw evidence reference" subtitle="Reference only. No payload body is rendered here.">
          {coupon.rawPayloadId ? (
            <FieldGrid
              columns={2}
              fields={[
                { label: "Raw payload ID", render: () => <IdChip value={coupon.rawPayloadId} /> },
                {
                  label: "Backend reference",
                  render: () => <span className="font-mono text-xs text-slate-600">/ops/raw-payloads/{coupon.rawPayloadId}</span>,
                },
              ]}
            />
          ) : (
            <NoticeBar tone="info">No raw payload reference is returned by this contract for this coupon.</NoticeBar>
          )}
        </Section>

        <Section title="Operational warnings" subtitle="Only states the contract actually proves">
          <WarningList warnings={warnings} />
        </Section>
      </div>
    </Drawer>
  );
}
CouponDrawer.propTypes = { coupon: optionalObject, open: optionalBool, onClose: optionalFunc, canReadCatalog: optionalBool };
