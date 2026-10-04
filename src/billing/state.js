// What plan the signed-in person is on. Read from their subscription row (written only by the
// Paddle webhook) and remembered in this browser so the editor still knows offline.
// Signed out, or no Supabase project: free.

import { planOf } from './plans.js';

const KEY = 'interactive-slides:plan';

export class Billing {
  #listeners = new Set();
  row = null;
  plan = 'free';

  constructor({ getCloud, storage = globalThis.localStorage, now = () => Date.now() }) {
    Object.assign(this, { getCloud, storage, now });
    this.#restore();
  }

  #restore() {
    try {
      const saved = JSON.parse(this.storage?.getItem(KEY) ?? 'null');
      const user = this.getCloud()?.user;
      if (saved && user && saved.uid === user.id) {
        this.row = saved.row;
        this.plan = planOf(this.row, this.now());
      }
    } catch { /* start as free */ }
  }

  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #set(row) {
    const before = this.plan;
    this.row = row;
    this.plan = planOf(row, this.now());
    if (this.plan !== before) for (const fn of [...this.#listeners]) fn(this.plan);
  }

  // Ask the database. Failing to reach it keeps what we knew, so a dropped connection never
  // downgrades someone mid-session. Returns the plan.
  async refresh() {
    const cloud = this.getCloud();
    if (!cloud?.user) {
      this.#set(null);
      try { this.storage?.removeItem(KEY); } catch { /* nothing to forget */ }
      return this.plan;
    }
    try {
      const row = await cloud.subscription();
      this.#set(row);
      try { this.storage?.setItem(KEY, JSON.stringify({ uid: cloud.user.id, row })); } catch { /* kept for this page only */ }
    } catch { /* offline: keep the last known plan */ }
    return this.plan;
  }

  // After checkout: the webhook takes a moment. Look every few seconds until the plan changes.
  async waitForChange({ tries = 20, everyMs = 3000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
    const start = this.plan;
    for (let i = 0; i < tries; i++) {
      await sleep(everyMs);
      if ((await this.refresh()) !== start) return this.plan;
    }
    return this.plan;
  }
}
