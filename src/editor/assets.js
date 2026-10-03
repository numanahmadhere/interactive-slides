// Uploaded images. Blobs live in IndexedDB; decks refer to them as "asset:<id>"
// so deck JSON stays small. The renderer resolves those references through
// resolve(), which is synchronous: every blob gets an object URL at startup and
// when it is added. Exports swap references for data URIs (see inline()).

import { uid } from '../core/util.js';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const KEEP_AS_IS_BYTES = 1_500_000;
const MAX_DIMENSION = 2560;
const ASSET_REF = /asset:([a-z0-9]+)/g;

export class AssetStore {
  #blobs = new Map();
  #urls = new Map();

  constructor(persistence) {
    this.persistence = persistence;
    this.version = 0; // bumped when the set of resolvable images changes
  }

  // ids: the images this deck uses. Others stay on disk until the deck that uses them is opened.
  async init(ids) {
    for (const rec of await this.persistence.loadAssets(ids)) this.#register(rec.id, rec.blob);
  }

  // Passed to the renderer as resolveAsset.
  resolve = (src) => {
    if (typeof src === 'string' && src.startsWith('asset:')) return this.#urls.get(src.slice(6)) ?? '';
    return src;
  };

  async add(file) {
    if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
    if (file.size > MAX_FILE_BYTES) throw new Error('Images must be under 25 MB.');
    const blob = await downscale(file);
    const id = uid();
    this.#register(id, blob);
    await this.persistence.saveAsset({ id, blob, name: file.name || 'image', type: blob.type, addedAt: Date.now() });
    return `asset:${id}`;
  }

  referenced(deck) {
    return new Set([...JSON.stringify(deck).matchAll(ASSET_REF)].map((m) => m[1]));
  }

  // Drop stored images no deck in the library uses. Run at startup, never mid-session,
  // so undo can still bring back an image that was just removed.
  async gc(keep) {
    await this.persistence.gcAssets(keep);
  }

  // Deck copy with every asset: reference replaced by a data URI, so the JSON
  // stands alone.
  async inline(deck) {
    const text = JSON.stringify(deck);
    const ids = [...new Set([...text.matchAll(ASSET_REF)].map((m) => m[1]))];
    const dataUrls = new Map();
    for (const id of ids) {
      const blob = this.#blobs.get(id);
      if (blob) dataUrls.set(id, await readAsDataUrl(blob));
    }
    return JSON.parse(text.replace(ASSET_REF, (m, id) => dataUrls.get(id) ?? m));
  }

  // Imported decks may carry images as data URIs; move the big ones into the
  // store so the working deck stays small.
  async adoptDataUrls(deck) {
    const convert = async (blocks) => {
      let changed = false;
      const out = [];
      for (const b of blocks) {
        let next = b;
        if (b.type === 'image' && typeof b.props.src === 'string' && b.props.src.startsWith('data:image/') && b.props.src.length > 20000) {
          try {
            const blob = await (await fetch(b.props.src)).blob();
            const ref = await this.add(new File([blob], 'image', { type: blob.type }));
            next = { ...b, props: { ...b.props, src: ref } };
          } catch { /* keep the data URI */ }
        } else if (b.type === 'columns') {
          let colsChanged = false;
          const cols = [];
          for (const c of b.props.cols) {
            const inner = await convert(c.blocks);
            if (inner !== c.blocks) colsChanged = true;
            cols.push(inner === c.blocks ? c : { ...c, blocks: inner });
          }
          if (colsChanged) next = { ...b, props: { ...b.props, cols } };
        }
        if (next !== b) changed = true;
        out.push(next);
      }
      return changed ? out : blocks;
    };
    let changed = false;
    const slides = [];
    for (const slide of deck.slides) {
      const blocks = await convert(slide.blocks);
      if (blocks !== slide.blocks) changed = true;
      slides.push(blocks === slide.blocks ? slide : { ...slide, blocks });
    }
    return changed ? { ...deck, slides } : deck;
  }

  #register(id, blob) {
    this.#blobs.set(id, blob);
    this.#urls.set(id, URL.createObjectURL(blob));
    this.version++;
  }
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Large photos are re-encoded as WebP at a sensible size; small files, SVG and
// GIF (animation) are stored untouched.
async function downscale(file) {
  if (file.size < KEEP_AS_IS_BYTES || file.type === 'image/svg+xml' || file.type === 'image/gif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const out = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
