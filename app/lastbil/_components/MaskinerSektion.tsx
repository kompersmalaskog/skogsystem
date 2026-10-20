'use client';

import { useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, KNAPP, RADIE, RAD, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { sthlmDelar } from '@/lib/sthlmTid';
import FlyttSheet from './FlyttSheet';
import { fmtDatum } from './nu';
import { fmtMinuter } from './rundaText';
import {
  FLYTT, MELLANRUM, fmtDagar, grupperaMaskiner, saknarKmText, saknarTidText, sammanfatta, snittUnder, starPa,
  type Flytt, type Maskin,
} from './maskiner';
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
  const star = innevarandeAr ? starPa(maskin, nu) : null;
  return (
    <Ark rubrik={maskin.namn} onStang={onStang}>
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

      <div data-maskin-antal style={{ ...TYP.tal, color: FARG.text }}>{maskin.antal} {maskin.antal === 1 ? 'flytt' : 'flyttar'}</div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>i {ar}</div>
      {star && <div data-star-pa style={{ ...TYP.text, color: FARG.text, marginTop: AVSTAND.s }}>{star}</div>}

      <div data-maskin-snitt style={{ marginTop: AVSTAND.m }}>
        <Rad rubrik="Lassat → lossat" hoger={s.tid.snitt != null ? fmtMinuter(s.tid.snitt) : '–'} under={snittUnder(s.tid, FLYTT, saknarTidText)} />
        <Rad rubrik="Snitt-km" hoger={s.km.snitt != null ? km(s.km.snitt) : '–'} under={snittUnder(s.km, FLYTT, saknarKmText)} sista={!s.trakt} />
        {s.trakt && <Rad rubrik="På en trakt" hoger={s.trakt.snitt != null ? fmtDagar(s.trakt.snitt) : '–'} under={snittUnder(s.trakt, MELLANRUM)} sista />}
      </div>

      <div style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.l}px 0 ${AVSTAND.xs}px` }}>Flyttar</div>
      <div data-maskin-flyttar>
        {maskin.flyttar.map((f, i) => (
          <FlyttRad key={f.id} f={f} visaMaskin={maskin.extern} sista={i === maskin.flyttar.length - 1}
            onTryck={arAdmin ? () => { setKvitto(null); setKvittoFel(null); setRedigerar(f.id); } : undefined} />
        ))}
      </div>
      {arAdmin && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Tryck på en flytt för att rätta eller stryka den.</p>}
    </Ark>
  );
}

function FlyttRad({ f, visaMaskin, sista, onTryck }: { f: Flytt; visaMaskin: boolean; sista: boolean; onTryck?: () => void }) {
  return (
    <Rad rubrik={`${f.franNamn ?? 'Från saknas'} → ${f.tillNamn ?? 'Till saknas'}`}
      under={[fmtDatum(f.lossad), visaMaskin ? f.maskinNamn : null].filter(Boolean).join(' · ')}
      hoger={f.km != null ? km(f.km) : 'km saknas'} hogerUnder={f.min != null ? fmtMinuter(f.min) : 'tid saknas'}
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
      <Sektion rubrik="Maskiner">
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
