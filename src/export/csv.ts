function escapeCell(value: string): string {
  const formulaPrefix = /^[\s\u0000-\u001f]*[=+\-@]|^[\t\r\n]/;
  const safeText = formulaPrefix.test(value) ? `'${value}` : value;
  return `"${safeText.replaceAll('"', '""')}"`;
}

/** CSV encoding handles strings only; it knows nothing about orders or field meanings. */
export function writeCsv(rows: Iterable<readonly string[]>): string {
  const lines = Array.from(rows, (row) => row.map(escapeCell).join(','));
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}
