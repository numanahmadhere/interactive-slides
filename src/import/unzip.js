// A small ZIP reader for .pptx files: finds entries through the central directory
// and inflates them with the browser's built-in DecompressionStream (also in Node).
// Limits keep a hostile file from exhausting memory ("zip bomb").

const MAX_ENTRIES = 5000;
const MAX_ENTRY_BYTES = 40 * 1024 * 1024;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;

async function inflateRaw(bytes, limit) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('That file is too large to import.');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// -> Map<name, () => Promise<Uint8Array>>
export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('That is not a PowerPoint file (.pptx).');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (count > MAX_ENTRIES) throw new Error('That file has too many parts to import.');
  const decoder = new TextDecoder();
  const entries = new Map();
  let declared = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new Error('That file is damaged.');
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const compSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    at += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/') || (flags & 1)) continue;
    declared += size;
    if (declared > MAX_TOTAL_BYTES) throw new Error('That file is too large to import.');
    entries.set(name, async () => {
      if (size > MAX_ENTRY_BYTES) throw new Error('That file is too large to import.');
      if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) throw new Error('That file is damaged.');
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + compSize);
      if (method === 0) return raw;
      if (method === 8) return inflateRaw(raw, Math.min(MAX_ENTRY_BYTES, size + 1024));
      throw new Error('That file uses a compression method that is not supported.');
    });
  }
  return entries;
}
