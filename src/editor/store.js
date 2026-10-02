// Holds the current deck and its undo/redo history. Decks are immutable and
// share structure (see ops.js), so a history entry is just a reference.
//
// Coalescing: consecutive commits that pass the same `coalesce` key replace
// the current state instead of adding history. Typing in a text box commits on
// every keystroke but should undo as one step; call endCoalesce() when the edit
// session ends (blur, selection change) so the next edit starts a new step.

export class Store {
  #deck;
  #undo = [];
  #redo = [];
  #listeners = new Set();
  #coalesceKey = null;
  #limit;

  constructor(deck, { limit = 100 } = {}) {
    this.#deck = deck;
    this.#limit = limit;
  }

  get deck() {
    return this.#deck;
  }

  get canUndo() {
    return this.#undo.length > 0;
  }

  get canRedo() {
    return this.#redo.length > 0;
  }

  // listener({ deck, prev, kind, source }); kind is commit | undo | redo | replace
  subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  commit(next, { coalesce = null, source = 'ui' } = {}) {
    if (next === this.#deck) return false;
    const prev = this.#deck;
    const merge = coalesce !== null && coalesce === this.#coalesceKey;
    if (!merge) {
      this.#undo.push(prev);
      if (this.#undo.length > this.#limit) this.#undo.shift();
    }
    this.#redo = [];
    this.#coalesceKey = coalesce;
    this.#deck = next;
    this.#emit(prev, 'commit', source);
    return true;
  }

  endCoalesce() {
    this.#coalesceKey = null;
  }

  undo() {
    if (!this.#undo.length) return false;
    const prev = this.#deck;
    this.#redo.push(prev);
    this.#deck = this.#undo.pop();
    this.#coalesceKey = null;
    this.#emit(prev, 'undo', 'history');
    return true;
  }

  redo() {
    if (!this.#redo.length) return false;
    const prev = this.#deck;
    this.#undo.push(prev);
    this.#deck = this.#redo.pop();
    this.#coalesceKey = null;
    this.#emit(prev, 'redo', 'history');
    return true;
  }

  // Swap in a deck without recording history (initial load).
  replace(deck, { clearHistory = true } = {}) {
    const prev = this.#deck;
    this.#deck = deck;
    this.#coalesceKey = null;
    if (clearHistory) {
      this.#undo = [];
      this.#redo = [];
    }
    this.#emit(prev, 'replace', 'load');
  }

  #emit(prev, kind, source) {
    for (const fn of [...this.#listeners]) fn({ deck: this.#deck, prev, kind, source });
  }
}
