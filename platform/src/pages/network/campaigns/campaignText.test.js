import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodeHtmlEntities, htmlToReadableText } from "./campaignText.js";

describe("htmlToReadableText", () => {
  it("strips a simple paragraph wrapper", () => {
    assert.equal(htmlToReadableText("<p>Link Tracking (SG)</p>"), "Link Tracking (SG)");
  });

  it("flattens nested inline markup", () => {
    assert.equal(htmlToReadableText("<p>Save <strong>10%</strong> today</p>"), "Save 10% today");
  });

  it("keeps null truthful", () => {
    assert.equal(htmlToReadableText(null), null);
    assert.equal(htmlToReadableText(undefined), null);
    assert.equal(htmlToReadableText(""), null);
    assert.equal(htmlToReadableText("   "), null);
  });

  it("reports markup-only input as empty", () => {
    assert.equal(htmlToReadableText("<p></p><br/>"), null);
    assert.equal(htmlToReadableText("<script>alert(1)</script>"), null);
  });

  it("leaves plain text untouched", () => {
    assert.equal(htmlToReadableText("Cross-border shopping campaign."), "Cross-border shopping campaign.");
    assert.equal(htmlToReadableText(42), "42");
  });

  it("preserves readable line breaks for blocks, <br> and list items", () => {
    assert.equal(htmlToReadableText("<p>First</p><p>Second</p>"), "First\nSecond");
    assert.equal(htmlToReadableText("Line one<br>Line two<br/>Line three"), "Line one\nLine two\nLine three");
    assert.equal(htmlToReadableText("<ul><li>Free shipping</li><li>Returns in 30 days</li></ul>"), "• Free shipping\n• Returns in 30 days");
    assert.equal(htmlToReadableText("<div>A</div>\n\n\n\n<div>B</div>"), "A\n\nB");
  });

  it("decodes common and numeric entities once", () => {
    assert.equal(htmlToReadableText("Tom &amp; Jerry &lt;3 &quot;deals&quot; &#39;now&#39;&nbsp;&#8364;5 &#x41;"), 'Tom & Jerry <3 "deals" \'now\' €5 A');
    assert.equal(htmlToReadableText("&amp;lt;b&amp;gt;"), "&lt;b&gt;");
    assert.equal(decodeHtmlEntities("&unknown; &#0; &#xD800;"), "&unknown; &#0; &#xD800;");
  });

  it("encoded tags become literal text, not markup", () => {
    assert.equal(htmlToReadableText("&lt;b&gt;bold&lt;/b&gt;"), "<b>bold</b>");
  });

  it("drops scripts, styles, embedded content and their bodies", () => {
    const input = [
      "<p>Promo</p>",
      "<script>window.__xss = 1</script>",
      "<style>body{display:none}</style>",
      "<iframe src=\"https://evil.example.test\"></iframe>",
      "<object data=\"x\"></object><embed src=\"x\">",
      "<SCRIPT type='text/javascript'>alert('upper')</SCRIPT>",
      "<p>After</p>",
    ].join("");
    assert.equal(htmlToReadableText(input), "Promo\nAfter");
  });

  it("drops an unclosed script to the end of the string", () => {
    assert.equal(htmlToReadableText("<p>Safe</p><script>while(true){}"), "Safe");
  });

  it("strips event handlers, javascript: links and comments without keeping any markup", () => {
    const input = "<img src=x onerror=\"window.__xss=2\"><a href=\"javascript:window.__xss=3\" onclick='x()'>Click</a><!-- <script>evil()</script> --><span title=\"a>b\">Text</span>";
    const out = htmlToReadableText(input);
    assert.equal(out, "ClickText");
    assert.ok(!/[<>]/.test(out));
    assert.ok(!/onerror|javascript:|script/i.test(out));
  });

  it("does not resolve to markup even for malformed tags", () => {
    const out = htmlToReadableText("<p>Broken <b <i>text</p> <img src=x onerror=alert(1)");
    assert.ok(!/<(script|img|iframe)\b/i.test(out));
    assert.ok(out.includes("text"));
  });
});
