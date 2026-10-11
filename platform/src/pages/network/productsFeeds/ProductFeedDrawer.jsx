import { Drawer } from "../../../components/ui/Drawer";
import { DateCell } from "../../../components/ui/TableCells";
import { optionalBool, optionalFunc, optionalObject } from "../../../utils/propValidators";
import { FieldGrid, NoticeBar, Section } from "../networkAccountUi";
import {
  BACKEND_UNAVAILABLE_FIELDS,
  COUNT_FIELDS,
  ERROR_LABELS,
  ERROR_STATE,
  ERROR_SUPPRESSED_NOTE,
  NO_RAW_REFERENCE,
  feedErrorState,
  feedWarnings,
} from "./productFeedContract";
import { CountCell, FeedErrorState, FeedStatusChip, IdChip, WarningList } from "./productFeedUi";

function text(value, empty = "Not available") {
  if (value == null || value === "") return <span className="text-xs text-slate-400">{empty}</span>;
  return <span className="text-slate-800">{value}</span>;
}

export function ProductFeedDrawer({ feed, open, onClose }) {
  if (!feed) return null;
  const warnings = feedWarnings(feed);
  const errorState = feedErrorState(feed);
  const counts = COUNT_FIELDS.reduce((acc, field) => ({ ...acc, [field.key]: field }), {});

  return (
    <Drawer open={open} onClose={onClose} title={feed.feedName || `Feed ${feed.feedExternalId || feed.id}`} width="max-w-3xl">
      <div className="space-y-5">
        <NoticeBar tone="info">
          A product feed is the network&apos;s own feed-level record. Nothing on this page ingests, syncs, retries or
          edits a feed.
        </NoticeBar>

        <Section title="Feed" subtitle="Identity as the admin contract returns it">
          <FieldGrid
            columns={3}
            fields={[
              { label: "Feed name", render: () => text(feed.feedName) },
              { label: "Supplier / network", render: () => <IdChip value={feed.supplier} /> },
              { label: "Supplier feed ID", render: () => <IdChip value={feed.feedExternalId} title="The network's own feed identifier" /> },
              { label: "Feed status", render: () => <FeedStatusChip value={feed.status} /> },
              { label: "MBO feed ID", render: () => <IdChip value={feed.id} title="MBO ProductFeed row id" /> },
            ]}
          />
        </Section>

        <Section title="Coverage" subtitle="Each count is reported separately; none is combined with another.">
          <FieldGrid
            columns={3}
            fields={["itemCount", "productCount", "assignmentCount"].map((key) => ({
              label: counts[key].label,
              render: () => <span title={counts[key].help}><CountCell value={feed[key]} /></span>,
            }))}
          />
        </Section>

        <Section title="Processing state" subtitle="Counts and the last sync timestamp, as stored.">
          <FieldGrid
            columns={3}
            fields={[
              ...["errorCount", "exceptionCount"].map((key) => ({
                label: counts[key].label,
                render: () => <span title={counts[key].help}><CountCell value={feed[key]} /></span>,
              })),
              { label: "Last sync", render: () => <DateCell value={feed.lastSyncAt} /> },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">
            No freshness or health state is derived from this timestamp: the contract defines none.
          </p>
        </Section>

        <Section title="Error state" subtitle="Presence only.">
          <FieldGrid columns={2} fields={[{ label: "Error state", render: () => <FeedErrorState feed={feed} /> }]} />
          {errorState === ERROR_STATE.PRESENT ? (
            <NoticeBar tone="warning">
              <span data-error-suppressed="true">{ERROR_SUPPRESSED_NOTE}</span>
            </NoticeBar>
          ) : (
            <p className="mt-2 text-xs text-slate-500">{ERROR_LABELS.NONE}</p>
          )}
        </Section>

        <Section title="Campaign source" subtitle="An exact MBO identifier. Nothing is matched by campaign or brand name.">
          <FieldGrid
            columns={2}
            fields={[
              {
                label: "Campaign source ID (MBO)",
                render: () => <IdChip value={feed.campaignSourceId} title="MBO CampaignSource row id" />,
              },
            ]}
          />
        </Section>

        <Section title="Contract availability" subtitle="Fields this contract does not return. They are named rather than shown as empty values.">
          <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-600">
            {BACKEND_UNAVAILABLE_FIELDS.map((field) => (
              <li key={field}>{field}</li>
            ))}
          </ul>
          <NoticeBar tone="info">{NO_RAW_REFERENCE}</NoticeBar>
        </Section>

        <Section title="Operational warnings" subtitle="Only states the contract actually proves">
          <WarningList warnings={warnings} />
        </Section>
      </div>
    </Drawer>
  );
}
ProductFeedDrawer.propTypes = { feed: optionalObject, open: optionalBool, onClose: optionalFunc };
