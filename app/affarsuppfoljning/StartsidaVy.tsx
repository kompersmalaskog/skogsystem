'use client';

// AFFÄRSUPPFÖLJNINGENS ÖVERSIKT — "hur går året för Vida?" Samma byggstenar som arbetsrapporten (Min tid): stor rubrik med
// väljare, talet i ett kort, staplarna, en etikett ovanför varje kort och rader med ›. Så enkelt att ett barn förstår:
//   1. "2026 ⌄"
//   2. kortet: 44 732 m³ · "till Vida i år" · antal objekt
//   3. PER MÅNAD: staplar som i Min tid — tryck på en månad, raden ovanför säger månaden och volymen, tryck på den öppnar månaden
//   4. VAD DET BLEV: grantimmer, talltimmer, kubb, massaved, energi och övrigt, löv — kubik, inga procent
//   5. ett tryck på ett sågbart sortiment visar vart det gick (industrierna), ett tryck på Löv visar vad lövet blev
// Totalen är summan av de avrundade raderna (skillen: "Summan är summan av det som visas").

import { useMemo, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, KORT, RADIE, SORTIMENTFARG, TNUM, TRAFFYTA, TYP, VIKT, overgang } from '@/lib/design/tokens';
import { SIDA, nf0, stor, manadNamn, Rubrikrad, Tillbakarad, Stort, Damp, Rad, Rader, Etikett, Stycken } from '@/components/Ytform';

export const BAS = '/affarsuppfoljning';
export type Vy = 'ar' | 'sortiment' | 'sa-raknas';

type Industri = { namn: string; andel: number; volym: number; ar_industri: boolean };
type SortRad = { namn: string; andel: number; volym: number; nyckel: string; sagbart?: boolean; industrier?: Industri[] };
export type Oversikt = {
  ar: number; manad: string | null; bolag: string;
  barr: { andel: number; volym: number; rader: SortRad[] };
  lov: { andel: number; volym: number; rader: SortRad[] };
  objekt: { namn: string; volym: number; objekt_id: string; vo_nummer: string | null }[];
  manader: { manad: string; volym: number }[];
  total_volym: number; antal_objekt: number;
};

const PRICK: Record<string, string> = {
  grantimmer: SORTIMENTFARG.timmer, talltimmer: SORTIMENTFARG.timmer, kubb: SORTIMENTFARG.kubb,
  massaved: SORTIMENTFARG.massa, energi: SORTIMENTFARG.ovrigt,
};
const r0 = (v: number) => Math.round(v);
/** Hela procent som summerar till 100 (största resten), så raderna går att räkna ihop. */
function hela(volymer: number[]): number[] {
  const sum = volymer.reduce((a, b) => a + b, 0);
  if (sum <= 0) return volymer.map(() => 0);
  const exakt = volymer.map(v => (100 * v) / sum);
  const ut = exakt.map(Math.floor);
  let kvar = 100 - ut.reduce((a, b) => a + b, 0);
  exakt.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (kvar-- > 0) ut[i]++; });
  return ut;
}
/** Ett objekt per trakt: ett numeriskt VO slår ihop skördarens och skotarens rad (samma regel som månadssidan). */
const antalTrakter = (o: Oversikt['objekt']) => new Set(o.map(x => (x.vo_nummer && /^[0-9]+$/.test(x.vo_nummer) ? x.vo_nummer : x.objekt_id))).size;

const STAPEL_H = 120;   // grafens höjd — ett layoutmått, som i Min tid (TimmarGraf)
const DAMPAD = 0.22;

/** Månadsstaplarna — Min tids form: vald månad vit, övriga samma vita dämpade, ingen axel. */
function Staplar({ manader, vald, valj, framtid }: { manader: Oversikt['manader']; vald: string; valj: (m: string) => void; framtid: (m: string) => boolean }) {
  const max = Math.max(1, ...manader.map(m => m.volym));
  return (
    <div style={{ display: 'flex', gap: AVSTAND.xs }}>
      {manader.map(m => {
        const kommande = framtid(m.manad);
        const markerad = m.manad === vald;
        const h = m.volym > 0 ? Math.max(4, (m.volym / max) * STAPEL_H) : 2;
        return (
          <button key={m.manad} disabled={kommande} onClick={() => valj(m.manad)} aria-pressed={markerad}
            aria-label={`${manadNamn(m.manad)}: ${kommande ? 'kommande' : `${nf0(m.volym)} kubik`}`}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none',
                     padding: 0, fontFamily: 'inherit', color: 'inherit', cursor: kommande ? 'default' : 'pointer', minHeight: TRAFFYTA.min }}>
            <div style={{ width: '100%', height: STAPEL_H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
              {!kommande && <div style={{ width: '56%', height: h, background: FARG.text, opacity: markerad ? 1 : DAMPAD,
                                          borderRadius: `${RADIE.stapel}px ${RADIE.stapel}px 0 0`, transition: overgang('opacity') }} />}
            </div>
            <span style={{ ...TYP.meta, marginTop: AVSTAND.s, color: markerad ? FARG.text : kommande ? FARG.text3 : FARG.text2,
                           fontWeight: markerad ? VIKT.halvfet : VIKT.normal }}>
              {manadNamn(m.manad).charAt(0).toUpperCase()}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function StartsidaVy({ d, ar, aren, idag, vy, sortiment, gaTill }: {
  d: Oversikt; ar: number; aren: number[]; idag: Date; vy: Vy; sortiment: string | null;
  gaTill: (href: string, ersatt?: boolean) => void;
}) {
  const nuAr = idag.getFullYear();
  const nuManad = `${nuAr}-${String(idag.getMonth() + 1).padStart(2, '0')}`;
  const iAr = ar === nuAr ? 'i år' : `under ${ar}`;
  const arUrl = `${BAS}?ar=${ar}`;

  // Raderna, avrundade — totalen är deras summa.
  const barr = d.barr.rader.map(x => ({ ...x, v: r0(x.volym) }));
  const lovV = d.lov.rader.reduce((a, x) => a + r0(x.volym), 0);
  const total = barr.reduce((a, x) => a + x.v, 0) + lovV;
  const trakter = useMemo(() => antalTrakter(d.objekt), [d.objekt]);

  const senastMedVolym = [...d.manader].reverse().find(m => m.volym > 0 && m.manad <= nuManad)?.manad ?? d.manader[0]?.manad ?? '';
  const [vald, setVald] = useState(ar === nuAr ? nuManad : senastMedVolym);
  const valdRad = d.manader.find(m => m.manad === vald);
  const manadUrl = (m: string) => `${BAS}/manad?manad=${m}&atgard=Allt&bolag=Vida`;

  // ── Så räknas ───────────────────────────────────────────────────────────
  if (vy === 'sa-raknas') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={arUrl} text={String(ar)} />
        <Stycken>
          <p style={{ margin: `0 0 ${AVSTAND.s}px` }}>Bara Vidas trakter, alla åtgärder. Volymen är kubikmeter fast under bark, mätt av skördaren.</p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px` }}>Hemved räknas inte — den går till markägaren, inte till Vida.</p>
          <p style={{ margin: `0 0 ${AVSTAND.s}px` }}>Kubb räknar klentimmer. Energi och övrigt är energived, avkap och det som inte har ett sortiment.</p>
          <p style={{ margin: 0 }}>Talet läses direkt ur stockarna varje gång sidan öppnas, så det är alltid aktuellt.</p>
        </Stycken>
      </div>
    );
  }

  // ── Ett sortiment öppnat: vart det gick, eller vad lövet blev ────────────
  if (vy === 'sortiment') {
    const arLov = sortiment === 'lov';
    const rad = barr.find(x => x.nyckel === sortiment);
    const delar = arLov
      ? d.lov.rader.map(x => ({ namn: x.namn, v: r0(x.volym) })).filter(x => x.v > 0)
      : (rad?.industrier ?? []).map(x => ({ namn: x.namn, v: r0(x.volym) })).filter(x => x.v > 0);
    const summa = delar.reduce((a, x) => a + x.v, 0);
    const pct = hela(delar.map(x => x.v));
    const namn = arLov ? 'Löv' : rad?.namn ?? 'Sortimentet';
    return (
      <div style={SIDA}>
        <Tillbakarad href={arUrl} text={String(ar)} />
        <Stort tal={nf0(summa)} enhet="m³" ordrad={`${namn.toLowerCase()} till Vida ${iAr}`} />
        {delar.length > 0 ? (
          <Rader rubrik={arLov ? 'Vad lövet blev' : 'Vart det gick'}>
            {delar.map((x, i) => <Rad key={x.namn} text={x.namn} tal={`${nf0(x.v)} m³`} hoger={`${pct[i]} %`} />)}
          </Rader>
        ) : (
          <div style={{ ...KORT, margin: `${AVSTAND.m}px ${AVSTAND.l}px 0`, ...TYP.meta, color: FARG.text2 }}>
            {arLov ? 'Inget löv till Vida' : 'Det här sortimentet har ingen industri i datan'} {iAr}.
          </div>
        )}
      </div>
    );
  }

  // ── Året ────────────────────────────────────────────────────────────────
  return (
    <div style={SIDA}>
      <Rubrikrad text={String(ar)} value={String(ar)} label="År" onChange={v => gaTill(`${BAS}?ar=${v}`, true)}>
        {aren.map(a => <option key={a} value={a}>{a}</option>)}
      </Rubrikrad>

      <Stort tal={nf0(total)} enhet="m³" ordrad={`till Vida ${iAr}`}>
        {total > 0 && <Damp>{trakter} {trakter === 1 ? 'trakt' : 'trakter'}</Damp>}
      </Stort>

      {total > 0 && (
        <>
          <Etikett>Per månad</Etikett>
          <div style={{ ...KORT, margin: `0 ${AVSTAND.l}px` }}>
            {/* Vald månad i klartext — tryck öppnar månaden. Samma höjd oavsett val, så staplarna står still. */}
            <button onClick={() => valdRad && valdRad.volym > 0 && gaTill(manadUrl(vald))} disabled={!valdRad || valdRad.volym <= 0}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center', minHeight: TRAFFYTA.min,
                       background: 'none', border: 'none', padding: 0, marginBottom: AVSTAND.s, fontFamily: 'inherit', color: FARG.text,
                       cursor: valdRad && valdRad.volym > 0 ? 'pointer' : 'default', textAlign: 'left' }}>
              <span style={{ ...TYP.listtitel }}>{vald ? stor(manadNamn(vald)) : ''}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.listtitel, ...TNUM }}>
                {valdRad ? `${nf0(valdRad.volym)} m³` : ''}
                {valdRad && valdRad.volym > 0 && <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />}
              </span>
            </button>
            <Staplar manader={d.manader} vald={vald} valj={setVald} framtid={m => m > nuManad} />
          </div>

          <Rader rubrik="Vad det blev">
            {barr.filter(x => x.v > 0).map(x => (
              <Rad key={x.nyckel} text={x.namn} prick={PRICK[x.nyckel]} tal={`${nf0(x.v)} m³`}
                href={x.sagbart && (x.industrier?.length ?? 0) > 0 ? `${arUrl}&s=${x.nyckel}` : undefined} />
            ))}
            {lovV > 0 && <Rad text="Löv" tal={`${nf0(lovV)} m³`} href={`${arUrl}&s=lov`} />}
          </Rader>
        </>
      )}

      <Rader>
        <Rad text="Massavedens längd" sub="Håller vi Vidas 4,6 m?" href="/affarsuppfoljning/kvalitet" />
        <Rad text="Så räknas" href={`${arUrl}&vy=sa-raknas`} dampad />
      </Rader>
    </div>
  );
}
