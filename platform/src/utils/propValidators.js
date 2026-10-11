/**
 * Dependency-free prop validators for `Component.propTypes`.
 *
 * React calls each validator in development as `(props, propName, componentName)` and expects
 * `null` when the prop is valid or an `Error` describing the problem. This is React's public
 * custom-validator contract, so no `prop-types` package is needed. Production builds skip
 * validation entirely.
 */

function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function optional(expected, test) {
  return function validate(props, propName, componentName) {
    const value = props[propName];
    if (value === undefined || value === null) return null;
    if (test(value)) return null;
    return new Error(`Invalid prop \`${propName}\` supplied to \`${componentName}\`: expected ${expected}, received ${describe(value)}.`);
  };
}

export const optionalString = optional("string", (v) => typeof v === "string");
export const optionalNumber = optional("number", (v) => typeof v === "number" && Number.isFinite(v));
export const optionalBool = optional("boolean", (v) => typeof v === "boolean");
export const optionalFunc = optional("function", (v) => typeof v === "function");
export const optionalArray = optional("array", (v) => Array.isArray(v));
export const optionalObject = optional("object", (v) => typeof v === "object" && !Array.isArray(v));
export const optionalStringOrNumber = optional("string or number", (v) => typeof v === "string" || typeof v === "number");

/** Anything renderable: string, number, boolean, element, array of those. */
export const optionalNode = optional("renderable node", (v) => {
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean" || t === "object";
});

export function optionalOneOf(values) {
  return optional(`one of ${values.map((v) => JSON.stringify(v)).join(", ")}`, (v) => values.includes(v));
}
