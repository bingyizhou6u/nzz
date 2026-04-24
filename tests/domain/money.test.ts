import { describe, expect, it } from "vitest";
import { addMinor, formatMinor, parseMinor } from "../../src/domain/money";

describe("money helpers", () => {
  it("parses decimal amounts into integer minor units", () => {
    expect(parseMinor("123.45", 2)).toBe(12345);
    expect(parseMinor("-7.01", 2)).toBe(-701);
    expect(parseMinor("300", 0)).toBe(300);
  });

  it("formats integer minor units", () => {
    expect(formatMinor(12345, 2)).toBe("123.45");
    expect(formatMinor(-701, 2)).toBe("-7.01");
    expect(formatMinor(300, 0)).toBe("300");
  });

  it("adds integer minor amounts without floating point drift", () => {
    expect(addMinor([10, 20, -5])).toBe(25);
  });
});
