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
