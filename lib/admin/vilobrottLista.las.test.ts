/**
 * Vilobrott-listans läsning: flaggan foretagsledare MÅSTE läsas med medarbetarna — utan den undantas ingen, och det syns inte
 * (en fake som returnerar hela raden döljer det, så här kontrolleras själva urvalet).
 */
import { describe, it, expect, vi } from "vitest";

const urval: Record<string, string> = {};
const vilobrottUrval: string[] = [];
let utanKolumn = false;
vi.mock("@/lib/supabase", () => {
  const fraga = (tabell: string) => {
    const kedja: any = {
      select: (kolumner: string) => { urval[tabell] = kolumner; if (tabell === "vilobrott") vilobrottUrval.push(kolumner); kedja.k = kolumner; return kedja; },
      order: () => kedja, gte: () => kedja, not: () => kedja,
      then: (res: any) => Promise.resolve(
        utanKolumn && tabell === "vilobrott" && /kvitterad/.test(kedja.k)
          ? { data: null, error: { code: "42703", message: "column vilobrott.kvitterad_anteckning does not exist" } }
          : { data: [], error: null }).then(res),
    };
    return kedja;
  };
  return { supabase: { from: fraga } };
});
vi.mock("@/lib/gs-avtal", () => ({
  hamtaGiltigtAvtal: async () => null,
  vilaTrosklarFromAvtal: () => ({ dygnsvila_krav_h: 11, dygnsvila_varning_h: 12, veckovila_krav_h: 36, veckovila_fonster_dagar: 7, kompensation_deadline_dagar: 14 }),
}));

import { laddaVilobrottLista } from "./vilobrottLista";

describe("laddaVilobrottLista", () => {
  it("läser medarbetare.foretagsledare tillsammans med id och namn", async () => {
    await laddaVilobrottLista(new Date(2026, 9, 20));
    expect(urval.medarbetare).toContain("foretagsledare");
    expect(urval.medarbetare).toContain("id");
    expect(urval.medarbetare).toContain("namn");
  });

  it("läser admins kvittering; saknas kolumnen (migrationen ej körd) läses svaren utan den, aldrig ett fel", async () => {
    vilobrottUrval.length = 0; utanKolumn = false;
    await laddaVilobrottLista(new Date(2026, 9, 20));
    expect(vilobrottUrval).toHaveLength(1);
    expect(vilobrottUrval[0]).toContain("kvitterad_anteckning");
    vilobrottUrval.length = 0; utanKolumn = true;
    await expect(laddaVilobrottLista(new Date(2026, 9, 20))).resolves.toEqual([]);
    expect(vilobrottUrval).toHaveLength(2);
    expect(vilobrottUrval[1]).not.toContain("kvitterad");
    utanKolumn = false;
  });
});
