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
