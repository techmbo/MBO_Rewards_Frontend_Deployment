import { Link } from "react-router-dom";
import { optionalArray, optionalNode, optionalObject, optionalString, optionalStringOrNumber } from "../../../../utils/propValidators";

/**
 * Campaign › Products / Feeds — laid out to the v13 campaign workspace (.metric summary,
 * .related-table, .empty-state, .note). The campaign's productFeedAvailability is a readiness
 * summary only; the related records are the ProductFeed rows linked to this campaign's sources
 * (ProductFeed.campaignSourceId), returned in the campaign detail and reduced by
 * PRODUCT_FEED_FIELDS in the campaign contract.
 *
 * Individual product records are not listed here: GET /ops/products has no campaign, campaign-source
 * or feed filter in the current backend, and the admin campaign contract has no product allowlist,
 * so no product row, price, image or URL is associated with the campaign in React.
 * Every value below is shown exactly as returned; nothing is derived from dates or counts.
 */

/* v13 .status pill tokens and badge() colour rule (whole-value match). */
const PILL_TONES = {
  green: "border-[#abefc6] bg-[#ecfdf3] text-[#067647]",
  amber: "border-[#fedf89] bg-[#fffaeb] text-[#b54708]",
  red: "border-[#fecdca] bg-[#fef3f2] text-[#b42318]",
  blue: "border-[#b2ccff] bg-[#eef4ff] text-[#2457d6]",
};
const GREEN = new Set(["ACTIVE", "AVAILABLE", "YES", "MAPPED"]);
const AMBER = new Set(["PAUSED", "NEEDS_REVIEW", "NOT_CONFIGURED", "PENDING"]);
const RED = new Set(["ERROR", "FAILED", "NO"]);

function toneFor(value) {
  const key = String(value).toUpperCase();
  if (GREEN.has(key)) return "green";
  if (AMBER.has(key)) return "amber";
  if (RED.has(key)) return "red";
  return "blue";
}

// Backend limit on feeds embedded in the campaign detail (adminContract.service productFeed take).
const EMBEDDED_FEED_LIMIT = 20;

const TH =
  "sticky top-0 z-[2] whitespace-nowrap border-b border-[#e4e7ec] bg-[#f8fafc] px-2 py-[9px] text-left align-bottom text-[9px] font-bold uppercase tracking-[.035em] text-[#475467]";
const TD = "whitespace-nowrap border-b border-[#eef2f6] px-2 py-[9px] align-top text-[10.5px] text-[#101828]";

function Muted({ children = "—", title }) {
  return (
    <span className="font-normal text-[#98a2b3]" title={title}>
      {children}
    </span>
  );
}
Muted.propTypes = { children: optionalNode, title: optionalString };

function Pill({ value, tone, title, empty = "—" }) {
  if (value == null || value === "") return <Muted title={title ? `${title}: not returned` : undefined}>{empty}</Muted>;
  const text = String(value);
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-1.5 py-[3px] text-[8px] font-black leading-none ${
        PILL_TONES[tone || toneFor(text)]
      }`}
    >
      {text}
    </span>
  );
}
Pill.propTypes = { value: optionalStringOrNumber, tone: optionalString, title: optionalString, empty: optionalString };

function Mono({ value, title }) {
  if (value == null || value === "") return <Muted />;
  return (
    <span className="font-mono text-[10px]" title={title}>
      {String(value)}
    </span>
  );
}
Mono.propTypes = { value: optionalStringOrNumber, title: optionalString };

/** Source identifier as secondary evidence (v13 .source-extra .keys). */
function SourceText({ children, title = "Source value as received (diagnostic)" }) {
  return (
    <span className="block font-mono text-[9px] leading-tight text-[#b54708]" title={title}>
      {children}
    </span>
  );
}
SourceText.propTypes = { children: optionalNode, title: optionalString };

const isCount = (value) => typeof value === "number" && Number.isFinite(value);

function Count({ value }) {
  return isCount(value) ? <span className="tabular-nums">{value}</span> : <Muted title="Not returned" />;
}
Count.propTypes = { value: optionalStringOrNumber };

function formatDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function DateValue({ value }) {
  const text = formatDateTime(value);
  return text ? <span>{text}</span> : <Muted title="Not returned" />;
}
DateValue.propTypes = { value: optionalString };

/** v13 .metric. */
function Metric({ label, children, hint }) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white px-3.5 py-3">
      <span className="block text-[9px] font-black uppercase text-[#98a2b3]">{label}</span>
      <div className="mt-1 text-[15px] font-bold leading-tight text-[#101828]">{children}</div>
      {hint ? <span className="mt-1 block text-[10px] leading-snug text-[#667085]">{hint}</span> : null}
    </div>
  );
}
Metric.propTypes = { label: optionalString, children: optionalNode, hint: optionalNode };

/** v13 .note (tone: info | warn). */
function Note({ tone = "info", children }) {
  const tones = { info: "border-[#2457d6] bg-[#f8fafc]", warn: "border-[#b54708] bg-[#fffaeb]" };
  return <div className={`rounded-r-[7px] border-l-[3px] px-3 py-2.5 text-[11px] leading-[1.55] text-[#475467] ${tones[tone]}`}>{children}</div>;
}
Note.propTypes = { tone: optionalString, children: optionalNode };

/** v13 .empty-state. */
function EmptyState({ title, tag, children }) {
  return (
    <div className="rounded-[9px] border border-dashed border-[#d0d5dd] bg-[#fcfcfd] p-[18px] text-center text-[11px] text-[#667085]">
      {tag ? <div className="mb-1.5">{tag}</div> : null}
      <b className="mb-1 block text-[#344054]">{title}</b>
      {children}
    </div>
  );
}
EmptyState.propTypes = { title: optionalString, tag: optionalNode, children: optionalNode };

function Card({ title, subtitle, action, children }) {
  return (
    <section className="min-w-0 rounded-[10px] border border-[#e4e7ec] bg-white p-3.5">
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="m-0 text-[13px] font-bold text-[#101828]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[10.5px] leading-snug text-[#667085]">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
Card.propTypes = { title: optionalString, subtitle: optionalNode, action: optionalNode, children: optionalNode };

/**
 * Error presence only; the text is never rendered. The contract passes `lastError` through, but the
 * current backend reports feed errors as `hasError`, which the contract drops, and a dropped field
 * reaches React as null. A null therefore cannot mean "no error" and is shown as "not returned".
 */
function ErrorPresence({ feed }) {
  if (String(feed.lastError ?? "").trim() !== "") {
    return (
      <span data-feed-error="present" title="This feed reports an error. The detail is not displayed.">
        <Pill value="ERROR PRESENT" tone="red" />
      </span>
    );
  }
  return (
    <Muted title="Error state not returned through the campaign contract">
      <span data-feed-error="unknown">Not returned</span>
    </Muted>
  );
}
ErrorPresence.propTypes = { feed: optionalObject };

const COLUMNS = [
  {
    label: "Feed ID",
    field: "id · feedExternalId",
    render: (f) => (
      <span className="block">
        <Mono value={f.id} title="MBO product feed id" />
        {f.feedExternalId ? <SourceText title="Network feed id">{f.feedExternalId}</SourceText> : null}
      </span>
    ),
  },
  { label: "Network Source", field: "supplier", render: (f) => <Mono value={f.supplier} /> },
  { label: "Feed Name", field: "feedName", render: (f) => (f.feedName ? <b className="font-semibold">{f.feedName}</b> : <Muted>Not returned</Muted>) },
  { label: "Feed Status", field: "status", render: (f) => <Pill value={f.status} title="Feed status (as stored)" empty="Not available" /> },
  { label: "Products", field: "productCount", render: (f) => <Count value={f.productCount} /> },
  { label: "Feed Items", field: "itemCount", render: (f) => <Count value={f.itemCount} /> },
  // assignmentCount / exceptionCount are not shown: the backend fills them with 0 when the feed
  // row has no such value, so a 0 there is not a real count.
  { label: "Errors", field: "errorCount", render: (f) => <Count value={f.errorCount} /> },
  { label: "Error State", field: "lastError (presence)", render: (f) => <ErrorPresence feed={f} /> },
  { label: "Campaign Source", field: "campaignSourceId", render: (f) => <Mono value={f.campaignSourceId} /> },
  { label: "Last Sync", field: "lastSyncAt", render: (f) => <DateValue value={f.lastSyncAt} /> },
];

function FeedTable({ feeds }) {
  return (
    <div className="overflow-x-auto rounded-[9px] border border-[#e4e7ec] bg-white">
      <table aria-label="Product feed records" className="w-full min-w-[1100px] border-collapse">
        <thead>
          <tr>
            {COLUMNS.map((col) => (
              <th key={col.label} className={TH}>
                {col.label}
                <span className="mt-0.5 block font-mono text-[8.5px] font-normal normal-case tracking-normal text-[#98a2b3]">{col.field}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {feeds.map((feed, index) => (
            <tr key={feed.id || `feed-${index}`} className="hover:bg-[#fbfcff]">
              {COLUMNS.map((col) => (
                <td key={col.label} className={TD}>
                  {col.render(feed)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
FeedTable.propTypes = { feeds: optionalArray };

/** Empty state from the readiness summary; "supported but not synced" only when AVAILABLE is returned. */
function NoFeedRecords({ availability }) {
  const value = availability == null || availability === "" ? null : String(availability).toUpperCase();
  if (value === "AVAILABLE") {
    return (
      <EmptyState title="Product feed reported available, but no feed record is synced" tag={<Pill value="SUPPORTED — DATA NOT SYNCED" tone="amber" />}>
        The campaign reports productFeedAvailability AVAILABLE, but the detail response carries no product feed record for its sources.
      </EmptyState>
    );
  }
  if (value) {
    return (
      <EmptyState title="Product feed not available for this campaign / source" tag={<Pill value={`PRODUCT FEED: ${value}`} tone="blue" />}>
        No product feed record is linked to this campaign&apos;s sources.
      </EmptyState>
    );
  }
  return <EmptyState title="No product / feed data available">The campaign detail returned no product feed availability and no feed record.</EmptyState>;
}
NoFeedRecords.propTypes = { availability: optionalString };

const distinct = (values) => [...new Set(values.filter((v) => v != null && v !== ""))];

export function CampaignProductsTab({ campaign }) {
  const feeds = Array.isArray(campaign.productFeeds) ? campaign.productFeeds : [];
  const atLimit = feeds.length >= EMBEDDED_FEED_LIMIT;
  const activeFeeds = feeds.filter((f) => f.status === "ACTIVE").length;
  const suppliers = distinct(feeds.map((f) => f.supplier));
  const productCounts = feeds.map((f) => f.productCount);
  const productTotal = productCounts.length && productCounts.every(isCount) ? productCounts.reduce((a, b) => a + b, 0) : null;
  const lastSync = feeds
    .map((f) => f.lastSyncAt)
    .filter((v) => v && !Number.isNaN(new Date(v).getTime()))
    .sort()
    .at(-1);

  return (
    <div className="space-y-3.5 text-[#101828]">
      {/* 1. Product / Feed Summary */}
      <Card
        title="Product / Feed Summary"
        subtitle="Product feeds linked to this campaign's sources. Product Feed Availability is a readiness summary, not proof that records exist."
        action={<Pill value="INTERNAL ADMIN" tone="amber" title="Supplier feed ids are internal" />}
      >
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Product Feed Availability" hint="Readiness summary on the campaign">
            <Pill value={campaign.productFeedAvailability} title="productFeedAvailability" empty="Not available" />
          </Metric>
          <Metric
            label="Feed Records"
            hint={atLimit ? `The campaign detail returns at most ${EMBEDDED_FEED_LIMIT} feeds; there may be more` : "Feeds linked to the campaign sources"}
          >
            {atLimit ? `${feeds.length}+` : feeds.length}
          </Metric>
          {feeds.length && !atLimit ? (
            <Metric label="Active Feeds" hint="Feed status ACTIVE, as stored">
              {activeFeeds}
            </Metric>
          ) : null}
          {productTotal != null ? (
            <Metric label="Products In Feeds" hint={atLimit ? "Across the feeds returned" : "Sum of the feeds' product counts"}>
              {productTotal}
            </Metric>
          ) : null}
          <Metric label="Feed Source / Last Sync" hint={lastSync ? `Last sync ${formatDateTime(lastSync)}` : "No sync time returned"}>
            {suppliers.length ? <span className="font-mono text-[13px]">{suppliers.join(", ")}</span> : <Muted>Not returned</Muted>}
          </Metric>
        </div>
      </Card>

      {/* 2. Product Feed Registry */}
      <Card title="Product Feed Registry" subtitle="One row per product feed record linked to this campaign's sources, as returned by the campaign detail.">
        {feeds.length ? <FeedTable feeds={feeds} /> : <NoFeedRecords availability={campaign.productFeedAvailability} />}
      </Card>

      {/* Product-level records */}
      <Card title="Product Records" subtitle="Individual products (name, price, image, URLs) for this campaign.">
        <EmptyState title="Product records are not available per campaign in the current backend" tag={<Pill value="NOT AVAILABLE" tone="blue" />}>
          The products endpoint has no campaign, campaign-source or feed filter, so product rows are not associated with this campaign here
          and no price, image or URL is shown. The feed product counts above come from the backend.{" "}
          <Link to="/network/products" className="font-bold text-[#2457d6] hover:underline">
            Open Products / Feeds
          </Link>{" "}
          for the cross-network product view.
        </EmptyState>
      </Card>

      <Note>
        <b>MBO rule:</b> <b>Product Feed Availability</b> on the campaign is a readiness summary. Feed and product data live on their own
        records. Product prices stay in the currency the source returned, and no tracking or deeplink URL is generated for a product here.
      </Note>
    </div>
  );
}
CampaignProductsTab.propTypes = { campaign: optionalObject };
