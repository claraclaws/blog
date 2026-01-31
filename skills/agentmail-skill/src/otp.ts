/**
 * OTP / verification-code extraction from email plain text.
 *
 * Strategy:
 *   1. Scan for keyword anchors: "code", "verification", "OTP", "pin",
 *      "2-step", "security code", "confirm", "one-time".
 *   2. Look for 4–10 digit sequences near those anchors (within ±120 chars).
 *   3. Filter out likely false positives:
 *      - Phone numbers (leading +, parenthesised area codes)
 *      - ZIP codes preceded by state abbreviations
 *      - Years (1900–2099)
 *      - Sequences > 10 digits
 */

export interface ExtractedCode {
  /** The raw digit string, e.g. "482931" */
  code: string;
  /** The keyword that anchored this match */
  keyword: string;
  /** Character offset in the source text */
  offset: number;
}

const KEYWORDS = [
  "code",
  "verification",
  "verify",
  "otp",
  "pin",
  "2-step",
  "two-step",
  "security code",
  "confirm",
  "one-time",
  "one time",
  "passcode",
  "pass code",
];

const KEYWORD_RE = new RegExp(`(${KEYWORDS.join("|")})`, "gi");

/** Window (in characters) around a keyword to search for digit sequences. */
const PROXIMITY = 120;

/** Matches 4-10 digit sequences that are not part of a longer number. */
const DIGIT_RE = /(?<!\d)(\d{4,10})(?!\d)/g;

/** Looks like a phone number: preceded by + or ( or "tel" */
const PHONE_PREFIX_RE = /[+(]\s*$/;

/** Years 1900–2099 */
const YEAR_RE = /^(19|20)\d{2}$/;

/** US state abbreviation followed by space – likely a ZIP */
const ZIP_PREFIX_RE = /\b[A-Z]{2}\s+$/;

export function extractVerificationCodes(plainText: string): ExtractedCode[] {
  const results: ExtractedCode[] = [];
  const seen = new Set<string>();

  let keywordMatch: RegExpExecArray | null;
  while ((keywordMatch = KEYWORD_RE.exec(plainText)) !== null) {
    const kwStart = keywordMatch.index;
    const kwEnd = kwStart + keywordMatch[0].length;
    const keyword = keywordMatch[0].toLowerCase();

    // Define a window around the keyword
    const windowStart = Math.max(0, kwStart - PROXIMITY);
    const windowEnd = Math.min(plainText.length, kwEnd + PROXIMITY);
    const window = plainText.slice(windowStart, windowEnd);

    let digitMatch: RegExpExecArray | null;
    const localDigitRe = new RegExp(DIGIT_RE.source, "g");
    while ((digitMatch = localDigitRe.exec(window)) !== null) {
      const code = digitMatch[1];
      const absOffset = windowStart + digitMatch.index;

      // --- False-positive filters ---

      // Skip years
      if (YEAR_RE.test(code)) continue;

      // Skip phone numbers: check chars immediately before the match
      const prefixSlice = plainText.slice(
        Math.max(0, absOffset - 5),
        absOffset
      );
      if (PHONE_PREFIX_RE.test(prefixSlice)) continue;

      // Skip ZIP codes
      if (ZIP_PREFIX_RE.test(prefixSlice)) continue;

      // Deduplicate
      const dedupeKey = `${code}@${absOffset}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      results.push({ code, keyword, offset: absOffset });
    }
  }

  return results;
}
