// Account page: who you are, sign in or out, what is stored where, and deleting it all.

import { h } from '../core/dom.js';
import { Persistence } from '../editor/persist.js';
import { button, openDialog, textInput, toast } from '../editor/ui.js';
import { getCloud } from '../cloud/instance.js';
import { signInPanel } from '../cloud/sign-in-panel.js';
import { appFooter, appHeader } from './chrome.js';
import { COMPANY_NAME, COMPANY_URL, SUPPORT_EMAIL, supportHref } from './contact.js';
import { takeFlash } from './flash.js';
import { getBilling } from '../billing/instance.js';
import { planPicker } from '../billing/picker.js';
import { PLANS } from '../billing/plans.js';
import { teamSection } from './teams.js';

export async function mountAccount(root) {
  const persist = new Persistence();
  await persist.init();
  const cloud = getCloud();
  const status = h('div', { class: 'ed-dialog-status', role: 'status', 'aria-live': 'polite' });
  const say = (text, kind = '') => { status.textContent = text; status.dataset.kind = kind; };
  let busy = false;
  const run = (label, fn) => async () => {
    if (busy) return;
    busy = true;
    say(label);
    try { await fn(); } catch (err) { console.error(err); say(err.message || 'That did not work.', 'error'); } finally { busy = false; }
  };

  const section = (title, ...children) => h('section', { class: 'sh-section' }, h('h2', { text: title }), ...children);
  const danger = (title, ...children) => h('section', { class: 'sh-section sh-section--danger' }, h('h2', { text: title }), ...children);

  const billing = getBilling();
  const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString([], { dateStyle: 'medium' }); };

  // Ask our server for a Paddle-hosted page where this person updates their card, cancels and sees invoices.
  async function openPortal() {
    const res = await fetch('/api/paddle-portal', { method: 'POST', headers: { authorization: `Bearer ${await cloud.accessToken()}` } });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) { location.assign(body.url); return; }
    const reasons = { not_configured: 'The billing page is not switched on yet. Write to support and we will sort it out.', no_subscription: 'We could not find a subscription on this account.', sign_in_required: 'Please sign in again.' };
    throw new Error(reasons[body.error] ?? 'Could not open your billing page. Try again in a minute.');
  }

  // Your plan, how to manage it, and the plans you could move to.
  function planSection() {
    const row = billing.row;
    const plan = PLANS[billing.plan];
    const lines = [];
    if (billing.plan !== 'free' && row) {
      if (row.status === 'trialing' && row.trial_ends_at) lines.push(`Free trial until ${day(row.trial_ends_at)}. You will be charged after that unless you cancel.`);
      if (row.status === 'past_due') lines.push('Your last payment did not go through. Update your payment method to keep your plan.');
      if (row.ends_at && row.status !== 'canceled') lines.push(`Your plan ends on ${day(row.ends_at)} and will not renew.`);
      if (row.status === 'canceled') lines.push('Your subscription has ended.');
    }
    const manage = [];
    if (row?.paddle_subscription_id && billing.plan !== 'free') manage.push(button({ label: 'Manage billing', variant: 'primary', onClick: run('Opening your billing page...', openPortal) }));
    if (row?.update_payment_url && billing.plan !== 'free') manage.push(h('a', { class: 'ed-btn', href: row.update_payment_url, target: '_blank', rel: 'noopener', text: 'Update payment method' }));
    if (row?.cancel_url && billing.plan !== 'free' && !row.ends_at) manage.push(h('a', { class: 'ed-btn', href: row.cancel_url, target: '_blank', rel: 'noopener', text: 'Cancel subscription' }));
    const wanted = new URLSearchParams(location.search).get('plan');
    return section('Plan and billing',
      h('p', { class: 'sh-lead' }, 'You are on the ', h('strong', { text: plan.name }), ' plan.'),
      ...lines.map((t) => h('p', { text: t })),
      manage.length ? h('div', { class: 'ed-live__actions' }, ...manage) : null,
      planPicker({
        billing, cloud, highlight: PLANS[wanted] ? wanted : null,
        onSignIn: () => document.querySelector('.sh-main')?.scrollIntoView(),
        onActivated: () => render(),
      }));
  }

  async function render() {
    const local = await persist.listDecks();
    const body = [h('h1', { class: 'sh-title', text: 'Account' })];

    if (!cloud) {
      body.push(section('Online saving', h('p', { text: 'Online accounts are not set up for this site. Your decks are saved on this device.' })));
    } else if (!cloud.user) {
      body.push(section('Sign in',
        h('p', { class: 'sh-lead', text: 'Sign in to save decks online, open them on any device, and share them with a link. You do not need an account to build and present decks.' }),
        signInPanel({ cloud, run, say, onSignedIn: () => location.reload() }), status));
    } else {
      body.push(section('Signed in',
        h('div', { class: 'sh-profile' }, h('span', { class: 'sh-avatar sh-avatar--lg', 'aria-hidden': 'true', text: (cloud.user.email[0] ?? '?').toUpperCase() }), h('div', {}, h('div', { class: 'sh-profile__email', text: cloud.user.email }), h('div', { class: 'sh-profile__note', text: 'Your decks save online automatically.' }))),
        h('div', { class: 'ed-live__actions' }, button({ label: 'Sign out', onClick: run('Signing out...', async () => { await cloud.signOut(); location.reload(); }) })),
        status));
    }

    if (cloud?.user) body.push(planSection());

    // Joining a team from an invite link, then showing the teams this person is in.
    if (cloud?.user) {
      const invite = new URLSearchParams(location.search).get('invite');
      if (invite) {
        try {
          await cloud.acceptInvite(invite);
          say('You joined the team. Its decks now appear in My decks.');
        } catch (err) {
          say(err.message || 'Could not use that invite link.', 'error');
        }
        history.replaceState(null, '', location.pathname);
      }
      let teams = [];
      try { teams = await cloud.teams(); } catch (err) { console.error(err); }
      body.push(teamSection({ cloud, plan: billing.plan, teams, run, say, rerender: render }));
    } else if (cloud && new URLSearchParams(location.search).get('invite')) {
      body.unshift(h('p', { class: 'ed-hint ed-hint--warn', role: 'status', text: 'You have been invited to a team. Sign in below to join it. If you are sent back here without the invite, open the link again.' }));
    }

    body.push(section('On this device',
      h('p', { text: `${local.length} deck${local.length === 1 ? '' : 's'} stored in this browser. They stay here until you delete them.` }),
      local.length ? h('div', { class: 'ed-live__actions' }, button({ label: 'Remove all decks from this device', variant: 'danger', onClick: () => confirmWipe(local.length) })) : null));

    if (cloud?.user) {
      body.push(danger('Delete my account',
        h('p', { text: 'Permanently deletes your account and every deck saved online, including shared links. Decks stored only on this device are not touched. This cannot be undone.' }),
        h('div', { class: 'ed-live__actions' }, button({ label: 'Delete my account...', variant: 'danger', onClick: confirmDelete }))));
    }

    body.push(section('Help and support',
      h('p', {}, 'Questions about your account, a deck, or a live session? Write to ', h('a', { href: supportHref(), text: SUPPORT_EMAIL }), ' and a person at ', h('a', { href: COMPANY_URL, text: COMPANY_NAME }), ' will reply.')));

    body.push(section('Your data', h('p', {}, 'We keep your decks and your email address, nothing else, and we do not use tracking cookies. Read the ', h('a', { href: '/privacy/', text: 'privacy policy' }), '.')));
    root.replaceChildren(appHeader({ active: 'account' }), h('main', { class: 'sh-main sh-narrow', id: 'main' }, ...body), appFooter());
  }

  function confirmWipe(n) {
    const dlg = openDialog({ title: 'Remove all decks from this device?', content: h('div', null,
      h('p', { text: `${n} deck${n === 1 ? '' : 's'} will be removed from this browser. Decks saved online stay online.` }),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Cancel', onClick: () => dlg.close() }),
        button({ label: 'Remove', variant: 'danger', onClick: async () => {
          dlg.close();
          for (const m of await persist.listDecks()) await persist.deleteDeck(m.id);
          toast('Removed.');
          render();
        } }))) });
  }

  function confirmDelete() {
    let typed = '';
    const input = textInput({ placeholder: 'Type DELETE', spellcheck: false, onInput: (v) => { typed = v.trim(); } });
    input.setAttribute('aria-label', 'Type DELETE to confirm');
    const dlg = openDialog({ title: 'Delete your account?', content: h('div', null,
      h('p', { text: `This deletes ${cloud.user.email} and every deck saved online. Type DELETE to confirm.` }), input,
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Cancel', onClick: () => dlg.close() }),
        button({ label: 'Delete everything', variant: 'danger', onClick: async () => {
          if (typed !== 'DELETE') return toast('Type DELETE first.', { kind: 'error' });
          try {
            await cloud.deleteAccount();
            // The decks on this device are unlinked from the deleted online copies.
            for (const m of await persist.listDecks()) if (m.cloudId) await persist.patchMeta(m.id, { cloudId: null, cloudUpdatedAt: null });
            dlg.close();
            location.assign('/?account-deleted=1');
          } catch (err) {
            toast(err.message || 'Could not delete the account.', { kind: 'error' });
          }
        } }))) });
  }

  await billing.refresh();
  await render();
  // Coming back from Paddle's checkout: the webhook may still be on its way, so wait for the plan to change.
  if (new URLSearchParams(location.search).get('welcome') && cloud?.user && billing.plan === 'free') {
    toast('Thank you. Switching your plan on...', { timeout: 6000 });
    if ((await billing.waitForChange()) !== 'free') { toast(`You are on the ${PLANS[billing.plan].name} plan.`); await render(); }
  }
  const flash = takeFlash();
  if (flash) toast(flash.text, { kind: flash.kind });
}
