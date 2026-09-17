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
