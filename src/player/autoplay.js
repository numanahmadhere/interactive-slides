// Advances a presentation on a timer (kiosk mode). Timer functions are
// injectable so the scheduling can be tested without waiting.

export class Autoplay {
  #handle = null;
  #running = false;
  #paused = false;

  // delayFor() -> seconds until the next advance (0 or less stops it)
  // onTick()   -> called when the delay elapses; the owner reschedules via reset()
  constructor({ delayFor, onTick, timers = globalThis }) {
    this.delayFor = delayFor;
    this.onTick = onTick;
    this.timers = timers;
  }

  get running() {
    return this.#running;
  }

  get paused() {
    return this.#paused;
  }

  start() {
    this.#running = true;
    this.#paused = false;
    this.#schedule();
  }

  stop() {
    this.#running = false;
    this.#paused = false;
    this.#clear();
  }

  pause() {
    if (!this.#running) return;
    this.#paused = true;
    this.#clear();
  }

  resume() {
    if (!this.#running) return;
    this.#paused = false;
    this.#schedule();
  }

  toggle() {
    if (!this.#running) return;
    if (this.#paused) this.resume();
    else this.pause();
  }

  // Restart the countdown for the slide now showing (after any navigation).
  reset() {
    if (this.#running && !this.#paused) this.#schedule();
  }

  #schedule() {
    this.#clear();
    const seconds = this.delayFor();
    if (!(seconds > 0)) return;
    this.#handle = this.timers.setTimeout(() => {
      this.#handle = null;
      if (this.#running && !this.#paused) this.onTick();
    }, seconds * 1000);
  }

  #clear() {
    if (this.#handle !== null) this.timers.clearTimeout(this.#handle);
    this.#handle = null;
  }
}
