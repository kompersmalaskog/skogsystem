// GROT-köer: vilka kö-rader som är kvarlevor, och hur de tas bort säkert.
//
// En trakt köas för en skotare (maskin_ko) medan den väntar på GROT. Trakten är då AVSLUTAD — v2:s skotarkö släpper
// bara in avslutade objekt som finns i GROT-listan (grotObjektIds, se lista.ts). När körd-regeln slår (grot_hamtad
// satt, eller länkat risjobb klart) lämnar trakten listan och kö-raden är en kvarleva: v2 döljer den redan, men den
// ligger kvar i databasen, syns som "i kö" i objekt-arket och som en vanlig kö-rad i gamla översikten. Då tas den bort.
//
// KONSERVATIVT, avsiktligt: bara rader på avslutade trakter där körd-regeln HAR slagit (grotKordaObjektIds). En
// avslutad trakt som aldrig var GROT, eller som lämnat listan av annat skäl, rörs inte — gamla kvarlevor därifrån
// är inte GROT-listans sak, och en rensning som är bredare än uppdraget raderar rader ingen bett om.
//
// Aldrig rensning på ett underlag som inte går att lita på: en tyst tom läsning (RLS som döljer raderna, ett läsfel
// som slank igenom) får inte läsas som "alla är körda".

/** Statusar som betyder avslutat — speglar STATUS_AVSLUTADE i app/oversikt/oversikt-types (lib får inte importera app/). */
const AVSLUTADE = ['avslutat', 'klar'];
const IN_BIT = 50; // ids per .in() — håller URL:en kort

export interface KoRad { id: string; maskin_id: string; objekt_id: string }
export interface ObjektStatusRad { id: string; status: string | null }

/** kö-id:n att rensa: kö-rader vars objekt är AVSLUTAT och där GROT är körd (objekt.id i `grotKorda`, ur
 *  grotKordaObjektIds). Objekt som inte går att slå upp lämnas ifred. */
export function koRaderAttRensa(ko: KoRad[], objekt: ObjektStatusRad[], grotKorda: Set<string>): string[] {
  const statusPer = new Map<string, string | null>();
  objekt.forEach((o) => statusPer.set(o.id, o.status));
  return ko
    .filter((k) => {
      const status = statusPer.get(k.objekt_id);
      return status != null && AVSLUTADE.indexOf(status) >= 0 && grotKorda.has(k.objekt_id);
    })
    .map((k) => k.id);
}

/** Går GROT-underlaget att lita på för rensning? Trakterna (dim_objekt med grot_anpassad) och deras skördade
 *  volym måste finnas — annars är en tom lista lika gärna ett dolt/misslyckat läsresultat som ett sant "inga väntar". */
export function arGrotUnderlagTillforlitligt(raw: { dim: unknown[]; prod: unknown[] }): boolean {
  return raw.dim.length > 0 && raw.prod.length > 0;
}

export interface RaderaResultat { ok: boolean; raderade: number; kvar: number; message: string }

/** Raderar kö-rader på id och BEKRÄFTAR med samma predikat (id i ids) — inga av dem får finnas kvar.
 *  Klienten injiceras. Kastar aldrig; fel kommer tillbaka i resultatet. */
export async function raderaKoRader(sb: any, ids: string[]): Promise<RaderaResultat> {
  let kvarTotalt = 0;
  for (let i = 0; i < ids.length; i += IN_BIT) {
    const bit = ids.slice(i, i + IN_BIT);
    const del = await sb.from('maskin_ko').delete().in('id', bit);
    if (del.error) return { ok: false, raderade: ids.length - kvarTotalt, kvar: kvarTotalt, message: `Kunde inte rensa kön: ${del.error.message}` };
    const kontroll = await sb.from('maskin_ko').select('id').in('id', bit);
    if (kontroll.error) return { ok: false, raderade: 0, kvar: bit.length, message: `Kunde inte bekräfta rensningen: ${kontroll.error.message}` };
    kvarTotalt += (kontroll.data || []).length;
  }
  return kvarTotalt === 0
    ? { ok: true, raderade: ids.length, kvar: 0, message: '' }
    : { ok: false, raderade: ids.length - kvarTotalt, kvar: kvarTotalt, message: `${kvarTotalt} av ${ids.length} kö-rader finns kvar efter rensningen` };
}
