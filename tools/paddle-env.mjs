// Reads the Paddle settings for a build and refuses anything ambiguous. The environment is never
// guessed: if a client-side token is set, PADDLE_ENV must say which Paddle account it belongs to
// and agree with the token's own prefix, so a build can never quietly run against the wrong account.

export function paddleFromEnv(env) {
  const token = (env.PADDLE_CLIENT_TOKEN ?? '').trim();
  const named = (env.PADDLE_ENV ?? '').trim().toLowerCase();
  if (!token) {
    if (named) throw new Error('PADDLE_ENV is set but PADDLE_CLIENT_TOKEN is empty. Set the client-side token, or remove PADDLE_ENV to switch checkout off.');
    return { token: '', environment: '' };
  }
  if (/^pdl_/i.test(token)) throw new Error('PADDLE_CLIENT_TOKEN is a server API key (pdl_...). Use the client-side token, which starts with test_ (sandbox) or live_ (live).');
  const prefixEnv = token.startsWith('live_') ? 'live' : token.startsWith('test_') ? 'sandbox' : '';
  if (!prefixEnv || !/^(test|live)_[A-Za-z0-9]{20,}$/.test(token)) throw new Error('PADDLE_CLIENT_TOKEN should start with test_ (sandbox) or live_ (live).');
  if (!named) throw new Error('PADDLE_ENV is not set. Set it to "sandbox" or "live" so the build knows which Paddle account to use. It is never guessed.');
  if (named !== 'sandbox' && named !== 'live') throw new Error(`PADDLE_ENV must be "sandbox" or "live", not "${named}".`);
  if (named !== prefixEnv) throw new Error(`PADDLE_ENV is "${named}" but the token starts with ${token.slice(0, token.indexOf('_') + 1)} (${prefixEnv}). They must match.`);
  return { token, environment: named };
}
