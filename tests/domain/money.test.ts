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

  it("accepts commas and surrounding whitespace", () => {
    expect(parseMinor(" 1,234.50 ", 2)).toBe(123450);
  });

  it("rejects fractional precision beyond currency minor units", () => {
    expect(() => parseMinor("1.999", 2)).toThrow("Too many decimal places");
    expect(() => parseMinor("1.9", 0)).toThrow("Too many decimal places");
  });

  it("rejects invalid minor unit metadata", () => {
    expect(() => parseMinor("1.00", -1)).toThrow("Invalid minor units");
    expect(() => formatMinor(100, 9)).toThrow("Invalid minor units");
  });

  it("rejects unsafe integer amounts", () => {
    expect(() => parseMinor("90071992547409.93", 2)).toThrow("exceeds safe integer range");
    expect(() => formatMinor(Number.MAX_SAFE_INTEGER + 1, 2)).toThrow(
      "exceeds safe integer range",
    );
    expect(() => addMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow("exceeds safe integer range");
  });
});
