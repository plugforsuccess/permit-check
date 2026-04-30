/**
 * PII redaction helpers. Pure functions, no env / IO dependencies, so they
 * can be unit-tested in isolation.
 *
 * Imported by src/lib/logger.ts.
 */

/**
 * Strip a postal address to ZIP+street-name only.
 *
 * Examples:
 *   "123 Main St, Atlanta, GA 30303"          -> "Main St 30303"
 *   "456 Elm Ave Apt 5, Atlanta, GA 30308-12" -> "Elm Ave Apt 5 30308"
 *   "789 Peachtree St NE"                     -> "Peachtree St NE"
 *   "30303"                                   -> "30303"
 *   ""                                        -> ""
 *
 * Rules:
 *   1. Extract a 5-digit ZIP if present (optionally ZIP+4); keep it.
 *   2. Drop everything from the first comma onward (city / state / ZIP-with-comma).
 *   3. Drop a leading street number (digits, optional letter).
 *   4. Append the extracted ZIP if it was found beyond the comma.
 */
export function redactAddress(input: unknown): string {
  if (typeof input !== "string") return String(input ?? "");
  const trimmed = input.trim();
  if (!trimmed) return trimmed;

  // 1. Extract ZIP if present anywhere in the string.
  const zipMatch = trimmed.match(/\b(\d{5})(?:-\d{4})?\b/);
  const zip = zipMatch ? zipMatch[1] : null;

  // 2. Take the segment before the first comma — that's typically just the
  //    street component "123 Main St".
  const beforeComma = trimmed.split(",")[0].trim();

  // 3. Strip a leading street number (e.g. "123" or "456A").
  const streetOnly = beforeComma.replace(/^\d+[A-Za-z]?\s+/, "").trim();

  // 4. Re-attach the ZIP, if any. If the only thing left is the ZIP itself
  //    (input was just a ZIP code), return it once — not duplicated.
  if (zip) {
    if (!streetOnly || streetOnly === zip) return zip;
    return `${streetOnly} ${zip}`;
  }
  return streetOnly;
}
