'use client';

import { useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, KNAPP, KORT, RADIE, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { sthlmDelar } from '@/lib/sthlmTid';
import { fmtDatum } from './nu';
import { fmtMinuter } from './rundaText';
import { dagarSedan, grupperaMaskiner, manadKort, manaderAttVisa, perManad, saknarKmText, saknarTidText, tidPaLastbilen, type Flytt, type Maskin } from './maskiner';
import { byggResa, type Steg } from './maskinResa';
import { useResa } from './useResa';
import type { MaskinerLage } from './useMaskiner';

const km = (v: number) => `${Math.round(v).toLocaleString('sv-SE')} km`;

/** En rad i arket: namn till vänster, värde till höger, en dämpad rad under. Tryckbar (admin) → öppnar flytten. */
function Rad({ rubrik, under, hoger, hogerUnder, onTryck, etikett, sista }: {
  rubrik: string; under?: string | null; hoger?: string; hogerUnder?: string | null; onTryck?: () => void; etikett?: string; sista?: boolean;
}) {
  const innehall: ReactNode = (
    <>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{rubrik}</div>
        {under && <div style={{ ...TYP.meta, color: FARG.text2 }}>{under}</div>}
      </div>
      {hoger && (
        <div style={{ textAlign: 'right', ...TNUM }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{hoger}</div>
          {hogerUnder && <div style={{ ...TYP.meta, color: FARG.text2 }}>{hogerUnder}</div>}
        </div>
      )}
      {onTryck && <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>}
    </>
  );
  const stil = { ...RAD, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, ...(sista ? { borderBottom: 'none' } : {}) };
  return onTryck
    ? <button type="button" onClick={onTryck} aria-label={etikett} style={{ ...stil, width: '100%', background: 'none', border: 'none', borderBottom: stil.borderBottom, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>{innehall}</button>
    : <div style={stil}>{innehall}</div>;
}

/** Ett tal med vad det betyder under — rutorna överst i maskinens ark. */
function Ruta({ varde, text, data }: { varde: string; text: string; data: string }) {
  return (
    <div data-ruta={data} style={{ background: FARG.upphojt, borderRadius: RADIE.rad, padding: AVSTAND.m, minWidth: 0 }}>
      <div style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{varde}</div>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>{text}</div>
    </div>
  );
}

/** Hur många dagar sedan, i ord: "idag", "1 dag", "18 dagar". */
const sedanOrd = (d: number) => (d === 0 ? 'idag' : d === 1 ? '1 dag' : `${d} dagar`);
const MANAD_LANG = ['Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni', 'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December'];
/** Stoppen som syns innan man trycker "Visa äldre". */
const RESA_SYNLIGA = 8;

/**
 * Maskinens ark (Martin 2026-10-24: "det är ju rena skiten — rita upp nytt"). Svaret överst ("18 flyttar med lastbil"),
 * tre rutor (tid på lastbilen · km · dagar per trakt), flyttar per månad, och resan "Här har Giant varit": varje trakt EN gång,
 * nyast överst, med hur den kom dit — lastbil eller körde själv (maskinens egna filer, `maskinResa.ts`). Bara att läsa.
 */
function MaskinArk({ maskin, ar, manader, onStang }: { maskin: Maskin; ar: number; manader: number[]; onStang: () => void }) {
  const nu = new Date();
  const innevarandeAr = sthlmDelar(nu)?.ar === ar;
  const resaLas = useResa(maskin.extern ? null : maskin.nyckel, ar);
  const resa = resaLas.lage.lage === 'klar' ? byggResa(resaLas.lage.dagar, maskin.flyttar) : null;
  const [visaAlla, setVisaAlla] = useState(false);
  const tid = tidPaLastbilen(maskin);
  const staplar = perManad(maskin, manader);
  const senaste = resa?.steg[0]?.stopp ?? null;
  const nuText = !innevarandeAr || maskin.extern ? null
    : resaLas.lage.lage === 'laddar' ? 'Läser var den är …'
    : senaste ? `Är på ${senaste.namn} sedan ${sedanOrd(dagarSedan(`${senaste.fran}T12:00:00Z`, nu) ?? 0)}`
    : null;
  const dagarPerTrakt = resa?.dagarPerTrakt.snitt != null ? `${Math.max(1, Math.round(resa.dagarPerTrakt.snitt))} ${Math.round(resa.dagarPerTrakt.snitt) <= 1 ? 'dag' : 'dagar'}` : '–';

  return (
    <Ark rubrik={maskin.namn} onStang={onStang} stang="Klar">
      {/* Svaret först. Arket ÄR ett kort: rutorna är upphöjda ytor, inga kort i kortet. */}
      <div style={{ marginBottom: AVSTAND.m }}>
        <div data-maskin-antal style={{ ...TYP.tal, ...TNUM, color: FARG.text }}>{maskin.antal} {maskin.antal === 1 ? 'flytt' : 'flyttar'}{maskin.extern ? '' : ' med lastbil'}</div>
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{innevarandeAr ? 'i år' : `i ${ar}`}</div>
        {nuText && <div data-maskin-nu style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.s }}>{nuText}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${maskin.extern ? 2 : 3}, minmax(0, 1fr))`, gap: AVSTAND.s, marginBottom: AVSTAND.m }}>
        <Ruta data="tid" varde={tid.min > 0 ? fmtMinuter(tid.min) : 'tid saknas'} text={tid.saknar > 0 && tid.min > 0 ? `på lastbilen · ${saknarTidText(tid.saknar)}` : 'på lastbilen'} />
        <Ruta data="km" varde={maskin.km > 0 || maskin.saknarKm === 0 ? km(maskin.km) : 'km saknas'} text={maskin.saknarKm > 0 && maskin.km > 0 ? `med lastbil · ${saknarKmText(maskin.saknarKm)}` : 'med lastbil'} />
        {!maskin.extern && <Ruta data="trakt" varde={resa ? dagarPerTrakt : '…'} text={resa && resa.dagarPerTrakt.snitt == null ? 'för få trakter för snitt' : 'jobbar på varje trakt'} />}
      </div>

      {manader.length > 1 && (
        <div style={{ background: FARG.upphojt, borderRadius: RADIE.rad, padding: AVSTAND.m, marginBottom: AVSTAND.l }}>
          <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>Flyttar med lastbil per månad</div>
          <ManadsStaplar staplar={staplar} max={Math.max(0, ...staplar.map(x => x.antal))} />
        </div>
      )}

      {maskin.extern ? (
        <Sektion rubrik="Vart flyttades de?" kort={false}>
          <div data-maskin-flyttar>
            {maskin.flyttar.map((f, i) => <FlyttRad key={f.id} f={f} visaMaskin sista={i === maskin.flyttar.length - 1} />)}
          </div>
        </Sektion>
      ) : (
        <Sektion rubrik={`Här har ${maskin.namn} varit`} kort={false}>
          {resaLas.lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Läser maskinens filer …</p>}
          {resaLas.lage.lage === 'fel' && (
            <div>
              <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte läsa var maskinen jobbat. Här är bara lastbilens flyttar.</p>
              <button type="button" onClick={resaLas.forsokIgen} style={{ ...KNAPP.sekundar, marginBottom: AVSTAND.m }}>Försök igen</button>
              <div data-maskin-flyttar>
                {maskin.flyttar.map((f, i) => <FlyttRad key={f.id} f={f} visaMaskin={false} sista={i === maskin.flyttar.length - 1} />)}
              </div>
            </div>
          )}
          {resa && (
            <>
              <div data-resa-summa style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>
                {[`Med lastbil ${resa.lastbil} ${resa.lastbil === 1 ? 'gång' : 'gånger'}`, `körde själv ${resa.sjalv} ${resa.sjalv === 1 ? 'gång' : 'gånger'}`].join(' · ')}. Nyast överst.
              </div>
              {resa.steg.length === 0
                ? <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Inga filer och inga flyttar i {ar}.</p>
                : <ResaLista steg={visaAlla ? resa.steg : resa.steg.slice(0, RESA_SYNLIGA)} nuFinns={innevarandeAr} />}
              {!visaAlla && resa.steg.length > RESA_SYNLIGA && (
                <button type="button" data-visa-aldre onClick={() => setVisaAlla(true)} style={{ ...KNAPP.lank, width: '100%', minHeight: TRAFFYTA.min }}>
                  Visa {resa.steg.length - RESA_SYNLIGA} äldre
                </button>
              )}
            </>
          )}
        </Sektion>
      )}
    </Ark>
  );
}

/** Resan: en prick per trakt, och mellan prickarna hur maskinen kom dit. Månadsrubrik när månaden byts. */
function ResaLista({ steg, nuFinns }: { steg: Steg[]; nuFinns: boolean }) {
  const PRICK = AVSTAND.m;
  return (
    <ol data-resa style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {steg.map((s, i) => {
        const man = Number(s.stopp.fran.slice(5, 7));
        const nyManad = i === 0 || Number(steg[i - 1].stopp.fran.slice(5, 7)) !== man;
        const arNu = i === 0 && nuFinns;
        const under = arNu && s.stopp.dagar > 0 ? `jobbar här nu · ${s.stopp.dagar} ${s.stopp.dagar === 1 ? 'dag' : 'dagar'} hittills`
          : s.stopp.dagar === 0 ? 'inga filer härifrån'
          : `jobbade ${s.stopp.dagar} ${s.stopp.dagar === 1 ? 'dag' : 'dagar'}`;
        const hit = s.hit?.typ === 'lastbil'
          ? { ikon: 'local_shipping', text: ['Lastbil', fmtDatum(s.hit.flytt.lossad), s.hit.flytt.km != null ? km(s.hit.flytt.km) : 'km saknas', s.hit.flytt.min != null ? fmtMinuter(s.hit.flytt.min) : 'tid saknas'].join(' · ') }
          : s.hit?.typ === 'sjalv' ? { ikon: 'agriculture', text: `Körde själv · ${fmtDatum(`${s.hit.datum}T12:00:00Z`)}` } : null;
        return (
          <li key={`${s.stopp.namn}-${s.stopp.fran}-${i}`} data-resa-steg={s.hit?.typ ?? 'start'}>
            {nyManad && <div style={{ ...TYP.meta, color: FARG.text3, margin: `${i === 0 ? 0 : AVSTAND.m}px 0 ${AVSTAND.xs}px ${PRICK + AVSTAND.m}px` }}>{MANAD_LANG[man - 1]}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: `${PRICK}px minmax(0, 1fr)`, columnGap: AVSTAND.m }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ width: PRICK, height: PRICK, borderRadius: '50%', boxSizing: 'border-box', marginTop: AVSTAND.xs,
                  border: `2px solid ${arNu ? FARG.text : FARG.text2}`, background: arNu ? FARG.text : 'transparent' }} />
                {hit && <div style={{ width: 2, flex: 1, background: FARG.linje, marginTop: AVSTAND.xs }} />}
              </div>
              <div style={{ paddingBottom: hit ? 0 : AVSTAND.s }}>
                <div data-resa-trakt style={{ ...TYP.listtitel, color: FARG.text }}>{s.stopp.namn}</div>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>{under}</div>
                {hit && (
                  <div data-resa-hit style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, ...TNUM, color: FARG.text2, padding: `${AVSTAND.s}px 0 ${AVSTAND.m}px` }}>
                    <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>{hit.ikon}</span>
                    <span>{hit.text}</span>
                  </div>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "Till Bågskyttebanan RP J-Hus- 25" · "tis 6 okt · från Vällust RP M-R -25 · 1 h 15 min" · km till höger (som rundraden i Körningar). */
function FlyttRad({ f, visaMaskin, sista }: { f: Flytt; visaMaskin: boolean; sista: boolean }) {
  return (
    <Rad rubrik={`Till ${f.tillNamn ?? 'okänd plats'}`}
      under={[fmtDatum(f.lossad), `från ${f.franNamn ?? 'okänd plats'}`, f.min != null ? fmtMinuter(f.min) : 'tid saknas', visaMaskin ? f.maskinNamn : null].filter(Boolean).join(' · ')}
      hoger={f.km != null ? km(f.km) : 'km saknas'} sista={sista} />
  );
}

/**
 * Ett kort per maskin, så att ett barn förstår det (Martin 2026-10-24): namnet och antalet flyttar överst, under det tiden maskinen stod på
 * lastbilen (lastad → lossad, hela året) och km, och sist EN stapel per månad med antalet ovanför. Månaderna och stapelskalan är desamma
 * för alla maskiner, så korten går att jämföra. Ett tryck öppnar maskinens ark (bara läsa).
 */
function MaskinKort({ m, manader, max, onTryck }: { m: Maskin; manader: number[]; max: number; onTryck: () => void }) {
  const tid = tidPaLastbilen(m);
  const staplar = perManad(m, manader);
  const tidText = [tid.min > 0 ? `${fmtMinuter(tid.min)} på lastbilen` : tid.saknar === m.antal ? 'tid saknas' : '', tid.saknar > 0 && tid.saknar < m.antal ? saknarTidText(tid.saknar) : ''].filter(Boolean).join(' · ');
  return (
    <button type="button" data-maskin-kort={m.nyckel} onClick={onTryck} aria-label={`Visa ${m.namn}`}
      style={{ ...KORT, display: 'block', width: '100%', textAlign: 'left', border: 'none', color: FARG.text, font: 'inherit', cursor: 'pointer', marginBottom: AVSTAND.m }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: AVSTAND.s }}>
        <span style={{ ...TYP.listtitel, color: FARG.text }}>{m.namn}</span>
        <span data-maskin-kort-antal style={{ ...TYP.listtitel, ...TNUM, color: FARG.text }}>{m.antal} {m.antal === 1 ? 'flytt' : 'flyttar'}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, ...TYP.meta, ...TNUM, color: FARG.text2 }}>
        <span data-maskin-kort-tid>{tidText}</span>
        <span>{m.km > 0 || m.saknarKm === 0 ? km(m.km) : 'km saknas'}{m.saknarKm > 0 && m.km > 0 ? ` · ${saknarKmText(m.saknarKm)}` : ''}</span>
      </div>
      {manader.length > 1 && <div style={{ marginTop: AVSTAND.m }}><ManadsStaplar staplar={staplar} max={max} /></div>}
    </button>
  );
}

/** En stapel per månad med antalet ovanför ("–" för 0). `max` = den högsta stapeln (samma för alla kort i listan). */
function ManadsStaplar({ staplar, max }: { staplar: { man: number; antal: number }[]; max: number }) {
  return (
    <div data-maskin-staplar style={{ display: 'grid', gridTemplateColumns: `repeat(${staplar.length}, minmax(0, 1fr))`, gap: AVSTAND.s }}>
      {staplar.map(st => (
        <div key={st.man} data-stapel={`${manadKort(st.man)}:${st.antal}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.meta, ...TNUM, color: st.antal ? FARG.text : FARG.text3 }}>{st.antal || '–'}</span>
          <div style={{ width: '100%', height: STAPEL_HOJD, display: 'flex', alignItems: 'flex-end' }}>
            <div style={{ width: '100%', height: `${max ? (100 * st.antal) / max : 0}%`, background: FARG.text, borderRadius: `${RADIE.rad / 2}px ${RADIE.rad / 2}px 0 0` }} />
          </div>
          <span style={{ ...TYP.meta, color: FARG.text2 }}>{manadKort(st.man)}</span>
        </div>
      ))}
    </div>
  );
}

/** Staplarnas höjd i px (den högsta månaden fyller den). */
const STAPEL_HOJD = AVSTAND.xxl + AVSTAND.s;

/**
 * "Hur mycket flyttades varje maskin?" längst ner på Uppföljning: ett kort per maskin (`MaskinKort`), flest flyttar först och andras
 * maskiner sist. Ett tryck öppnar maskinens ark. Läsfel är ett fel med Försök igen, aldrig en tom lista.
 */
export default function MaskinerSektion({ ar, lage, onForsokIgen }: { ar: number; lage: MaskinerLage; onForsokIgen: () => void }) {
  const [vald, setVald] = useState<string | null>(null);
  const maskiner = lage.lage === 'klar' ? grupperaMaskiner(lage.flyttar) : null;
  const valdMaskin = maskiner?.find(m => m.nyckel === vald) ?? null;
  const manader = maskiner ? manaderAttVisa(maskiner, ar, new Date()) : [];
  const max = maskiner ? Math.max(0, ...maskiner.flatMap(m => perManad(m, manader).map(x => x.antal))) : 0;

  return (
    <div data-maskiner>
      <Sektion rubrik="Hur mycket flyttades varje maskin?" kort={false}>
        {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.l}px 0`, margin: 0 }}>Läser maskiner …</p>}
        {lage.lage === 'fel' && (
          <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
            <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa maskinerna just nu.</p>
            <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
          </div>
        )}
        {maskiner && maskiner.length === 0 && <p style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0`, margin: 0 }}>Inga flyttar i {ar}.</p>}
        {maskiner?.map(m => <MaskinKort key={m.nyckel} m={m} manader={manader} max={max} onTryck={() => setVald(m.nyckel)} />)}
      </Sektion>
      {valdMaskin && <MaskinArk key={valdMaskin.nyckel} maskin={valdMaskin} ar={ar} manader={manader} onStang={() => setVald(null)} />}
    </div>
  );
}
