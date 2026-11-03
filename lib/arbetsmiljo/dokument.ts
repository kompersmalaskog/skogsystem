// Arbetsmiljöns dokument som PDF (2026-11-02): skyddsronden och riskbedömningen per maskintyp. Det Arbetsmiljöverket ber att få se vid
// en inspektion — AFS 2023:1 kräver att riskbedömningen och skyddsronden finns skriftligt, med åtgärderna och när de ska vara gjorda.
//
// Här byggs bara INNEHÅLLET (ren, testad): rubrik, fakta, svaret i en mening och avsnitt med rader. Varje text står också i appen, så
// PDF:en och skärmen kan aldrig säga olika saker. Ritningen är lib/arbetsmiljo/pdf.ts.

import { grupperaPunkter, antalBrister, type Rond, type SvarTyp } from './skyddsrond';
import {
  ALLA_LASER, MASKINTYPER, TYP_NAMN, lage, lastTid, lista, underlag,
  type Bedomning, type Kvitto, type MaskinTyp,
} from './maskinRisk';

/** bra = grön, brist = orange, dampad = grå, ingen = svart. */
export type Ton = 'bra' | 'brist' | 'dampad';
export type DokRad = { titel: string; text?: string; status?: string; ton?: Ton };
export type DokSektion = { rubrik: string; under?: string; rader: DokRad[] };
export type Dokument = {
  titel: string;
  /** Filnamn utan ändelse. */
  filnamn: string;
  fakta: { etikett: string; varde: string }[];
  /** Svaret i en mening, stort överst. */
  svar: string;
  svarTon?: Ton;
  sektioner: DokSektion[];
  /** Dämpad rad sist. */
  not?: string;
};

const TZ = 'Europe/Stockholm';
const MANADER = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/** 'YYYY-MM-DD' i svensk tid. */
function svDag(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** "2 november 2026" (svensk tid). Ett rent datum ('YYYY-MM-DD') tolkas som den dagen. */
export function langtDatum(iso: string): string {
  const dag = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : svDag(iso);
  const [a, m, d] = dag.split('-').map(Number);
  return `${d} ${MANADER[m - 1]} ${a}`;
}

const fornamn = (n: string | null | undefined) => n?.trim().split(/\s+/)[0] || null;

// ── Skyddsronden ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Åtgärden som en brist blev (am_atgard, kalla 'skyddsrond'). */
export type RondAtgard = { svarId: string; status: 'oppen' | 'klar'; deadline: string | null; vadGjordes: string | null; stangdTid: string | null };

const SVAR_ORD: Record<SvarTyp, string> = { ok: 'Bra', brist: 'Brist', galler_inte: 'Gäller inte' };
const SVAR_TON: Record<SvarTyp, Ton> = { ok: 'bra', brist: 'brist', galler_inte: 'dampad' };

function bristerText(n: number): string {
  return n === 0 ? 'Inga brister' : n === 1 ? '1 brist' : `${n} brister`;
}

/** Vad som hänt med bristen. Saknas åtgärden (läsfel eller borttagen) säger raden det — aldrig en gissning. */
export function atgardStatus(a: RondAtgard | undefined, idag: string): { status: string; ton: Ton } {
  if (!a) return { status: 'Åtgärden kunde inte läsas', ton: 'dampad' };
  if (a.status === 'klar') {
    const nar = a.stangdTid ? ` ${langtDatum(a.stangdTid)}` : '';
    return { status: `Åtgärdad${nar}${a.vadGjordes ? ` – ${a.vadGjordes}` : ''}`, ton: 'bra' };
  }
  if (a.deadline && a.deadline < idag) return { status: `Inte åtgärdad · skulle vara klar ${langtDatum(a.deadline)}`, ton: 'brist' };
  return { status: a.deadline ? `Inte åtgärdad än · senast ${langtDatum(a.deadline)}` : 'Inte åtgärdad än', ton: 'brist' };
}

/**
 * En klar skyddsrond. `atgarder` = null när åtgärderna inte gick att läsa: bristerna står då utan status och en not säger det.
 * Bristerna kommer först (det som ska göras), sedan alla punkter område för område.
 */
export function skyddsrondDokument(rond: Rond, atgarder: readonly RondAtgard[] | null, nu: Date = new Date()): Dokument {
  const idag = svDag(nu.toISOString());
  const brister = rond.punkter
    .map(p => ({ p, s: rond.svar.find(x => x.punkt === p.id) }))
    .filter(x => x.s?.svar === 'brist');
  const atgardFor = (svarId: string | undefined) => (svarId ? atgarder?.find(a => a.svarId === svarId) : undefined);
  const gjorda = atgarder ? brister.filter(b => atgardFor(b.s?.id)?.status === 'klar').length : 0;

  const svar = brister.length === 0 ? 'Inga brister'
    : !atgarder ? bristerText(brister.length)
    : `${bristerText(brister.length)} · ${gjorda === brister.length ? 'alla åtgärdade' : `${gjorda} av ${brister.length} åtgärdade`}`;

  const sektioner: DokSektion[] = [];
  if (brister.length > 0) {
    sektioner.push({
      rubrik: 'Vad ska åtgärdas?',
      // Det som inte är gjort först; inom varje grupp punkternas ordning.
      rader: brister
        .map(({ p, s }) => {
          const st = atgarder ? atgardStatus(atgardFor(s?.id), idag) : null;
          return { titel: p.text, text: s?.beskrivning ?? undefined, status: st?.status, ton: st?.ton };
        })
        .sort((a, b) => Number(a.ton === 'bra') - Number(b.ton === 'bra')),
    });
  }
  for (const g of grupperaPunkter(rond.punkter)) {
    sektioner.push({
      rubrik: g.namn,
      rader: g.punkter.map(p => {
        const s = rond.svar.find(x => x.punkt === p.id);
        if (!s) return { titel: p.text, status: 'Inte besvarad', ton: 'dampad' as Ton };
        return { titel: p.text, text: s.svar === 'brist' ? s.beskrivning ?? undefined : undefined, status: SVAR_ORD[s.svar], ton: SVAR_TON[s.svar] };
      }),
    });
  }

  const dag = rond.klar ?? rond.startad;
  return {
    titel: 'Skyddsrond',
    filnamn: `skyddsrond-${svDag(dag)}`,
    fakta: [
      { etikett: 'Datum', varde: langtDatum(dag) },
      { etikett: 'Gick ronden', varde: rond.deltagare?.trim() || 'Saknas' },
      { etikett: 'Punkter', varde: `${rond.punkter.length} · ${bristerText(antalBrister(rond)).toLowerCase()}` },
    ],
    svar,
    svarTon: brister.length === 0 || (atgarder && gjorda === brister.length) ? 'bra' : 'brist',
    sektioner,
    not: atgarder
      ? 'En brist blir en åtgärd som ska vara gjord inom 30 dagar. Skyddsronden görs en gång om året av arbetsledningen och skyddsombudet (AFS 2023:1).'
      : 'Åtgärderna kunde inte läsas när dokumentet skapades. Skyddsronden görs en gång om året av arbetsledningen och skyddsombudet (AFS 2023:1).',
  };
}

// ── Riskbedömningen per maskintyp ────────────────────────────────────────────────────────────────────────────────────

export type RiskForare = { id: string; namn: string; typ: MaskinTyp | null };

/**
 * Alla fyra maskintyper i ett dokument. `namn` = medarbetarnas namn (för "godkänd av"); `forare` = null när förarna inte gick att läsa
 * (då står ingen rad om vem som läst). Varje typ säger om den är godkänd — en ändrad eller aldrig godkänd bedömning sägs rakt ut.
 */
export function riskDokument(
  bedomningar: Record<MaskinTyp, Bedomning>,
  namn: Record<string, string>,
  forare: readonly RiskForare[] | null,
  kvitton: readonly Kvitto[],
  nu: Date = new Date(),
): Dokument {
  const godkanda = MASKINTYPER.filter(t => lage(t, bedomningar[t], nu) === 'godkand').length;
  const sektioner: DokSektion[] = MASKINTYPER.map(t => {
    const b = bedomningar[t];
    const l = lage(t, b, nu);
    const risker = lista(t, b);
    const av = b.godkandAv ? fornamn(namn[b.godkandAv]) : null;
    const under = l === 'aldrig' ? 'Inte godkänd'
      : l === 'andrad' ? `Ändrad efter godkännandet ${langtDatum(b.godkandTid!)} – inte godkänd igen`
      : `Godkänd ${langtDatum(b.godkandTid!)}${av ? ` av ${av}` : ''}${l === 'se_over' ? ' – över ett år sedan, ska ses över' : ''}`;
    const rader: DokRad[] = risker.length === 0
      ? [{ titel: 'Inga risker', ton: 'dampad' }]
      : risker.map(r => ({ titel: r.risk, text: r.atgard }));
    if (forare && l !== 'aldrig' && l !== 'andrad') {
      const u = underlag(risker);
      const deras = ALLA_LASER.includes(t) ? [...forare] : forare.filter(f => f.typ === t);
      if (deras.length > 0) {
        const delar = deras.map(f => {
          const tid = lastTid(kvitton, f.id, t, u);
          return tid ? `${fornamn(f.namn)} ${langtDatum(tid)}` : `${fornamn(f.namn)} har inte läst`;
        });
        const alla = deras.every(f => lastTid(kvitton, f.id, t, u));
        rader.push({ titel: 'Lästa av förarna', text: delar.join(' · '), ton: alla ? 'bra' : 'brist' });
      }
    }
    return { rubrik: TYP_NAMN[t], under, rader };
  });
  return {
    titel: 'Riskbedömning – maskinerna och kemikalierna',
    filnamn: `riskbedomning-${svDag(nu.toISOString())}`,
    fakta: [
      { etikett: 'Utskriven', varde: langtDatum(nu.toISOString()) },
      { etikett: 'Gäller', varde: 'Skördare, skotare, lastbil, motorsåg samt oljor och kemikalier' },
    ],
    svar: godkanda === MASKINTYPER.length ? 'Alla är godkända' : `${godkanda} av ${MASKINTYPER.length} godkända`,
    svarTon: godkanda === MASKINTYPER.length ? 'bra' : 'brist',
    sektioner,
    not: 'Varje risk står med vad föraren gör. Bedömningen ses över varje år och när något ändras. Riskerna på varje trakt bedöms i planeringen innan maskinen börjar (AFS 2023:1).',
  };
}
