import { Badge } from "../../../components/ui/Badge";
import { MonoChip, UrlCell } from "../../../components/ui/TableCells";
import { optionalArray, optionalObject, optionalString } from "../../../utils/propValidators";
import {
  SLUG_DISCLAIMER,
  SLUG_STATE,
  URL_HELP,
  URL_LABELS,
  attributionParameter,
  attributionSummary,
  deeplinkSupport,
  supplierSlugState,
} from "./trackingLinkContract";

/**
 * One supplier URL, always under its own label. The registry resolves two of these fields with a
 * fallback, so the label and its tooltip say which sources the single value can have come from.
 */
export function SupplierUrl({ field, url }) {
  return (
    <span className="inline-flex items-center gap-1" title={URL_HELP[field]} data-url-field={field}>
      <UrlCell url={url} missingLabel="None" />
    </span>
  );
}
SupplierUrl.propTypes = { field: optionalString, url: optionalString };

export function UrlLabel({ field }) {
  return <span title={URL_HELP[field]}>{URL_LABELS[field]}</span>;
}
UrlLabel.propTypes = { field: optionalString };

/** Deeplink support flag. It never implies that a deeplink URL exists. */
export function DeeplinkSupportChip({ row }) {
  const support = deeplinkSupport(row);
  if (support.supported === null) {
    return (
      <span className="text-xs text-slate-400" title="The network did not state whether deeplinking is supported">
        Not stated
      </span>
    );
  }
  return (
    <Badge variant={support.supported ? "success" : "default"}>
      <span title="Whether the network says deeplinking is supported. This does not prove a deeplink URL is returned.">
        {support.label}
      </span>
    </Badge>
  );
}
DeeplinkSupportChip.propTypes = { row: optionalObject };

/**
 * Supplier-level MBO slug. The registry derives its own field from nothing more than the presence
 * of an MBO URL on the SupplierCampaign row, so this is reported as slug generation and never as
 * an assignment.
 */
export function SupplierSlugChip({ row }) {
  const state = supplierSlugState(row);
  if (state === SLUG_STATE.GENERATED) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" data-supplier-slug="generated">
        <Badge variant="info">
          <span title={`An MBO slug exists on this supplier campaign row. ${SLUG_DISCLAIMER}`}>Generated</span>
        </Badge>
      </span>
    );
  }
  if (state === SLUG_STATE.NOT_GENERATED) {
    return (
      <Badge variant="default">
        <span title={`No MBO slug has been generated on this supplier campaign row. ${SLUG_DISCLAIMER}`}>
          Not generated
        </span>
      </Badge>
    );
  }
  return <span className="text-xs text-slate-400">Not available</span>;
}
SupplierSlugChip.propTypes = { row: optionalObject };

/** Attribution parameter NAME only. Never a value, and never invented where unconfirmed. */
export function AttributionParam({ row }) {
  const param = attributionParameter(row);
  if (!param.confirmed) {
    return (
      <span className="inline-flex items-center" data-attribution-param="unconfirmed">
        <Badge variant="warning">
          <span title="The backend reports this network's attribution parameter as unverified. No parameter name is shown, because none is confirmed.">
            Unconfirmed
          </span>
        </Badge>
      </span>
    );
  }
  return (
    <span className="font-mono text-xs text-slate-800" title="Attribution parameter name. No attribution value is shown.">
      {param.name}
    </span>
  );
}
AttributionParam.propTypes = { row: optionalObject };

export function AttributionSummary({ row }) {
  const summary = attributionSummary(row);
  if (!summary) {
    return <span className="text-xs text-slate-400">Not confirmed for this network</span>;
  }
  return (
    <span className="font-mono text-xs text-slate-700" title="Parameter names the redirect would carry. Names only, never values.">
      {summary}
    </span>
  );
}
AttributionSummary.propTypes = { row: optionalObject };

export function LinkStatusChip({ value }) {
  if (!value) return <span className="text-xs text-slate-400">Not available</span>;
  const text = String(value).toUpperCase();
  const variant = text === "ACTIVE" ? "success" : text === "VERIFY_LIVE" ? "warning" : "default";
  return (
    <Badge variant={variant}>
      <span title="Link status exactly as the backend reports it">{text}</span>
    </Badge>
  );
}
LinkStatusChip.propTypes = { value: optionalString };

export function MappingChip({ value }) {
  if (!value) return <span className="text-xs text-slate-400">Not available</span>;
  const text = String(value).toUpperCase();
  const variant = text === "MAPPED" ? "success" : text === "UNMAPPED" ? "danger" : "warning";
  return <Badge variant={variant}>{text}</Badge>;
}
MappingChip.propTypes = { value: optionalString };

export function IdChip({ value, title }) {
  if (value == null || value === "") return <span className="text-xs text-slate-400">Not available</span>;
  return (
    <span title={title}>
      <MonoChip value={value} />
    </span>
  );
}
IdChip.propTypes = { value: optionalString, title: optionalString };

export function WarningList({ warnings }) {
  const list = Array.isArray(warnings) ? warnings : [];
  if (!list.length) return <span className="text-xs text-slate-400">None</span>;
  return (
    <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-800">
      {list.map((warning) => (
        <li key={warning}>{warning}</li>
      ))}
    </ul>
  );
}
WarningList.propTypes = { warnings: optionalArray };
