import { Link } from "react-router-dom";
import { Drawer } from "../../../components/ui/Drawer";
import { DateCell } from "../../../components/ui/TableCells";
import { CAMPAIGN_LOOKUP_ERROR, LINK_STATE, useRuleCampaignLink } from "../../../hooks/useRuleCampaignLink";
import { optionalBool, optionalFunc, optionalObject } from "../../../utils/propValidators";
import { humanize } from "../networkAccountFormat";
import { FieldGrid, NoticeBar, Section } from "../networkAccountUi";
import { CAMPAIGNS_PATH, FINANCE_READY_UNAVAILABLE, ruleWarnings } from "./commissionRuleContract";
import {
  AverageCommission,
  ConditionList,
  FinanceReadyCell,
  IdChip,
  LifecycleChip,
  PersistedChip,
  ReviewReasons,
  ReviewStateChip,
  RuleStatusChip,
  RuleValue,
  SequenceLabel,
  WarningList,
} from "./commissionRuleUi";

function textOrMissing(value, missingLabel = "Not available") {
  if (value == null || value === "") return <span className="text-xs text-slate-400">{missingLabel}</span>;
  return <span className="text-slate-800">{value}</span>;
}

function CampaignLink({ rule, canReadCatalog }) {
  const link = useRuleCampaignLink(CAMPAIGNS_PATH, rule, { enabled: canReadCatalog });
  if (!canReadCatalog) {
    // No request is made: the hook stays disabled, so a role without catalog:read never calls
    // GET /ops/admin/campaigns. This is a neutral state, not an error.
    return (
      <span className="text-xs text-slate-500" data-campaign-link="unavailable-for-role">
        Campaign link unavailable for this role. Resolving the campaign needs catalog:read, which this page does not require.
      </span>
    );
  }
  if (link.state === LINK_STATE.LOADING || link.state === LINK_STATE.IDLE) {
    return <span className="text-xs text-slate-400">Resolving campaign…</span>;
  }
  if (link.state === LINK_STATE.RESOLVED && link.campaign?.id) {
    return (
      <Link
        to={`/network/campaigns/${encodeURIComponent(link.campaign.id)}`}
        className="text-sm font-medium text-indigo-700 hover:underline"
      >
        View campaign{link.campaign.campaignName ? ` · ${link.campaign.campaignName}` : ""}
      </Link>
    );
  }
  if (link.state === LINK_STATE.AMBIGUOUS) {
    return (
      <span className="text-xs text-amber-800">
        Several campaigns carry these identifiers, so no single campaign can be linked. Open Campaigns and search the supplier
        campaign id.
      </span>
    );
  }
  if (link.state === LINK_STATE.ERROR) {
    // The constant is rendered directly rather than any value carried on the hook, so no
    // backend-derived string can reach this branch even if the hook's error handling changes.
    return (
      <span className="text-xs text-rose-700" data-campaign-link="lookup-error">
        {CAMPAIGN_LOOKUP_ERROR}
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-500">
      No canonical campaign matches this rule&apos;s SupplierCampaign row or campaign source. The rule contract carries no
      canonical campaign id, so nothing is linked by name.
    </span>
  );
}
CampaignLink.propTypes = { rule: optionalObject, canReadCatalog: optionalBool };

/**
 * Read-only audit detail for one supplier commission rule: what it pays, under what conditions,
 * which campaign record it belongs to, where it came from, and what state the backend reports it
 * in. No editing, no approval, no payout calculation, and no finance-readiness verdict.
 */
export function CommissionRuleDrawer({ rule, group, open, onClose, canReadCatalog }) {
  if (!rule) return null;
  const warnings = ruleWarnings(rule);

  return (
    <Drawer open={open} onClose={onClose} title={rule.displayLabel || "Supplier commission rule"} width="max-w-3xl">
      <div className="space-y-5">
        <NoticeBar tone="info">
          Supplier rule value — the network&apos;s advertised commercial rule. It is not commission earned, not a client
          payable amount and not an MBO margin. Actual supplier commission comes from conversion and report records.
        </NoticeBar>

        <Section title="Commission" subtitle="What this rule pays, with its unit semantics preserved">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Commission N", render: () => <SequenceLabel rule={rule} /> },
              { label: "Rule value", render: () => <RuleValue rule={rule} /> },
              { label: "Rule type", render: () => textOrMissing(rule.commissionType) },
              { label: "Payout basis", render: () => textOrMissing(rule.basis ? humanize(rule.basis) : null) },
              { label: "Rate percent", render: () => textOrMissing(rule.ratePercent) },
              { label: "Fixed amount", render: () => textOrMissing(rule.fixedAmount) },
              { label: "Currency", render: () => <IdChip value={rule.currency} title="Currency recorded on the rule" /> },
              { label: "Backend value string", render: () => textOrMissing(rule.commissionValue) },
              {
                label: "Average for this campaign group",
                render: () => <AverageCommission group={group} />,
              },
            ]}
          />
        </Section>

        <Section
          title="Conditions"
          subtitle="Rule-scoped dimensions only. Campaign metadata below is context, never an implied restriction."
        >
          <FieldGrid
            columns={3}
            fields={[
              { label: "Country / geo", render: () => textOrMissing(rule.country) },
              { label: "Customer type", render: () => textOrMissing(rule.customerType) },
              { label: "Category / product / goal", render: () => textOrMissing(rule.categoryProductGoal) },
              { label: "Coupon / tier", render: () => textOrMissing(rule.couponOrTier) },
              {
                label: "Campaign countries (context)",
                render: () => textOrMissing(rule.campaignCountries?.length ? rule.campaignCountries.join(", ") : null),
              },
              { label: "Campaign category (context)", render: () => textOrMissing(rule.campaignCategory) },
            ]}
          />
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Recorded conditions</p>
            <ConditionList conditions={rule.conditions} />
            <p className="mt-2 text-xs text-slate-500">
              Condition type, operator and value are shown. The raw supplier condition payload is not rendered.
            </p>
          </div>
        </Section>

        <Section
          title="Campaign linkage"
          subtitle="A supplier-side campaign id is not a unique campaign identity: the same string can exist on several network rows."
        >
          <FieldGrid
            columns={3}
            fields={[
              { label: "Brand", render: () => textOrMissing(rule.brandName) },
              { label: "Campaign", render: () => textOrMissing(rule.campaignName) },
              { label: "Network", render: () => <IdChip value={rule.networkSource} /> },
              {
                label: "Supplier campaign ID (supplier side)",
                render: () => <IdChip value={rule.sourceCampaignId} title="The id the network uses; not unique across MBO rows" />,
              },
              {
                label: "Supplier campaign row ID (MBO)",
                render: () => <IdChip value={rule.supplierCampaignId} title="MBO SupplierCampaign row id" />,
              },
              {
                label: "Campaign source ID (MBO)",
                render: () => <IdChip value={rule.campaignSourceId} title="MBO CampaignSource id" />,
              },
            ]}
          />
          <div className="mt-3">
            <CampaignLink rule={rule} canReadCatalog={canReadCatalog} />
          </div>
        </Section>

        <Section title="Source lineage" subtitle="Where this rule came from inside the network payload">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Network account label", render: () => <IdChip value={rule.sourceAccountLabel} /> },
              { label: "Source group ID", render: () => <IdChip value={rule.sourceGroupId} /> },
              { label: "Source group name", render: () => textOrMissing(rule.sourceGroupName) },
              { label: "Source rule ID", render: () => <IdChip value={rule.sourceRuleId} /> },
              { label: "Source rule name", render: () => textOrMissing(rule.sourceRuleName) },
              { label: "Supplier commission rule ID", render: () => <IdChip value={rule.supplierCommissionRuleId} /> },
              { label: "Outcome key", render: () => <IdChip value={rule.outcomeKey} title="Stable MBO outcome identity" /> },
              { label: "Outcome slot", render: () => textOrMissing(rule.outcomeSlot) },
              { label: "Source object", render: () => <IdChip value={rule.sourceObject} /> },
              { label: "Source path", render: () => <IdChip value={rule.sourcePath} /> },
              { label: "Source field path", render: () => textOrMissing(rule.sourceFieldPath) },
              { label: "Rule version", render: () => <IdChip value={rule.ruleVersion} /> },
            ]}
          />
        </Section>

        <Section
          title="Lifecycle and review state"
          subtitle="Each state below is reported on its own. None of them is a finance-readiness decision."
        >
          <FieldGrid
            columns={3}
            fields={[
              { label: "Effective from", render: () => <DateCell value={rule.effectiveFrom} /> },
              {
                label: "Effective until",
                render: () =>
                  rule.effectiveUntil ? <DateCell value={rule.effectiveUntil} /> : <span className="text-xs text-slate-400">Open-ended</span>,
              },
              { label: "Rule status (backend)", render: () => <RuleStatusChip value={rule.ruleStatus} /> },
              { label: "Lifecycle (from dates)", render: () => <LifecycleChip rule={rule} /> },
              { label: "Review state", render: () => <ReviewStateChip rule={rule} /> },
              { label: "Persisted / projected", render: () => <PersistedChip projected={rule.projected} /> },
              { label: "Mapping status", render: () => textOrMissing(rule.mappingStatus) },
              { label: "Field mapping outcome", render: () => textOrMissing(rule.fieldMappingOutcome) },
              { label: "Finance ready", render: () => <FinanceReadyCell /> },
              { label: "Last modified", render: () => <DateCell value={rule.lastModifiedAt} /> },
            ]}
          />
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">Review reasons</p>
            <ReviewReasons reasons={rule.reviewReasons} />
            <p className="mt-2 text-xs text-slate-500">
              {FINANCE_READY_UNAVAILABLE}: the rule contract returns no financeReady field, so finance readiness is not shown
              as a decision here and is never inferred from the states above.
            </p>
          </div>
          {rule.projected && rule.projectionNote ? (
            <NoticeBar tone="warning">{rule.projectionNote}</NoticeBar>
          ) : null}
        </Section>

        <Section title="Raw evidence reference" subtitle="References only. No payload body is rendered here.">
          <NoticeBar tone="info">
            This contract returns no raw payload id for a commission rule, so there is no direct evidence reference to open.
            The lineage above (source object, source path, outcome key) identifies the fragment the rule was mapped from.
          </NoticeBar>
        </Section>

        <Section title="Operational warnings" subtitle="Only states the contract actually proves">
          <WarningList warnings={warnings} />
        </Section>
      </div>
    </Drawer>
  );
}
CommissionRuleDrawer.propTypes = {
  rule: optionalObject,
  group: optionalObject,
  open: optionalBool,
  onClose: optionalFunc,
  canReadCatalog: optionalBool,
};
