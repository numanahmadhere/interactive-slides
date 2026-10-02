// Pasted table data for charts: comma, tab or semicolon separated, with quotes,
// thousands separators and an optional header row.

function splitLine(line, delim) {
  const out = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { out.push(cell.trim()); cell = ''; }
    else cell += ch;
  }
  out.push(cell.trim());
  return out;
}

export function toNumber(s) {
  const clean = String(s ?? '').replace(/[\s,$%€£]/g, '');
  if (clean === '' || !/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(clean)) return NaN;
  return Number(clean);
}

// -> { headers: string[], rows: [{ label, values: number[] }] }
export function parseTable(text, { maxRows = 40, maxSeries = 6 } = {}) {
  const lines = String(text ?? '').split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '');
  if (!lines.length) return { headers: [], rows: [] };
  const sample = lines.slice(0, 5).join('\n');
  const delim = ['\t', ';', ','].map((d) => [d, sample.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const cells = lines.map((l) => splitLine(l, delim));

  const width = Math.max(...cells.map((r) => r.length));
  const first = cells[0];
  const hasHeader = first.slice(1).some((c) => c !== '' && Number.isNaN(toNumber(c)));
  const headers = hasHeader
    ? first.slice(1, 1 + maxSeries).map((h, i) => h || `Series ${i + 1}`)
    : Array.from({ length: Math.min(width - 1, maxSeries) }, (_, i) => (width - 1 === 1 ? 'Value' : `Series ${i + 1}`));

  const rows = [];
  for (const row of cells.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + maxRows)) {
    const values = headers.map((_, i) => toNumber(row[i + 1]));
    if (values.every(Number.isNaN)) continue;
    rows.push({ label: row[0] || '', values: values.map((v) => (Number.isNaN(v) ? 0 : v)) });
  }
  return { headers, rows };
}

// A friendly axis maximum and step for a data maximum.
export function niceScale(max, ticks = 5) {
  if (!(max > 0)) return { max: 1, step: 0.2 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  return { max: Math.ceil(max / step) * step, step };
}
