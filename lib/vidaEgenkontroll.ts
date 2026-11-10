// VIDAS EGENKONTROLL — förarnas korta lista (Martin 2026-11-10: "så mycket på automatik det bara går … bara det som han vet till 100 %").
//
// Vida skickar sin egen frågemall i trakt-filen (objekt.checklist_items, lib/trakt/objektinfo.ts parseChecklist): ~20 frågor
// med Vidas svarsalternativ. Förarna fyllde i den halvhjärtat. Här görs om den till:
//   * några frågor till SKÖRDAREN och några till SKOTAREN, med två–tre knappar var,
//   * det appen VET säkert svarar appen själv (trakthandlingarna importerades, traktens cert, GROT-märkningen, evighetsträden
//     räknade mot kravet) — aldrig en gissning ur kartan eller spåret,
//   * slutfrågorna (cert uppfyllt, Vidas krav) räknas ur förarnas svar,
//   * och Vidas hela formulär byggs ihop igen, i Vidas ordning och med Vidas egna svarsalternativ, för rapporten.
//
// Ingenting skickas till Vida härifrån (Martin: visa Vida först). Ren logik — sidan läser och sparar.

export interface VidaFraga {
  sektion: string | null;
  fraga: string | null;
  svarsalternativ?: { text: string; larmar?: boolean }[] | null;
}

export type Roll = 'skordare' | 'skotare';
export type Varde = 'ok' | 'av' | 'ej';

export interface Knapp { varde: Varde | string; text: string }

export interface ForarFraga {
  nyckel: string;
  roll: Roll;
  text: string;
  knappar: Knapp[];
  /** Vilket värde som är en avvikelse (kräver en rad om vad som hände). */
  avvikelse: (varde: string) => boolean;
}

export interface Svar { varde: string; kommentar?: string | null }

export interface Fakta {
  cert: string | null | undefined;
  /** objekt.grot — null = okänt. */
  grot: boolean | null;
  /** Satta evighetsträd + naturhörnor (lib/miljokrav raknaMiljo). */
  evighetstrad: number;
  /** Kravet (lib/miljokrav miljoKrav). null = inget krav/okänt. */
  evighetstradKrav: number | null;
}

export type Kalla = 'appen' | 'skordare' | 'skotare' | 'harlett' | 'ingen';

export interface RapportRad {
  sektion: string;
  fraga: string;
  /** Vidas eget svarsalternativ (eller text). null = inte besvarat än. */
  svar: string | null;
  avvikelse: boolean;
  kalla: Kalla;
  /** Var svaret kommer ifrån, i ord. */
  varifran: string;
}

export interface Egenkontroll {
  skordare: ForarFraga[];
  skotare: ForarFraga[];
  appen: { fraga: string; svar: string; varifran: string }[];
  rapport: RapportRad[];
  /** Antal av förarnas frågor som är besvarade / totalt. */
  besvarade: { skordare: number; skotare: number };
  avvikelser: number;
}

// ---------- cert ----------
export type CertLage = 'fsc_pefc' | 'fsc' | 'pefc' | 'ingen' | 'okand';
export function certLage(cert: string | null | undefined): CertLage {
  const t = (cert ?? '').toLowerCase();
  if (!t.trim()) return 'okand';
  const fsc = /\bfsc\b/.test(t), pefc = /\bpefc\b/.test(t);
  if (fsc && pefc) return 'fsc_pefc';
  if (fsc) return 'fsc';
  if (pefc) return 'pefc';
  if (/ej certifierad|none/.test(t)) return 'ingen';
  return 'okand'; // "Not known" m.m. — appen vet inte
}
const harFsc = (c: CertLage) => c === 'fsc' || c === 'fsc_pefc';

// ---------- Vidas alternativ ----------
/** Vidas alternativ, utan tomma och utan dubbletter (mallen upprepar ibland samma alternativ; första förekomsten gäller, men ett larm på någon av dem räknas). */
function alt(f: VidaFraga): { text: string; larmar: boolean }[] {
  const ut: { text: string; larmar: boolean }[] = [];
  for (const a of f.svarsalternativ ?? []) {
    const text = (a?.text ?? '').trim();
    if (!text) continue;
    const fanns = ut.find((x) => x.text.toLowerCase() === text.toLowerCase());
    if (fanns) fanns.larmar = fanns.larmar || !!a.larmar; else ut.push({ text, larmar: !!a.larmar });
  }
  return ut;
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
function valj(f: VidaFraga, ...onskat: string[]): string | null {
  const a = alt(f);
  for (const o of onskat) { const t = a.find((x) => norm(x.text) === norm(o)); if (t) return t.text; }
  return null;
}
/** Vidas text för "bra" (Hänsyn tagen / Ja …), "avvikelse" och "ej aktuell". */
const vOk = (f: VidaFraga) => valj(f, 'Hänsyn tagen', 'Ja') ?? 'Ja';
const vAv = (f: VidaFraga) => alt(f).find((a) => a.larmar)?.text ?? valj(f, 'Avvikelse', 'Nej') ?? 'Avvikelse';
const vEj = (f: VidaFraga) => valj(f, 'Ej aktuell') ?? 'Ej aktuell';
function certSvar(f: VidaFraga, c: CertLage): string {
  if (c === 'pefc') return valj(f, 'PEFC') ?? 'PEFC';
  return valj(f, 'FSC/PEFC', 'FSC') ?? 'FSC/PEFC';
}

export const nyckelFor = (f: VidaFraga) => `v:${norm(f.sektion ?? '')}|${norm(f.fraga ?? '')}`;

// ---------- regler ----------
type Regel =
  | { typ: 'appen'; svar: string; varifran: string }
  | { typ: 'forare'; nyckel: string; roll: Roll; text: string; knappar: Knapp[]; avvikelse: Varde[]; vida: Partial<Record<string, string>> }
  | { typ: 'harlett'; slag: 'cert' | 'krav' | 'kommentar' | 'ovrigt' }
  | { typ: 'ingen'; varifran: string };

const JA_NEJ: Knapp[] = [{ varde: 'ok', text: 'Ja' }, { varde: 'av', text: 'Nej' }];

function regel(f: VidaFraga, fakta: Fakta, grotObjekt: boolean): Regel {
  const q = norm(f.fraga ?? '');
  const sek = norm(f.sektion ?? '');
  const c = certLage(fakta.cert);
  const fr = (nyckel: string, roll: Roll, text: string, knappar: Knapp[], vida: Partial<Record<string, string>>, avvikelse: Varde[] = ['av']): Regel =>
    ({ typ: 'forare', nyckel, roll, text, knappar, avvikelse, vida });

  if (/trakthandlingar/.test(q)) return { typ: 'appen', svar: valj(f, 'Ja') ?? 'Ja', varifran: 'Traktdirektiv och karta importerade från Vida' };
  if (/beståndsgränser|utmärkt i fält/.test(q)) return fr('grans', 'skordare', 'Var gränser och hänsyn utmärkta i skogen?', JA_NEJ, { ok: vOk(f), av: vAv(f) });
  if (/^sparade naturvärdesträd/.test(q)) {
    const krav = fakta.evighetstradKrav;
    if (krav != null && krav > 0 && fakta.evighetstrad >= krav)
      return { typ: 'appen', svar: valj(f, 'Ja') ?? 'Ja', varifran: `${fakta.evighetstrad} evighetsträd satta · kravet är ${krav}` };
    return fr('naturvarde', 'skordare', 'Sparade du naturvärdesträd?', JA_NEJ, { ok: valj(f, 'Ja') ?? 'Ja', av: valj(f, 'Nej') ?? 'Nej' });
  }
  if (/utvecklingsträd/.test(q)) {
    if (c === 'ingen') return { typ: 'appen', svar: vEj(f), varifran: 'Trakten är inte certifierad' };
    if (c === 'okand') return fr('utveckling', 'skordare', 'Sparade du utvecklingsträd?', [...JA_NEJ, { varde: 'ej', text: 'Inte certifierad' }], { ok: certSvar(f, 'fsc_pefc'), av: vAv(f), ej: vEj(f) });
    return fr('utveckling', 'skordare', 'Sparade du utvecklingsträd?', JA_NEJ, { ok: certSvar(f, c), av: vAv(f) });
  }
  if (/grova toppar/.test(q)) {
    if (c === 'ingen' || c === 'pefc') return { typ: 'appen', svar: vEj(f), varifran: c === 'pefc' ? 'Trakten är bara PEFC-certifierad' : 'Trakten är inte certifierad' };
    return fr('toppar', 'skordare', 'Lämnade du grova toppar?', JA_NEJ, { ok: vOk(f), av: vAv(f) });
  }
  if (/kantzon/.test(q)) return fr('kantzon', 'skordare', 'Lämnade du kantzon mot vatten, åker och myr?', [...JA_NEJ, { varde: 'ej', text: 'Fanns inget' }], { ok: vOk(f), av: vAv(f), ej: vEj(f) });
  if (/hänsynskrävande biotoper|fornlämningar lämnade oskadade|kultur och fornlämningar/.test(q))
    return fr('hansyn', 'skordare', 'Är hänsynsytor och fornlämningar orörda?', [...JA_NEJ, { varde: 'ej', text: 'Fanns inga' }], { ok: vOk(f), av: vAv(f), ej: vEj(f) });
  if (/kulturstubbar/.test(q)) return fr('kulturstubbar', 'skordare', 'Ställde du kulturstubbar vid fornlämningarna?', [...JA_NEJ, { varde: 'ej', text: 'Fanns inga' }], { ok: vOk(f), av: vAv(f), ej: vEj(f) });
  if (/ej registrerade lämningar/.test(q)) return fr('nyalamningar', 'skordare', 'Hittade du en lämning som inte fanns på kartan?', [{ varde: 'ok', text: 'Nej' }, { varde: 'av', text: 'Ja' }], { ok: valj(f, 'Nej') ?? 'Nej', av: valj(f, 'Ja') ?? 'Ja' });
  if (/lövträd.*frihugg/.test(q)) return fr('lovfrihugg', 'skordare', 'Högg du fram lövträd?', JA_NEJ, { ok: vOk(f), av: vAv(f) });
  if (/lövandel/.test(q)) return fr('lovandel', 'skordare', 'Lämnade du över 10 % löv?', JA_NEJ, { ok: vOk(f), av: vAv(f) });
  if (/grotanpassad/.test(q)) {
    if (fakta.grot != null) return { typ: 'appen', svar: valj(f, fakta.grot ? 'Ja' : 'Nej') ?? (fakta.grot ? 'Ja' : 'Nej'), varifran: fakta.grot ? 'Trakten är märkt GROT' : 'Trakten är inte märkt GROT' };
    return fr('grotanpassad', 'skordare', 'La du riset i högar för GROT?', JA_NEJ, { ok: valj(f, 'Ja') ?? 'Ja', av: valj(f, 'Nej') ?? 'Nej' });
  }
  if (/grot kvar att skota/.test(q)) {
    if (fakta.grot === false) return { typ: 'appen', svar: valj(f, 'Nej') ?? 'Nej', varifran: 'Ingen GROT tas ut på trakten' };
    return fr('grotkvar', 'skotare', 'Är all grot utskotad?', JA_NEJ, { ok: valj(f, 'Groten är utskotad', 'Nej') ?? 'Nej', av: valj(f, 'Ja') ?? 'Ja' });
  }
  if (/utan körskador/.test(q)) return fr('korskador', 'skotare', 'Blev det några körskador?', [{ varde: 'ok', text: 'Nej' }, { varde: 'av', text: 'Ja' }], { ok: valj(f, 'Ja') ?? 'Ja', av: vAv(f) });
  if (/anpassningar.*körskador/.test(q)) return fr('anpassning', 'skotare', 'Körde du runt eller risade där det var blött?', [...JA_NEJ, { varde: 'ej', text: 'Behövdes inte' }], { ok: valj(f, 'Ja') ?? 'Ja', av: valj(f, 'Nej') ?? 'Nej', ej: valj(f, 'Ja') ?? 'Ja' });
  if (/bro samt risning|passage över vatten/.test(q)) return fr('bro', 'skotare', 'Användes bro och ris över vattnet?', [...JA_NEJ, { varde: 'ej', text: 'Inget vatten' }], { ok: vOk(f), av: vAv(f), ej: vEj(f) });
  if (/certifiering uppfyllda/.test(q)) return { typ: 'harlett', slag: 'cert' };
  if (/vidas krav/.test(q)) return { typ: 'harlett', slag: 'krav' };
  if (/övriga kommentarer/.test(q)) return { typ: 'harlett', slag: 'kommentar' };
  if (q === 'övrigt' || sek === 'övrigt') return { typ: 'harlett', slag: 'ovrigt' };
  if (/flisning/.test(sek)) return { typ: 'ingen', varifran: 'Görs av den som flisar' };

  // Okänd fråga: Vidas egen text och Vidas egna svar, till den maskin som rimligast vet (GROT-trakt → skotaren).
  const a = alt(f);
  const roll: Roll = grotObjekt || /grot|vält/.test(sek + ' ' + q) ? 'skotare' : 'skordare';
  if (a.length === 0) return { typ: 'ingen', varifran: 'Fritext i Vidas formulär' };
  const knappar = a.map((x) => ({ varde: x.text, text: x.text }));
  return { typ: 'forare', nyckel: nyckelFor(f), roll, text: (f.fraga ?? '').trim(), knappar, avvikelse: a.filter((x) => x.larmar).map((x) => x.text as Varde), vida: Object.fromEntries(a.map((x) => [x.text, x.text])) };
}

/** Bygger förarnas listor, appens svar och Vidas hela formulär. `grotObjekt` = trakten är en GROT-trakt (objekt.typ). */
export function byggEgenkontroll(items: unknown, fakta: Fakta, svar: Record<string, Svar>, grotObjekt = false): Egenkontroll | null {
  if (!Array.isArray(items)) return null;
  const fragor: VidaFraga[] = (items as VidaFraga[]).filter((f) => f && typeof f.fraga === 'string' && f.fraga.trim() && Array.isArray(f.svarsalternativ ?? []));
  if (fragor.length === 0) return null;
  // Vidas mall har bara fasta frågor med sektion; planeringens egna åtta (id/text/answer) är inte Vidas.
  if (!fragor.some((f) => f.sektion)) return null;

  const regler = fragor.map((f) => ({ f, r: regel(f, fakta, grotObjekt) }));
  const forare = new Map<string, ForarFraga>();
  for (const { r } of regler) {
    if (r.typ !== 'forare' || forare.has(r.nyckel)) continue;
    const av = new Set<string>(r.avvikelse);
    forare.set(r.nyckel, { nyckel: r.nyckel, roll: r.roll, text: r.text, knappar: r.knappar, avvikelse: (v) => av.has(v) });
  }

  const forarAvvikelse = [...forare.values()].filter((q) => svar[q.nyckel] && q.avvikelse(svar[q.nyckel].varde));
  const avvikelser = forarAvvikelse.length;
  const allaBesvarade = [...forare.values()].every((q) => svar[q.nyckel]);
  const c = certLage(fakta.cert);
  const kommentarer = [
    ...forarAvvikelse.filter((q) => svar[q.nyckel].kommentar?.trim()).map((q) => `${q.text} ${svar[q.nyckel].kommentar!.trim()}`),
    ...(['skordare', 'skotare'] as Roll[]).map((r) => svar[`kommentar:${r}`]?.kommentar?.trim()).filter((t): t is string => !!t),
  ];
  const rollNamn = (r: Roll) => (r === 'skordare' ? 'Skördaren' : 'Skotaren');

  const rapport: RapportRad[] = regler.map(({ f, r }) => {
    const bas = { sektion: (f.sektion ?? '').trim(), fraga: (f.fraga ?? '').trim() };
    if (r.typ === 'appen') return { ...bas, svar: r.svar, avvikelse: false, kalla: 'appen', varifran: r.varifran };
    if (r.typ === 'ingen') return { ...bas, svar: null, avvikelse: false, kalla: 'ingen', varifran: r.varifran };
    if (r.typ === 'forare') {
      const s = svar[r.nyckel];
      const q = forare.get(r.nyckel)!;
      if (!s) return { ...bas, svar: null, avvikelse: false, kalla: r.roll, varifran: `${rollNamn(r.roll)} svarar` };
      return { ...bas, svar: r.vida[s.varde] ?? s.varde, avvikelse: q.avvikelse(s.varde), kalla: r.roll, varifran: `${rollNamn(r.roll)}${s.kommentar?.trim() && q.avvikelse(s.varde) ? ` · ${s.kommentar.trim()}` : ''}` };
    }
    // härlett
    if (r.slag === 'kommentar') return { ...bas, svar: kommentarer.length ? kommentarer.join(' · ') : null, avvikelse: false, kalla: 'harlett', varifran: kommentarer.length ? 'Förarnas kommentarer' : 'Inga kommentarer' };
    if (r.slag === 'ovrigt') return { ...bas, svar: null, avvikelse: false, kalla: 'harlett', varifran: 'Samlas under Övriga kommentarer' };
    if (!allaBesvarade) return { ...bas, svar: null, avvikelse: false, kalla: 'harlett', varifran: 'Räknas ut när förarna svarat' };
    if (r.slag === 'cert') {
      if (c === 'ingen') return { ...bas, svar: vEj(f), avvikelse: false, kalla: 'harlett', varifran: 'Trakten är inte certifierad' };
      if (avvikelser) return { ...bas, svar: vAv(f), avvikelse: true, kalla: 'harlett', varifran: `${avvikelser} avvikelse${avvikelser > 1 ? 'r' : ''}` };
      return { ...bas, svar: certSvar(f, c === 'okand' ? 'fsc_pefc' : c), avvikelse: false, kalla: 'harlett', varifran: 'Inga avvikelser' };
    }
    return avvikelser
      ? { ...bas, svar: valj(f, 'Nej') ?? 'Nej', avvikelse: true, kalla: 'harlett', varifran: `${avvikelser} avvikelse${avvikelser > 1 ? 'r' : ''}` }
      : { ...bas, svar: valj(f, 'Ja') ?? 'Ja', avvikelse: false, kalla: 'harlett', varifran: 'Inga avvikelser' };
  });

  const lista = (roll: Roll) => [...forare.values()].filter((q) => q.roll === roll);
  const skordare = lista('skordare'), skotare = lista('skotare');
  return {
    skordare, skotare,
    appen: rapport.filter((r) => r.kalla === 'appen').map((r) => ({ fraga: r.fraga, svar: r.svar ?? '', varifran: r.varifran })),
    rapport,
    besvarade: { skordare: skordare.filter((q) => svar[q.nyckel]).length, skotare: skotare.filter((q) => svar[q.nyckel]).length },
    avvikelser,
  };
}

/** En avvikelse kräver en rad om vad som hände innan frågan räknas som klar. */
export function saknarKommentar(q: ForarFraga, s: Svar | undefined): boolean {
  return !!s && q.avvikelse(s.varde) && !(s.kommentar ?? '').trim();
}
