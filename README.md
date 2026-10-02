# Interactive Slides

A browser-based builder and presenter for interactive slide decks. Vanilla JS,
no framework. A deck is plain JSON; one renderer draws it for the editor, the
presenter and the standalone export.

## Commands

```bash
npm install
npm run dev     # http://localhost:5177 (watch + serve)
npm run build   # dist/ plus dist/single/index.html, a self-contained file
npm test        # unit tests (node:test)
```

`/` opens the editor. `/?play` plays the sample deck in the bare player, with
`&theme=densight-light|paper|midnight`, `&aspect=4:3` and
`&transition=none|fade|slide|zoom` to try themes and layouts. In the player,
deep links work: `#3` is slide 3, `#3.2` is slide 3 after two reveal steps.

## Layout

```
src/core/schema.js       deck model, normalizeDeck() (the gate for untrusted input)
src/core/layouts.js      layouts: grid areas and slots on a 1920x1080 canvas
src/core/theme.js        design tokens as --sp-* custom properties
src/core/sanitize.js     whitelist sanitizer for inline rich text and URLs
src/core/render.js       deck data -> DOM (modes: present, edit, thumb)
src/core/blocks/         one module per block type, registered in registry.js
src/player/navigator.js  pure slide/step state machine
src/player/player.js     stage scaling, input, transitions
src/editor/ops.js        pure deck edits (insert, move, patch...), structurally shared
src/editor/store.js      current deck + undo/redo with coalescing
src/editor/editor.js     controller: selection, actions, shortcuts, autosave, import/export
src/editor/canvas.js     edit-mode slide, click-to-edit text, format bar
src/editor/sidebar.js    thumbnails, drag-to-reorder
src/editor/inspector.js  settings panel generated from each block's `fields`
src/editor/persist.js    IndexedDB (decks + images), localStorage and memory fallbacks
src/editor/assets.js     uploaded images, referenced from decks as asset:<id>
```

## Editor

Click a block to select it, click it again (or press Enter) to type in place.
Pasted text is always plain. Settings for the selection are in the right panel.

| Keys | Action |
| --- | --- |
| Enter / F2 | edit the selected block |
| Esc | finish editing, then deselect |
| Ctrl/Cmd+B, I, K | bold, italic, link (while editing rich text) |
| Delete | delete the selected block |
| Ctrl/Cmd+Z, Shift+Z | undo, redo (a whole typing session is one step) |
| Ctrl/Cmd+D | duplicate the selected block, or the slide |
| PageUp / PageDown | previous / next slide |
| Alt+Up / Down (in the slide list) | move the slide |
| Ctrl/Cmd+Enter | present |
| Ctrl/Cmd+S | save now (autosave runs after every change) |

The working deck and uploaded images are stored in the browser (IndexedDB).
Use File > Export to get a portable JSON file with images embedded; Import
reads it back. Images dropped on the canvas or pasted are downscaled to WebP
when large.

## Deck format

```json
{
  "version": 1,
  "meta": { "title": "..." },
  "theme": { "id": "densight-dark", "overrides": {} },
  "aspect": "16:9",
  "transition": "fade",
  "slides": [
    {
      "id": "s_1",
      "layout": "content",
      "notes": "",
      "blocks": [
        { "id": "b_1", "type": "heading", "slot": "title", "props": { "text": "Hello", "level": 2 } },
        { "id": "b_2", "type": "list", "slot": "body", "props": { "items": ["a", "b"], "revealItems": true } }
      ]
    }
  ]
}
```

Blocks take a `slot` from their slide's layout and an optional `reveal` step
number. A block type is one file that calls `registerBlock({ type, label,
defaults, normalize, render, steps? })`.

## Status

Phase 1 (foundation) and phase 2 (editor) are done. Next: interactive blocks
(phase 3), presenter view with notes and overview (phase 4), standalone export
(phase 5).

Known limits: Inter is bundled as the Latin subset only, so other scripts
fall back to system fonts. Code blocks are not syntax-highlighted yet.
