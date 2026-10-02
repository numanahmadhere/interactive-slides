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

Dev shell query params: `?theme=densight-light|paper|midnight`,
`?aspect=4:3`, `?transition=none|fade|slide|zoom`. Deep links: `#3` is slide 3,
`#3.2` is slide 3 after two reveal steps.

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
```

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

Phase 1 (foundation) is done: model, sanitizer, layouts, four themes, nine
static blocks, and the player with keyboard, click, swipe, hash deep links,
transitions and reveal steps. Next: the editor (phase 2), interactive blocks
(phase 3), presenter view and fullscreen (phase 4), export (phase 5).

Known limits: Inter is bundled as the Latin subset only, so other scripts
fall back to system fonts. Code blocks are not syntax-highlighted yet.
