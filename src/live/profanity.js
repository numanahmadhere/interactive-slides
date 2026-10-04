// A basic filter for what an audience types onto a shared screen. It catches common swearing, simple
// spelling tricks (0 for o, @ for a, doubled letters, spaced-out letters) and nothing subtle. No word list
// is complete, so rooms that need certainty should use "approve first" instead.

const WORDS = [
  'fuck', 'fucker', 'fucking', 'fucked', 'motherfucker', 'shit', 'shitty', 'bullshit', 'bitch', 'bitches', 'bastard',
  'asshole', 'arsehole', 'dick', 'dickhead', 'cunt', 'pussy', 'whore', 'slut', 'piss', 'pissed', 'cock', 'wanker',
  'twat', 'prick', 'douche', 'douchebag', 'jackass', 'dumbass', 'retard', 'retarded', 'moron', 'idiot', 'stupid', 'scum',
  'nigger', 'nigga', 'faggot', 'fag', 'tranny', 'kike', 'spic', 'chink', 'paki', 'coon', 'rape', 'rapist', 'nazi',
  'sex', 'porn', 'tits', 'boobs', 'cum', 'jizz', 'anal', 'dildo', 'blowjob',
];

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i', '+': 't' };
const BLOCKED = new Set(WORDS);

const normalize = (text) => String(text ?? '')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[0134-57@$!+]/g, (c) => LEET[c]);

// "fuuuck" -> "fuck"; "shiit" -> "shit"
const collapse = (word) => word.replace(/(.)\1+/g, '$1');

function words(text) {
  const base = normalize(text);
  const out = new Set();
  for (const w of base.split(/[^a-z]+/).filter(Boolean)) {
    out.add(w);
    out.add(collapse(w));
  }
  // single letters spread out with spaces or dots: "f u c k", "s.h.i.t"
  for (const run of base.match(/\b(?:[a-z][\s.\-_*]+){2,}[a-z]\b/g) ?? []) out.add(run.replace(/[^a-z]/g, ''));
  return out;
}

const COLLAPSED = new Set(WORDS.map(collapse));

export function isProfane(text) {
  for (const w of words(text)) if (BLOCKED.has(w) || COLLAPSED.has(w)) return true;
  return false;
}
