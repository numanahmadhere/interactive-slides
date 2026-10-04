// The Team part of the account page: make a team, invite people with a link, see who is in it, and leave or close it.
// Team rules (who can create one, how many seats) are enforced by the database; this page only explains them.

import { h } from '../core/dom.js';
import { button, textInput, toast } from '../editor/ui.js';
import { PLANS } from '../billing/plans.js';

export function inviteLink(token) {
  return `${location.origin}/app/account?invite=${encodeURIComponent(token)}`;
}

// teams: from cloud.teams(). Returns the section element.
export function teamSection({ cloud, plan, teams, run, say, rerender }) {
  const me = cloud.user.id;
  const seats = PLANS[plan]?.teamSeats ?? 0;
  const out = [h('h2', { text: 'Team' })];

  if (!teams.length) {
    out.push(h('p', { text: 'A team shares decks, comments on slides and one brand kit between the people in it. Everyone joins with a link; only the person who makes the team needs a plan.' }));
  }

  for (const team of teams) {
    const mine = team.owner === me;
    const members = team.team_members ?? [];
    const ownerSeats = mine ? seats : null;
    const list = h('ul', { class: 'sh-members' }, ...members.map((m) => h('li', {},
      h('span', { text: m.email || 'A member' }), m.role === 'owner' ? h('span', { class: 'sh-tag', text: 'Owner' }) : null,
      mine && m.user_id !== me ? button({ label: 'Remove', onClick: run('Removing...', async () => { await cloud.removeMember(team.id, m.user_id); rerender(); }) }) : null)));
    const linkBox = h('div', { class: 'sh-invite', hidden: true });
    const actions = [];
    if (mine) {
      actions.push(button({ label: 'Invite someone', variant: 'primary', onClick: run('Making a link...', async () => {
        const link = inviteLink(await cloud.createInvite(team.id));
        linkBox.hidden = false;
        linkBox.replaceChildren(h('p', { class: 'ed-hint', text: 'Send this link to one person. It works once and expires in 7 days.' }), h('div', { class: 'ed-live__url', text: link }),
          button({ label: 'Copy link', onClick: async () => { try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch { toast('Could not copy. Select the link and copy it by hand.', { kind: 'error' }); } } }));
        say('');
      }) }));
      actions.push(button({ label: 'Close this team', variant: 'danger', onClick: run('Closing...', async () => {
        if (!confirm(`Close "${team.name}"? Its decks stay with the people who made them.`)) return;
        await cloud.deleteTeam(team.id);
        rerender();
      }) }));
    } else {
      actions.push(button({ label: 'Leave this team', onClick: run('Leaving...', async () => {
        if (!confirm(`Leave "${team.name}"? Your decks in it go back to being yours alone.`)) return;
        await cloud.removeMember(team.id, me);
        rerender();
      }) }));
    }
    out.push(h('div', { class: 'sh-team' },
      h('h3', { text: team.name }),
      h('p', { class: 'sh-profile__note', text: `${members.length} ${members.length === 1 ? 'person' : 'people'}${ownerSeats ? ` of ${ownerSeats} seats` : ''}. ${team.brand?.logo || team.brand?.overrides ? 'Has a shared brand kit.' : 'No shared brand kit yet: set one from a deck in the editor (File > Cloud).'}` }),
      list, h('div', { class: 'ed-live__actions' }, ...actions), linkBox));
  }

  if (seats > 0 && teams.filter((t) => t.owner === me).length < 3) {
    let name = '';
    const input = textInput({ placeholder: 'Team name', spellcheck: false, onInput: (v) => { name = v; } });
    input.setAttribute('aria-label', 'Team name');
    out.push(h('div', { class: 'sh-team-new' }, input, button({ label: 'Create team', onClick: run('Creating...', async () => {
      await cloud.createTeam(name);
      rerender();
    }) })));
  } else if (seats === 0 && !teams.length) {
    out.push(h('p', { class: 'ed-hint', text: 'Team workspaces come with the Pro and Advanced plans. Choose a plan above to create one. If someone sent you an invite link, open it while signed in: you do not need a plan to join.' }));
  }
  return h('section', { class: 'sh-section' }, ...out);
}
