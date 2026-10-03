// The sign-in form, shared by the account page and the editor's online-saving dialog.
// One-click first: Google (only if the project has switched it on), then an emailed
// link; a password sits behind a disclosure.

import { h } from '../core/dom.js';
import { button, field, textInput } from '../editor/ui.js';
import { rememberReturn, signInReturnAddress } from '../shell/paths.js';

// run(label, fn) -> click handler that shows progress and errors (see the callers);
// say(text, kind) shows a status line; onSignedIn() is called after a password sign-in.
export function signInPanel({ cloud, run, say, onSignedIn, onProviders }) {
  let email = '';
  let password = '';
  const emailInput = textInput({ placeholder: 'you@example.com', spellcheck: false, onInput: (v) => { email = v.trim(); } });
  emailInput.type = 'email';
  emailInput.autocomplete = 'email';
  const passInput = textInput({ placeholder: 'Password (6 or more characters)', spellcheck: false, onInput: (v) => { password = v; } });
  passInput.type = 'password';
  passInput.autocomplete = 'current-password';
  const needEmail = () => (email ? true : (say('Enter your email address.', 'error'), false));

  const googleSlot = h('div', { class: 'ed-signin__google' });
  cloud.providers().then((p) => {
    if (!p.google) return;
    googleSlot.append(button({ label: 'Continue with Google', variant: 'primary', onClick: () => {
      rememberReturn();
      location.href = cloud.oauthUrl('google', signInReturnAddress());
    } }));
    googleSlot.after(h('p', { class: 'ed-hint', text: 'Or get a sign-in link by email.' }));
    onProviders?.(p);
  });

  return h('div', { class: 'ed-signin' },
    googleSlot,
    field('Email', emailInput, 'We email you a link; opening it signs you in. No password needed.'),
    h('div', { class: 'ed-live__actions' },
      button({ label: 'Email me a sign-in link', variant: 'primary', onClick: run('Sending the link...', async () => {
        if (!needEmail()) return;
        rememberReturn();
        await cloud.sendEmailLink(email, signInReturnAddress());
        say(`Check ${email} for a sign-in link and open it on this device.`);
      }) })),
    h('details', { class: 'ed-cloud__pw' },
      h('summary', { text: 'Use a password instead' }),
      field('Password', passInput),
      h('div', { class: 'ed-live__actions' },
        button({ label: 'Create account', onClick: run('Creating your account...', async () => {
          if (!needEmail() || !password) return say('Enter your email and password.', 'error');
          const r = await cloud.signUp(email, password);
          if (r.signedIn) { say(''); onSignedIn(); } else say('Account created. Check your email for a confirmation link, then sign in.');
        }) }),
        button({ label: 'Sign in', onClick: run('Signing in...', async () => {
          if (!needEmail() || !password) return say('Enter your email and password.', 'error');
          await cloud.signIn(email, password);
          say('');
          onSignedIn();
        }) }))));
}
