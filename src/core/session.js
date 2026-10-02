// Per-presentation state for interactive blocks: which quiz answers were given,
// which tab is open, which cards are flipped. It lives as long as one Player so
// leaving a slide and coming back restores what the audience did, and a results
// slide can read every quiz's outcome. Nothing here is saved with the deck.

export class Session {
  #state = new Map();

  // The state object for a block, created from init() the first time.
  get(id, init = () => ({})) {
    if (!this.#state.has(id)) this.#state.set(id, init());
    return this.#state.get(id);
  }

  // Read without creating.
  peek(id) {
    return this.#state.get(id);
  }

  clear(filter = () => true) {
    for (const id of [...this.#state.keys()]) {
      if (filter(id)) this.#state.delete(id);
    }
  }
}
