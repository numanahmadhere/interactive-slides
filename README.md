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

`/` opens the editor (File > Open interactive demo loads a deck that uses every
block). `/?play` plays the sample deck in the bare player, `/?play&deck=interactive`
the interactive one, with
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
src/player/player.js     stage scaling, input, transitions, tool and view shortcuts
src/player/tools.js      laser, drawing, spotlight, black and whiteboard screens
src/player/overview.js   the all-slides grid
src/player/presenter-view.js  the speaker's second window
src/player/autoplay.js   kiosk timer
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
| Ctrl/Cmd+Enter | present (add Shift for the presenter view) |
| Ctrl/Cmd+S | save now (autosave runs after every change) |

The working deck and uploaded images are stored in the browser (IndexedDB).
Use File > Export to get a portable JSON file with images embedded; Import
reads it back. Images dropped on the canvas or pasted are downscaled to WebP
when large.

## Presenting

Present from the editor (Ctrl/Cmd+Enter, or the arrow beside the button for "from
the beginning" and "with presenter view"). Keys while presenting; `?` shows them:

| Key | Action |
| --- | --- |
| Arrows, Space, Page keys, Home, End | move through slides and reveal steps |
| O or G | overview grid of every slide |
| F | fullscreen |
| P | presenter view: a second window with notes, next slide, a timer and clock |
| B or . | black screen (any key brings the slide back) |
| W | whiteboard you can draw on |
| L | laser pointer |
| D | draw on the slide (1 to 5 pick a colour, U undo, C clear); drawings stay with their slide |
| S | spotlight (scroll to resize) |
| A | pause or resume auto-play |
| Esc | turn off the current tool |

Slide settings add a countdown (shown to the speaker, optionally on screen).
Deck settings add auto-play: advance every N seconds, looping or not, for kiosks.
Remote control from a phone needs a server and arrives with the live features.

## Exporting

File > Export... offers:

| Format | What you get |
| --- | --- |
| Web page (HTML) | one file with the player and deck inlined; every interaction works; speaker notes left out unless you ask |
| PDF | one slide per page with tabs and accordions expanded, through the browser's print dialog |
| Images (PNG) | every slide (zip) or the current one, drawn as it looks on screen |
| PowerPoint (PPTX) | each slide as a picture with its text removed, plus real editable text boxes for headings, text, lists and quotes; interactions become still pictures |
| Deck file (JSON) | reopen and keep editing, images included |
| Embed code | an iframe snippet for a page you host yourself |

## Blocks

Content: heading, text, list, image, code, quote, divider, columns, embed.

Quiz, matching, ordering and fill-in-the-blank are "scored": the Score summary block totals all of them.

Interactive (the presenter clicks, the audience sees the result):

| Block | What it does |
| --- | --- |
| Button | next, previous, first, back, jump to any slide, or open a link, so a deck can branch |
| Quiz question | one or several correct answers, instant feedback, optional explanation |
| Score summary | the score across every scored question in the deck, with "try again" |
| Tabs, Accordion | sections that each hold other blocks |
| Image hotspots | numbered markers on a picture that open a note; drag them into place in the editor |
| Flip cards | click to turn a card over |
| Click to reveal | a question with an answer behind a button |
| Before / after | two images with a draggable divider |
| Matching | pair items by clicking or dragging; checked at the end |
| Put in order | drag or use arrows to sequence items; checked at the end |
| Timeline | step through stages with a track, dots and next/previous |
| Fill in the blank | `[answer]` blanks in a sentence, with accepted alternatives `[a\|b]` |
| Reflection prompt | a private text box that stays on the device |
| Chart | bar, line, pie or donut from pasted spreadsheet data, with a table for screen readers |
| Calculator | sliders feeding formulas (`people * hours * 48`), evaluated without `eval` |
| Live code | HTML, CSS and JS the audience can edit, run in an isolated frame with no network |

Anything the audience does lives in a per-presentation session, so leaving a
slide and coming back restores it, and a score slide can read every quiz. It is
never saved with the deck.

### Adding a block type

One file that calls `registerBlock`, plus an import in `src/core/blocks/index.js`:

```js
registerBlock({
  type: 'my-block', label: 'My block', group: 'Interactive',
  defaults: () => ({ ... }),
  normalize: (props, ctx) => ({ ... }),   // clamp and validate everything
  render: (block, ctx) => element,       // pure DOM; ctx.mode is present | edit | thumb
  fields: [...],                         // what the inspector shows (segmented, toggle, text,
                                         // list, image, slide, sections, ...)
  edit: [...],                           // text you can type into directly on the slide
  mount: (el, block, ctx) => dispose?,   // behaviour for the live presentation
  mountInEdit: true,                     // also run it in the editor (visual toggles only)
  container: { key, min, max, item },    // if it holds other blocks in sections
});
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

Phases 1 to 5 are done (foundation, editor, interactive blocks and exercises,
presenting, export). Next: polish (phase 6).

Known limits: Inter is bundled as the Latin subset only, so other scripts
fall back to system fonts. Code blocks are not syntax-highlighted yet.
