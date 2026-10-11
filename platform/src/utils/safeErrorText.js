/**
 * Display-safe error text for backend failures.
 *
 * `redactCredentialText` (Phase 2) removes credential-shaped substrings, which is the right
 * guard for a message that is otherwise safe to show. It is not a guard against a backend
 * message that is itself an internal artefact: an ORM or driver error carries no credential
 * pattern, so it survives redaction intact and reaches the DOM verbatim. That is how an
 * "Invalid `prisma.canonicalCampaign.findMany()` invocation" message became visible in the
 * rule drawer.
 *
 * This boundary therefore does not redact backend error text — it discards it. Nothing the
 * backend returns in an error body is rendered; the caller supplies a fixed operator-facing
 * message instead. The original text is left where it belongs, in the network response and
 * the server logs.
 *
 * Use this wherever a raw backend failure would otherwise be shown to a user. Where a backend
 * message IS part of the product contract and safe to show (a validation message the operator
 * must read), keep using `redactCredentialText` instead.
 */

import { redactCredentialText } from "../pages/network/networkAccountContract.js";

export const GENERIC_LOOKUP_ERROR = "Lookup could not be completed.";

/** Shown when a list request fails with a message that is not safe to display. */
export const GENERIC_REQUEST_ERROR = "The request could not be completed. Please retry.";

/**
 * Returns the caller's fixed message, never any part of the backend error.
 *
 * The error is accepted only so call sites read naturally and so a future logger has it;
 * no field of it is returned, which is what makes the guarantee total rather than pattern
 * based. A blocklist of ORM, SQL and stack-trace shapes would always be one unseen message
 * behind.
 */
export function toSafeDisplayError(_error, fallback = GENERIC_LOOKUP_ERROR) {
  return typeof fallback === "string" && fallback.trim() ? fallback : GENERIC_LOOKUP_ERROR;
}

/**
 * True when a string looks like an internal implementation detail rather than an operator
 * message: ORM invocations, model or query fragments, SQL, stack frames, source locations,
 * Prisma error codes or dependency paths.
 *
 * This is NOT the sanitizer — `toSafeDisplayError` discards backend text unconditionally.
 * It exists so tests and future diagnostics can assert that no such text is being rendered.
 */
const INTERNAL_MARKERS = [
  /\bprisma\b/i,
  /\bPrismaClient(?:KnownRequestError|ValidationError)?\b/,
  /\bP\d{4}\b/,
  /\.\s*(?:findMany|findFirst|findUnique|findUniqueOrThrow|create|createMany|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy)\s*\(/,
  /\binvocation\b/i,
  /\bArgument\s+`[^`]+`/,
  /["'`]?\b(?:where|include|select|orderBy|take|skip|cursor|distinct)\b["'`]?\s*:/,
  /\bselect\b[\s\S]*\bfrom\b/i,
  /\binsert\s+into\b/i,
  /\bupdate\b[\s\S]*\bset\b[\s\S]*\bwhere\b/i,
  /\b(?:inner|left|right|outer)\s+join\b/i,
  /\bat\s+[\w$.<>]+\s*\(/,
  /\b[\w.-]+\.(?:js|mjs|cjs|ts|tsx|jsx):\d+(?::\d+)?/i,
  /\bnode_modules\b/i,
  /\b@prisma\//i,
  /\b(?:canonicalCampaign|supplierCampaign|campaignSource|supplierCommissionRule|rawPayload|trackingLink)\b/,
];

export function looksInternal(text) {
  if (text == null || text === "") return false;
  const value = String(text);
  return INTERNAL_MARKERS.some((pattern) => pattern.test(value));
}

/**
 * Error text for a PRIMARY request whose message is part of the product contract — a validation
 * message or an operator-facing failure the user needs to read.
 *
 * Unlike `toSafeDisplayError`, which discards backend text outright, this keeps a message that is
 * genuinely meant for a person and substitutes the caller's fallback as soon as the text looks
 * like an internal artefact: an ORM invocation, a query fragment, SQL, a stack frame, a source
 * location or a dependency path. Credential-shaped substrings are still redacted from whatever
 * survives.
 *
 * The recogniser is a safety net on top of a backend that is expected to sanitize its own error
 * bodies; it is not a licence to render anything the backend sends.
 */
export function safeListError(message, fallback = GENERIC_LOOKUP_ERROR) {
  const safeFallback = typeof fallback === "string" && fallback.trim() ? fallback : GENERIC_LOOKUP_ERROR;
  if (message == null || String(message).trim() === "") return safeFallback;
  if (looksInternal(message)) return safeFallback;
  return redactCredentialText(message) || safeFallback;
}

/**
 * A display message chosen from HTTP status semantics alone.
 *
 * The response body is never consulted: the caller supplies the message its page owns, and only
 * the few statuses that mean something actionable to an operator get their own wording. This is
 * the guarantee that does not depend on recognising anything, which is why the Network Operations
 * pages use it instead of `safeListError` for their primary loads.
 */
export function statusSafeMessage(status, fallback = GENERIC_REQUEST_ERROR) {
  const safeFallback = typeof fallback === "string" && fallback.trim() ? fallback : GENERIC_REQUEST_ERROR;
  const code = Number(status);
  if (code === 400 || code === 422) return `${safeFallback} The request was rejected; check the filters and try again.`;
  if (code === 401) return `${safeFallback} Your session is no longer authorized; sign in again.`;
  if (code === 403) return `${safeFallback} Your role does not allow this request.`;
  if (code === 404) return `${safeFallback} The endpoint was not found.`;
  if (code === 429) return `${safeFallback} Too many requests; retry shortly.`;
  return safeFallback;
}
