// A finished (or running) session turned into a report: who took part, what each question showed, and the
// quiz scores. Built on the presenter's page from what it already holds and, if the presenter chooses, kept
// on their own device. Nothing here is sent to a server.

import { cell } from './results.js';

const MAX_TEXT_ROWS = 300;

// parts: everything the host knows. See LiveHost.report().
export function buildReport({ id, title, startedAt, endedAt, participants, known, tally, boards, players, teams }) {
  const questions = known.map(({ prompt: p, slide }) => {
    const q = { slide, kind: p.kind, question: p.question };
    if (p.kind === 'poll' || p.kind === 'quiz') {
      const counts = tally.counts(p.id, p.options.length);
      q.options = p.options.map((text, i) => ({ text, count: counts[i] }));
      q.responses = counts.reduce((a, b) => a + b, 0);
    } else if (p.kind === 'rating') {
      const counts = tally.counts(p.id, p.options.length);
      const n = counts.reduce((a, b) => a + b, 0);
      q.counts = counts;
      q.responses = n;
      q.average = n ? Math.round((counts.reduce((a, c, i) => a + c * (i + 1), 0) / n) * 100) / 100 : null;
    } else if (p.kind === 'ranking') {
      const scores = tally.scores(p.id, p.options.length);
      q.options = p.options.map((text, i) => ({ text, points: scores[i] })).sort((a, b) => b.points - a.points);
      q.responses = tally.voters(p.id);
    } else if (p.kind === 'cloud') {
      q.words = boards.words(p.id, MAX_TEXT_ROWS);
      q.responses = q.words.reduce((a, w) => a + w[1], 0);
    } else if (p.kind === 'open') {
      q.answers = boards.responses(p.id, MAX_TEXT_ROWS);
      q.responses = q.answers.length;
    } else if (p.kind === 'qna') {
      q.questions = boards.questions(p.id, { includeHidden: false }).slice(0, MAX_TEXT_ROWS);
      q.responses = q.questions.length;
    }
    return q;
  });
  return {
    id,
    title: String(title ?? '').slice(0, 200) || 'Untitled session',
    startedAt,
    endedAt,
    minutes: Math.max(0, Math.round((endedAt - startedAt) / 60000)),
    participants,
    questions,
    players: players.map(({ name, team, points, correct, answered }) => ({ name, team, points, correct, answered })),
    teams,
  };
}

// One flat CSV: questions first, then the scoreboard.
export function reportCsv(r) {
  const out = [[`Report: ${r.title}`], [`Date`, new Date(r.startedAt).toISOString()], ['Minutes', r.minutes], ['People who took part', r.participants], [], ['Slide', 'Type', 'Question', 'Answer', 'Count']];
  for (const q of r.questions) {
    const base = [q.slide, q.kind, q.question];
    if (q.options) q.options.forEach((o) => out.push([...base, o.text, o.count ?? o.points]));
    else if (q.counts) {
      q.counts.forEach((c, i) => out.push([...base, String(i + 1), c]));
      if (q.average !== null) out.push([...base, 'Average', q.average]);
    } else if (q.words) q.words.forEach(([w, n]) => out.push([...base, w, n]));
    else if (q.answers) q.answers.forEach((a) => out.push([...base, a, 1]));
    else if (q.questions) q.questions.forEach((x) => out.push([...base, x.text, x.votes]));
  }
  if (r.players.length) {
    out.push([], ['Rank', 'Name', 'Team', 'Points', 'Questions right', 'Questions answered']);
    r.players.forEach((p, i) => out.push([i + 1, p.name, p.team, p.points, p.correct, p.answered]));
  }
  if (r.teams.length) {
    out.push([], ['Team', 'Average points', 'Players']);
    r.teams.forEach((t) => out.push([t.team, t.average, t.members]));
  }
  return `﻿${out.map((row) => row.map(cell).join(',')).join('\n')}\n`;
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A clean page to print or save as PDF. All text is escaped; nothing from the audience can run.
export function reportHtml(r) {
  const section = (q) => {
    let body = '';
    if (q.options) body = `<table>${q.options.map((o) => `<tr><td>${esc(o.text)}</td><td class="n">${o.count ?? `${o.points} pts`}</td></tr>`).join('')}</table>`;
    else if (q.counts) body = `<table>${q.counts.map((c, i) => `<tr><td>${i + 1}</td><td class="n">${c}</td></tr>`).join('')}</table>${q.average !== null ? `<p>Average ${q.average}</p>` : ''}`;
    else if (q.words) body = `<p>${q.words.slice(0, 40).map(([w, n]) => `${esc(w)} (${n})`).join(', ') || 'No words.'}</p>`;
    else if (q.answers) body = `<ul>${q.answers.slice(0, 100).map((a) => `<li>${esc(a)}</li>`).join('') || '<li>No answers.</li>'}</ul>`;
    else if (q.questions) body = `<ol>${q.questions.map((x) => `<li>${esc(x.text)} <span class="n">${x.votes} votes${x.answered ? ', answered' : ''}</span></li>`).join('') || '<li>No questions.</li>'}</ol>`;
    return `<section><h3>${esc(q.question || '(no question text)')}</h3><p class="meta">Slide ${q.slide} &middot; ${esc(q.kind)} &middot; ${q.responses} ${q.responses === 1 ? 'response' : 'responses'}</p>${body}</section>`;
  };
  const board = r.players.length
    ? `<h2>Scoreboard</h2><table>${r.players.slice(0, 50).map((p, i) => `<tr><td class="n">${i + 1}</td><td>${esc(p.name)}${p.team ? ` <span class="meta">(${esc(p.team)})</span>` : ''}</td><td class="n">${p.points}</td></tr>`).join('')}</table>`
    : '';
  const teams = r.teams.length ? `<h2>Teams</h2><table>${r.teams.map((t) => `<tr><td>${esc(t.team)}</td><td class="n">${t.average} avg</td><td class="n">${t.members} players</td></tr>`).join('')}</table>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(r.title)}: session report</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 20px;color:#0F1117}h1{font-size:28px;margin:0 0 4px}h2{margin-top:36px;border-bottom:1px solid #ccc;padding-bottom:6px}h3{margin:0 0 2px;font-size:17px}section{break-inside:avoid;margin:22px 0}.meta{color:#5B6475;margin:0 0 8px;font-size:13px}table{border-collapse:collapse;width:100%}td{padding:5px 8px;border-bottom:1px solid #e5e7eb}.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.stats{display:flex;gap:32px;margin:16px 0}.stats b{display:block;font-size:26px}</style></head><body>
<h1>${esc(r.title)}</h1><p class="meta">${esc(new Date(r.startedAt).toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' }))}</p>
<div class="stats"><div><b>${r.participants}</b>people took part</div><div><b>${r.questions.length}</b>questions</div><div><b>${r.minutes}</b>minutes</div></div>
${board}${teams}<h2>Questions</h2>${r.questions.map(section).join('') || '<p>No questions were asked.</p>'}
<p class="meta">Made by Densight Slides. Answers were held on the presenter's own device.</p></body></html>`;
}
