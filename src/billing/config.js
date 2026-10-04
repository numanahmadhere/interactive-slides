// Paddle settings compiled into the page. The client-side token is public by design: it only
// lets the page open Paddle's checkout. Its prefix says which account it belongs to.

/* global __PADDLE_TOKEN__, __PADDLE_ENV__ */
export const PADDLE_TOKEN = typeof __PADDLE_TOKEN__ === 'string' ? __PADDLE_TOKEN__ : '';
// 'sandbox' or 'live', set by the build from PADDLE_ENV (checked against the token; never guessed).
export const PADDLE_ENV = typeof __PADDLE_ENV__ === 'string' ? __PADDLE_ENV__ : '';
export const PADDLE_SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';
