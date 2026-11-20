// Vakt: Min tid räknar årets övertid med den delade funktionen (lib/lonesystem/minTidArsovertid → beraknaArsovertid), aldrig med en egen loop.
// Förut: `mMålMin = mArbD * 480` per månad i vyn — ett tredje tal bredvid lönens och lagkontrollens (Martin 2026-10-19).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const kalla = readFileSync(new URL("./Arbetsrapport.tsx", import.meta.url), "utf8");

describe("Min tid: ett tal för årets övertid", () => {
  it("använder minTidArsovertid och har ingen egen månadsloop (mMålMin / mArbD * 480)", () => {
    expect(kalla).toContain('from "@/lib/lonesystem/minTidArsovertid"');
    expect(kalla).toMatch(/minTidArsovertid\(\{/);
    expect(kalla).not.toMatch(/mMålMin/);
    expect(kalla).not.toMatch(/mArbD\s*\*\s*480/);
    expect(kalla).not.toMatch(/årsÖvH\s*\+=/);
  });
  it("ger funktionen det den behöver: anställningsdatum, avtalets röda dagar, frånvaro och utjämningsperioder", () => {
    const anrop = kalla.slice(kalla.indexOf("minTidArsovertid({"), kalla.indexOf("minTidArsovertid({") + 700);
    for (const nyckel of ["anstallningsdatum", "helglonNamn", "franvaro:", "utjamning:", "ordinarieVeckaH"]) expect(anrop, nyckel).toContain(nyckel);
  });
});
