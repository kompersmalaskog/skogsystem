/**
 * Vilobrott-listans läsning: flaggan foretagsledare MÅSTE läsas med medarbetarna — utan den undantas ingen, och det syns inte
 * (en fake som returnerar hela raden döljer det, så här kontrolleras själva urvalet).
 */
import { describe, it, expect, vi } from "vitest";

const urval: Record<string, string> = {};
vi.mock("@/lib/supabase", () => {
  const fraga = (tabell: string) => {
    const kedja: any = {
      select: (kolumner: string) => { urval[tabell] = kolumner; return kedja; },
      order: () => kedja, gte: () => kedja, not: () => kedja,
      then: (res: any) => Promise.resolve({ data: [], error: null }).then(res),
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
});
