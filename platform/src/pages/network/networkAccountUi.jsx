import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";
import { DateCell, MonoChip } from "../../components/ui/TableCells";
import { humanize } from "./networkAccountFormat";
import { optionalArray, optionalNode, optionalNumber, optionalObject, optionalOneOf, optionalString, optionalStringOrNumber } from "../../utils/propValidators";

// Badge variants for the backend enumerations (values are rendered verbatim).
const VARIANTS = {
  // connectionStatus
  CONNECTED: "success",
  PLANNED: "info",
  // credentialHealth / integration / data health / sync
  HEALTHY: "success",
  SYNCED: "success",
  SUCCESS: "success",
  AVAILABLE: "success",
  SYNCING: "info",
  RUNNING: "info",
  PARTIAL: "warning",
  NEEDS_REVIEW: "warning",
  EXPIRED: "warning",
  UNVERIFIED: "warning",
  ERROR: "danger",
  FAILED: "danger",
  CANCELLED: "default",
  NEVER: "default",
  IDLE: "default",
  UNKNOWN: "default",
  NOT_CONFIGURED: "default",
  NO_RECENT_DATA: "default",
  NOT_AVAILABLE: "default",
  UNAVAILABLE: "default",
  SKIPPED: "default",
};

export function EnumBadge({ value, emptyLabel = "Not available" }) {
  if (value == null || value === "") return <span className="text-xs text-slate-400">{emptyLabel}</span>;
  const key = String(value).toUpperCase();
  return <Badge variant={VARIANTS[key] || "default"}>{humanize(key)}</Badge>;
}
EnumBadge.propTypes = { value: optionalStringOrNumber, emptyLabel: optionalString };

export function BoolBadge({ value, yes = "Yes", no = "No" }) {
  if (value == null) return <span className="text-xs text-slate-400">Not available</span>;
  return <Badge variant={value ? "success" : "default"}>{value ? yes : no}</Badge>;
}
BoolBadge.propTypes = { value: optionalNode, yes: optionalString, no: optionalString };

export function NumberCell({ value }) {
  if (value == null) return <span className="text-xs text-slate-400" title="Not provided by backend">Not available</span>;
  return <span className="tabular-nums">{Number(value).toLocaleString()}</span>;
}
NumberCell.propTypes = { value: optionalStringOrNumber };

/** Two-column label/value grid for detail sections. */
export function FieldGrid({ fields, columns = 3 }) {
  const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4" }[columns] || "md:grid-cols-3";
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${cols}`}>
      {fields.map((field) => (
        <div key={field.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{field.label}</dt>
          <dd className="mt-0.5 text-sm text-slate-800">{renderFieldValue(field)}</dd>
        </div>
      ))}
    </dl>
  );
}
FieldGrid.propTypes = { fields: optionalArray, columns: optionalNumber };

function renderFieldValue(field) {
  if (field.render) return field.render();
  const { value, type } = field;
  if (type === "enum") return <EnumBadge value={value} />;
  if (type === "bool") return <BoolBadge value={value} />;
  if (type === "date") return <DateCell value={value} />;
  if (type === "number") return <NumberCell value={value} />;
  if (type === "mono") return <MonoChip value={value} />;
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : <span className="text-xs text-slate-400">None</span>;
  }
  if (value == null || value === "") return <span className="text-xs text-slate-400">Not available</span>;
  return String(value);
}

export function Section({ title, subtitle, actions, children }) {
  return (
    <Card title={title} subtitle={subtitle} actions={actions}>
      {children}
    </Card>
  );
}
Section.propTypes = { title: optionalNode, subtitle: optionalNode, actions: optionalNode, children: optionalNode };

export function NoticeBar({ tone = "info", children }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-rose-200 bg-rose-50 text-rose-900",
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm ${tones[tone] || tones.info}`}>{children}</div>;
}
NoticeBar.propTypes = { tone: optionalOneOf(["info", "warning", "danger"]), children: optionalNode };

/** Live sync + scheduler line from the GET /suppliers envelope. Rendered verbatim, never inferred. */
export function SyncStatusStrip({ liveSync, scheduler }) {
  if (!liveSync && !scheduler) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
      <span className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Live sync</span>
        <EnumBadge value={liveSync?.status} />
        {liveSync?.jobName ? <MonoChip value={liveSync.jobName} /> : null}
        {liveSync?.percentComplete != null ? <span className="text-xs text-slate-500">{liveSync.percentComplete}%</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scheduler</span>
        <BoolBadge value={scheduler ? Boolean(scheduler.enabled) : null} yes="Enabled" no="Disabled" />
        {scheduler?.intervalMinutes != null ? (
          <span className="text-xs text-slate-500">every {scheduler.intervalMinutes} min</span>
        ) : null}
        {scheduler?.lastAttemptAt ? (
          <span className="text-xs text-slate-500">
            last attempt <DateCell value={scheduler.lastAttemptAt} />
          </span>
        ) : null}
      </span>
    </div>
  );
}
SyncStatusStrip.propTypes = { liveSync: optionalObject, scheduler: optionalObject };
