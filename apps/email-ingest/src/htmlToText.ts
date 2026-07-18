/**
 * Minimal HTML→text for OTA notification emails: enough structure (line
 * breaks at block boundaries) for the line-oriented parsers, no DOM needed.
 */
// Prototype-free so inherited Object members (&constructor;, &toString;,
// &hasOwnProperty;, …) can never resolve to a junk value; only real named
// entities defined here exist on the table.
const NAMED_ENTITIES: Record<string, string> = Object.assign(Object.create(null) as Record<string, string>, {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  ocirc: "ô",
  ucirc: "û",
  icirc: "î",
  ecirc: "ê",
  acirc: "â",
});

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|td|th|tr|li|h[1-6]|table|section|header|footer)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => {
      const cp = Number(n);
      return !Number.isFinite(cp) || cp < 0 || cp > 0x10ffff ? "" : String.fromCodePoint(cp);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => {
      const cp = parseInt(n, 16);
      return !Number.isFinite(cp) || cp < 0 || cp > 0x10ffff ? "" : String.fromCodePoint(cp);
    })
    .replace(/&([a-z]+);/gi, (m, name: string) => {
      const key = name.toLowerCase();
      return Object.hasOwn(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
    })
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
