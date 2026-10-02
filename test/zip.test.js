import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, zipFiles } from '../src/export/zip.js';

const bytes = (s) => new TextEncoder().encode(s);

test('crc32 matches the standard check values', () => {
  assert.equal(crc32(bytes('')), 0);
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
  assert.equal(crc32(bytes('The quick brown fox jumps over the lazy dog')), 0x414fa339);
});

test('zip structure: signatures, counts and offsets line up', () => {
  const zip = zipFiles([{ name: 'a.txt', data: bytes('hello') }, { name: 'dir/b.bin', data: new Uint8Array([1, 2, 3, 4]) }]);
  const v = new DataView(zip.buffer);
  assert.equal(v.getUint32(0, true), 0x04034b50, 'starts with a local header');
  const eocd = zip.length - 22;
  assert.equal(v.getUint32(eocd, true), 0x06054b50);
  assert.equal(v.getUint16(eocd + 10, true), 2, 'two entries');
  const cdOffset = v.getUint32(eocd + 16, true);
  assert.equal(v.getUint32(cdOffset, true), 0x02014b50, 'central directory starts where the end record says');
  assert.equal(cdOffset + v.getUint32(eocd + 12, true), eocd, 'and ends at the end record');
});

test('an empty zip is valid', () => {
  const zip = zipFiles([]);
  assert.equal(zip.length, 22);
});

test('a real unzip accepts the archive and recovers the files', (t) => {
  const probe = spawnSync('unzip', ['-v']);
  if (probe.error) return t.skip('unzip is not installed');
  const dir = mkdtempSync(join(tmpdir(), 'zip-test-'));
  try {
    const payload = new Uint8Array(5000).map((_, i) => (i * 7) % 256);
    const zip = zipFiles([
      { name: '01-title.png', data: payload },
      { name: 'café/notes.txt', data: bytes('unicode names work') },
    ]);
    const file = join(dir, 'out.zip');
    writeFileSync(file, zip);
    const test_ = spawnSync('unzip', ['-t', file], { encoding: 'utf8' });
    assert.equal(test_.status, 0, test_.stdout + test_.stderr);
    assert.match(test_.stdout, /No errors detected/);
    const cat = spawnSync('unzip', ['-p', file, '01-title.png']);
    assert.deepEqual(new Uint8Array(cat.stdout), payload, 'content round-trips byte for byte');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
