'use client';

import { useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { sthlmDelar } from '@/lib/sthlmTid';
import FlyttSheet from './FlyttSheet';
import { fmtDatum } from './nu';
import { fmtMinuter } from './rundaText';
import { grupperaMaskiner, hurLang, hurOfta, saknarKmText, sammanfatta, varArDen, type Flytt, type Maskin } from './maskiner';
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

function MaskinArk({ maskin, ar, arAdmin, namn, onStang, onAndrad }: {
  maskin: Maskin; ar: number; arAdmin: boolean; namn: string; onStang: () => void; onAndrad: () => void;
}) {
  const [redigerar, setRedigerar] = useState<string | null>(null);
  const [kvitto, setKvitto] = useState<string | null>(null);
  const [kvittoFel, setKvittoFel] = useState<string | null>(null);

  // Sheeten "Flytten" ersätter arket medan den är öppen (som rundans ark); Avbryt går tillbaka hit.
  if (redigerar) {
    return (
      <FlyttSheet key={redigerar} flyttId={redigerar} namn={namn}
        onStang={() => setRedigerar(null)}
        onKlar={text => { setKvitto(text); setKvittoFel(null); setRedigerar(null); }}
        onDelvis={fel => { setKvittoFel(fel); setKvitto(null); setRedigerar(null); }}
        onAndrad={onAndrad} />
    );
  }

  const s = sammanfatta(maskin);
  const nu = new Date();
  const innevarandeAr = sthlmDelar(nu)?.ar === ar;
  const var_ = innevarandeAr ? varArDen(maskin, nu) : null;
  const ofta = hurOfta(maskin, s, ar, innevarandeAr);
  const lang = hurLang(s, fmtMinuter);
  return (
    <Ark rubrik={maskin.namn} onStang={onStang} stang="Klar">
      {kvitto && (
        <div role="status" data-ratta-kvitto style={{ background: FARG.fyllning, borderRadius: RADIE.knapp, padding: AVSTAND.m, marginBottom: AVSTAND.s }}>
          <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{kvitto}</p>
          <button type="button" onClick={() => setKvitto(null)} style={KNAPP.lank}>OK</button>
        </div>
      )}
      {kvittoFel && (
        <div style={{ marginBottom: AVSTAND.s }}>
          <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{kvittoFel}</p>
          <button type="button" onClick={() => setKvittoFel(null)} style={KNAPP.lank}>OK</button>
        </div>
      )}

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

      <Sektion rubrik={maskin.extern ? 'Vart flyttades de?' : 'Vart har den flyttats?'} kort={false}
        not={arAdmin ? 'Tryck på en flytt för att rätta eller stryka den.' : undefined}>
        <div data-maskin-flyttar>
          {maskin.flyttar.map((f, i) => (
            <FlyttRad key={f.id} f={f} visaMaskin={maskin.extern} sista={i === maskin.flyttar.length - 1}
              onTryck={arAdmin ? () => { setKvitto(null); setKvittoFel(null); setRedigerar(f.id); } : undefined} />
          ))}
        </div>
      </Sektion>
    </Ark>
  );
}

/** "Till Bågskyttebanan RP J-Hus- 25" · "tis 6 okt · från Vällust RP M-R -25 · 1 h 15 min" · km till höger (som rundraden i Körningar). */
function FlyttRad({ f, visaMaskin, sista, onTryck }: { f: Flytt; visaMaskin: boolean; sista: boolean; onTryck?: () => void }) {
  return (
    <Rad rubrik={`Till ${f.tillNamn ?? 'okänd plats'}`}
      under={[fmtDatum(f.lossad), `från ${f.franNamn ?? 'okänd plats'}`, f.min != null ? fmtMinuter(f.min) : 'tid saknas', visaMaskin ? f.maskinNamn : null].filter(Boolean).join(' · ')}
      hoger={f.km != null ? km(f.km) : 'km saknas'}
      onTryck={onTryck} etikett={`Visa flytten ${f.maskinNamn}`} sista={sista} />
  );
}

/**
 * "Maskiner" längst ner på Uppföljning: en rad per maskin (namn, antal flyttar i året, km), flest flyttar först och andras maskiner
 * sist. Ett tryck öppnar maskinens ark. Läsfel är ett fel med Försök igen, aldrig en tom lista.
 */
export default function MaskinerSektion({ ar, lage, onForsokIgen, arAdmin, namn, onAndrad }: {
  ar: number; lage: MaskinerLage; onForsokIgen: () => void; arAdmin: boolean; namn: string;
  /** En flytt rättades i arket: läs om. */
  onAndrad: () => void;
}) {
  const [vald, setVald] = useState<string | null>(null);
  const maskiner = lage.lage === 'klar' ? grupperaMaskiner(lage.flyttar) : null;
  const valdMaskin = maskiner?.find(m => m.nyckel === vald) ?? null;

  return (
    <div data-maskiner>
      <Sektion rubrik="Vilka maskiner flyttades?">
        {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.l}px 0`, margin: 0 }}>Läser maskiner …</p>}
        {lage.lage === 'fel' && (
          <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
            <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa maskinerna just nu.</p>
            <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>
          </div>
        )}
        {maskiner && maskiner.length === 0 && <p style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0`, margin: 0 }}>Inga flyttar i {ar}.</p>}
        {maskiner?.map((m, i) => (
          <Rad key={m.nyckel} rubrik={m.namn} onTryck={() => setVald(m.nyckel)} etikett={`Visa ${m.namn}`}
            under={`${m.antal} ${m.antal === 1 ? 'flytt' : 'flyttar'}${m.saknarKm > 0 ? ` · ${saknarKmText(m.saknarKm)}` : ''}`}
            hoger={m.km > 0 || m.saknarKm === 0 ? km(m.km) : '–'} sista={i === maskiner.length - 1} />
        ))}
      </Sektion>
      {valdMaskin && <MaskinArk key={valdMaskin.nyckel} maskin={valdMaskin} ar={ar} arAdmin={arAdmin} namn={namn} onStang={() => setVald(null)} onAndrad={onAndrad} />}
    </div>
  );
}
