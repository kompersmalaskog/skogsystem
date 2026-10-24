'use client';

import { useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, KNAPP, KORT, RADIE, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { sthlmDelar } from '@/lib/sthlmTid';
import { fmtDatum } from './nu';
import { fmtMinuter } from './rundaText';
import { grupperaMaskiner, hurLang, hurOfta, manadKort, manaderAttVisa, perManad, saknarKmText, saknarTidText, sammanfatta, tidPaLastbilen, varArDen, type Flytt, type Maskin } from './maskiner';
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

function MaskinArk({ maskin, ar, onStang }: { maskin: Maskin; ar: number; onStang: () => void }) {
  // Uppföljning är till för att LÄSA: flyttarna rättas i Körningar och på fakturasidan, inte här (Martin 2026-10-24).
  const s = sammanfatta(maskin);
  const nu = new Date();
  const innevarandeAr = sthlmDelar(nu)?.ar === ar;
  const var_ = innevarandeAr ? varArDen(maskin, nu) : null;
  const ofta = hurOfta(maskin, s, ar, innevarandeAr);
  const lang = hurLang(s, fmtMinuter);
  return (
    <Ark rubrik={maskin.namn} onStang={onStang} stang="Klar">
      {/* Frågor som rubriker, svaret först i ord (Martin 2026-10-24). Arket ÄR ett kort: inga kort i kortet. */}
      {var_ && (
        <Sektion rubrik={`Var är ${maskin.namn} nu?`} kort={false}>
          <div data-star-pa style={{ ...TYP.rubrik, color: FARG.text }}>{var_.plats}</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{var_.sedan}</div>
        </Sektion>
      )}
      <Sektion rubrik={maskin.extern ? 'Hur ofta flyttades de?' : 'Hur ofta flyttas den?'} kort={false}>
        <div data-maskin-antal style={{ ...TYP.rubrik, color: FARG.text }}>{ofta.svar}</div>
        {ofta.under && <div data-maskin-trakt style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{ofta.under}</div>}
      </Sektion>
      <Sektion rubrik="Hur lång är en flytt?" kort={false}>
        <div data-maskin-snitt style={{ ...TYP.rubrik, ...TNUM, color: FARG.text }}>{lang.svar}</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{lang.under}</div>
      </Sektion>

      <Sektion rubrik={maskin.extern ? 'Vart flyttades de?' : 'Vart har den flyttats?'} kort={false}>
        <div data-maskin-flyttar>
          {maskin.flyttar.map((f, i) => (
            <FlyttRad key={f.id} f={f} visaMaskin={maskin.extern} sista={i === maskin.flyttar.length - 1} />
          ))}
        </div>
      </Sektion>
    </Ark>
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
      {manader.length > 1 && (
        <div data-maskin-staplar style={{ display: 'grid', gridTemplateColumns: `repeat(${manader.length}, minmax(0, 1fr))`, gap: AVSTAND.s, marginTop: AVSTAND.m }}>
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
      )}
    </button>
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
      {valdMaskin && <MaskinArk key={valdMaskin.nyckel} maskin={valdMaskin} ar={ar} onStang={() => setVald(null)} />}
    </div>
  );
}
