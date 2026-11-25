// ─────────────────────────────────────────────────────────────
// Admin › Lön › ATK-val — vad sidan säger, räknat rent (Martin 2026-11-25: "som Apple").
//
// Förarna väljer ATK (pengar, ledig tid eller pension) i Arbetsrapport › Min tid › Saldon, 1–15 maj.
// Sidan svarar först på EN fråga — har alla valt? — och visar sedan bara de grupper som har något:
// "Väntar på dig" (pengar/pension som ska godkännas), "Inte valt", "Valt".
// Företagsledare och maskinkonton gör inget ATK-val och står inte här; den som slutat bara om hen hann välja.
// ─────────────────────────────────────────────────────────────

export type AtkLage = "fore" | "oppen" | "stangd";
export type AtkValRad = { id?: string; medarbetare_id: string; val: string; timmar: number | null; belopp: number | null; status: string | null };
export type AtkPerson = { id: string; namn: string | null; roll?: string | null; foretagsledare?: boolean | null; aktiv?: boolean | null };

export const VAL_LABEL: Record<string, string> = { ledig: "Ledig tid", kontant: "Pengar", pension: "Pension" };

/** Valperioden är 1–15 maj (samma som förarens vy). Svensk lokal tid räcker: gränsen är en dag, inte en minut. */
export function atkLage(ar: number, nu: Date): AtkLage {
  const oppnar = new Date(ar, 4, 1);
  const stanger = new Date(ar, 4, 15, 23, 59, 59);
  if (nu < oppnar) return "fore";
  if (nu <= stanger) return "oppen";
  return "stangd";
}

/** Pengar och pension godkänns av admin; ledig tid behöver inget godkännande. */
export const vantarPaGodkannande = (v: AtkValRad) => v.val !== "ledig" && (!v.status || v.status === "bekräftad");

export function statusText(v: AtkValRad): string {
  if (v.status === "godkand") return "Godkänd";
  if (v.status === "avslagen") return "Avslagen";
  if (vantarPaGodkannande(v)) return "Väntar på dig";
  return "";
}

export function valDetalj(v: AtkValRad): string {
  return [
    VAL_LABEL[v.val] || v.val,
    v.timmar != null ? `${String(v.timmar).replace(".", ",")} tim` : null,
    v.belopp != null ? `${v.belopp.toLocaleString("sv-SE")} kr` : null,
  ].filter(Boolean).join(" · ");
}

export type AtkVy = {
  lage: AtkLage;
  /** Det stora på sidan: "7 har inte valt" / "Alla har valt" / "Ingen gjorde ATK-val". */
  svar: string;
  /** Raden under: när valet öppnar/stänger, och hur många som väntar på godkännande. */
  under: string[];
  /** Orange när något kräver admin (godkännande) eller när valet är öppet och folk saknas. */
  kraverDig: boolean;
  vantar: { person: AtkPerson; val: AtkValRad }[];
  inteValt: AtkPerson[];
  valt: { person: AtkPerson; val: AtkValRad }[];
  /** Påminn alla — bara medan valet är öppet i innevarande år och någon saknas. */
  kanPaminna: boolean;
};

export function byggAtkVy(ar: number, nu: Date, personer: AtkPerson[], val: Record<string, AtkValRad>): AtkVy {
  const lage = atkLage(ar, nu);
  // En som slutat (aktiv = false) står bara med om hen hann välja.
  const med = personer.filter(p => p.roll !== "maskin" && p.foretagsledare !== true && (p.aktiv !== false || !!val[p.id]));
  const vantar: AtkVy["vantar"] = [];
  const valt: AtkVy["valt"] = [];
  const inteValt: AtkPerson[] = [];
  for (const p of med) {
    const v = val[p.id];
    if (!v) inteValt.push(p);
    else if (vantarPaGodkannande(v)) vantar.push({ person: p, val: v });
    else valt.push({ person: p, val: v });
  }
  const n = inteValt.length;
  const svar =
    med.length === 0 ? "Inga förare"
    : n === 0 ? "Alla har valt"
    : n === med.length && lage === "stangd" ? "Ingen gjorde ATK-val"
    : lage === "stangd" ? `${n} valde inte`
    : `${n} har inte valt`;
  const under: string[] = [];
  if (lage === "fore") under.push(`Valet öppnar 1 maj ${ar}`);
  else if (lage === "oppen") under.push(`Valet stänger 15 maj`);
  else under.push(`Valet stängde 15 maj ${ar}`);
  if (vantar.length > 0) under.push(`${vantar.length} väntar på dig`);
  return {
    lage, svar, under,
    kraverDig: vantar.length > 0 || (lage === "oppen" && n > 0),
    vantar, inteValt, valt,
    kanPaminna: lage === "oppen" && n > 0,
  };
}
