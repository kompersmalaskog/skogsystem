// Förarens tidsspecifikation (A4): svaret först, lönen med förklaring i ord, dagarna per vecka.
// Texten läses TILLBAKA ur PDF:en med pdf-parse. TIDSSPEC_SKRIV=<mapp> sparar PDF:en.
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { ritaTidsspec, lageMening, perVecka, platsText, dagUnderrad } from "./tidsspecPdf";

const dag = (datum: string, start: string, slut: string, rast: number, min: number, objekt: string[], extra: Partial<any> = {}) => ({
  id: datum, datum, start_tid: start, slut_tid: slut, rast_min: rast, arbetad_min: min, extra_min: 0, objekt, perioddag: false,
  maskin_id: "R64428", km_totalt: 8, ersattningsmil: 0, km_morgon: 4, km_kvall: 4, km_kalla: "auto", bekraftad: true,
  brandrisk_beordrad: null, dagtyp: "normal", ...extra,
});

/** Oskar november 2026, formad efter hans riktiga tidsspecifikation (skärmbild 2026-11-25). */
export function oskarNovember(): any {
  const dagar = [
    dag("2026-11-02", "07:19", "16:48", 39, 530, ["Vashult gallring 2026"], { km_totalt: 52 }),
    dag("2026-11-03", "07:03", "16:14", 19, 532, ["Kjell-Erik Lindström Steglehylte", "Vashult gallring 2026"], { km_totalt: 52 }),
    dag("2026-11-04", "06:55", "16:18", 41, 522, ["Kjell-Erik Lindström Steglehylte", "Flytt 2026"], { km_totalt: 0 }),
    dag("2026-11-23", "07:05", "17:27", 34, 588, ["Gallring Santhe 2026."]),
    dag("2026-11-24", "06:47", "17:27", 36, 604, ["Gallring Santhe 2026."]),
    dag("2026-11-25", "06:41", "17:41", 56, 604, ["Gallring Santhe 2026."], { bekraftad: false }),
  ];
  return {
    medarbetare_id: "oskar", namn: "Oskar Nilsson", foretagsledare: false, obekraftade: 1,
    rader: [
      { loneart: "timlon", SalaryCode: "11", Number: 56.33 },
      { loneart: "premielon_skordare", SalaryCode: "1355", Number: 56.33 },
      { loneart: "valtlappar", SalaryCode: "136", Number: 2 },
    ],
    dagar, km_grans: 60, extra_h: 0, ob: { timmar: 0, dagar: 0, obesvarade: 0 },
    varningar: [], maskin_utan_typ: [], kortpass: [], deldagar: [], hemskickad: [],
  };
}

async function textUr(bytes: Uint8Array): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  return (await new PDFParse({ data: Buffer.from(bytes) }).getText()).text;
}

describe("tidsspecifikationen", { timeout: 30000 }, () => {
  it("svaret först: månaden, timmarna och vad som väntar", async () => {
    const bytes = await ritaTidsspec("2026-11", oskarNovember(), new Date("2026-11-25T18:40:00Z"));
    if (process.env.TIDSSPEC_SKRIV) fs.writeFileSync(path.join(process.env.TIDSSPEC_SKRIV, "tidsspec.pdf"), bytes);
    const t = await textUr(bytes);
    expect(t).toContain("November 2026");
    expect(t).toContain("lönen kommer i december");
    expect(t).toContain("56 tim 20 min");                   // 530+532+522+588+604+604 = 3380 min
    expect(t).toContain("Så mycket har du arbetat i november.");
    expect(t).toContain("En dag väntar på att du bekräftar den: ons 25 nov.");
    expect(t).toContain("Rörlig ersättning, räknad på samma timmar.");
    expect(t).toContain("Premie");
    expect(t).not.toContain("Premielön skördare");
    expect(t).toContain("Bilersättning");
    expect(t).toContain("Du körde aldrig mer än 60 km på en dag.");
    expect(t).toContain("Vecka 45");
    expect(t).toContain("Vecka 48");
    expect(t).toContain("Hela november");
    expect(t).toContain("Santhe");
    expect(t).not.toContain("Gallring Santhe");
    expect(t).toContain("inte bekräftad");
    expect(t).toContain("Skapad 25 nov 2026 19:40");          // svensk tid, inte UTC
    expect(t).toMatch(/För lönen \(Fortnox\): Timlön 11: 56,33 tim\s+·\s+Premie 1355/);
    expect(t).not.toMatch(/\bkr\b/i);
  });

  it("allt bekräftat säger det, och företagsledaren får inga lönerader", async () => {
    const m = oskarNovember();
    m.dagar = m.dagar.map((d: any) => ({ ...d, bekraftad: true })); m.obekraftade = 0;
    expect(lageMening(m)).toEqual({ text: "Alla dagar är bekräftade.", vantar: false });
    const t = await textUr(await ritaTidsspec("2026-11", { ...m, foretagsledare: true }));
    expect(t).not.toContain("Det här går till lönen".toUpperCase());
    expect(t).not.toContain("Fortnox");
    expect(t).toContain("Hela november");
  });

  it("veckorna summerar till månaden, och raden under dagen säger bara det som finns", () => {
    const m = oskarNovember();
    const v = perVecka(m.dagar);
    expect(v.map(x => x.vecka)).toEqual([45, 48]);
    expect(v.reduce((s, x) => s + x.min, 0)).toBe(3380);
    expect(platsText(["Kjell-Erik Lindström Steglehylte", "Vashult gallring 2026"])).toBe("Kjell-Erik Lindström Steglehylte, Vashult");
    expect(dagUnderrad(m.dagar[0])).toBe("rast 39 min · 52 km");
    expect(dagUnderrad(m.dagar[5])).toBe("inte bekräftad · rast 56 min · 8 km");
    expect(dagUnderrad({ ...m.dagar[0], rast_min: 0, km_totalt: 0 })).toBe("");
  });

  it("ingen data: en mening, ingen krasch", async () => {
    const t = await textUr(await ritaTidsspec("2026-11", null));
    expect(t).toContain("Inga arbetsdagar registrerade den här månaden.");
  });
});
