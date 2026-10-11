/** Plain formatting helpers shared by the Network Accounts and API Credentials pages. */

export function humanize(value) {
  if (value == null || value === "") return "—";
  return String(value).replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export const AUTH_TYPE_LABELS = {
  api_key: "API key",
  oauth: "OAuth 2.0",
};

export function authTypeLabel(value) {
  if (!value) return "Not available";
  return AUTH_TYPE_LABELS[String(value).toLowerCase()] || String(value);
}
