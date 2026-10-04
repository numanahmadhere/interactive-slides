// A session's answers as a spreadsheet file. Built from the presenter's own page, so
// nothing is sent anywhere; the presenter chooses to download it.

// A cell that starts with = + - @ would be run as a formula by Excel and Sheets, so it
// gets a leading apostrophe. Quotes are doubled and anything awkward is wrapped.
export function cell(value) {
  let t = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const TYPE_NAMES = { poll: 'Poll', quiz: 'Quiz', rating: 'Rating', ranking: 'Ranking', cloud: 'Word cloud', open: 'Open answers', qna: 'Q&A', pin: 'Pin on image' };

// known: [{ prompt, slide }]. Rows are: slide, type, question, answer, count, note.
export function resultsCsv(known, tally, boards, title = '', pins = () => []) {
  const rows = [['Slide', 'Type', 'Question', 'Answer', 'Count', 'Note']];
  for (const { prompt: p, slide } of known) {
    const base = [slide, TYPE_NAMES[p.kind] ?? p.kind, p.question];
    if (p.kind === 'poll' || p.kind === 'quiz') {
      const counts = tally.counts(p.id, p.options.length);
      p.options.forEach((o, i) => rows.push([...base, o, counts[i], '']));
    } else if (p.kind === 'rating') {
      const counts = tally.counts(p.id, p.options.length);
      const n = counts.reduce((a, b) => a + b, 0);
      counts.forEach((c, i) => rows.push([...base, p.options[i], c, '']));
      if (n) rows.push([...base, 'Average', Math.round((counts.reduce((a, c, i) => a + c * (i + 1), 0) / n) * 100) / 100, `${n} responses`]);
    } else if (p.kind === 'ranking') {
      const scores = tally.scores(p.id, p.options.length);
      p.options.map((o, i) => [o, scores[i]]).sort((a, b) => b[1] - a[1]).forEach(([o, pts], place) => rows.push([...base, o, pts, `place ${place + 1}`]));
    } else if (p.kind === 'cloud') {
      for (const [word, n] of boards.words(p.id, 500)) rows.push([...base, word, n, '']);
    } else if (p.kind === 'open') {
      for (const text of boards.responses(p.id, 500)) rows.push([...base, text, 1, '']);
    } else if (p.kind === 'pin') {
      for (const [x, y] of pins(p.id)) rows.push([...base, `${Math.round(x / 10)}% across, ${Math.round(y / 10)}% down`, 1, '']);
    } else if (p.kind === 'qna') {
      for (const q of boards.questions(p.id, { includeHidden: true })) rows.push([...base, q.text, q.votes, [q.answered ? 'answered' : '', q.hidden ? 'hidden' : ''].filter(Boolean).join(', ')]);
    }
  }
  const meta = title ? `${cell(`Results for ${title}`)}\n` : '';
  return `﻿${meta}${rows.map((r) => r.map(cell).join(',')).join('\n')}\n`;
}
