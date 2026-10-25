import { describe, it, expect } from "vitest";
import { enhetText } from "./pushEnhet";

describe("enhetText", () => {
  it("gör webbläsarens text till ett ord", () => {
    expect(enhetText("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15")).toBe("iPhone");
    expect(enhetText("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X)")).toBe("iPad");
    expect(enhetText("Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36")).toBe("Android-telefon");
    expect(enhetText("Mozilla/5.0 (Linux; Android 14; SM-X700) Safari/537.36")).toBe("Android-platta");
    expect(enhetText("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("Mac");
    expect(enhetText("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows-dator");
  });
  it("visar aldrig den tekniska strängen", () => {
    expect(enhetText("Mozilla/5.0 (X11; FreeBSD amd64)")).toBe("den här enheten");
    expect(enhetText("")).toBe("den här enheten");
    expect(enhetText(null)).toBe("den här enheten");
  });
  it("en kort egen text står kvar", () => {
    expect(enhetText("Denna enhet")).toBe("Denna enhet");
  });
});
