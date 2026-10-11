import { Badge } from "../../../components/ui/Badge";
import { MonoChip } from "../../../components/ui/TableCells";
import { optionalArray, optionalObject, optionalString, optionalStringOrNumber } from "../../../utils/propValidators";
import { ERROR_LABELS, ERROR_STATE, feedErrorState } from "./productFeedContract";

/** Feed status exactly as the backend reports it. No health or freshness is derived from it. */
export function FeedStatusChip({ value }) {
  if (!value) return <span className="text-xs text-slate-400">Not available</span>;
  const text = String(value).toUpperCase();
  const variant =
    text === "ACTIVE" ? "success" : text === "ERROR" ? "danger" : text === "PAUSED" ? "default" : "warning";
  return (
    <Badge variant={variant}>
      <span title="Feed status exactly as the backend reports it">{text}</span>
    </Badge>
  );
}
FeedStatusChip.propTypes = { value: optionalString };

/**
 * Error state as a two-valued signal.
 *
 * The backend's `lastError` string is never rendered, never placed in a title, and never put in
 * the DOM in any other form. Only its presence is shown.
 */
export function FeedErrorState({ feed }) {
  const state = feedErrorState(feed);
  if (state === ERROR_STATE.PRESENT) {
    return (
      <Badge variant="danger">
        <span data-feed-error="present" title="This feed reports an error. The detail is not displayed.">
          {ERROR_LABELS.PRESENT}
        </span>
      </Badge>
    );
  }
  return (
    <span className="text-xs text-slate-500" data-feed-error="none">
      {ERROR_LABELS.NONE}
    </span>
  );
}
FeedErrorState.propTypes = { feed: optionalObject };

/** A count is shown as supplied, or as absent. A missing count never becomes zero. */
export function CountCell({ value }) {
  if (value == null) return <span className="text-xs text-slate-400">Not available</span>;
  return <span className="tabular-nums text-slate-900">{Number(value).toLocaleString()}</span>;
}
CountCell.propTypes = { value: optionalStringOrNumber };

export function IdChip({ value, title }) {
  if (value == null || value === "") return <span className="text-xs text-slate-400">Not available</span>;
  return (
    <span title={title}>
      <MonoChip value={value} />
    </span>
  );
}
IdChip.propTypes = { value: optionalStringOrNumber, title: optionalString };

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
