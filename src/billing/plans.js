// What each plan includes. One table, read by the editor (to lock things), the pricing
// page (to list them), the live host (to cap the room) and the webhook (to name a plan).
// The database enforces the cloud-deck limit itself (supabase/schema.sql keeps the same
// numbers); everything else is a convenience lock in the browser, because a page that
// runs on the customer's own computer cannot truly stop them from editing it.

export const PLAN_ORDER = ['free', 'starter', 'pro', 'advanced'];

// Question types that need a paid plan to collect answers from a live room.
export const PAID_KINDS = ['cloud', 'open', 'qna', 'ranking'];

export const PLANS = {
  free: {
    id: 'free', name: 'Free', blurb: 'Build, present and try live questions.',
    cloudDecks: 3, livePhones: 25, kinds: ['poll', 'quiz', 'rating'],
    exports: ['json', 'png'], brand: false, csv: false, leaderboard: false, themes: ['densight-dark', 'densight-light'],
  },
  starter: {
    id: 'starter', name: 'Starter', blurb: 'For regular workshops and talks.',
    cloudDecks: 25, livePhones: 100, kinds: ['poll', 'quiz', 'rating', ...PAID_KINDS],
    exports: ['json', 'png', 'html', 'pdf'], brand: true, csv: true, leaderboard: true, themes: ['densight-dark', 'densight-light', 'paper', 'midnight'],
  },
  pro: {
    id: 'pro', name: 'Pro', blurb: 'For trainers and speakers who present every week.',
    cloudDecks: 100, livePhones: 500, kinds: ['poll', 'quiz', 'rating', ...PAID_KINDS],
    exports: ['json', 'png', 'html', 'pdf', 'pptx'], brand: true, csv: true, leaderboard: true, themes: ['densight-dark', 'densight-light', 'paper', 'midnight'],
  },
  advanced: {
    id: 'advanced', name: 'Advanced', blurb: 'For large rooms and organisations.',
    cloudDecks: 1000, livePhones: 1000, kinds: ['poll', 'quiz', 'rating', ...PAID_KINDS],
    exports: ['json', 'png', 'html', 'pdf', 'pptx'], brand: true, csv: true, leaderboard: true, themes: ['densight-dark', 'densight-light', 'paper', 'midnight'],
  },
};

export const getPlan = (id) => PLANS[id] ?? PLANS.free;

// Subscriptions that should still give access: Paddle's own status words. A trial counts.
// "past_due" keeps access for now: Paddle retries the card for a while, and locking a
// presenter out mid-session over a failed payment would be the wrong time to find out.
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

// row: the subscriptions row for the signed-in user (or null). -> plan id
export function planOf(row, now = Date.now()) {
  if (!row || !PLANS[row.plan] || row.plan === 'free') return 'free';
  if (!ACTIVE.has(row.status)) return 'free';
  // A cancelled-at-period-end subscription stays paid until the period is over.
  if (row.ends_at && Date.parse(row.ends_at) < now) return 'free';
  return row.plan;
}

export const canUseKind = (plan, kind) => getPlan(plan).kinds.includes(kind);
export const canExport = (plan, format) => getPlan(plan).exports.includes(format);
export const canUseTheme = (plan, theme) => getPlan(plan).themes.includes(theme);
export const canBrand = (plan) => getPlan(plan).brand;
export const canCsv = (plan) => getPlan(plan).csv;
export const canLeaderboard = (plan) => getPlan(plan).leaderboard;
export const livePhones = (plan) => getPlan(plan).livePhones;
export const cloudDeckLimit = (plan) => getPlan(plan).cloudDecks;

// The cheapest plan that unlocks something, for "Upgrade to Starter" wording.
export function planFor(test) {
  return PLAN_ORDER.find((id) => test(PLANS[id])) ?? 'advanced';
}

// Checkout prices. Paddle price ids differ between sandbox and live, so the build picks
// one set. Both sets are public identifiers, not secrets.
export function priceId(catalog, plan, interval) {
  return catalog?.[plan]?.[interval] ?? null;
}

// What shows on the pricing page, in dollars. The checkout shows local currencies; these
// are the list prices that the Paddle catalog was created with.
export const PRICES = {
  starter: { month: 10, year: 100 },
  pro: { month: 40, year: 400 },
  advanced: { month: 120, year: 1200 },
};
export const TRIAL_DAYS = 7;
