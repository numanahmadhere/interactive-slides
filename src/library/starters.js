// Decks a person can start from. Each call returns a fresh, normalised copy.

import { createDeck, createSlide, normalizeDeck } from '../core/schema.js';
import { sampleDeck } from '../samples/sample-deck.js';
import { interactiveDeck } from '../samples/interactive-deck.js';

export function blankDeck() {
  const deck = createDeck({ title: 'Untitled deck' });
  deck.slides = [createSlide('title'), createSlide('content')];
  return deck;
}

export const sampleDeckCopy = () => normalizeDeck(structuredClone(sampleDeck)).deck;
export const demoDeckCopy = () => normalizeDeck(structuredClone(interactiveDeck)).deck;

// Same content, a new identity: its own creation stamp and slide/block ids.
export function duplicateDeck(deck, title) {
  const copy = structuredClone(deck);
  const now = new Date().toISOString();
  copy.meta = { ...copy.meta, title: title ?? `Copy of ${copy.meta.title}`.slice(0, 200), createdAt: now, updatedAt: now };
  return normalizeDeck(copy).deck;
}
