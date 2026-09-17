# Content-Script Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the popup/background prototype with a content-script overlay that voice-drives real moves on chess.com, using a grammar-based (non-cloud) parser for accuracy.

**Architecture:** Two content scripts run on chess.com's game pages: a MAIN-world `pageBridge.ts` that talks directly to chess.com's own `wc-chess-board` API, and an isolated-world script that renders a persistent floating mic overlay, runs speech recognition, parses the transcript with a grammar+fuzzy-correction parser, resolves it against live board state via `chess.js`, and sends the move to `pageBridge.ts` over `window.postMessage`. The popup and background service worker are dropped from the move-playing path.

**Tech Stack:** Vite 8, `@crxjs/vite-plugin` 2.7.x (MV3 build), React 19 (popup only), TypeScript 6 (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), `chess.js` 1.4.0, Vitest 5 + jsdom.

**Spec:** [docs/superpowers/specs/2026-09-17-content-script-redesign-design.md](../specs/2026-09-17-content-script-redesign-design.md)

## Global Constraints

- No cloud/LLM APIs or network calls anywhere in the parsing/voice path — fully offline, per user decision (personal project, no cloud API).
- `verbatimModuleSyntax` is on: type-only imports must use `import type`.
- `erasableSyntaxOnly` is on: no TypeScript constructor parameter properties (`constructor(private x: T)`); declare fields and assign in the constructor body instead.
- `chess.js` is pinned at `1.4.0`; verbatim verified move-object shape: `{ from, to, piece, flags, san, promotion? }` where `flags` contains `"k"`/`"q"` for castling and `"c"` for captures.
- chess.com's board custom element is `<wc-chess-board>`; its `.game` property exposes `getFEN()`, `isGameOver()`, `move({from, to, promotion?})` — verified live against a chess.com bot game (calling `.move()` registered a real move and the bot replied).
- This tool is for practice/casual play as a voice-input accessibility aid, not ranked ladder play (see spec Risks) — no code changes needed for this, it's a documentation/framing point already covered in the popup copy (Task 11).

---

### Task 1: Fix the build pipeline (tsconfig + crx bundling)

The repo currently can't produce a loadable extension: `manifest.json` points at raw `.ts` source files, which plain `vite build` doesn't bundle per-entry, and `tsc -b` is broken today (verified: `moveValidator.ts` has a `verbatimModuleSyntax` violation, and `tsconfig.json` isn't wired as a proper project-reference solution file, so it uses the wrong compiler options and fails on CSS side-effect imports). This task fixes both so later tasks have a working `npm run build`.

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`
- Modify: `tsconfig.app.json`
- Modify: `tsconfig.node.json`
- Modify: `src/chess/moveValidator.ts`

**Interfaces:**
- Produces: a working `npm run build` → `dist/` that Chrome can load unpacked (verified manually in this task).

- [ ] **Step 1: Install `@crxjs/vite-plugin`**

Run: `npm install -D @crxjs/vite-plugin@^2.7.1`

- [ ] **Step 2: Point Vite at the manifest via the crx plugin**

Replace the full contents of `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.json" with { type: "json" };

export default defineConfig({
  plugins: [react(), crx({ manifest })],
});
```

- [ ] **Step 3: Fix the tsconfig project-reference setup**

Replace the full contents of `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

In `tsconfig.app.json`, add `"composite": true` as the first entry in `compilerOptions`, and add `"chrome"` to the `types` array so it reads `"types": ["vite/client", "chrome"]`.

In `tsconfig.node.json`, add `"composite": true` as the first entry in `compilerOptions`.

- [ ] **Step 4: Fix the pre-existing `verbatimModuleSyntax` violation blocking the bundle**

In `src/chess/moveValidator.ts`, change:

```ts
import { ParsedMove } from "./moveParser";
```

to:

```ts
import type { ParsedMove } from "./moveParser";
```

(`ParsedMove` is a type-only import; `chess.js`'s Rolldown-based bundler treats it as a missing value export otherwise — verified this is a real build-breaking error, not just a type-checker warning.)

- [ ] **Step 5: Verify the bundling pipeline**

Run: `npx vite build`
Expected: succeeds, producing `dist/manifest.json`, `dist/service-worker-loader.js`, `dist/assets/content.ts-*.js`, `dist/assets/background.ts-*.js`, and `dist/index.html`. (Full `npm run build`, which also runs `tsc -b`, will still fail until Task 2 removes two more pre-existing type errors — that's expected at this point.)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json src/chess/moveValidator.ts
git commit -m "fix: wire up MV3 build pipeline with @crxjs/vite-plugin"
```

---

### Task 2: Add Vitest, delete dead code, fix remaining `tsc -b` errors

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/chess/chessState.test.ts`
- Delete: `src/voice/speechRecogniser.ts` (unused duplicate of `speechRecognizer.ts`)
- Delete: `src/chess/testChess.ts` (scratch script, superseded by real tests)
- Delete: `src/chess/testParser.ts` (scratch script, superseded by real tests)
- Modify: `src/voice/speechRecognizer.ts`

**Interfaces:**
- Produces: `npm test` (Vitest), a clean `npm run build` (both `tsc -b` and `vite build` succeed).

- [ ] **Step 1: Install Vitest and jsdom**

Run: `npm install -D vitest@^5.0.1 jsdom@^30.1.0`

- [ ] **Step 2: Add the Vitest config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 3: Add the `test` script**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 4: Write a smoke test for the existing `ChessState` (failing first)**

Create `src/chess/chessState.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { ChessState } from "./chessState";

describe("ChessState", () => {
  it("starts at the standard opening position, white to move", () => {
    const state = new ChessState();

    expect(state.getFen()).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );
    expect(state.getTurn()).toBe("w");
  });

  it("applies a legal move and switches the turn", () => {
    const state = new ChessState();

    const result = state.makeMove("e2", "e4");

    expect(result).not.toBeNull();
    expect(state.getTurn()).toBe("b");
  });

  it("returns null for an illegal move instead of throwing", () => {
    const state = new ChessState();

    expect(state.makeMove("e2", "e5")).toBeNull();
  });
});
```

- [ ] **Step 5: Run it to confirm it passes against the existing code**

Run: `npx vitest run src/chess/chessState.test.ts`
Expected: PASS (3 tests) — `ChessState` already behaves this way; this test just gives the pipeline a real first case and guards the class going forward.

- [ ] **Step 6: Delete dead files**

```bash
git rm src/voice/speechRecogniser.ts src/chess/testChess.ts src/chess/testParser.ts
```

- [ ] **Step 7: Fix the `erasableSyntaxOnly` violation in the surviving `SpeechRecognizer`**

In `src/voice/speechRecognizer.ts`, replace the class field/constructor declarations:

```ts
export class SpeechRecognizer {
  private recognition: any;
  private listening = false;

  constructor(
    private onResult: SpeechCallback,
    private onError: ErrorCallback
  ) {
```

with:

```ts
export class SpeechRecognizer {
  private recognition: any;
  private listening = false;
  private onResult: SpeechCallback;
  private onError: ErrorCallback;

  constructor(onResult: SpeechCallback, onError: ErrorCallback) {
    this.onResult = onResult;
    this.onError = onError;
```

(TypeScript's `erasableSyntaxOnly` rejects constructor parameter properties because they generate runtime assignment code that can't be erased along with the types — this project enables that flag, so both remaining usages need explicit field declarations.)

- [ ] **Step 8: Verify the full build is clean**

Run: `npm run build`
Expected: `tsc -b` succeeds with no errors, `vite build` succeeds, `dist/` is produced.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "test: add Vitest, remove dead scratch files, fix erasableSyntaxOnly violation"
```

---

### Task 3: Fuzzy text matching utility

**Files:**
- Create: `src/chess/textMatch.ts`
- Test: `src/chess/textMatch.test.ts`

**Interfaces:**
- Produces: `levenshteinDistance(a: string, b: string): number`, `closestMatch(token: string, vocabulary: string[], maxDistance?: number): string | null` — used by Task 5's parser.

- [ ] **Step 1: Write the failing test**

Create `src/chess/textMatch.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { closestMatch, levenshteinDistance } from "./textMatch";

describe("levenshteinDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshteinDistance("cat", "cat")).toBe(0);
  });

  it("counts a single substitution", () => {
    expect(levenshteinDistance("cat", "bat")).toBe(1);
  });

  it("matches the classic kitten/sitting example", () => {
    expect(levenshteinDistance("kitten", "sitting")).toBe(3);
  });
});

describe("closestMatch", () => {
  const vocabulary = ["knight", "rook", "bishop", "queen", "king", "pawn"];

  it("corrects a near-miss within the distance threshold", () => {
    expect(closestMatch("knght", vocabulary, 2)).toBe("knight");
  });

  it("returns null when nothing is close enough", () => {
    expect(closestMatch("banana", vocabulary, 2)).toBeNull();
  });

  it("returns an exact match unchanged", () => {
    expect(closestMatch("rook", vocabulary, 2)).toBe("rook");
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/chess/textMatch.test.ts`
Expected: FAIL — `Cannot find module './textMatch'`

- [ ] **Step 3: Implement it**

Create `src/chess/textMatch.ts`:

```ts
export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0)
  );

  for (let i = 0; i < rows; i++) distances[i][0] = i;
  for (let j = 0; j < cols; j++) distances[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      distances[i][j] = Math.min(
        distances[i - 1][j] + 1,
        distances[i][j - 1] + 1,
        distances[i - 1][j - 1] + cost
      );
    }
  }

  return distances[rows - 1][cols - 1];
}

export function closestMatch(
  token: string,
  vocabulary: string[],
  maxDistance = 2
): string | null {
  let best: string | null = null;
  let bestDistance = Infinity;

  for (const word of vocabulary) {
    const distance = levenshteinDistance(token, word);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = word;
    }
  }

  if (best !== null && bestDistance <= maxDistance) {
    return best;
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chess/textMatch.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chess/textMatch.ts src/chess/textMatch.test.ts
git commit -m "feat: add Levenshtein-based fuzzy text matching"
```

---

### Task 4: Phonetic correction table

**Files:**
- Create: `src/chess/phoneticMap.ts`
- Test: `src/chess/phoneticMap.test.ts`

**Interfaces:**
- Produces: `applyPhoneticCorrections(tokens: string[]): string[]` — used by Task 5's parser.

- [ ] **Step 1: Write the failing test**

Create `src/chess/phoneticMap.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyPhoneticCorrections } from "./phoneticMap";

describe("applyPhoneticCorrections", () => {
  it("corrects number words to digits", () => {
    expect(applyPhoneticCorrections(["knight", "to", "b", "four"])).toEqual([
      "knight",
      "to",
      "b",
      "4",
    ]);
  });

  it("corrects letter homophones for files b and c", () => {
    expect(applyPhoneticCorrections(["bee", "four"])).toEqual(["b", "4"]);
    expect(applyPhoneticCorrections(["sea", "five"])).toEqual(["c", "5"]);
  });

  it("corrects night/nite to knight", () => {
    expect(applyPhoneticCorrections(["night", "to", "f3"])).toEqual([
      "knight",
      "to",
      "f3",
    ]);
  });

  it("leaves unrecognized words untouched", () => {
    expect(applyPhoneticCorrections(["hello", "world"])).toEqual([
      "hello",
      "world",
    ]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/chess/phoneticMap.test.ts`
Expected: FAIL — `Cannot find module './phoneticMap'`

- [ ] **Step 3: Implement it**

Create `src/chess/phoneticMap.ts`:

```ts
export const PHONETIC_CORRECTIONS: Record<string, string> = {
  one: "1",
  won: "1",
  two: "2",
  too: "2",
  three: "3",
  tree: "3",
  four: "4",
  for: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  ate: "8",
  be: "b",
  bee: "b",
  sea: "c",
  see: "c",
  night: "knight",
  nite: "knight",
  nights: "knights",
  nites: "knights",
};

export function applyPhoneticCorrections(tokens: string[]): string[] {
  return tokens.map((token) => PHONETIC_CORRECTIONS[token] ?? token);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chess/phoneticMap.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chess/phoneticMap.ts src/chess/phoneticMap.test.ts
git commit -m "feat: add phonetic correction table for common ASR mishears"
```

---

### Task 5: Rewrite the move parser as a grammar + fuzzy-correction tokenizer

Replaces the old substring-matching `moveParser.ts`. Adds promotion detection, which didn't exist before.

**Files:**
- Modify: `src/chess/moveParser.ts` (full rewrite)
- Test: `src/chess/moveParser.test.ts`

**Interfaces:**
- Consumes: `applyPhoneticCorrections(tokens: string[]): string[]` from `./phoneticMap` (Task 4); `closestMatch(token: string, vocabulary: string[], maxDistance?: number): string | null` from `./textMatch` (Task 3).
- Produces: `interface ParsedMove { piece: "p"|"n"|"b"|"r"|"q"|"k"; target: string; capture: boolean; castle?: "kingside"|"queenside"; promotion?: "q"|"r"|"b"|"n"; }` and `parseMove(text: string): ParsedMove | null` — used by Task 6 (`moveValidator.ts`) and Task 9 (`voiceController.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/chess/moveParser.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseMove } from "./moveParser";

describe("parseMove", () => {
  it("parses a simple piece move", () => {
    expect(parseMove("Knight to f3")).toEqual({
      piece: "n",
      target: "f3",
      capture: false,
    });
  });

  it("defaults to pawn when no piece is named", () => {
    expect(parseMove("Pawn to e4")).toEqual({
      piece: "p",
      target: "e4",
      capture: false,
    });
  });

  it("detects a capture", () => {
    expect(parseMove("Queen takes d5")).toEqual({
      piece: "q",
      target: "d5",
      capture: true,
    });
  });

  it("detects kingside castling by default", () => {
    expect(parseMove("Castle kingside")).toEqual({
      piece: "k",
      target: "",
      capture: false,
      castle: "kingside",
    });
  });

  it("detects queenside castling", () => {
    expect(parseMove("Castle queenside")).toEqual({
      piece: "k",
      target: "",
      capture: false,
      castle: "queenside",
    });
    expect(parseMove("Castle long")).toEqual({
      piece: "k",
      target: "",
      capture: false,
      castle: "queenside",
    });
  });

  it("detects promotion named after the target square", () => {
    expect(parseMove("e8 queen")).toEqual({
      piece: "p",
      target: "e8",
      capture: false,
      promotion: "q",
    });
  });

  it("merges a spoken-out file letter and rank digit into a square", () => {
    expect(parseMove("knight to bee four")).toEqual({
      piece: "n",
      target: "b4",
      capture: false,
    });
  });

  it("fuzzy-corrects a garbled piece name", () => {
    expect(parseMove("knght to f3")).toEqual({
      piece: "n",
      target: "f3",
      capture: false,
    });
  });

  it("corrects night to knight", () => {
    expect(parseMove("night to f3")).toEqual({
      piece: "n",
      target: "f3",
      capture: false,
    });
  });

  it("returns null when no square can be found", () => {
    expect(parseMove("hello there")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/chess/moveParser.test.ts`
Expected: FAIL (old implementation doesn't detect promotion, doesn't merge spoken squares, doesn't fuzzy-correct)

- [ ] **Step 3: Implement it**

Replace the full contents of `src/chess/moveParser.ts`:

```ts
import { applyPhoneticCorrections } from "./phoneticMap";
import { closestMatch } from "./textMatch";

export interface ParsedMove {
  piece: "p" | "n" | "b" | "r" | "q" | "k";
  target: string;
  capture: boolean;
  castle?: "kingside" | "queenside";
  promotion?: "q" | "r" | "b" | "n";
}

const PIECE_ALIASES: Record<ParsedMove["piece"], string[]> = {
  p: ["pawn", "pawns"],
  n: ["knight", "knights"],
  b: ["bishop", "bishops"],
  r: ["rook", "rooks"],
  q: ["queen", "queens"],
  k: ["king", "kings"],
};

const PROMOTION_ALIASES: Record<"q" | "r" | "b" | "n", string[]> = {
  q: ["queen", "queens"],
  r: ["rook", "rooks"],
  b: ["bishop", "bishops"],
  n: ["knight", "knights"],
};

const CAPTURE_WORDS = [
  "capture",
  "captures",
  "capturing",
  "take",
  "takes",
  "taking",
];
const CASTLE_WORDS = ["castle", "castling"];
const QUEENSIDE_WORDS = ["queenside", "long"];
const KINGSIDE_WORDS = ["kingside", "short"];

const VOCABULARY = [
  ...Object.values(PIECE_ALIASES).flat(),
  ...CAPTURE_WORDS,
  ...CASTLE_WORDS,
  ...QUEENSIDE_WORDS,
  ...KINGSIDE_WORDS,
];

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function isSquare(token: string): boolean {
  return /^[a-h][1-8]$/.test(token);
}

function correctToken(token: string): string {
  if (VOCABULARY.includes(token)) return token;
  if (isSquare(token)) return token;
  if (/^[a-h]$/.test(token) || /^[1-8]$/.test(token)) return token;

  return closestMatch(token, VOCABULARY, 2) ?? token;
}

function mergeSquareTokens(tokens: string[]): string[] {
  const merged: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const current = tokens[i];
    const next = tokens[i + 1];

    if (/^[a-h]$/.test(current) && next && /^[1-8]$/.test(next)) {
      merged.push(current + next);
      i++;
      continue;
    }

    merged.push(current);
  }

  return merged;
}

export function parseMove(text: string): ParsedMove | null {
  const rawTokens = tokenize(text);
  const phoneticTokens = applyPhoneticCorrections(rawTokens);
  const correctedTokens = phoneticTokens.map(correctToken);
  const tokens = mergeSquareTokens(correctedTokens);

  const hasAny = (words: string[]) => tokens.some((t) => words.includes(t));

  if (hasAny(CASTLE_WORDS)) {
    const castle = hasAny(QUEENSIDE_WORDS) ? "queenside" : "kingside";
    return { piece: "k", target: "", capture: false, castle };
  }

  const targetIndex = tokens.findIndex(isSquare);
  if (targetIndex === -1) return null;
  const target = tokens[targetIndex];

  const beforeTarget = tokens.slice(0, targetIndex);
  const afterTarget = tokens.slice(targetIndex + 1);

  let piece: ParsedMove["piece"] = "p";
  for (const [symbol, aliases] of Object.entries(PIECE_ALIASES)) {
    if (beforeTarget.some((t) => aliases.includes(t))) {
      piece = symbol as ParsedMove["piece"];
      break;
    }
  }

  const capture = hasAny(CAPTURE_WORDS);

  let promotion: ParsedMove["promotion"] | undefined;
  for (const [symbol, aliases] of Object.entries(PROMOTION_ALIASES)) {
    if (afterTarget.some((t) => aliases.includes(t))) {
      promotion = symbol as ParsedMove["promotion"];
      break;
    }
  }

  return promotion
    ? { piece, target, capture, promotion }
    : { piece, target, capture };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chess/moveParser.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chess/moveParser.ts src/chess/moveParser.test.ts
git commit -m "feat: rewrite move parser as grammar + fuzzy/phonetic correction"
```

---

### Task 6: Update move resolution (capture filter, castling, promotion)

**Files:**
- Modify: `src/chess/moveValidator.ts` (full rewrite)
- Test: `src/chess/moveValidator.test.ts`

**Interfaces:**
- Consumes: `ParsedMove` type from `./moveParser` (Task 5).
- Produces: `interface ResolvedMove { from: string; to: string; promotion?: "q"|"r"|"b"|"n"; }` and `resolveMove(chess: Chess, parsed: ParsedMove): ResolvedMove[]` — used by Task 9 (`voiceController.ts`).

- [ ] **Step 1: Write the failing tests**

Create `src/chess/moveValidator.test.ts`:

```ts
import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { resolveMove } from "./moveValidator";

describe("resolveMove", () => {
  it("resolves a single matching move", () => {
    const chess = new Chess();

    const result = resolveMove(chess, {
      piece: "n",
      target: "f3",
      capture: false,
    });

    expect(result).toEqual([{ from: "g1", to: "f3", promotion: undefined }]);
  });

  it("returns multiple candidates when the piece+target is ambiguous", () => {
    const chess = new Chess("4k3/8/8/8/8/8/8/1N1N2K1 w - - 0 1");

    const result = resolveMove(chess, {
      piece: "n",
      target: "c3",
      capture: false,
    });

    expect(result).toHaveLength(2);
    expect(result.map((m) => m.from).sort()).toEqual(["b1", "d1"]);
  });

  it("resolves kingside castling", () => {
    const chess = new Chess(
      "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4"
    );

    const result = resolveMove(chess, {
      piece: "k",
      target: "",
      capture: false,
      castle: "kingside",
    });

    expect(result).toEqual([{ from: "e1", to: "g1", promotion: undefined }]);
  });

  it("returns no candidates for castling when it isn't legal", () => {
    const chess = new Chess();

    const result = resolveMove(chess, {
      piece: "k",
      target: "",
      capture: false,
      castle: "kingside",
    });

    expect(result).toEqual([]);
  });

  it("filters to a promotion piece", () => {
    const chess = new Chess("8/P7/8/8/8/8/8/k1K5 w - - 0 1");

    const result = resolveMove(chess, {
      piece: "p",
      target: "a8",
      capture: false,
      promotion: "q",
    });

    expect(result).toEqual([{ from: "a7", to: "a8", promotion: "q" }]);
  });

  it("prefers capturing candidates when a capture was heard", () => {
    const chess = new Chess();
    chess.load("rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2");

    const result = resolveMove(chess, {
      piece: "p",
      target: "d5",
      capture: true,
    });

    expect(result).toEqual([{ from: "e4", to: "d5", promotion: undefined }]);
  });

  it("returns an empty array when nothing matches", () => {
    const chess = new Chess();

    const result = resolveMove(chess, {
      piece: "q",
      target: "e5",
      capture: false,
    });

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/chess/moveValidator.test.ts`
Expected: FAIL (castling currently always returns `[]`, capture/promotion aren't used)

- [ ] **Step 3: Implement it**

Replace the full contents of `src/chess/moveValidator.ts`:

```ts
import type { Chess } from "chess.js";
import type { ParsedMove } from "./moveParser";

export interface ResolvedMove {
  from: string;
  to: string;
  promotion?: "q" | "r" | "b" | "n";
}

export function resolveMove(
  chess: Chess,
  parsed: ParsedMove
): ResolvedMove[] {
  const legalMoves = chess.moves({ verbose: true });

  if (parsed.castle) {
    const flag = parsed.castle === "queenside" ? "q" : "k";

    return legalMoves
      .filter((move) => move.piece === "k" && move.flags.includes(flag))
      .map((move) => ({ from: move.from, to: move.to, promotion: undefined }));
  }

  let candidates = legalMoves.filter(
    (move) => move.piece === parsed.piece && move.to === parsed.target
  );

  if (parsed.capture) {
    const capturing = candidates.filter((move) => move.flags.includes("c"));
    if (capturing.length > 0) {
      candidates = capturing;
    }
  }

  if (parsed.promotion) {
    candidates = candidates.filter(
      (move) => move.promotion === parsed.promotion
    );
  }

  return candidates.map((move) => ({
    from: move.from,
    to: move.to,
    promotion: move.promotion as "q" | "r" | "b" | "n" | undefined,
  }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/chess/moveValidator.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/chess/moveValidator.ts src/chess/moveValidator.test.ts
git commit -m "feat: resolve castling/capture/promotion in move validator"
```

---

### Task 7: Bridge protocol + MAIN-world page bridge

This is the piece that actually talks to chess.com's board. It runs in the page's own JS realm (declared via manifest `"world": "MAIN"` in Task 11) rather than the content script's isolated world, because chess.com's board component may use native private class fields internally — those throw a `TypeError` if accessed from a different JS realm even though the DOM element itself is shared, so isolated-world direct access isn't reliable. Communication with the isolated-world overlay happens over `window.postMessage`.

**Files:**
- Create: `src/content/bridgeProtocol.ts`
- Create: `src/content/pageBridge.ts`
- Test: `src/content/pageBridge.test.ts`

**Interfaces:**
- Produces: `BRIDGE_CHANNEL: string`, `BridgeRequest`, `BridgeResponse`, `isBridgeResponse(data: unknown): data is BridgeResponse` from `bridgeProtocol.ts` — used by Task 8 (`boardBridge.ts`). `handleBridgeRequest(game, request): BridgeResponse` and `findBoardGame(): ChessComGame | null` from `pageBridge.ts`.

- [ ] **Step 1: Write the protocol types (no test needed — pure types + one type guard, covered by Step 3's test)**

Create `src/content/bridgeProtocol.ts`:

```ts
export const BRIDGE_CHANNEL = "voice-chess-bridge";

export interface BoardStatePayload {
  fen: string;
  gameOver: boolean;
}

export type BridgeRequest =
  | { channel: typeof BRIDGE_CHANNEL; id: string; type: "GET_STATE" }
  | {
      channel: typeof BRIDGE_CHANNEL;
      id: string;
      type: "PLAY_MOVE";
      from: string;
      to: string;
      promotion?: "q" | "r" | "b" | "n";
    };

export type BridgeResponse =
  | ({
      channel: typeof BRIDGE_CHANNEL;
      id: string;
      ok: true;
    } & BoardStatePayload)
  | { channel: typeof BRIDGE_CHANNEL; id: string; ok: false; error: string };

export function isBridgeResponse(data: unknown): data is BridgeResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === BRIDGE_CHANNEL &&
    typeof (data as { id?: unknown }).id === "string"
  );
}
```

- [ ] **Step 2: Write the failing test for the request handler**

Create `src/content/pageBridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BRIDGE_CHANNEL } from "./bridgeProtocol";
import { handleBridgeRequest } from "./pageBridge";

describe("handleBridgeRequest", () => {
  it("returns board state for GET_STATE", () => {
    const game = {
      getFEN: () => "8/8/8/8/8/8/8/8 w - - 0 1",
      isGameOver: () => false,
      move: vi.fn(),
    };

    const result = handleBridgeRequest(game, {
      channel: BRIDGE_CHANNEL,
      id: "req-1",
      type: "GET_STATE",
    });

    expect(result).toEqual({
      channel: BRIDGE_CHANNEL,
      id: "req-1",
      ok: true,
      fen: "8/8/8/8/8/8/8/8 w - - 0 1",
      gameOver: false,
    });
  });

  it("plays a move and returns the updated state", () => {
    const move = vi.fn();
    const game = {
      getFEN: () => "8/8/8/8/4P3/8/8/8 b - - 0 1",
      isGameOver: () => false,
      move,
    };

    const result = handleBridgeRequest(game, {
      channel: BRIDGE_CHANNEL,
      id: "req-2",
      type: "PLAY_MOVE",
      from: "e2",
      to: "e4",
    });

    expect(move).toHaveBeenCalledWith({
      from: "e2",
      to: "e4",
      promotion: undefined,
    });
    expect(result.ok).toBe(true);
  });

  it("returns an error when the board API isn't found", () => {
    const result = handleBridgeRequest(null, {
      channel: BRIDGE_CHANNEL,
      id: "req-3",
      type: "GET_STATE",
    });

    expect(result).toEqual({
      channel: BRIDGE_CHANNEL,
      id: "req-3",
      ok: false,
      error: "wc-chess-board API not found on this page.",
    });
  });

  it("returns an error when the board API throws", () => {
    const game = {
      getFEN: () => "8/8/8/8/8/8/8/8 w - - 0 1",
      isGameOver: () => false,
      move: () => {
        throw new Error("illegal move");
      },
    };

    const result = handleBridgeRequest(game, {
      channel: BRIDGE_CHANNEL,
      id: "req-4",
      type: "PLAY_MOVE",
      from: "e2",
      to: "e5",
    });

    expect(result).toEqual({
      channel: BRIDGE_CHANNEL,
      id: "req-4",
      ok: false,
      error: "illegal move",
    });
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `npx vitest run src/content/pageBridge.test.ts`
Expected: FAIL — `Cannot find module './pageBridge'`

- [ ] **Step 4: Implement it**

Create `src/content/pageBridge.ts`:

```ts
import {
  BRIDGE_CHANNEL,
  type BridgeRequest,
  type BridgeResponse,
} from "./bridgeProtocol";

export interface ChessComGame {
  getFEN(): string;
  isGameOver(): boolean;
  move(move: { from: string; to: string; promotion?: string }): unknown;
}

interface ChessComBoardElement extends Element {
  game?: ChessComGame;
}

export function findBoardGame(): ChessComGame | null {
  const board = document.querySelector<ChessComBoardElement>(
    "wc-chess-board"
  );
  return board?.game ?? null;
}

export function handleBridgeRequest(
  game: ChessComGame | null,
  request: BridgeRequest
): BridgeResponse {
  if (!game) {
    return {
      channel: BRIDGE_CHANNEL,
      id: request.id,
      ok: false,
      error: "wc-chess-board API not found on this page.",
    };
  }

  try {
    if (request.type === "PLAY_MOVE") {
      game.move({
        from: request.from,
        to: request.to,
        promotion: request.promotion,
      });
    }

    return {
      channel: BRIDGE_CHANNEL,
      id: request.id,
      ok: true,
      fen: game.getFEN(),
      gameOver: game.isGameOver(),
    };
  } catch (error) {
    return {
      channel: BRIDGE_CHANNEL,
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown board error.",
    };
  }
}

window.addEventListener("message", (event: MessageEvent) => {
  if (event.source !== window) return;

  const data = event.data as Partial<BridgeRequest> | undefined;
  if (!data || data.channel !== BRIDGE_CHANNEL) return;

  const response = handleBridgeRequest(
    findBoardGame(),
    data as BridgeRequest
  );
  window.postMessage(response, "*");
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/content/pageBridge.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/content/bridgeProtocol.ts src/content/pageBridge.ts src/content/pageBridge.test.ts
git commit -m "feat: add MAIN-world page bridge to chess.com's board API"
```

---

### Task 8: Isolated-world board bridge client

**Files:**
- Create: `src/content/boardBridge.ts`
- Test: `src/content/boardBridge.test.ts`

**Interfaces:**
- Consumes: `BRIDGE_CHANNEL`, `isBridgeResponse`, `BridgeResponse` from `./bridgeProtocol` (Task 7).
- Produces: `interface BoardState { fen: string; turn: "w"|"b"; gameOver: boolean; }`, `getBoardState(): Promise<BoardState>`, `playMove(from: string, to: string, promotion?: "q"|"r"|"b"|"n"): Promise<BoardState>` — used by Task 9 (`voiceController.ts` consumes the types) and Task 10 (`overlay.ts` calls these directly).

- [ ] **Step 1: Write the failing tests**

Create `src/content/boardBridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { BRIDGE_CHANNEL } from "./bridgeProtocol";
import { getBoardState, playMove } from "./boardBridge";

function respondToNextRequest(
  build: (id: string) => Record<string, unknown>
) {
  const spy = vi
    .spyOn(window, "postMessage")
    .mockImplementation((message: unknown) => {
      spy.mockRestore();
      const id = (message as { id: string }).id;
      queueMicrotask(() => {
        window.dispatchEvent(
          new MessageEvent("message", { data: build(id), source: window })
        );
      });
    });
}

describe("boardBridge", () => {
  it("resolves board state from a successful GET_STATE response", async () => {
    respondToNextRequest((id) => ({
      channel: BRIDGE_CHANNEL,
      id,
      ok: true,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      gameOver: false,
    }));

    const state = await getBoardState();

    expect(state.turn).toBe("b");
    expect(state.gameOver).toBe(false);
  });

  it("resolves the updated state after playing a move", async () => {
    respondToNextRequest((id) => ({
      channel: BRIDGE_CHANNEL,
      id,
      ok: true,
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
      gameOver: false,
    }));

    const state = await playMove("e2", "e4");

    expect(state.fen).toContain("4P3");
    expect(state.turn).toBe("b");
  });

  it("rejects with the bridge error message on failure", async () => {
    respondToNextRequest((id) => ({
      channel: BRIDGE_CHANNEL,
      id,
      ok: false,
      error: "wc-chess-board API not found on this page.",
    }));

    await expect(playMove("e2", "e4")).rejects.toThrow(
      "wc-chess-board API not found on this page."
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/content/boardBridge.test.ts`
Expected: FAIL — `Cannot find module './boardBridge'`

- [ ] **Step 3: Implement it**

Create `src/content/boardBridge.ts`:

```ts
import {
  BRIDGE_CHANNEL,
  isBridgeResponse,
  type BridgeResponse,
} from "./bridgeProtocol";

export interface BoardState {
  fen: string;
  turn: "w" | "b";
  gameOver: boolean;
}

function turnFromFen(fen: string): "w" | "b" {
  return fen.split(" ")[1] === "b" ? "b" : "w";
}

function toBoardState(
  response: Extract<BridgeResponse, { ok: true }>
): BoardState {
  return {
    fen: response.fen,
    turn: turnFromFen(response.fen),
    gameOver: response.gameOver,
  };
}

let requestCounter = 0;

type OutgoingRequest =
  | { type: "GET_STATE" }
  | {
      type: "PLAY_MOVE";
      from: string;
      to: string;
      promotion?: "q" | "r" | "b" | "n";
    };

function sendBridgeRequest(
  request: OutgoingRequest,
  timeoutMs = 2000
): Promise<BoardState> {
  const id = `req-${Date.now()}-${requestCounter++}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Board bridge timed out waiting for a response."));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (!isBridgeResponse(event.data) || event.data.id !== id) return;

      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);

      if (event.data.ok) {
        resolve(toBoardState(event.data));
      } else {
        reject(new Error(event.data.error));
      }
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ channel: BRIDGE_CHANNEL, id, ...request }, "*");
  });
}

export function getBoardState(): Promise<BoardState> {
  return sendBridgeRequest({ type: "GET_STATE" });
}

export function playMove(
  from: string,
  to: string,
  promotion?: "q" | "r" | "b" | "n"
): Promise<BoardState> {
  return sendBridgeRequest({ type: "PLAY_MOVE", from, to, promotion });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/content/boardBridge.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/content/boardBridge.ts src/content/boardBridge.test.ts
git commit -m "feat: add isolated-world board bridge client"
```

---

### Task 9: Voice command interpreter (pure logic)

Decides what a recognized transcript should do — play a move, ask for disambiguation, or report an error — without touching the DOM, Chrome APIs, or speech recognition directly, so it can be fully unit tested.

**Files:**
- Create: `src/content/voiceController.ts`
- Test: `src/content/voiceController.test.ts`

**Interfaces:**
- Consumes: `parseMove(text: string): ParsedMove | null` from `../chess/moveParser` (Task 5); `resolveMove(chess: Chess, parsed: ParsedMove): ResolvedMove[]` and `ResolvedMove` from `../chess/moveValidator` (Task 6); `Chess` from `chess.js`.
- Produces: `type VoiceCommandResult = { kind: "PLAY"; move: ResolvedMove } | { kind: "ASK_DISAMBIGUATION"; candidates: ResolvedMove[] } | { kind: "ERROR"; message: string }`, `interface PendingDisambiguation { candidates: ResolvedMove[] }`, `interpretTranscript(transcript: string, fen: string, pending: PendingDisambiguation | null): VoiceCommandResult`, and `interpretTranscripts(transcripts: string[], fen: string, pending: PendingDisambiguation | null): VoiceCommandResult` — used by Task 10 (`overlay.ts`). `interpretTranscripts` implements the spec's "multiple-alternative retry": Web Speech API can return several candidate transcripts per utterance (`maxAlternatives`), and this tries each in order, returning the first one that resolves to an unambiguous legal move.

- [ ] **Step 1: Write the failing tests**

Create `src/content/voiceController.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { interpretTranscript, interpretTranscripts } from "./voiceController";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TWO_KNIGHTS_FEN = "4k3/8/8/8/8/8/8/1N1N2K1 w - - 0 1";

describe("interpretTranscript", () => {
  it("plays a move when exactly one legal move matches", () => {
    const result = interpretTranscript("knight to f3", START_FEN, null);

    expect(result).toEqual({
      kind: "PLAY",
      move: { from: "g1", to: "f3", promotion: undefined },
    });
  });

  it("asks for disambiguation when multiple legal moves match", () => {
    const result = interpretTranscript("knight to c3", TWO_KNIGHTS_FEN, null);

    expect(result.kind).toBe("ASK_DISAMBIGUATION");
    if (result.kind === "ASK_DISAMBIGUATION") {
      expect(result.candidates.map((c) => c.from).sort()).toEqual([
        "b1",
        "d1",
      ]);
    }
  });

  it("resolves a pending disambiguation by source square", () => {
    const pending = {
      candidates: [
        { from: "b1", to: "c3", promotion: undefined },
        { from: "d1", to: "c3", promotion: undefined },
      ],
    };

    const result = interpretTranscript("d1", TWO_KNIGHTS_FEN, pending);

    expect(result).toEqual({
      kind: "PLAY",
      move: { from: "d1", to: "c3", promotion: undefined },
    });
  });

  it("re-prompts when the disambiguation answer doesn't match a candidate", () => {
    const pending = {
      candidates: [
        { from: "b1", to: "c3", promotion: undefined },
        { from: "d1", to: "c3", promotion: undefined },
      ],
    };

    const result = interpretTranscript("f1", TWO_KNIGHTS_FEN, pending);

    expect(result.kind).toBe("ERROR");
  });

  it("reports an error for unrecognized speech", () => {
    const result = interpretTranscript("hello there", START_FEN, null);

    expect(result.kind).toBe("ERROR");
  });

  it("reports an error for a move with no legal match", () => {
    const result = interpretTranscript("queen to e5", START_FEN, null);

    expect(result.kind).toBe("ERROR");
  });
});

describe("interpretTranscripts", () => {
  it("uses the first alternative that resolves to a legal move", () => {
    const result = interpretTranscripts(
      ["knght to f3", "knight to f3"],
      START_FEN,
      null
    );

    expect(result).toEqual({
      kind: "PLAY",
      move: { from: "g1", to: "f3", promotion: undefined },
    });
  });

  it("skips an alternative that fails to resolve and uses the next one", () => {
    const result = interpretTranscripts(
      ["hello there", "pawn to e4"],
      START_FEN,
      null
    );

    expect(result).toEqual({
      kind: "PLAY",
      move: { from: "e2", to: "e4", promotion: undefined },
    });
  });

  it("falls back to the first alternative's result when none resolve", () => {
    const result = interpretTranscripts(
      ["hello there", "also nonsense"],
      START_FEN,
      null
    );

    expect(result.kind).toBe("ERROR");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/content/voiceController.test.ts`
Expected: FAIL — `Cannot find module './voiceController'`

- [ ] **Step 3: Implement it**

Create `src/content/voiceController.ts`:

```ts
import { Chess } from "chess.js";
import { parseMove } from "../chess/moveParser";
import { resolveMove, type ResolvedMove } from "../chess/moveValidator";

export type VoiceCommandResult =
  | { kind: "PLAY"; move: ResolvedMove }
  | { kind: "ASK_DISAMBIGUATION"; candidates: ResolvedMove[] }
  | { kind: "ERROR"; message: string };

export interface PendingDisambiguation {
  candidates: ResolvedMove[];
}

function describeCandidate(move: ResolvedMove): string {
  return move.from;
}

export function interpretTranscript(
  transcript: string,
  fen: string,
  pending: PendingDisambiguation | null
): VoiceCommandResult {
  if (pending) {
    const squareMatch = transcript.toLowerCase().match(/\b([a-h][1-8])\b/);

    if (squareMatch) {
      const chosen = pending.candidates.filter(
        (move) => move.from === squareMatch[1]
      );

      if (chosen.length === 1) {
        return { kind: "PLAY", move: chosen[0] };
      }
    }

    return {
      kind: "ERROR",
      message: `Please say the square the piece is on: ${pending.candidates
        .map(describeCandidate)
        .join(" or ")}`,
    };
  }

  const parsed = parseMove(transcript);
  if (!parsed) {
    return {
      kind: "ERROR",
      message: `I couldn't understand "${transcript}".`,
    };
  }

  const chess = new Chess();
  chess.load(fen);

  const candidates = resolveMove(chess, parsed);

  if (candidates.length === 0) {
    return {
      kind: "ERROR",
      message: `"${transcript}" isn't a legal move.`,
    };
  }

  if (candidates.length === 1) {
    return { kind: "PLAY", move: candidates[0] };
  }

  return { kind: "ASK_DISAMBIGUATION", candidates };
}

export function interpretTranscripts(
  transcripts: string[],
  fen: string,
  pending: PendingDisambiguation | null
): VoiceCommandResult {
  let firstResult: VoiceCommandResult | null = null;

  for (const transcript of transcripts) {
    const result = interpretTranscript(transcript, fen, pending);

    if (!firstResult) {
      firstResult = result;
    }

    if (result.kind === "PLAY") {
      return result;
    }
  }

  return (
    firstResult ?? {
      kind: "ERROR",
      message: "I couldn't understand that.",
    }
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/content/voiceController.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/content/voiceController.ts src/content/voiceController.test.ts
git commit -m "feat: add pure voice-command interpreter with disambiguation"
```

---

### Task 10: Multi-alternative speech results + in-page overlay UI

Two parts: first, extend `SpeechRecognizer` to request and forward multiple candidate transcripts per utterance (the spec's "multiple-alternative retry" — Web Speech API can return several guesses per utterance ranked by confidence, and trying each against the grammar catches cases where the top guess is garbled but a lower-ranked one parses cleanly). Second, mount a persistent floating mic button on chess.com (shadow DOM, so chess.com's styles can't leak in) that owns the updated `SpeechRecognizer` and wires it through `voiceController` and `boardBridge`. The overlay itself is DOM/browser-only code, verified manually in Task 12; the `SpeechRecognizer` change gets its own unit test since it's now non-trivial logic.

**Files:**
- Modify: `src/voice/speechRecognizer.ts`
- Test: `src/voice/speechRecognizer.test.ts`
- Create: `src/content/overlay.ts`
- Create: `src/content/main.ts`

**Interfaces:**
- Consumes: `getBoardState`, `playMove` from `./boardBridge` (Task 8); `interpretTranscripts`, `PendingDisambiguation` from `./voiceController` (Task 9).
- Produces: `SpeechRecognizer` now calls `onResult` with `SpeechResult[]` (was a single `SpeechResult`) and sets `maxAlternatives = 3`. `mountOverlay(): void` — called by `main.ts`, which is the isolated-world content script entry point declared in `manifest.json` (Task 11).

- [ ] **Step 1: Write the failing test for multi-alternative results**

Create `src/voice/speechRecognizer.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { SpeechRecognizer } from "./speechRecognizer";

class FakeSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  maxAlternatives = 1;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

describe("SpeechRecognizer", () => {
  it("requests multiple alternatives and forwards them all, in order", () => {
    const instances: FakeSpeechRecognition[] = [];
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      vi.fn(() => {
        const instance = new FakeSpeechRecognition();
        instances.push(instance);
        return instance;
      });

    const onResult = vi.fn();
    const recognizer = new SpeechRecognizer(onResult, vi.fn());
    recognizer.start();

    const instance = instances[0];
    expect(instance.maxAlternatives).toBe(3);

    instance.onresult?.({
      results: [
        [
          { transcript: "knight to f3", confidence: 0.9 },
          { transcript: "night to f3", confidence: 0.4 },
        ],
      ],
    });

    expect(onResult).toHaveBeenCalledWith([
      { transcript: "knight to f3", confidence: 0.9 },
      { transcript: "night to f3", confidence: 0.4 },
    ]);

    delete (window as unknown as { SpeechRecognition?: unknown })
      .SpeechRecognition;
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/voice/speechRecognizer.test.ts`
Expected: FAIL — `onResult` is currently called with a single object, not an array.

- [ ] **Step 3: Update `SpeechRecognizer` to forward multiple alternatives**

In `src/voice/speechRecognizer.ts`, change:

```ts
type SpeechCallback = (result: SpeechResult) => void;
```

to:

```ts
type SpeechCallback = (results: SpeechResult[]) => void;
```

Add `this.recognition.maxAlternatives = 3;` right after `this.recognition.lang = "en-US";` in the constructor.

Replace the `onresult` handler:

```ts
    this.recognition.onresult = (event: any) => {
      const result = event.results[0][0];

      this.onResult({
        transcript: result.transcript,
        confidence: result.confidence,
      });

      this.listening = false;
    };
```

with:

```ts
    this.recognition.onresult = (event: any) => {
      const alternatives = event.results[0];
      const results: SpeechResult[] = [];

      for (let i = 0; i < alternatives.length; i++) {
        results.push({
          transcript: alternatives[i].transcript,
          confidence: alternatives[i].confidence,
        });
      }

      this.onResult(results);
      this.listening = false;
    };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/voice/speechRecognizer.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/voice/speechRecognizer.ts src/voice/speechRecognizer.test.ts
git commit -m "feat: request and forward multiple speech recognition alternatives"
```

- [ ] **Step 6: Implement the overlay**

Create `src/content/overlay.ts`:

```ts
import { SpeechRecognizer } from "../voice/speechRecognizer";
import { getBoardState, playMove } from "./boardBridge";
import {
  interpretTranscripts,
  type PendingDisambiguation,
} from "./voiceController";

const HOST_ID = "voice-chess-overlay-host";

export function mountOverlay(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.style.position = "fixed";
  host.style.bottom = "24px";
  host.style.right = "24px";
  host.style.zIndex = "999999";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    .panel {
      font-family: Arial, sans-serif;
      background: #1e1e1e;
      color: #fff;
      border-radius: 12px;
      padding: 12px 16px;
      width: 260px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    }
    .mic {
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      background: #4caf50;
      color: #fff;
    }
    .mic.listening {
      background: #e53935;
    }
    .status {
      margin-top: 8px;
      font-size: 12px;
      min-height: 32px;
      white-space: pre-wrap;
    }
  `;
  shadow.appendChild(style);

  const panel = document.createElement("div");
  panel.className = "panel";

  const button = document.createElement("button");
  button.className = "mic";
  button.textContent = "\u{1F399} Speak Move";

  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "Ready";

  panel.appendChild(button);
  panel.appendChild(status);
  shadow.appendChild(panel);

  let pending: PendingDisambiguation | null = null;

  const setStatus = (text: string) => {
    status.textContent = text;
  };

  const setListening = (listening: boolean) => {
    button.classList.toggle("listening", listening);
    button.textContent = listening ? "⏹ Stop" : "\u{1F399} Speak Move";
  };

  let recognizer: SpeechRecognizer;

  try {
    recognizer = new SpeechRecognizer(
      async (results) => {
        setListening(false);
        setStatus(`Heard: "${results[0].transcript}"`);

        try {
          const boardState = await getBoardState();
          const outcome = interpretTranscripts(
            results.map((r) => r.transcript),
            boardState.fen,
            pending
          );

          if (outcome.kind === "PLAY") {
            pending = null;
            await playMove(
              outcome.move.from,
              outcome.move.to,
              outcome.move.promotion
            );
            setStatus(`Played ${outcome.move.from} to ${outcome.move.to}`);
          } else if (outcome.kind === "ASK_DISAMBIGUATION") {
            pending = { candidates: outcome.candidates };
            setStatus(
              `Which one? ${outcome.candidates
                .map((m) => m.from)
                .join(" or ")}`
            );
          } else {
            pending = null;
            setStatus(outcome.message);
          }
        } catch (error) {
          setStatus(error instanceof Error ? error.message : "Board error.");
        }
      },
      (error) => {
        setListening(false);
        setStatus(`Speech error: ${error}`);
      }
    );
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : "Speech recognition is not supported in this browser."
    );
    button.disabled = true;
    return;
  }

  button.addEventListener("click", () => {
    if (recognizer.isListening()) {
      recognizer.stop();
      setListening(false);
    } else {
      setStatus("Listening...");
      setListening(true);
      recognizer.start();
    }
  });
}
```

- [ ] **Step 7: Implement the isolated-world entry point**

Create `src/content/main.ts`:

```ts
import { mountOverlay } from "./overlay";

mountOverlay();
```

- [ ] **Step 8: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/content/overlay.ts src/content/main.ts
git commit -m "feat: add in-page voice overlay for chess.com"
```

---

### Task 11: Manifest, popup, and final cleanup

Wires the two new content scripts into `manifest.json`, removes the now-superseded background/relay code, trims the popup to a short instructional panel, and removes leftover dead files.

**Files:**
- Modify: `manifest.json`
- Delete: `src/background/background.ts`
- Delete: `src/content/content.ts`
- Delete: `src/popup/main.tsx` (unreferenced — `index.html` loads `src/main.tsx`, not this file)
- Modify: `src/popup/Popup.tsx` (full rewrite)

**Interfaces:**
- Produces: a clean `npm run build` whose `dist/manifest.json` declares both content scripts and no `background` key.

- [ ] **Step 1: Update the manifest**

Replace the full contents of `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Voice Chess",
  "version": "0.1.0",
  "description": "Control Chess.com using voice commands.",
  "host_permissions": [
    "https://www.chess.com/*"
  ],
  "action": {
    "default_popup": "index.html",
    "default_title": "Voice Chess"
  },
  "content_scripts": [
    {
      "matches": [
        "https://www.chess.com/play/*",
        "https://www.chess.com/game/*"
      ],
      "js": ["src/content/pageBridge.ts"],
      "world": "MAIN",
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://www.chess.com/play/*",
        "https://www.chess.com/game/*"
      ],
      "js": ["src/content/main.ts"],
      "run_at": "document_idle"
    }
  ]
}
```

(Dropped the unused `storage` permission and the `background` key — nothing uses `chrome.storage` or the service worker anymore.)

- [ ] **Step 2: Delete the superseded background/relay files**

```bash
git rm src/background/background.ts src/content/content.ts src/popup/main.tsx
```

- [ ] **Step 3: Rewrite the popup as a short instructional panel**

Replace the full contents of `src/popup/Popup.tsx`:

```tsx
function Popup() {
  return (
    <div className="popup">
      <h2>♟ Voice Chess</h2>
      <p>
        Open a game on chess.com (Play vs Computer, or a live game). Look for
        the floating mic button in the bottom-right corner of the page.
      </p>
      <p>
        Click it and say a move, like "knight to f3" or "pawn takes e5". For
        castling, say "castle kingside" or "castle queenside".
      </p>
      <p>
        This is a voice-input accessibility tool for practice and casual
        play — it plays exactly the move you say, with no move suggestions.
      </p>
    </div>
  );
}

export default Popup;
```

- [ ] **Step 4: Verify the full build**

Run: `npm run build`
Expected: `tsc -b` succeeds, `vite build` succeeds, `dist/manifest.json` contains two `content_scripts` entries (one with `"world": "MAIN"`) and no `background` key.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests across every file pass.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: wire content scripts into manifest, trim popup, remove background relay"
```

---

### Task 12: Manual QA on chess.com

Automated tests cover the parsing/resolution/messaging logic; this task verifies the real end-to-end flow, which needs an actual browser with the unpacked extension loaded and a real microphone.

**Files:** none (verification only).

- [ ] **Step 1: Load the unpacked extension**

Run `npm run build`, then in Chrome go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", and select the `dist/` folder.

- [ ] **Step 2: Start a bot game**

Go to `https://www.chess.com/play/computer`, start any bot game. Confirm the floating mic panel appears in the bottom-right corner.

- [ ] **Step 3: Play a normal move**

Click the mic button, allow microphone access when Chrome prompts (first time only — tied to the chess.com origin), say "pawn to e4". Confirm the move lands on the real board and the status line shows "Played e2 to e4".

- [ ] **Step 4: Verify state sync after the opponent replies**

After the bot replies, say a second move (e.g. "knight to f3"). Confirm it resolves against the position *after* the bot's reply, not the original position.

- [ ] **Step 5: Test castling**

From the game's start, play through to a position where kingside castling is legal (or start a fresh game and play `e4 e5 Nf3 Nc6 Bc4 Bc5`), then say "castle kingside". Confirm the king and rook both move correctly.

- [ ] **Step 6: Test an ambiguous move**

Reach a position where two identical pieces can reach the same square (e.g. both knights developed toward the center), say a command that matches both (e.g. "knight to d2" if two knights can reach d2), confirm the overlay asks "Which one?", then say a source square (e.g. "b1") and confirm the correct piece moves.

- [ ] **Step 7: Test promotion**

Reach a position with a pawn one move from promoting, say e.g. "e8 queen", confirm it promotes to a queen rather than defaulting.

- [ ] **Step 8: Test error paths**

Say something unrelated (e.g. "hello there") and confirm a friendly "couldn't understand" message, not a crash. Say a real move phrase but for a piece that has no legal path to the target and confirm an "isn't a legal move" message.

- [ ] **Step 9: Record findings**

If any step behaves differently than expected (in particular: whether Chrome's mic permission prompt appears reliably for a content-script-injected `SpeechRecognition`, and whether `wc-chess-board`'s API shape holds on a live (non-bot) game page, which wasn't directly tested during planning), note it — this is the one part of the plan validated only by live research on the bot-game page, not by an automated test, so it's the most likely spot for a real-world surprise.
