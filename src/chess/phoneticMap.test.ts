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
