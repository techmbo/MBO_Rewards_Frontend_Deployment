import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  QUEUE_STATE_OPTIONS,
  TRACKING_LINK_STATE,
  selectQueueRows,
  toQueueRow,
} from "./supplierTrackingLinkContract.js";

const PAGE = readFileSync(new URL("./SupplierTrackingLinksPage.jsx", import.meta.url), "utf8");
const HOOK = readFileSync(new URL("../../../hooks/usePagedQuery.js", import.meta.url), "utf8");
const DATA_TABLE = readFileSync(
  new URL("../../../components/ui/DataTable.jsx", import.meta.url),
  "utf8",
);

/** The exact envelope the backend returns, with real Partnerize-shaped rows. */
const LIVE_ENVELOPE = {
  ok: true,
  data: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      supplier: "PARTNERIZE",
      supplierRegion: "GLOBAL",
      supplierCampaignId: "5001",
      campaignName: "Example Campaign",
      merchantNameRaw: "Example Brand",
      campaignStatus: "ACTIVE",
      participationStatus: "JOINED",
      isJoined: true,
      destinationUrl: "https://www.merchant-example.com/spring",
      hasSupplierTrackingUrl: false,
      supplierTrackingUrlHost: null,
      supplierTrackingLinkState: "TRACKING_LINK_NOT_GENERATED",
      supplierTrackingLinkProvenance: null,
      supplierTrackingLinkUpdatedAt: null,
      updatedAt: "2026-09-13T15:24:29.508Z",
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      supplier: "PARTNERIZE",
      supplierCampaignId: "5002",
      campaignName: "Second Campaign",
      campaignStatus: "ACTIVE",
      participationStatus: "JOINED",
      isJoined: true,
      hasSupplierTrackingUrl: false,
      supplierTrackingLinkState: "TRACKING_LINK_NOT_GENERATED",
      updatedAt: "2026-09-13T15:24:29.508Z",
    },
  ],
  pagination: { page: 1, pageSize: 25, total: 2 },
};

/** Mirrors usePagedQuery's normalisation: the envelope's `data` is exposed as `rows`. */
function hookResultFor(envelope) {
  return {
    rows: envelope.data ?? envelope.rows ?? [],
    pagination: envelope.pagination ?? {},
  };
}

describe("queue rendering — the regression", () => {
  it("a 200 with non-empty data renders rows", () => {
    const { rows } = hookResultFor(LIVE_ENVELOPE);
    const view = selectQueueRows(rows);
    assert.equal(view.length, 2, "both live rows must survive to the table");
    assert.equal(view[0].supplierCampaignId, "5001");
    assert.equal(view[0].state, "TRACKING_LINK_NOT_GENERATED");
    assert.equal(view[0].campaignName, "Example Campaign");
  });

  it("reproduces the bug: reading `data` off the hook yields no rows", () => {
    const hookResult = hookResultFor(LIVE_ENVELOPE);
    // This is precisely what the page did before the fix.
    assert.equal(hookResult.data, undefined, "usePagedQuery exposes no `data` key");
    assert.equal(selectQueueRows(hookResult.data).length, 0);
    // And what it does now.
    assert.equal(selectQueueRows(hookResult.rows).length, 2);
  });

  it("pagination.total > 0 does not produce an empty state", () => {
    const { rows, pagination } = hookResultFor(LIVE_ENVELOPE);
    assert.ok(pagination.total > 0);
    const view = selectQueueRows(rows);
    // DataTable shows the empty state iff rows.length === 0.
    assert.ok(DATA_TABLE.includes("if (!rows.length) {"));
    assert.notEqual(view.length, 0, "a positive total must not render as empty");
  });

  it("the empty state appears only when the row count is actually zero", () => {
    assert.equal(selectQueueRows([]).length, 0);
    assert.equal(selectQueueRows(undefined).length, 0);
    assert.equal(selectQueueRows(null).length, 0);
    assert.equal(selectQueueRows({ data: [] }).length, 0, "a non-array must not throw");
    assert.equal(selectQueueRows(LIVE_ENVELOPE.data).length, 2);
  });

  it("TRACKING_LINK_NOT_GENERATED rows appear under the default filter", () => {
    // The default filter is the state the live rows carry, so they must be requested and shown.
    assert.ok(PAGE.includes("useState({ state: TRACKING_LINK_STATE.NOT_GENERATED })"));
    assert.equal(TRACKING_LINK_STATE.NOT_GENERATED, "TRACKING_LINK_NOT_GENERATED");
    const view = selectQueueRows(LIVE_ENVELOPE.data);
    assert.ok(view.every((row) => row.state === TRACKING_LINK_STATE.NOT_GENERATED));
  });

  it("every selectable filter state is a real backend state", () => {
    const states = new Set(Object.values(TRACKING_LINK_STATE));
    assert.equal(QUEUE_STATE_OPTIONS.length, states.size, "all four states are selectable");
    for (const option of QUEUE_STATE_OPTIONS) {
      assert.ok(states.has(option.value), option.value);
    }
  });

  it("no client-side filter drops rows the backend returned", () => {
    // The backend already applies supplier/state/joined filtering. The page must not re-filter.
    const body = PAGE.slice(PAGE.indexOf("const rows = useMemo"), PAGE.indexOf("const save ="));
    assert.ok(!body.includes(".filter("), "rows must not be filtered again client-side");
    assert.ok(body.includes("selectQueueRows(queueRows)"));
  });
});

describe("queue rendering — the hook contract", () => {
  it("usePagedQuery exposes the envelope array as `rows`, not `data`", () => {
    const returned = HOOK.slice(HOOK.lastIndexOf("return {"), HOOK.lastIndexOf("};") + 2);
    assert.ok(returned.includes("rows: result.data"), "rows is the public key");
    assert.ok(!/^\s*data,/m.test(returned), "the hook must not expose a bare `data` key");
    assert.ok(returned.includes("pagination: result.pagination"));
  });

  it("the page reads `rows` from the hook and never `data`", () => {
    assert.ok(
      PAGE.includes("const { rows: queueRows, pagination, loading, error, page, setPage, reload } = usePagedQuery("),
      "the destructure must take rows",
    );
    // Exactly the braces, so the surrounding explanatory comment cannot satisfy the assertion.
    const end = PAGE.indexOf("} = usePagedQuery(");
    const start = PAGE.lastIndexOf("const {", end);
    const destructure = PAGE.slice(start, end + 1);
    assert.ok(!/\bdata\b/.test(destructure), `\`data\` must not be destructured: ${destructure}`);
    assert.ok(/\brows\s*:/.test(destructure));
  });

  it("the rendered table is fed the selected rows", () => {
    assert.ok(PAGE.includes("rows={rows}"));
    assert.ok(PAGE.includes("total={pagination?.total ?? null}"));
  });
});

describe("queue rendering — backend contract unchanged", () => {
  it("the page still calls the same endpoint with the same params", () => {
    assert.ok(PAGE.includes("SUPPLIER_TRACKING_QUEUE_PATH"));
    assert.ok(PAGE.includes('{ supplier: "PARTNERIZE", state: filters.state }'));
    // No new query parameter was invented to work around the bug.
    assert.ok(!PAGE.includes("joinedOnly"));
    assert.ok(!PAGE.includes("unwrap"));
  });

  it("row mapping still reads exactly the backend field names", () => {
    const row = toQueueRow(LIVE_ENVELOPE.data[0]);
    assert.equal(row.state, LIVE_ENVELOPE.data[0].supplierTrackingLinkState);
    assert.equal(row.provenance, LIVE_ENVELOPE.data[0].supplierTrackingLinkProvenance);
    assert.equal(row.hasSupplierTrackingUrl, false);
    assert.equal(row.destinationUrl, LIVE_ENVELOPE.data[0].destinationUrl);
    // The full attributed URL is still never surfaced.
    assert.equal(row.trackingUrl, undefined);
  });
});

describe("the All filter", () => {
  const API = readFileSync(new URL("../../../apiUrl.js", import.meta.url), "utf8");
  const FILTER_BAR = readFileSync(
    new URL("../../../components/ui/FilterBar.jsx", import.meta.url),
    "utf8",
  );

  it("FilterBar offers an all-option whose value is the empty string", () => {
    assert.ok(FILTER_BAR.includes('{ value: "", label: filter.allLabel'));
    assert.ok(PAGE.includes('allLabel: "All states"'));
  });

  it("an empty state is omitted from the request entirely", () => {
    // fetchApi drops undefined, null and "" params, so All sends no `state` key at all.
    assert.ok(API.includes('if (value !== undefined && value !== null && value !== "")'));

    const params = { supplier: "PARTNERIZE", state: "" };
    const url = new URL("https://example.test/supplier-campaigns/tracking-links/queue");
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    assert.equal(url.searchParams.has("state"), false, "All must omit state");
    assert.equal(url.searchParams.get("supplier"), "PARTNERIZE", "other filters still apply");
  });

  it("a specific state is sent as a query parameter", () => {
    const url = new URL("https://example.test/q");
    const params = { supplier: "PARTNERIZE", state: TRACKING_LINK_STATE.AVAILABLE };
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    assert.equal(url.searchParams.get("state"), "TRACKING_LINK_AVAILABLE");
  });

  it("the page uses FilterBar's (key, value) onChange signature", () => {
    // Passing setFilters directly would call setState("state", value) and replace the whole
    // filters object with the string "state", so no selection would ever take effect.
    assert.ok(
      PAGE.includes("onChange={(key, value) => setFilters((prev) => ({ ...prev, [key]: value }))}"),
      "must merge by key",
    );
    assert.ok(!/onChange=\{setFilters\}/.test(PAGE), "setFilters must not be passed directly");
  });

  it("the state filter flows into the query the hook sends", () => {
    assert.ok(PAGE.includes('{ supplier: "PARTNERIZE", state: filters.state }'));
    assert.ok(PAGE.includes("[filters.state]"), "the query memo must track the filter");
  });
});
