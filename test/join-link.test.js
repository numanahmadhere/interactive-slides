import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinBase, joinLink } from '../src/live/config.js';

const here = { origin: 'https://slides.example', pathname: '/app/d/d_abc123' };
const local = { kind: 'local' };

test('the audience link is the short app address, not the deck being edited', () => {
  assert.equal(joinBase({ base: '' }, here), 'https://slides.example/app/');
  assert.equal(joinLink(joinBase({ base: '' }, here), 'ABC234', local), 'https://slides.example/app/?join=ABC234');
});

test('an address typed by the presenter wins', () => {
  assert.equal(joinBase({ base: 'https://go.example/j?x=1' }, here), 'https://go.example/j');
});
