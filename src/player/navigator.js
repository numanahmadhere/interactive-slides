// Pure navigation state: which slide, and how many reveal steps into it. No
// DOM, so the rules for stepping and for returning to earlier slides are
// unit-tested. Every move returns { from, to } or null when nothing changes.

export class Navigator {
  // stepCounts[i] is the number of reveal steps on slide i.
  constructor(stepCounts, start = { slide: 0, step: 0 }) {
    this.stepCounts = stepCounts.slice();
    this.slide = 0;
    this.step = 0;
    this.#set(start.slide, start.step);
  }

  get state() {
    return { slide: this.slide, step: this.step };
  }

  get slideCount() {
    return this.stepCounts.length;
  }

  // Called when the deck is edited. If the current slide no longer exists the
  // position falls to the nearest slide at step 0; otherwise the step is
  // clamped to what the slide still offers.
  setStepCounts(stepCounts) {
    const before = this.slide;
    this.stepCounts = stepCounts.slice();
    this.#set(this.slide, this.step);
    if (this.slide !== before) this.step = 0;
  }

  next() {
    const from = this.state;
    if (this.step < this.stepCounts[this.slide]) this.step++;
    else if (this.slide < this.slideCount - 1) {
      this.slide++;
      this.step = 0;
    }
    return this.#move(from);
  }

  // Going back lands on the earlier slide fully revealed.
  prev() {
    const from = this.state;
    if (this.step > 0) this.step--;
    else if (this.slide > 0) {
      this.slide--;
      this.step = this.stepCounts[this.slide];
    }
    return this.#move(from);
  }

  // step may be a number or 'end' for the fully revealed state.
  goTo(slide, step = 0) {
    const from = this.state;
    this.#set(slide, step);
    return this.#move(from);
  }

  first() {
    return this.goTo(0, 0);
  }

  last() {
    return this.goTo(this.slideCount - 1, 'end');
  }

  #set(slide, step) {
    this.slide = Math.min(Math.max(Number.isFinite(slide) ? Math.trunc(slide) : 0, 0), this.slideCount - 1);
    const max = this.stepCounts[this.slide];
    const s = step === 'end' ? max : Number.isFinite(step) ? Math.trunc(step) : 0;
    this.step = Math.min(Math.max(s, 0), max);
  }

  #move(from) {
    const to = this.state;
    return from.slide === to.slide && from.step === to.step ? null : { from, to };
  }
}

// Deep links look like #3 (slide 3) or #3.2 (slide 3, second reveal step).
export function parseHash(hash) {
  const m = /^#(\d+)(?:\.(\d+))?$/.exec(hash || '');
  return m ? { slide: Number(m[1]) - 1, step: Number(m[2] || 0) } : null;
}

export function formatHash({ slide, step }) {
  return `#${slide + 1}${step ? `.${step}` : ''}`;
}
