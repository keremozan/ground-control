/**
 * Compiles a Record<hexColor, regexPattern> into a fast color lookup.
 * Used by Inbox (email classification), Tasks (track colors), Calendar (event colors).
 * Returns null if no pattern matches — callers provide their own fallback.
 */
export function buildColorMatcher(
  patterns: Record<string, string>
): (text: string) => string | null {
  const compiled = Object.entries(patterns).map(([color, pattern]) => ({
    color,
    re: new RegExp(pattern, "i"),
  }));
  return (text: string) => {
    for (const { color, re } of compiled) {
      if (re.test(text)) return color;
    }
    return null;
  };
}
