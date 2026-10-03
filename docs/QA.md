# QA record and pre-deploy checklist

## Before every deploy (about 2 minutes, costs no Netlify credits)

```bash
npm run qa -- --require-project
```

Put `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.env.local` first (git-ignored) so
the check builds exactly what Netlify will. It runs every automated test, makes a
production build and inspects it: no source maps, no secret keys, every key is an
`anon` key, no unexpected third-party hosts, size budgets, the service worker and
deploy headers, and that everything is committed. It exits non-zero on any
failure; do not deploy until it passes. Deploys cost credits, so batch changes
into one push.

## After a deploy (5 minutes, on a real phone)

1. Open the site in a private/incognito window. File shows Cloud; the top bar
   shows "Sign in to save online".
2. Present > Go live > Start session. The dialog shows `Build <commit> <date>` and
   your project's hostname. Compare the build with `git log -1 --format=%h`.
3. Scan the audience QR with an iPhone and an Android phone. A poll or quiz slide
   shows on both; vote; the bars move on the presenter screen.
4. Scan the remote QR; Next and Previous move the slides; notes show.
5. Reload the presenter page mid-session: the same code resumes, phones re-send
   their answers.
6. Sign in with your email, edit a deck, wait for "Saved online", then open the site
   on another device, sign in and Open the deck.
7. Share, open the link in a private window, Stop sharing, reload it: "not shared any more".

If a phone shows "Waiting for the presenter...", read the small line at the bottom
(`Session CODE · build X · host`): a different build or host than the presenter's
means one of them is on a stale page.

## Accessibility audits (axe-core)

`axe-core` is a dev dependency. To audit a page: build, serve `dist/` with
`node tools/serve.mjs 5178`, copy `node_modules/axe-core/axe.min.js` to `dist/__axe.js`,
load the page in a browser, inject the script and run `axe.run()`. Run it on `/`,
`/learn/`, `/app/`, `/app/account`, an editor page, and the phone pages, at 375 px
wide, in light and dark. The last run found and fixed: invalid roles on dashboard
cards, focusable controls inside slide-list options, heading order, low-contrast
build text, unstyled error pages, and a dark-mode link colour. All pages were clean after.

## Visual and theme checks

After any styling change: view the home page, `/app/`, an editor page and a Go live
dialog in light and dark at desktop and 375 px width, and run the axe audit in both
schemes. Known and accepted: an open editor menu is flagged by axe's "region" rule
because pop-up menus sit outside page landmarks.

## What the automated suite covers (186+ tests)

- Database rules: `supabase/schema.sql` runs on real Postgres (PGlite) with
  Supabase-style roles. Each person sees only their own decks; nobody can write as
  another person or hand over a deck; anonymous visitors get no table access; share
  links work for the exact token only. Sabotaging the rules makes these fail.
- Cloud client against a fake Supabase: accounts, token refresh, owner scoping,
  email links, share links, auto-save (debounce, retry, mid-save edits, deleted
  decks, never claims "saved" for an unsaved deck).
- Live sessions: message validation (hostile votes, commands, config), tallies,
  a presenter that restarts, heartbeat staleness, 150 simultaneous phones with
  real realtime clients, exact totals.
- Service worker behaviour (network first, offline fallback, cleanup of old caches).
- Colour contrast of the phone pages in light and dark (WCAG), and ARIA semantics.
- Everything earlier: renderer, sanitiser, editor operations, exports, find and replace.

## What was exercised by hand in a browser (production build)

Fresh visit; email-link sign-in through the service worker; auto-save with an
uploaded image; opening the deck on a "second device" with storage wiped; sharing
and a stranger's view; stopping sharing; malformed links (`?join=`, `?view=`,
`?remote=`); a hostile presenter publishing script tags, handlers, oversized data
and prototype keys to the audience page; a hostile deck (scripts, `javascript:`
URLs, theme injection, code-lab escape attempts) opened through a share link;
a phone-sized viewport; presenter going silent (notice after 45 s, recovery);
presenter reload with session resume; offline reload; and the real deployed site
against real Supabase Realtime (join, vote, remote). Real Supabase broadcast was
also measured: 51 of 51 messages in order, about 70 ms.

## Platform flows exercised by hand (production build, stand-in Supabase)

Upgrade of an old single-deck database into the library; creating, renaming,
duplicating, deleting, searching and sorting decks; autosave and thumbnails; the
online sign-in link arriving at the site root and being forwarded; return to the
page you were on; a deck made on one device appearing as "online only" on another
and opening with its images; "changed elsewhere" conflict handling (nothing is
overwritten; three choices; the other version is kept); deleting an account (typed
confirmation, decks removed online, kept on the device); old `/?join=` links.

## Known limits (not tested, or by design)

- Only Chromium was available. Safari, Firefox and real iPhones are untested; the
  bundle is compiled for Safari 15 and up, and the CSS has fallbacks, but a real
  device check (step 3 above) is the proof.
- Real email delivery and Google sign-in were not exercised (the fake server stands
  in). Supabase's built-in email sender is rate-limited.
- Realtime capacity depends on your Supabase plan's concurrent connection limit.
- Two devices editing the same deck: last save wins.
- Netlify's own build was not run; `netlify.toml` omits the public key from the
  secrets scan on purpose.
- Votes are not tamper-proof (a room is protected by its code); each prompt caps at 1000 voters.
