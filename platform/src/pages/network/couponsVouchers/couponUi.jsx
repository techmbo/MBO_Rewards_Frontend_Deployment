import { Badge } from "../../../components/ui/Badge";
import { MonoChip, Truncate, UrlCell } from "../../../components/ui/TableCells";
import { optionalArray, optionalBool, optionalObject, optionalString } from "../../../utils/propValidators";
import {
  CODE_STATE,
  URL_AS_CODE_HELP,
  URL_AS_CODE_LABEL,
  URL_AS_CODE_REVIEW,
  couponCodeState,
  hasSensitiveParams,
  redactUrlSecrets,
} from "./couponCodeSafety";
import {
  ATTRIBUTION_UNAVAILABLE,
  COUPON_LIFECYCLE_LABELS,
  DISCOUNT_KIND,
  couponLifecycle,
  couponReadableText,
  formatDiscount,
  lifecycleConflict,
} from "./couponContract";

/**
 * A real coupon code is operational data an admin may see, and is shown as supplied.
 *
 * A value that parses as a URL is never rendered here: it is not a redeemable code, and printing
 * it would put a full query string — token material included — into the table. The record is
 * flagged for review instead, and the stored value is left where the backend put it.
 */
export function CouponCode({ value }) {
  const { state } = couponCodeState({ couponCode: value });
  if (state === CODE_STATE.NONE) return <span className="text-xs text-slate-400">No code</span>;
  if (state === CODE_STATE.URL_SUPPLIED) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" data-coupon-code="url-supplied">
        <span className="text-xs text-slate-600" title={URL_AS_CODE_HELP}>
          {URL_AS_CODE_LABEL}
        </span>
        <Badge variant="warning">
          <span title={URL_AS_CODE_HELP}>{URL_AS_CODE_REVIEW}</span>
        </Badge>
      </span>
    );
  }
  return <MonoChip value={value} />;
}
CouponCode.propTypes = { value: optionalString };

/**
 * Discount exactly as the network stated it. A bare number is never given a percent sign, and a
 * currency amount is never re-expressed as a rate.
 */
export function CouponDiscount({ coupon }) {
  const discount = formatDiscount(coupon);
  if (discount.kind === DISCOUNT_KIND.NONE) {
    return <span className="text-xs text-slate-400">Not available</span>;
  }
  if (!discount.unitKnown) {
    return (
      <span className="inline-flex flex-wrap items-center gap-1" data-discount-unit="unknown">
        <span className="font-medium tabular-nums text-slate-900">{discount.text}</span>
        <Badge variant="warning">
          <span title="The network stored this discount as a bare number. Its unit is not stated by the contract, so it is shown as supplied and never turned into a percentage.">
            Unit not stated
          </span>
        </Badge>
        {discount.sourceType ? <span className="text-xs text-slate-500">type: {discount.sourceType}</span> : null}
      </span>
    );
  }
  return <span className="font-medium text-slate-900">{discount.text}</span>;
}
CouponDiscount.propTypes = { coupon: optionalObject };

/** Supplier coupon status, verbatim. */
export function CouponStatusChip({ value }) {
  if (!value) return <span className="text-xs text-slate-400">Not available</span>;
  const text = String(value).toUpperCase();
  const variant = text === "ACTIVE" ? "success" : text === "EXPIRED" ? "default" : text === "PAUSED" ? "warning" : "info";
  return (
    <Badge variant={variant}>
      <span title="Coupon status exactly as the network reports it">{text}</span>
    </Badge>
  );
}
CouponStatusChip.propTypes = { value: optionalString };

const LIFECYCLE_VARIANTS = { CURRENT: "success", SCHEDULED: "info", EXPIRED: "default", UNKNOWN: "warning" };

/** Date-derived lifecycle, shown beside the network status and never replacing it. */
export function CouponLifecycleChip({ coupon }) {
  const state = couponLifecycle(coupon);
  const status = coupon?.couponStatus ? String(coupon.couponStatus).toUpperCase() : "no status";
  return (
    <Badge variant={LIFECYCLE_VARIANTS[state] || "default"}>
      <span title={`Derived from the coupon dates; the network reports ${status}`}>{COUPON_LIFECYCLE_LABELS[state]}</span>
    </Badge>
  );
}
CouponLifecycleChip.propTypes = { coupon: optionalObject };

/** Shown only when the network status and the dates disagree. Never resolved silently. */
export function LifecycleConflict({ coupon }) {
  const conflict = lifecycleConflict(coupon);
  if (!conflict) return null;
  return (
    <span className="inline-flex items-center" data-lifecycle-conflict="true">
      <Badge variant="warning">
        <span title={conflict}>Status and dates disagree</span>
      </Badge>
    </span>
  );
}
LifecycleConflict.propTypes = { coupon: optionalObject };

export function FlagChip({ value, yes, no, unknown = "Not stated" }) {
  if (value == null) return <span className="text-xs text-slate-400">{unknown}</span>;
  return <Badge variant={value ? "success" : "default"}>{value ? yes : no}</Badge>;
}
FlagChip.propTypes = { value: optionalBool, yes: optionalString, no: optionalString, unknown: optionalString };

/**
 * Attribution confirmation is a backend decision that this contract does not carry. It is
 * reported as unavailable and is never inferred from the presence of a coupon code.
 */
export function AttributionConfirmation() {
  return (
    <span
      className="text-xs text-slate-400"
      data-coupon-attribution="unavailable"
      title="The supplier coupon contract returns no attribution evidence. A coupon code alone never proves that coupon attribution is confirmed or that the campaign is payable."
    >
      {ATTRIBUTION_UNAVAILABLE}
    </span>
  );
}

/** Supplier description and terms rendered as readable text. Never injected as HTML. */
export function ReadableText({ value, emptyLabel = "Not available", maxWidthClass = "max-w-xl" }) {
  const readable = couponReadableText(value);
  if (readable == null) {
    return <span className="text-xs text-slate-400">{emptyLabel}</span>;
  }
  return (
    <p className={`whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 ${maxWidthClass}`}>{readable}</p>
  );
}
ReadableText.propTypes = { value: optionalString, emptyLabel: optionalString, maxWidthClass: optionalString };

export function ReadableCell({ value }) {
  const readable = couponReadableText(value);
  if (readable == null) return <span className="text-xs text-slate-400">—</span>;
  return <Truncate title={readable}>{readable}</Truncate>;
}
ReadableCell.propTypes = { value: optionalString };

/**
 * A supplier URL, with the values of credential-like query parameters replaced before render.
 *
 * When a URL carries such a parameter it is shown as text rather than as a link: an anchor would
 * put the unredacted value back into the DOM through its href, which is exactly what must not
 * happen. Ordinary URLs keep their normal link behaviour.
 */
export function CouponLink({ url }) {
  const text = url == null || String(url).trim() === "" ? null : String(url).trim();
  if (!text) return <UrlCell url={null} missingLabel="None" />;
  if (!hasSensitiveParams(text)) return <UrlCell url={text} missingLabel="None" />;
  return (
    <span
      className="break-all font-mono text-xs text-slate-700"
      data-url-redacted="true"
      title="This URL carries a credential-like query parameter. Its value is not displayed, and the link is not clickable, so the value never reaches the page."
    >
      {redactUrlSecrets(text)}
    </span>
  );
}
CouponLink.propTypes = { url: optionalString };

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
