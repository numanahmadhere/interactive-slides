// Saved session reports: kept on this device only, listed newest first. Open one to read it, download it as a
// spreadsheet, print it to PDF, or delete it.

import { h } from '../core/dom.js';
import { Persistence } from '../editor/persist.js';
import { button, openDialog, toast } from '../editor/ui.js';
import { appFooter, appHeader } from './chrome.js';
import { reportCsv, reportHtml } from '../live/report.js';
import { slugify } from '../core/util.js';

const when = (ms) => new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// A report as a page to print or save as PDF, in a new tab.
export function printReport(report) {
  const win = window.open('', '_blank');
  if (!win) {
    toast('Allow pop-ups for this page to print the report.', { kind: 'error' });
    return;
  }
  win.document.open();
  win.document.write(reportHtml(report));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

export function reportActions(report, { onDelete } = {}) {
  const base = slugify(report.title) || 'session';
  return h('div', { class: 'ed-live__actions' },
    button({ label: 'Download spreadsheet', onClick: () => download(`${base}-report.csv`, reportCsv(report), 'text/csv;charset=utf-8') }),
    button({ label: 'Print or save as PDF', onClick: () => printReport(report) }),
    onDelete ? button({ label: 'Delete', variant: 'danger', onClick: onDelete }) : null);
}

export async function mountReports(root) {
  const persist = new Persistence();
  await persist.init();

  async function render() {
    const reports = await persist.listReports();
    const list = reports.length
      ? h('ul', { class: 'sh-reports' }, ...reports.map((r) => h('li', { class: 'sh-report' },
        h('div', {}, h('div', { class: 'sh-report__title', text: r.title }),
          h('div', { class: 'sh-report__meta', text: `${when(r.startedAt)} · ${r.participants} ${r.participants === 1 ? 'person' : 'people'} · ${r.questions.length} ${r.questions.length === 1 ? 'question' : 'questions'}` })),
        button({ label: 'Open', onClick: () => show(r) }))))
      : h('p', { class: 'sh-lead', text: 'No reports yet. During a live session, choose "Save report" in the Go live window, or when you end the session.' });
    root.replaceChildren(appHeader({ active: 'reports' }),
      h('main', { class: 'sh-main sh-narrow', id: 'main' },
        h('h1', { class: 'sh-title', text: 'Session reports' }),
        h('p', { class: 'sh-lead', text: 'Saved in this browser only. Audience answers are never sent to our servers, so a report exists only if you save it here, and clearing this browser\'s data removes it.' }),
        list),
      appFooter());
  }

  function show(report) {
    const content = h('div', null,
      h('p', { class: 'ed-hint', text: `${when(report.startedAt)} · ${report.participants} people · ${report.minutes} minutes` }),
      report.players.length ? h('div', {}, h('h3', { text: 'Scoreboard' }), h('ol', {}, ...report.players.slice(0, 10).map((p) => h('li', { text: `${p.name}${p.team ? ` (${p.team})` : ''}: ${p.points}` })))) : null,
      ...report.questions.map((q) => h('div', { class: 'ed-xrow' },
        h('div', { class: 'ed-xrow__title', text: q.question || '(no question text)' }),
        h('div', { class: 'ed-xrow__desc', text: `Slide ${q.slide} · ${q.kind} · ${q.responses} ${q.responses === 1 ? 'response' : 'responses'}${q.average ? ` · average ${q.average}` : ''}` }))),
      reportActions(report, { onDelete: async () => { await persist.deleteReport(report.id); dlg.close(); toast('Deleted.'); render(); } }));
    const dlg = openDialog({ title: report.title, content, wide: true });
  }

  await render();
}
