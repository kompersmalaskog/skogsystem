// Min tid (förarens vy) visar årets övertid med SAMMA beräkning som lagkontrollen i Admin och som lönen: månadens ordinarie, per
// kalendermånad (Martin 2026-10-19). Förut hade Min tid en egen loop (timmar − vardagar × 8 per månad) som gav ett annat tal än Admin.
import { describe, it, expect } from "vitest";
import { minTidArsovertid } from "./minTidArsovertid";
import { beraknaArsovertid } from "./arsovertid";
import type { FranvaroRad } from "../franvaro";

const dag = (datum: string, timmar: number) => ({ datum, arbetad_min: Math.round(timmar * 60) });
const feb = (tim: number) => { const ut: ReturnType<typeof dag>[] = []; for (let d = 1; d <= 28; d++) if (new Date(2026, 1, d).getDay() % 6) ut.push(dag(`2026-02-${String(d).padStart(2, "0")}`, tim)); return ut; };
const IDAG = new Date(2026, 2, 10, 12, 0);

describe("Min tid: årets övertid = månadsregeln", () => {
  it("februari 170 tim mot 160 ordinarie = 10 tim", () => {
    expect(minTidArsovertid({ dagar: feb(8.5), extra: [], franvaro: [], utjamning: [], idag: IDAG }).timmar).toBe(10);
  });

  it("den gamla Min tid-loopen räknade bara vardagar × 8 och glömde frånvaron: semester nu dras av ordinarie (3 dagar × 8 = 24 tim lägre)", () => {
    const semester: FranvaroRad = { medarbetare_id: "m", typ: "semester", startdatum: "2026-02-02", slutdatum: "2026-02-04", status: "godkänd" };
    const dagar = feb(8.5).filter(d => d.datum > "2026-02-04");   // arbetade bara resten av månaden: 17 dagar × 8,5 = 144,5
    expect(minTidArsovertid({ dagar, extra: [], franvaro: [semester], utjamning: [], idag: IDAG }).timmar).toBe(8.5);   // 144,5 − (160 − 24)
  });

  it("anställningsdatum och avtalets röda dagar följer med", () => {
    const dagar = feb(9).filter(d => d.datum >= "2026-02-16");
    expect(minTidArsovertid({ dagar, extra: [], franvaro: [], utjamning: [], anstallningsdatum: "2026-02-16", idag: IDAG }).timmar).toBe(10);
    // januari: 22 vardagar; avtalets standardlista har Nyårsdagen och Trettondagen (ordinarie 160), en kortare lista bara Nyårsdagen (168)
    const jan = (helglonNamn?: string) => minTidArsovertid({ dagar: [dag("2026-01-07", 164)], extra: [], franvaro: [], utjamning: [], helglonNamn, idag: IDAG }).timmar;
    expect(jan()).toBe(4);
    expect(jan("Nyårsdagen,Julafton")).toBe(0);
  });

  it("är EXAKT samma tal som lagkontrollen (beraknaArsovertid.modeller.manad) för samma indata — en utjämningsmånad inräknad", () => {
    const utj = [{ startdatum: "2026-02-02", slutdatum: "2026-02-08", anteckning: "Test" }];
    const dagar = [...feb(10), dag("2026-03-02", 12)];
    const extra = [{ datum: "2026-03-03", minuter: 90 }];
    const fran: FranvaroRad[] = [{ medarbetare_id: "m", typ: "sjuk", startdatum: "2026-03-04", slutdatum: "2026-03-04", status: "registrerad" }];
    const admin = beraknaArsovertid(dagar, extra, 2026, "2026-03-10", utj, fran, { anstallningsdatum: null, helglonNamn: null, ordinarieVeckaH: null }).modeller.manad;
    expect(minTidArsovertid({ dagar, extra, franvaro: fran, utjamning: utj, idag: IDAG }).timmar).toBe(admin);
  });

  it("rader ur året före eller efter räknas inte; idag bestämmer vilket år och hur långt", () => {
    const med = minTidArsovertid({ dagar: [...feb(8.5), dag("2025-12-01", 24)], extra: [{ datum: "2027-01-05", minuter: 600 }], franvaro: [], utjamning: [], idag: IDAG });
    expect(med.timmar).toBe(10);
  });
});
