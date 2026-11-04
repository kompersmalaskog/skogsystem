// ARBETSMILJÖ — EN sida för allt (2026-11-03, Martin: "kör på 1"). Svarar på EN fråga: "Är allt i ordning?".
// Överst svaret ("Allt är i ordning" / "2 saker behöver dig"), sedan Om något händer och en rad per del med sitt läge i ord.
// Startsidan har ett kort i stället för sju; de enskilda vyerna finns kvar (sökning, länkar från pushar och Behöver dig).
//
// Ren logik, ingen React. Varje del kommer in som det den redan läser i sin egen vy, så raden här och vyn kan aldrig säga olika saker.
// En del som inte gick att läsa är `null`: raden säger det, och svaret påstår aldrig "Allt är i ordning".

import { antalBesvarade, type Lage as RondLage } from './skyddsrond';
import { MASKINTYPER, TYP_BESTAMD, attLasa, forarensTyper, lage as riskLage, lastTid, lista, synligForForare, underlag, type Bedomning, type Kvitto, type MaskinTyp } from './maskinRisk';
import { datumText, lageText, type IntroLage } from './introduktion';
import { arshjulRad, svenskArManad, type Rad as ArshjulRad } from './arshjul';
import { svar as kemSvar, type Kemikalie } from './kemikalier';
import { svar as avfallSvar, type Lamning } from './avfall';
import { svar as saGorViSvar, type Godkannande, type InstrId, type Kvitto as InstrKvitto } from './saGorVi';

export type Ton = 'orange' | 'rod';

export type OversiktRad = {
  id: 'atgarder' | 'skyddsrond' | 'arshjul' | 'riskbedomning' | 'maskinkoll' | 'kemikalier' | 'avfall' | 'sagorvi' | 'rapportera' | 'introduktion';
  titel: string;
  href: string;
  under: string;
  /** Färg på raden under — förstärker bara, ordet står alltid. */
  ton?: Ton;
  /** Räknas i svaret ("N saker behöver dig"). */
  attGora: boolean;
  /** Gick inte att läsa. */
  fel?: boolean;
};

export type Risk =
  | { bedomningar: Record<MaskinTyp, Bedomning>; kvitton: readonly Kvitto[] | null; minTyp: MaskinTyp | null }
  | null;

export type Indata = {
  /** admin, eller skyddsombudet: ser Åtgärder och Skyddsrond. */
  serArbetsledning: boolean;
  arAdmin: boolean;
  medarbetareId: string;
  /** 1 = dags eller påbörjad, 0 = inget att göra. null = läsfel. */
  maskinkoll: number | null;
  atgarder: { antal: number; stopp: number } | null;
  skyddsrond: RondLage | null;
  risk: Risk;
  /** Förarens egen introduktion. undefined = visas som information (admin). null = läsfel. */
  intro?: IntroLage | null;
  /** Årshjulets rader (bara arbetsledningen). undefined = visas inte, null = läsfel. */
  arshjul?: ArshjulRad[] | null;
  /** Kemikalieförteckningen. undefined = visas inte, null = läsfel. */
  kemikalier?: readonly Kemikalie[] | null;
  /** Farligt avfall (lämningarna). undefined = visas inte, null = läsfel. */
  avfall?: readonly Lamning[] | null;
  /** Så gör vi (instruktionerna). undefined = visas inte, null = läsfel. */
  saGorVi?: { g: Record<InstrId, Godkannande>; kvitton: readonly InstrKvitto[] } | null;
};

const LASFEL = 'Kunde inte läsas just nu';

function felRad(id: OversiktRad['id'], titel: string, href: string): OversiktRad {
  return { id, titel, href, under: LASFEL, attGora: false, fel: true };
}

function atgardRad(a: Indata['atgarder']): OversiktRad {
  const bas = { id: 'atgarder' as const, titel: 'Åtgärder', href: '/atgarder' };
  if (!a) return felRad(bas.id, bas.titel, bas.href);
  if (a.stopp > 0) {
    const stopp = a.stopp === 1 ? '1 maskin ska stå tills det är lagat' : `${a.stopp} maskiner ska stå tills det är lagat`;
    return { ...bas, under: stopp, ton: 'rod', attGora: true };
  }
  if (a.antal > 0) return { ...bas, under: a.antal === 1 ? '1 att åtgärda' : `${a.antal} att åtgärda`, ton: 'orange', attGora: true };
  return { ...bas, under: 'Inget att åtgärda', attGora: false };
}

function rondRad(l: Indata['skyddsrond']): OversiktRad {
  const bas = { id: 'skyddsrond' as const, titel: 'Skyddsrond', href: '/skyddsrond' };
  if (!l) return felRad(bas.id, bas.titel, bas.href);
  if (l.typ === 'pagar') return { ...bas, under: `Pågår · ${antalBesvarade(l.rond)} av ${l.rond.punkter.length}`, ton: 'orange', attGora: true };
  if (l.typ === 'dags') {
    return { ...bas, under: l.senast?.klar ? `Dags igen · förra ${datumText(l.senast.klar)}` : 'Ingen gjord än · en gång om året', ton: 'orange', attGora: true };
  }
  return { ...bas, under: `Gjord ${datumText(l.senast.klar!)} · nästa om ett år`, attGora: false };
}

function riskRad(r: Risk, arAdmin: boolean, medarbetareId: string, nu: Date): OversiktRad {
  const bas = { id: 'riskbedomning' as const, titel: 'Riskbedömning', href: '/riskbedomning' };
  if (!r) return felRad(bas.id, bas.titel, bas.href);
  if (arAdmin) {
    const godkanda = MASKINTYPER.filter(t => riskLage(t, r.bedomningar[t], nu) === 'godkand').length;
    if (godkanda === MASKINTYPER.length) return { ...bas, under: 'Alla är godkända', attGora: false };
    return { ...bas, under: `${godkanda} av ${MASKINTYPER.length} godkända`, ton: 'orange', attGora: true };
  }
  // Föraren läser sin maskin och oljor och kemikalier (ALLA_LASER).
  const typer = forarensTyper(r.minTyp).filter(t => synligForForare(riskLage(t, r.bedomningar[t], nu)));
  if (typer.length === 0) {
    return { ...bas, under: r.minTyp ? `Riskerna för ${TYP_BESTAMD[r.minTyp]} är inte klara än` : 'Vad som är farligt i arbetet', attGora: false };
  }
  if (!r.kvitton) return felRad(bas.id, bas.titel, bas.href);
  const kvar = attLasa(r.minTyp, r.bedomningar, r.kvitton, medarbetareId, nu);
  if (kvar.length > 0) return { ...bas, under: `Läs riskerna för ${kvar.map(t => TYP_BESTAMD[t]).join(' och ')}`, ton: 'orange', attGora: true };
  const senast = typer.map(t => lastTid(r.kvitton!, medarbetareId, t, underlag(lista(t, r.bedomningar[t]))) ?? '').sort().pop()!;
  return { ...bas, under: `Läst ${datumText(senast)}`, attGora: false };
}

function maskinkollRad(n: number | null): OversiktRad {
  const bas = { id: 'maskinkoll' as const, titel: 'Maskinkoll', href: '/maskinkoll' };
  if (n == null) return felRad(bas.id, bas.titel, bas.href);
  return n > 0
    ? { ...bas, under: 'Dags för månadens koll · ca 1 min', ton: 'orange', attGora: true }
    : { ...bas, under: 'Ingen koll att göra nu', attGora: false };
}

function kemikalieRad(k: readonly Kemikalie[] | null, arAdmin: boolean): OversiktRad {
  const bas = { id: 'kemikalier' as const, titel: 'Kemikalier', href: '/kemikalier' };
  if (!k) return felRad(bas.id, bas.titel, bas.href);
  if (k.length === 0) return { ...bas, under: arAdmin ? 'Lägg in oljor och sprayer ni har' : 'Säkerhetsbladen för oljor och sprayer', attGora: false };
  const s = kemSvar(k);
  // Ett saknat blad är något admin gör; för föraren är det information.
  return s.ton ? { ...bas, under: s.text, ton: 'orange', attGora: arAdmin } : { ...bas, under: `${s.text} · ${s.under}`, attGora: false };
}

/** Farligt avfall är aldrig något att göra här — det antecknas när det lämnas. Väntar något på täckning står det i orange. */
function avfallRad(l: readonly Lamning[] | null): OversiktRad {
  const bas = { id: 'avfall' as const, titel: 'Farligt avfall', href: '/farligt-avfall' };
  if (!l) return felRad(bas.id, bas.titel, bas.href);
  const s = avfallSvar(l);
  if (s.ton) return { ...bas, under: s.text, ton: 'orange', attGora: false };
  return { ...bas, under: l.length === 0 ? 'Gamla slangar, oljiga trasor och tomma dunkar' : `${s.text} · ${s.under}`, attGora: false };
}

function saGorViRad(d: Indata['saGorVi'], arAdmin: boolean, medarbetareId: string, nu: Date): OversiktRad {
  const bas = { id: 'sagorvi' as const, titel: 'Så gör vi', href: '/sa-gor-vi' };
  if (!d) return felRad(bas.id, bas.titel, bas.href);
  const s = saGorViSvar(arAdmin, d.g, d.kvitton, medarbetareId, nu);
  return s.ton ? { ...bas, under: s.text, ton: 'orange', attGora: true } : { ...bas, under: s.text, attGora: false };
}

function introRad(i: Indata['intro']): OversiktRad {
  const bas = { id: 'introduktion' as const, titel: 'Introduktion', href: '/introduktion' };
  if (i === undefined) return { ...bas, under: 'Det en ny förare ska veta', attGora: false };
  if (i === null) return felRad(bas.id, bas.titel, bas.href);
  return i.klarTid ? { ...bas, under: lageText(i), attGora: false } : { ...bas, under: lageText(i), ton: 'orange', attGora: true };
}

function arshjulOversikt(a: ArshjulRad[] | null, nu: Date): OversiktRad {
  const bas = { id: 'arshjul' as const, href: '/arbetsmiljo?ar=1' };
  const ar = svenskArManad(nu).ar;
  if (!a) return felRad(bas.id, `Året ${ar}`, bas.href);
  return { ...bas, ...arshjulRad(a, ar) };
}

/** Raderna i en fast ordning — det som ska åtgärdas först, sedan det man gör själv, sist det nya förare läser. */
export function byggRader(d: Indata, nu: Date = new Date()): OversiktRad[] {
  const rader: OversiktRad[] = [];
  if (d.serArbetsledning) {
    rader.push(atgardRad(d.atgarder), rondRad(d.skyddsrond));
    if (d.arshjul !== undefined) rader.push(arshjulOversikt(d.arshjul, nu));
  }
  rader.push(
    riskRad(d.risk, d.arAdmin, d.medarbetareId, nu),
    maskinkollRad(d.maskinkoll),
    ...(d.kemikalier !== undefined ? [kemikalieRad(d.kemikalier, d.arAdmin)] : []),
    ...(d.saGorVi !== undefined ? [saGorViRad(d.saGorVi, d.arAdmin, d.medarbetareId, nu)] : []),
    ...(d.avfall !== undefined ? [avfallRad(d.avfall)] : []),
    { id: 'rapportera', titel: 'Rapportera', href: '/om-nagot-hander?rapport=1', under: 'Något trasigt, nära att hända eller en skada', attGora: false },
    introRad(d.intro),
  );
  return rader;
}

/** Svaret överst. Aldrig "i ordning" när något inte gick att läsa. */
export function svar(rader: readonly OversiktRad[]): { text: string; ton?: Ton } {
  const n = rader.filter(r => r.attGora).length;
  const stopp = rader.some(r => r.attGora && r.ton === 'rod');
  if (n > 0) return { text: n === 1 ? '1 sak behöver dig' : `${n} saker behöver dig`, ton: stopp ? 'rod' : 'orange' };
  if (rader.some(r => r.fel)) return { text: 'Allt kunde inte läsas' };
  return { text: 'Allt är i ordning' };
}

/**
 * Startsidans märke på kortet Arbetsmiljö: samma räkning som sidans svar, ur det startsidan redan läser
 * (maskinkoll, åtgärder, Behöver dig-raderna för riskbedömning och skyddsrond, introduktionen). Inget känt = null (inget märke).
 */
export function startsidaAntal(p: { maskinkoll: number | null; atgarder: number | null; rader: number; introduktion: boolean }): number | null {
  const n = (p.maskinkoll && p.maskinkoll > 0 ? 1 : 0) + (p.atgarder && p.atgarder > 0 ? 1 : 0) + p.rader + (p.introduktion ? 1 : 0);
  return n > 0 ? n : null;
}
