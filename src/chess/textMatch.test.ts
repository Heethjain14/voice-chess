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
