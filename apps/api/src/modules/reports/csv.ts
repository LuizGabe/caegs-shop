const formulaPrefix = /^\s*[=+\-@]|^[\t\r\n]/;

function safeCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const neutralized = formulaPrefix.test(raw) ? `'${raw}` : raw;
  return `"${neutralized.replaceAll('"', '""')}"`;
}

export function createCsv(headers: string[], rows: unknown[][]) {
  const lines = [headers, ...rows].map((row) => row.map(safeCell).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
