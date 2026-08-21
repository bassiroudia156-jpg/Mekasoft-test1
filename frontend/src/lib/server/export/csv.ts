// Minimal RFC-4180-ish CSV builder — no new dependency for what's a handful
// of flat columns per resource. Business-plan export feature
// (PLAN_LIMITS.BUSINESS.features.dataExport), see app/api/export/[resource]/route.ts.
import 'server-only';

/** Wraps a field in quotes and doubles any internal quotes only when
 * needed (comma/quote/newline present) — matches every spreadsheet app's
 * expectation without over-quoting plain numbers/short strings. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }
  // BOM so Excel (the whole point of this export) detects UTF-8 instead of
  // mangling accented French text (garages, é/è/à everywhere). Written as
  // an escape (not a literal char) so it doesn't trip no-irregular-whitespace.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
