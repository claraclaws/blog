/**
 * HTML → safe plain-text sanitiser.
 *
 * Goals:
 *   1. Strip <script> and <style> blocks entirely.
 *   2. Remove all remaining HTML tags.
 *   3. Decode common HTML entities.
 *   4. Collapse runs of whitespace into single spaces / newlines.
 *   5. Never return raw HTML to the caller.
 *
 * This intentionally avoids a full DOM parser to keep dependencies at zero.
 */

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

const ENTITY_RE = new RegExp(Object.keys(ENTITY_MAP).join("|"), "gi");

function decodeEntities(text: string): string {
  // Named / common entities
  let result = text.replace(
    ENTITY_RE,
    (match) => ENTITY_MAP[match.toLowerCase()] ?? match
  );
  // Numeric entities  &#123; or &#x1A;
  result = result.replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16))
  );
  result = result.replace(/&#(\d+);/g, (_m, dec: string) =>
    String.fromCodePoint(Number(dec))
  );
  return result;
}

/**
 * Convert an HTML string to safe plain text.
 *
 * @param html  Raw HTML body (may be undefined/null).
 * @returns     Sanitised plain-text string.
 */
export function htmlToPlainText(html: string | undefined | null): string {
  if (!html) return "";

  let text = html;

  // 1. Remove <script> … </script> and <style> … </style> blocks
  text = text.replace(/<script[\s>][\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s>][\s\S]*?<\/style>/gi, "");

  // 2. Turn <br>, <p>, <div>, <tr>, <li> boundaries into newlines
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/?(p|div|tr|li|h[1-6]|blockquote)[\s>]/gi, "\n");

  // 3. Strip all remaining tags
  text = text.replace(/<[^>]*>/g, "");

  // 4. Decode HTML entities
  text = decodeEntities(text);

  // 5. Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");            // horizontal runs → single space
  text = text.replace(/\n[ \t]+/g, "\n");          // leading space on lines
  text = text.replace(/[ \t]+\n/g, "\n");          // trailing space on lines
  text = text.replace(/\n{3,}/g, "\n\n");          // at most one blank line
  text = text.trim();

  return text;
}

/**
 * Truncate text to a maximum length, appending an ellipsis if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "…";
}
