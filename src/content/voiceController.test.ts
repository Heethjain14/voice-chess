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

  it("returns error when a pending candidate move is no longer legal on the current board", () => {
    const pending = {
      candidates: [
        { from: "b1", to: "c3", promotion: undefined },
        { from: "d1", to: "c3", promotion: undefined },
      ],
    };

    // FEN where only b1 has a knight; d1 is empty, so d1->c3 is stale
    const staleFEN = "4k3/8/8/8/8/8/8/1N5K w - - 0 1";

    const result = interpretTranscript("d1", staleFEN, pending);

    expect(result.kind).toBe("ERROR");
    if (result.kind === "ERROR") {
      expect(result.message).toContain("no longer available");
    }
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
