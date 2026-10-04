// Paddle settings compiled into the page. The client-side token is public by design: it only
// lets the page open Paddle's checkout. Its prefix says which account it belongs to.

/* global __PADDLE_TOKEN__ */
export const PADDLE_TOKEN = typeof __PADDLE_TOKEN__ === 'string' ? __PADDLE_TOKEN__ : '';
export const PADDLE_ENV = PADDLE_TOKEN.startsWith('live_') ? 'live' : PADDLE_TOKEN.startsWith('test_') ? 'sandbox' : '';
export const PADDLE_SCRIPT = 'https://cdn.paddle.com/paddle/v2/paddle.js';
