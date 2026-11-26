import { describe, it, expect } from "vitest";
import { avvikelseVidTidsandring, tidsluckor, luckansSegment, LUCKA_MIN } from "./tidsluckor";

const NU = "2026-11-25T18:00:00.000Z";
const synkDag = { start_tid: "06:30:00", slut_tid: "15:00:00", rast_min: 30, redigerad: false, synk_avvikelse: null };

describe("avvikelseVidTidsandring — appen sparar maskinens tider när föraren ändrar sina", () => {
  it("föraren börjar 05:30 i stället för 06:30: maskinens tider sparas bredvid", () => {
    const r = avvikelseVidTidsandring(synkDag, { start: "05:30", slut: "15:00", rast: 30 }, true, NU);
    expect(r).toEqual({ andra: true, varde: {
      mom_start: "06:30", mom_slut: "15:00", mom_rast_min: 30,
      bekraftad_start: "05:30", bekraftad_slut: "15:00", bekraftad_rast_min: 30,
      upptackt: NU, kalla: "forare",
    } });
  });

  it("tillbaka till maskinens tider: fältet nollas", () => {
    const bef = avvikelseVidTidsandring(synkDag, { start: "05:30", slut: "15:00", rast: 30 }, true, NU);
    if (!bef.andra) throw new Error("väntade en avvikelse");
    const r = avvikelseVidTidsandring({ ...synkDag, start_tid: "05:30:00", redigerad: true, synk_avvikelse: bef.varde }, { start: "06:30", slut: "15:00", rast: 30 }, true);
    expect(r).toEqual({ andra: true, varde: null });
  });

  it("en redigerad dag utan sparad avvikelse: maskinens tider är okända — rör inget", () => {
    expect(avvikelseVidTidsandring({ ...synkDag, redigerad: true }, { start: "05:00", slut: "15:00", rast: 30 }, true)).toEqual({ andra: false });
  });

  it("maskin utan filer (810E): ingen avvikelse", () => {
    expect(avvikelseVidTidsandring(synkDag, { start: "05:00", slut: "15:00", rast: 30 }, false)).toEqual({ andra: false });
  });

  it("samma förartider som redan sparats: kvittensen står kvar", () => {
    const sv = { mom_start: "06:30", mom_slut: "15:00", mom_rast_min: 30, bekraftad_start: "05:30", bekraftad_slut: "15:00", bekraftad_rast_min: 30, kvitterad: "x" };
    expect(avvikelseVidTidsandring({ ...synkDag, redigerad: true, synk_avvikelse: sv }, { start: "05:30", slut: "15:00", rast: 30 }, true)).toEqual({ andra: false });
  });
});

describe("tidsluckor", () => {
  const avv = (bs: string, be: string, ms: string, me: string, extra = {}) => ({ bekraftad_start: bs, bekraftad_slut: be, mom_start: ms, mom_slut: me, ...extra });

  it("före och efter maskinen", () => {
    expect(tidsluckor({ synk_avvikelse: avv("05:30", "16:00", "06:30", "15:00") })).toEqual([
      { start: "05:30", slut: "06:30", minuter: 60 },
      { start: "15:00", slut: "16:00", minuter: 60 },
    ]);
  });

  it(`kortare än ${LUCKA_MIN} min frågas inte`, () => {
    expect(tidsluckor({ synk_avvikelse: avv("06:20", "15:00", "06:30", "15:00") })).toEqual([]);
    expect(tidsluckor({ synk_avvikelse: avv("06:15", "15:00", "06:30", "15:00") })).toHaveLength(1);
  });

  it("hoppad avvikelse frågas inte igen", () => {
    expect(tidsluckor({ synk_avvikelse: avv("05:30", "15:00", "06:30", "15:00", { val: "hoppad" }) })).toEqual([]);
  });

  it("samma lucka från synk och tidigarelagd start = EN fråga", () => {
    expect(tidsluckor({
      synk_avvikelse: avv("05:30", "15:00", "06:30", "15:00"),
      tidigarelagd_start: { angiven_start: "05:30", maskin_start: "06:30" },
    })).toHaveLength(1);
  });

  it("luckans segment = svaret", () => {
    const l = { start: "05:30", slut: "06:30", minuter: 60 };
    expect(luckansSegment(l, [{ start_tid: "05:30:00", slut_tid: "06:30:00" }])).not.toBeNull();
    expect(luckansSegment(l, [{ start_tid: "07:00:00", slut_tid: "08:00:00" }])).toBeNull();
  });
});

import { luckansRest } from "./tidsluckor";
describe("luckansRest — två saker i samma lucka", () => {
  const l = { start: "05:30", slut: "06:30", minuter: 60 };
  it("första halvan svarad: resten är en egen fråga", () => {
    expect(luckansRest(l, [{ start_tid: "05:30:00", slut_tid: "06:00:00" }])).toEqual([{ start: "06:00", slut: "06:30", minuter: 30 }]);
  });
  it("hela svarad: inget kvar", () => {
    expect(luckansRest(l, [{ start_tid: "05:30:00", slut_tid: "06:30:00" }])).toEqual([]);
  });
  it("rest under en kvart frågas inte", () => {
    expect(luckansRest(l, [{ start_tid: "05:30:00", slut_tid: "06:20:00" }])).toEqual([]);
  });
  it("mitten svarad: två rester", () => {
    expect(luckansRest(l, [{ start_tid: "05:45:00", slut_tid: "06:15:00" }]).map(x => x.start)).toEqual(["05:30", "06:15"]);
  });
});

import { forstaVal } from "./mestAnvanda";
describe("forstaVal", () => {
  it("ingen historik = alla", () => { expect(forstaVal({})).toBeNull(); });
  it("sex, i appens ordning", () => {
    const v = forstaVal({ brandkontroll: 5, service: 1 })!;
    expect(v).toHaveLength(6);
    expect(v).toContain("brandkontroll");
    expect(v[0]).toBe("service");
  });
});
