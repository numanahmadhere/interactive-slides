// Self-paced courses. On a shared link whose deck has the course switch on, the visitor works through the
// slides at their own speed; the page remembers which they have seen (on their own device) and, once they have
// seen them all, offers to record that they finished and to print a certificate.

const key = (token) => `is-course-${token.slice(0, 12)}`;

export function loadProgress(token, store = globalThis.localStorage) {
  try {
    const raw = JSON.parse(store.getItem(key(token)) ?? 'null');
    return { seen: Array.isArray(raw?.seen) ? raw.seen.filter(Number.isInteger) : [], name: typeof raw?.name === 'string' ? raw.name.slice(0, 80) : '', done: raw?.done === true };
  } catch {
    return { seen: [], name: '', done: false };
  }
}

export function saveProgress(token, progress, store = globalThis.localStorage) {
  try { store.setItem(key(token), JSON.stringify(progress)); } catch { /* private window: progress lasts for this visit only */ }
}

export const isComplete = (seen, total) => total > 0 && new Set(seen.filter((n) => n >= 0 && n < total)).size >= total;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A page to print or save as PDF. The name is typed by the visitor, so it is escaped.
export function certificateHtml({ name, course, date = new Date() }) {
  const day = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Certificate of completion</title>
<style>@page{size:A4 landscape;margin:0}body{margin:0;font-family:system-ui,sans-serif;color:#0F1117;background:#fff}.c{box-sizing:border-box;min-height:100vh;margin:0 auto;padding:64px 80px;border:14px solid #2020E8;display:flex;flex-direction:column;justify-content:center;text-align:center}.k{letter-spacing:.2em;text-transform:uppercase;color:#5B6475;font-size:15px}h1{font-size:44px;margin:12px 0 28px}.n{font-size:56px;font-weight:700;color:#2020E8;margin:6px 0 24px;overflow-wrap:anywhere}p{font-size:20px;margin:6px 0}.f{margin-top:48px;color:#5B6475;font-size:14px}@media print{.c{border-width:14px}}</style></head><body>
<main class="c"><div class="k">Certificate of completion</div><h1>${esc(course)}</h1><p>This certifies that</p><div class="n">${esc(name)}</div><p>completed every part of this course on ${esc(day)}.</p>
<div class="f">Made with Densight Slides</div></main></body></html>`;
}

export function completionsCsv(rows) {
  const cell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  return `﻿${['Name,Completed']
    .concat(rows.map((r) => `${cell(r.name)},${cell(new Date(r.completed_at).toISOString())}`)).join('\n')}\n`;
}
