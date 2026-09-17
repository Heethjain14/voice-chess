# Voice Chess: Content-Script Redesign

Date: 2026-09-17

## Problem

The current prototype has voice-to-move parsing logic (`moveParser.ts`,
`moveValidator.ts`) but nothing that actually plays a move on chess.com:

- `content.ts`'s `playMoveOnBoard()` is a stub that always returns `false`.
- The popup never sends the `VOICE_MOVE` message it computes, so the
  background/content relay is dead code.
- The popup's `ChessState` starts at the initial position and is never
  synced with the real game, so after one real move validation would be
  against the wrong position.
- Popups unload when they lose focus, which is a poor fit for a mic that
  needs to stay listening while the user looks at the board.
- The move parser matches on raw substrings, has no phonetic/fuzzy
  correction, and ignores its own `capture` flag; castling and promotion
  are unhandled.
- There's a duplicate, unused `speechRecogniser.ts` (British spelling) next
  to the real `speechRecognizer.ts`.
- No test runner is installed; `testChess.ts` / `testParser.ts` are
  console.log scratch scripts.

## Goals

- Voice-drive real moves on chess.com's board (bot games and casual/unrated
  play; not intended for ranked ladder play — see Risks).
- Keep listening persistently while a game is in progress, without
  depending on a popup staying open.
- Correctly resolve voice commands against the live board position,
  including the opponent's replies.
- Improve recognition accuracy for chess vocabulary without cloud
  services — fully offline, free, private.
- Support castling, promotion, and capture-based disambiguation.

## Non-goals

- No engine assistance / best-move suggestions (would be cheating).
- No cloud/LLM-based parsing in this pass (may be a future optional
  fallback; out of scope now per user decision — personal project, no
  cloud API).
- No support for chess variants (standard chess only).

## Architecture

Move the whole interaction loop into the content script injected on
`chess.com/play/*` and `chess.com/game/*`. Drop the popup → background →
content message relay; the background service worker and popup are no
longer required for the core flow.

```
chess.com page
├── wc-chess-board (page's own custom element, exposes `.game`)
│
└── content script (src/content/*)
    ├── boardBridge.ts   — reads live FEN/turn from `.game`, submits moves
    ├── overlay.ts        — floating mic button + status, rendered into
    │                       a shadow DOM host appended to the page
    ├── speechRecognizer.ts (existing, reused as-is)
    └── moveParser.ts / moveValidator.ts (rewritten grammar parser)
```

### Board bridge (`src/content/boardBridge.ts`)

- Locates the board via `document.querySelector('wc-chess-board')` rather
  than a hardcoded id (the id observed today, `board-play-computer`,
  differs per game mode).
- Reads state via `board.game.getFEN()` / `board.game.getTurn()` /
  `board.game.isGameOver()` before resolving every voice command, so
  resolution is always against the true current position.
- Submits moves via `board.game.move({ from, to, promotion })`. Verified
  live against a chess.com bot game: calling this updates the move list
  and the bot replies, confirming it's wired into the real game, not just
  a decorative local FEN.
- If `.game` is missing or its shape has changed (chess.com ships an
  update), falls back to injecting a `<script>` tag into page context and
  relaying calls via `window.postMessage`, since an injected script runs
  in the page's own JS realm and has the same access a page script would.
- Exposes a small typed interface (`getFen()`, `getTurn()`,
  `getLegalMoves()`, `playMove(from, to, promotion?)`) so the rest of the
  extension never touches `wc-chess-board` directly.

### Overlay UI (`src/content/overlay.ts`)

- Injected once per matching page load; appended as a fixed-position host
  element with an attached shadow root (isolates styles from chess.com's
  CSS).
- Renders a mic toggle button and a small status line (heard text /
  parsed move / error), reusing the visual language of the current
  `Popup.tsx` but as a persistent in-page widget instead of a popup.
- Owns the `SpeechRecognizer` instance directly — since it lives in the
  page's content-script context, it survives as long as the tab is open,
  not tied to a transient popup window.

### State sync

- Before resolving each recognized transcript, pull `boardBridge.getFen()`
  and `load()` it into a fresh `chess.js` instance (replacing the current
  approach of a long-lived `ChessState` object that drifts from reality).
  This guarantees resolution always reflects the opponent's/bot's latest
  reply.

### Popup / background

- Popup becomes optional: a minimal static panel (instructions / link to
  the overlay) since the overlay is now the primary UI. Not required for
  the core loop — can be trimmed to a short "look for the mic button on
  chess.com" message, or dropped from `manifest.json` entirely if the
  user prefers.
- Background service worker is no longer required for the move-playing
  path. Keep it only if we want extension-level concerns later (e.g.
  cross-tab settings); otherwise remove it and simplify `manifest.json`
  (drop the `background` key and the popup-related message-passing code
  in `background.ts`/old `content.ts`).

## Voice parsing: grammar + phonetic/fuzzy correction (Approach A)

Chess voice commands are a small closed grammar — 6 piece names, 8 files,
8 ranks, castle/capture/promote keywords — not open-ended language, so a
constrained grammar parser with correction beats both plain substring
matching and a general NLP/ML model here.

Rewrite `moveParser.ts` as a tokenizer + slot grammar:

1. **Phonetic normalization table** applied to the raw transcript before
   tokenizing — corrects common STT mishears for this vocabulary, e.g.
   `to/too/two → to`, `for/four → 4`, `ate → 8`, `be → b`, `sea/see → c`,
   `won → 1`, `night → knight`. Table lives as data (`phoneticMap.ts`) so
   it's easy to extend from real mis-recognitions during testing.
2. **Tokenize** the normalized text into words, then match each token
   against known vocab (piece names, file letters, rank digits, keywords)
   using exact match first, then Levenshtein distance (threshold 1-2)
   for near-misses the phonetic table doesn't already cover.
3. **Slot fill**: piece (defaults to pawn if absent, as today), target
   square, capture flag, castle side, promotion piece (new — detect a
   trailing piece name after reaching the back rank, e.g. "e8 promote
   queen" / "e8 queen").
4. **Multiple-alternative retry**: configure `SpeechRecognition` with
   `maxAlternatives = 3` (currently 1) and try the grammar parser against
   each alternative transcript in order, taking the first that resolves
   to exactly one legal move; if several alternatives each resolve
   ambiguously, prefer the highest-confidence alternative's candidates.
5. Feed the parsed slots into an updated `resolveMove` that:
   - actually uses the `capture` flag to filter/disambiguate,
   - handles `castle` by checking the corresponding legal castling move
     (`O-O` / `O-O-O`) instead of returning `[]`,
   - handles `promotion`.

This stays fully offline/on-device (Web Speech API still does audio→text;
everything downstream is deterministic local code), keeps the extension
free of API keys and network calls, and is straightforward to unit test
by feeding strings and asserting parsed output.

## Error handling

- No square/piece recognized → status message asking the user to repeat,
  overlay stays listening-ready.
- Zero legal moves match → "illegal move" status with the heard text.
- Multiple legal moves match (unresolved ambiguity) → overlay prompts the
  user to disambiguate by source square (e.g. "knight from b1 or d2?")
  and accepts a short follow-up utterance (e.g. "b1") rather than just
  displaying a status string as today.
- Board bridge can't find `wc-chess-board` / `.game` API missing → overlay
  shows a clear "couldn't connect to the board" error instead of silently
  failing.

## Testing

- Add Vitest (`vitest`, `@vitest/ui` optional) — nothing is installed
  today.
- Convert `testChess.ts` / `testParser.ts` into real unit test files
  (`moveParser.test.ts`, `moveValidator.test.ts`) covering: piece
  detection, captures, castling both sides, promotion, phonetic
  correction cases, and ambiguous-move resolution.
- Manual QA checklist (executed once implementation lands): load the
  unpacked extension, start a chess.com bot game, verify voice moves land
  on the board, verify state stays correct after the bot's reply, verify
  castling/promotion/ambiguous-move flows.

## Risks

- `wc-chess-board`'s internal API is undocumented and chess.com-owned;
  it can change without notice. The board bridge isolates this risk to
  one file, and the postMessage/injected-script fallback gives a second
  path if direct property access ever stops working.
- Driving moves through this internal API rather than simulating real
  UI drag/click events may interact differently with chess.com's
  fair-play systems on rated/competitive games. This tool is intended as
  a voice-input accessibility aid for practice/casual play, not for
  ranked ladder play.
- Phonetic/fuzzy correction is tuned by hand from observed mis-hearings;
  accuracy will improve iteratively as real usage surfaces new cases,
  not be perfect on day one.
