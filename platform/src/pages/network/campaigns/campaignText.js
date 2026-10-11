/**
 * Safe readable text for admin summary fields (campaign description, terms & conditions,
 * promotion description). Network sources deliver these as basic HTML fragments, e.g.
 * "<p>Link Tracking (SG)</p>". The Sheet contract asks for sanitized readable content.
 *
 * Strategy: HTML → plain text, never HTML → DOM. The result is only ever rendered as a React
 * text node, so nothing here can execute or become markup regardless of the input. Tag and
 * entity handling exists purely for readability. The raw value in state is never modified.
 */

// Elements whose content is not readable text; removed together with their bodies.
const DROP_WITH_BODY = /<(script|style|iframe|object|embed|noscript|template|svg|math|textarea|title|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// Raw-text elements left unclosed: drop from the opening tag to the end of the string.
// (embed/object are not listed: embed is a void tag and object bodies are readable fallbacks.)
const DROP_UNCLOSED = /<(script|style|iframe|noscript|template)\b[\s\S]*$/i;
const COMMENT = /<!--[\s\S]*?-->/g;
const DECLARATION = /<![^>]*>|<\?[\s\S]*?\?>/g;
const LINE_BREAK = /<br\s*\/?>|<\/(p|div|ul|ol|h[1-6]|tr|table|thead|tbody|blockquote|section|article|header|footer|pre|dd|dt|dl)\s*>|<hr\s*\/?>/gi;
const LIST_ITEM = /<li\b[^>]*>/gi; // opening <li> starts a bullet line; </li> needs no extra break
const CELL_GAP = /<\/(td|th)\s*>/gi;
// Any remaining tag, with quoted attribute values allowed to contain ">".
const TAG = /<\/?[a-zA-Z][^\s/>]*(?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*\s*\/?>/g;
// A tag opened but never closed before the end of the input is markup residue, not text.
const DANGLING_TAG = /<\/?[a-zA-Z][^<>]*$/;

const NAMED_ENTITIES = Object.freeze({
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  laquo: "\u00ab",
  raquo: "\u00bb",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  bull: "\u2022",
  middot: "\u00b7",
  euro: "\u20ac",
  pound: "\u00a3",
  yen: "\u00a5",
});

// Single pass so "&amp;lt;" becomes "&lt;" (text), never "<".
const ENTITY = /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});/gi;

export function decodeHtmlEntities(text) {
  return String(text).replace(ENTITY, (match, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return match;
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/**
 * Converts a basic-HTML string to readable plain text.
 * Returns null when the input is null/undefined/empty or contains no readable text.
 */
export function htmlToReadableText(value) {
  if (value == null) return null;
  let text = String(value);
  if (!text.trim()) return null;

  text = text
    .replace(/\r\n?/g, "\n")
    .replace(COMMENT, "")
    .replace(DECLARATION, "")
    .replace(DROP_WITH_BODY, "")
    .replace(DROP_UNCLOSED, "")
    .replace(LIST_ITEM, "\n• ")
    .replace(CELL_GAP, " ")
    .replace(LINE_BREAK, "\n")
    .replace(TAG, "")
    .replace(DANGLING_TAG, "");

  text = decodeHtmlEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return text || null;
}
