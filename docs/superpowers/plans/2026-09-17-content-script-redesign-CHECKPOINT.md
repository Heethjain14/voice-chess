# Content-Script Redesign — Midpoint Checkpoint

Status as of this checkpoint: **Tasks 1–11 of 12 complete and reviewed clean.**
Paused before the final whole-branch review so work can resume later.

- Plan: `docs/superpowers/plans/2026-09-17-content-script-redesign.md`
- Spec: `docs/superpowers/specs/2026-09-17-content-script-redesign-design.md`
- Worktree: `.worktrees/content-script-redesign` (branch `content-script-redesign`, based on `master` at `91f7685`)
- SDD ledger (full detail, local-only, gitignored): `.superpowers/sdd/2026-09-17-content-script-redesign/progress.md`
- Model policy used throughout: implementers/reviewers restricted to `sonnet` and `haiku` only (per user instruction) — no `opus`, no non-coding agent types.

## What's done

All 11 implementation tasks were executed via Subagent-Driven Development: a fresh implementer subagent per task (TDD where applicable), then an independent reviewer subagent per task (spec compliance + code quality), with one fix round where the reviewer found a real gap. Every task is committed on this branch.

| Task | What it built | Implementer | Reviewer | Outcome |
|---|---|---|---|---|
| 1 | Fixed the build pipeline: `@crxjs/vite-plugin` wired up, tsconfig project-reference solution file fixed, one pre-existing `verbatimModuleSyntax` bug fixed — `npx vite build` went from broken to working | sonnet | haiku | Approved clean |
| 2 | Added Vitest + jsdom, deleted 3 dead scratch files, fixed a pre-existing `erasableSyntaxOnly` violation — first point where full `npm run build` is clean | haiku | haiku | Approved clean |
| 3 | `textMatch.ts` — Levenshtein distance + fuzzy vocabulary matching | haiku | haiku | Approved (1 cosmetic minor deferred) |
| 4 | `phoneticMap.ts` — ASR mishear correction table (e.g. "bee"→"b", "four"→"4") | haiku | haiku | Approved (1 cosmetic minor deferred) |
| 5 | Rewrote `moveParser.ts` as a grammar + fuzzy/phonetic tokenizer, added promotion detection | haiku | **sonnet** (core logic) | Approved — reviewer independently traced the before/after-target scoping logic and confirmed it's correct |
| 6 | Rewrote `moveValidator.ts` — castling, capture, and promotion resolution against real `chess.js` legal moves | haiku | sonnet | Approved (1 cosmetic minor deferred) |
| 7 | `bridgeProtocol.ts` + `pageBridge.ts` — MAIN-world script that talks to chess.com's `wc-chess-board.game` API | sonnet | sonnet | Approved — reviewer verified the pure-handler/DOM-wiring separation directly |
| 8 | `boardBridge.ts` — isolated-world client, async request/response over `postMessage` with id correlation + timeout | sonnet | sonnet | Approved — reviewer independently re-derived the id-correlation and cleanup logic since the implementer's scratch verification test had been deleted |
| 9 | `voiceController.ts` — decides PLAY / ASK_DISAMBIGUATION / ERROR from a transcript + live FEN, plus multi-alternative retry | haiku | sonnet | **1 fix round**: reviewer found the pending-disambiguation reply path never re-validated the candidate move against a fresh FEN (a real gap inherited from the plan's own reference code). Implementer added the re-validation + a covering test. Re-review: addressed, no new breakage. |
| 10 | `SpeechRecognizer` multi-alternative results (`maxAlternatives=3`) + the in-page shadow-DOM overlay UI + `main.ts` entry point | sonnet | sonnet | Approved — implementer disclosed 2 self-directed fixes (Popup.tsx broke from the callback signature change; the plan's own test mock used an arrow function as a `new` target, which is invalid JS), reviewer independently verified both were necessary, minimal, and correct |
| 11 | Wired both content scripts into `manifest.json` (MAIN-world `pageBridge.ts` + isolated `main.ts`), deleted the old background/content-relay files, trimmed the popup to a static panel | sonnet | sonnet | Approved — reviewer ran `npm run build` itself and independently confirmed the built `dist/manifest.json` has the right shape |

**End state:** `npm run build` succeeds end-to-end (tsc -b + vite build), `npm test` passes 48/48 across 9 test files, `dist/manifest.json` has exactly two `content_scripts` entries (one `world: "MAIN"` → `pageBridge.ts`, one isolated → `main.ts`), no `background` key, no unused `storage` permission.

## Rulings made along the way

- **Task 9 ruling:** the plan's own reference code for `interpretTranscript`'s pending-disambiguation branch didn't re-validate the chosen candidate against a live FEN before replaying it. Ruled this was a real gap worth fixing (not a false positive) since it's the exact "always reflects the live board" guarantee the design spec promises. Fixed via a resumed implementer + scoped re-review. Cost if this ruling was wrong: negligible — it's a small, already-tested, already-reviewed diff either way.
- **Task 10 ruling:** implementer touched `src/popup/Popup.tsx` (not in that task's file list) and changed a test's mock from an arrow function to a function expression, both because the plan's own specified changes broke them. Ruled both were legitimate, necessary, narrowly-scoped corrections rather than scope creep, after the reviewer independently verified each. Cost if wrong: negligible — both are tiny, already-reviewed diffs.

## What's left

1. **Final whole-branch code review** — was about to be dispatched (on `sonnet`, the most capable model available under the user's model restriction) over the full range `91f7685..806f4c2`, covering cross-task integration (the full flow: overlay → `interpretTranscripts` → `boardBridge.playMove()` → `postMessage` → `pageBridge.ts` → chess.com's `game.move()`) that per-task reviews couldn't see. **Not yet run — this is the next step.**
2. If the final review finds issues: one fix dispatch (not one per finding) + one scoped re-review + adjudicate residuals, per the subagent-driven-development skill.
3. **Task 12 (manual QA on live chess.com)** — explicitly out of scope for subagent execution (needs a real browser + real microphone). This needs a human (or a browser-driven session without real mic input, which can at most verify the overlay renders and the board bridge responds, not full voice recognition) to actually play a game and verify: normal moves, state sync after opponent replies, castling, ambiguous-move disambiguation, promotion, and error paths. The plan's Task 12 section has the exact checklist.
4. Once the final review is clean and Task 12 QA passes: use `superpowers:finishing-a-development-branch` to decide how to integrate this branch (merge, PR, etc.) and clean up the worktree + SDD workspace.

## To resume

Open this worktree (`.worktrees/content-script-redesign`, branch `content-script-redesign`), re-invoke `superpowers:subagent-driven-development`, and continue from "Final Review" in that skill using the ledger at `.superpowers/sdd/2026-09-17-content-script-redesign/progress.md` as the source of truth for what's already done.
