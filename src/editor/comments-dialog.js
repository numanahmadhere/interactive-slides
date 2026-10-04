// Comments on the slides of a team's deck. They live in the team's database (not in the deck file), are visible to
// everyone in the team, and can be marked done. Plain text only.

import { h } from '../core/dom.js';
import { slideTitle } from '../core/schema.js';
import { getCloud } from '../cloud/instance.js';
import { button, openDialog } from './ui.js';

const REFRESH_MS = 15000;

export function openCommentsDialog(editor) {
  const cloud = getCloud();
  let comments = [];
  let teamId = undefined; // undefined = not looked up, null = deck is not in a team
  let showDone = false;
  let timer = 0;
  const body = h('div');
  const dialog = openDialog({ title: 'Comments', content: body });
  const origClose = dialog.close;
  dialog.close = () => { clearInterval(timer); origClose(); };

  const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });

  async function load() {
    try {
      if (teamId === undefined) teamId = (await cloud.deckTeam(editor.cloudId))?.team_id ?? null;
      if (teamId) comments = await cloud.comments(editor.cloudId);
      render();
    } catch (err) {
      say(err.message || 'Could not load comments.', 'error');
    }
  }

  function render() {
    if (!cloud?.user) { body.replaceChildren(h('p', { text: 'Sign in (File > Cloud) to use comments.' })); return; }
    if (!editor.cloudId) { body.replaceChildren(h('p', { text: 'Save this deck online first (File > Cloud), then put it in a team to comment with others.' })); return; }
    if (teamId === null) { body.replaceChildren(h('p', { text: 'This deck is not in a team. Put it in one under File > Cloud, and the people in the team can comment here.' })); return; }

    const slides = editor.deck.slides;
    const current = editor.slide ?? slides[0];
    const field = h('textarea', { class: 'ed-input', rows: '3', maxlength: '1000', placeholder: `Comment on "${slideTitle(current, slides.indexOf(current))}"`, 'aria-label': 'Write a comment' });
    const add = button({ label: 'Add comment', variant: 'primary', onClick: async () => {
      const text = field.value.trim();
      if (!text) { field.focus(); return; }
      add.disabled = true;
      try {
        await cloud.addComment(editor.cloudId, current.id, cloud.user.email.split('@')[0], text);
        field.value = '';
        await load();
      } catch (err) {
        say(err.message || 'Could not add the comment.', 'error');
      } finally { add.disabled = false; }
    } });

    const bySlide = slides.map((s, i) => ({ s, i, items: comments.filter((c) => c.slide_id === s.id && (showDone || !c.resolved)) })).filter((g) => g.items.length);
    const orphan = comments.filter((c) => !slides.some((s) => s.id === c.slide_id) && (showDone || !c.resolved));
    const card = (c) => h('li', { class: `ed-comment${c.resolved ? ' is-done' : ''}` },
      h('div', { class: 'ed-comment__meta' }, h('strong', { text: c.author_name || 'Someone' }), h('span', { text: ` ${new Date(c.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` })),
      h('p', { class: 'ed-comment__body', text: c.body }),
      h('div', { class: 'ed-comment__actions' },
        button({ label: c.resolved ? 'Reopen' : 'Mark done', onClick: async () => { try { await cloud.resolveComment(c.id, !c.resolved); await load(); } catch (e) { say(e.message, 'error'); } } }),
        c.author === cloud.user.id ? button({ label: 'Delete', onClick: async () => { try { await cloud.deleteComment(c.id); await load(); } catch (e) { say(e.message, 'error'); } } }) : null));

    body.replaceChildren(
      field, h('div', { class: 'ed-live__actions' }, add,
        button({ label: showDone ? 'Hide done' : 'Show done', onClick: () => { showDone = !showDone; render(); } })),
      status,
      ...bySlide.map((g) => h('section', { class: 'ed-comments' },
        h('h3', { text: `${g.i + 1}. ${slideTitle(g.s, g.i)}` }),
        h('ul', { class: 'ed-comment-list' }, ...g.items.map(card)))),
      orphan.length ? h('section', { class: 'ed-comments' }, h('h3', { text: 'On slides that were deleted' }), h('ul', { class: 'ed-comment-list' }, ...orphan.map(card))) : null,
      !bySlide.length && !orphan.length ? h('p', { class: 'ed-hint', text: comments.length ? 'Everything is done.' : 'No comments yet.' }) : null);
  }

  render();
  load();
  timer = setInterval(load, REFRESH_MS);
  return dialog;
}
