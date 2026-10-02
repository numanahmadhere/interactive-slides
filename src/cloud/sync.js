// Saves the open deck to the cloud by itself whenever you are signed in. It is a
// small state machine with everything it touches passed in, so it can be tested
// without a browser:
//   off        no cloud project in this build
//   signedout  a project exists but nobody is signed in (nothing is saved)
//   idle       signed in, nothing to save
//   saving     a save is under way or waiting for you to stop typing
//   saved      the cloud copy matches
//   error      the last save failed (it retries on the next change and after a pause)

const RETRY_MS = 30_000;

export class CloudSync {
  #savedDeck = null;
  #timer = 0;
  #retry = 0;
  #running = false;
  #again = false;
  state = 'off';
  error = '';

  constructor({ getCloud, getDeck, inline, getLink, setLink, onState = () => {}, delayMs = 3000, timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) } }) {
    Object.assign(this, { getCloud, getDeck, inline, getLink, setLink, onState, delayMs, timers });
    this.refresh();
  }

  #set(state, error = '') {
    if (state === this.state && error === this.error) return;
    this.state = state;
    this.error = error;
    this.onState(state, error);
  }

  // Re-read whether anyone is signed in (after signing in or out).
  refresh() {
    const cloud = this.getCloud();
    if (!cloud) this.#set('off');
    else if (!cloud.user) this.#set('signedout');
    else if (this.state === 'off' || this.state === 'signedout') this.#set('idle');
  }

  // The deck on screen was just loaded from, or replaced by, something already
  // accounted for; do not save it until it is edited.
  markClean(deck = this.getDeck()) {
    this.#savedDeck = deck;
    this.timers.clear(this.#timer);
    this.#timer = 0;
    if (this.state === 'saving' && !this.#running) this.#set('saved');
  }

  // Call after every edit.
  changed() {
    this.refresh();
    if (this.state === 'off' || this.state === 'signedout') return;
    this.#set('saving');
    this.timers.clear(this.#timer);
    this.#timer = this.timers.set(() => this.flush(), this.delayMs);
  }

  // Save now. asCopy forces a new cloud deck; manual means a person asked, so errors are thrown to them. Returns the saved row, or null if
  // there was nothing to do.
  async flush({ asCopy = false, manual = false } = {}) {
    this.timers.clear(this.#timer);
    this.timers.clear(this.#retry);
    this.#timer = this.#retry = 0;
    if (this.#running) {
      this.#again = true;
      return null;
    }
    const cloud = this.getCloud();
    if (!cloud?.user) {
      this.refresh();
      return null;
    }
    this.#running = true;
    let row = null;
    try {
      do {
        this.#again = false;
        const deck = this.getDeck();
        if (deck === this.#savedDeck && !asCopy) break;
        this.#set('saving');
        const data = await this.inline(deck);
        data.meta = { ...data.meta, updatedAt: new Date().toISOString() };
        const title = deck.meta.title;
        const linked = asCopy ? null : this.getLink(deck);
        if (linked) {
          try {
            row = await cloud.update(linked, { title, data });
          } catch (err) {
            if (err.code !== 'not_found') throw err;
            row = await cloud.create({ title, data });
          }
        } else {
          row = await cloud.create({ title, data });
        }
        this.setLink(row.id, deck);
        this.#savedDeck = deck;
        asCopy = false;
        if (this.getDeck() !== deck) this.#again = true; // edited while saving
      } while (this.#again);
      this.#set('saved');
    } catch (err) {
      if (err.code === 'signed_out') this.refresh();
      else {
        this.#set('error', err.message || 'Could not save to the cloud.');
        this.#retry = this.timers.set(() => this.flush(), RETRY_MS);
      }
      if (manual || asCopy) throw err; // someone pressed Save: tell them
    } finally {
      this.#running = false;
    }
    return row;
  }
}
