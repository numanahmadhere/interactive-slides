// What the app allows. Everything is free: there is one set of limits, and every feature is in it.
// The numbers here are sanity limits (the size of a live room, how many decks one account keeps
// online), not a ladder. The database keeps the same online-deck limit (supabase/schema.sql).

export const KINDS = ['poll', 'quiz', 'rating', 'cloud', 'open', 'qna', 'ranking', 'pin'];

export const LIMITS = {
  id: 'free', name: 'Free',
  cloudDecks: 1000, livePhones: 1000, kinds: KINDS,
  exports: ['json', 'png', 'html', 'pdf', 'pptx'], brand: true, csv: true, leaderboard: true, reports: true, selfPaced: true, teamSeats: 25,
  themes: ['densight-dark', 'densight-light', 'paper', 'midnight'],
};

// Kept as a table so callers can still ask for a plan by name; every name gives the same answer.
export const PLANS = { free: LIMITS };
export const getPlan = () => LIMITS;

export const canUseKind = (plan, kind) => LIMITS.kinds.includes(kind);
export const canExport = (plan, format) => LIMITS.exports.includes(format);
export const canUseTheme = () => true;
export const canBrand = () => true;
export const canCsv = () => true;
export const canLeaderboard = () => true;
export const canSelfPace = () => true;
export const canTeam = () => true;
export const canReports = () => true;
export const livePhones = () => LIMITS.livePhones;
export const cloudDeckLimit = () => LIMITS.cloudDecks;
