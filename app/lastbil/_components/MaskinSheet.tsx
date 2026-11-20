'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, RAD, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { lassFraga } from '@/lib/lastbil/lass/notis';
import { avvisaLass, besvaraLass } from './besvara';
import {
  kravKundRuta, lassFakturerbar, lassForslagText, lassKmText, lassMaskinText, lassPlatsNot, lassRuttVy, lassSamtidigaRader, lassTidText, lassViktText,
  redanText, saknasForSvar, type LassRad, type SvarUtfall, type Val,
} from './lass';
import { usePlatsData } from './usePlatsData';
import { useAktivaMaskiner, useEttLass, type MaskinVal } from './useSaknarMaskin';

const faltStil = { ...TYP.text, ...TNUM, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: AVSTAND.m, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, minHeight: 44 };

/** Ett val i listan: namn, en förklarande rad, en bock när det är valt. Samma form som väljarna i Flytten-sheeten. */
function ValAlt({ namn, sub, valt, onTryck }: { namn: string; sub?: string | null; valt: boolean; onTryck: () => void }) {
  return (
    <button type="button" role="option" aria-selected={valt} onClick={onTryck}
      style={{ ...RAD, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${FARG.linje}`, textAlign: 'left', font: 'inherit', cursor: 'pointer', color: FARG.text }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYP.listtitel, display: 'block' }}>{namn}</span>
        {sub && <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{sub}</span>}
      </span>
      {valt && <span className="material-symbols-outlined" aria-label="Vald" style={{ fontSize: IKON.rad, color: FARG.text }}>check</span>}
    </button>
  );
}

function Meddelande({ children, fel, onForsokIgen }: { children: ReactNode; fel?: boolean; onForsokIgen?: () => void }) {
  return (
    <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
      <p role={fel ? 'alert' : 'status'} style={{ ...TYP.text, color: fel ? FARG.rod : FARG.text2, margin: onForsokIgen ? `0 0 ${AVSTAND.m}px` : 0 }}>{children}</p>
      {onForsokIgen && <button type="button" onClick={onForsokIgen} style={KNAPP.sekundar}>Försök igen</button>}
    </div>
  );
}

/** Själva frågan — ett lass som väntar. */
function Svar({ rad, onStang, onKlar }: { rad: LassRad; onStang: () => void; onKlar: (kvitto: string) => void }) {
  const maskiner = useAktivaMaskiner(true);
  const platsData = usePlatsData(true);
  const [maskinId, setMaskinId] = useState<string | null>(rad.forslag_maskin_id);
  const [externVald, setExternVald] = useState(false);
  const [extern, setExtern] = useState('');
  // Två kundrutor, aldrig en delad: en maskin som inte är vår har en EGEN kund (inte traktens bolag), och den förifylls aldrig.
  const [kundEgen, setKundEgen] = useState('');
  const [kundExtern, setKundExtern] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [redan, setRedan] = useState<Extract<SvarUtfall, { typ: 'redan' }> | null>(null);
  const [fragaIngen, setFragaIngen] = useState(false);

  const visaKund = externVald || kravKundRuta(rad, { maskinId: externVald ? null : maskinId, extern });
  const val: Val = { maskinId: externVald ? null : maskinId, extern, kund: externVald ? kundExtern : visaKund ? kundEgen : '' };
  const saknas = saknasForSvar(rad, val, externVald);
  const ruttVy = useMemo(
    () => lassRuttVy(rad, platsData.lage.lage === 'klar' ? platsData.lage.data.platser : null),
    [rad, platsData.lage],
  );
  const faktureras = lassFakturerbar(rad, externVald);
  const not = lassPlatsNot(rad);
  const samtidiga = lassSamtidigaRader(rad, id => (maskiner.lage.lage === 'klar' ? maskiner.lage.maskiner.find(m => m.maskin_id === id)?.namn ?? null : null));

  const { forslag, andra } = useMemo(() => {
    if (maskiner.lage.lage !== 'klar') return { forslag: null as MaskinVal | null, andra: [] as MaskinVal[] };
    const rang = new Map((rad.kandidater ?? []).map((k, i) => [k.maskin_id, i]));
    const alla = [...maskiner.lage.maskiner].sort((a, b) => (rang.get(a.maskin_id) ?? 99) - (rang.get(b.maskin_id) ?? 99) || a.namn.localeCompare(b.namn, 'sv'));
    const f = alla.find(m => m.maskin_id === rad.forslag_maskin_id) ?? null;
    return { forslag: f, andra: alla.filter(m => m.maskin_id !== f?.maskin_id) };
  }, [maskiner.lage, rad.kandidater, rad.forslag_maskin_id]);

  const klar = (u: SvarUtfall, kvitto: string) => {
    if (u.typ === 'klart') { onKlar(kvitto); return; }
    if (u.typ === 'redan') { setRedan(u); return; }
    setFel(u.fel);
  };
  const skapa = async () => {
    if (saknas || sparar) return;
    setSparar(true); setFel(null);
    const u = await besvaraLass(rad.id, val, externVald);
    setSparar(false);
    klar(u, 'Flytten är skapad och ligger under Att godkänna.');
  };
  const ingenFlytt = async () => {
    setSparar(true); setFel(null);
    const u = await avvisaLass(rad.id);
    setSparar(false);
    klar(u, 'Markerat som ingen maskinflytt.');
  };

  if (redan) {
    return (
      <Ark rubrik="Redan besvarat" onStang={onStang}>
        <Meddelande>{redanText(redan)}</Meddelande>
        <button type="button" onClick={() => onKlar('')} style={{ ...KNAPP.sekundar, width: '100%', justifyContent: 'center' }}>Stäng</button>
      </Ark>
    );
  }

  const fot = fragaIngen ? (
    <>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Lasset sparas som "ingen maskinflytt" och ingen flytt skapas.</p>
      <button type="button" onClick={ingenFlytt} disabled={sparar} style={{ ...KNAPP.destruktiv, ...(sparar ? INAKTIV : {}) }}>Ja, det var ingen maskinflytt</button>
      <button type="button" onClick={() => setFragaIngen(false)} style={KNAPP.tertiar}>Tillbaka</button>
    </>
  ) : (
    <>
      {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
      {!fel && saknas && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>{saknas}</p>}
      <button type="button" onClick={skapa} disabled={!!saknas || sparar} style={{ ...KNAPP.primar, ...(saknas || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Skapar flytten …' : 'Skapa flytten'}
      </button>
      <button type="button" onClick={() => setFragaIngen(true)} style={KNAPP.tertiar}>Det var ingen maskinflytt</button>
    </>
  );

  return (
    <Ark rubrik={lassFraga(rad.status_orsak)} onStang={onStang} fot={fot}>
      <div style={{ marginBottom: AVSTAND.l }}>
        <div style={{ ...TYP.listtitel }}>{ruttVy.rutt}</div>
        {ruttVy.andra.map(a => (
          <div key={a.sida} data-plats-andra style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{ruttVy.andra.length > 1 ? `${a.sida}: ` : ''}{a.text}</div>
        ))}
        <div style={{ ...TYP.meta, color: FARG.text2, ...TNUM }}>{[lassTidText(rad), lassKmText(rad), lassViktText(rad)].filter(Boolean).join(' · ')}</div>
        {faktureras && <div style={{ ...TYP.meta, color: FARG.text2 }}>Över 30 km — flytten faktureras</div>}
        {not && <p style={{ ...TYP.meta, color: FARG.orange, margin: `${AVSTAND.s}px 0 0` }}>{not}</p>}
        {samtidiga.length > 0 && (
          <div data-flytt-samma-tid style={{ margin: `${AVSTAND.s}px 0 0` }}>
            {samtidiga.map((t, i) => <p key={i} style={{ ...TYP.meta, color: FARG.orange, margin: 0 }}>{t}</p>)}
            <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Är det samma flytt: välj "Det var ingen maskinflytt".</p>
          </div>
        )}
      </div>

      {maskiner.lage.lage === 'laddar' && <Meddelande>Läser maskinerna …</Meddelande>}
      {maskiner.lage.lage === 'fel' && <Meddelande fel onForsokIgen={maskiner.forsokIgen}>Kunde inte läsa maskinerna.</Meddelande>}
      {maskiner.lage.lage === 'klar' && (
        <>
          {forslag && (
            <Sektion rubrik="Förslag">
              <div role="listbox" aria-label="Föreslagen maskin">
                <ValAlt namn={forslag.namn} sub={lassForslagText(rad)} valt={!externVald && maskinId === forslag.maskin_id}
                  onTryck={() => { setExternVald(false); setMaskinId(forslag.maskin_id); }} />
              </div>
            </Sektion>
          )}
          <Sektion rubrik={forslag ? 'Andra maskiner' : 'Maskiner'}>
            <div role="listbox" aria-label="Maskiner">
              {andra.map(m => (
                <ValAlt key={m.maskin_id} namn={m.namn} sub={lassMaskinText(rad, m.maskin_id)} valt={!externVald && maskinId === m.maskin_id}
                  onTryck={() => { setExternVald(false); setMaskinId(m.maskin_id); }} />
              ))}
              <ValAlt namn="Maskin som inte är vår" sub="Kunduppdrag — skriv maskinens namn och kund" valt={externVald}
                onTryck={() => { setExternVald(true); setMaskinId(null); }} />
            </div>
          </Sektion>
        </>
      )}

      {externVald && (
        <div style={{ marginBottom: AVSTAND.l }}>
          <input autoFocus value={extern} onChange={e => setExtern(e.target.value)} placeholder="Maskinens namn" aria-label="Maskinens namn" style={faltStil} />
        </div>
      )}
      {visaKund && (
        <Sektion rubrik="Kund" not={externVald ? 'Flytten faktureras kunden.' : 'Traktens bolag saknas — skriv vem flytten faktureras.'}>
          <div style={{ padding: `${AVSTAND.s}px 0` }}>
            <input value={externVald ? kundExtern : kundEgen} onChange={e => (externVald ? setKundExtern : setKundEgen)(e.target.value)} placeholder="Välj kund" aria-label="Kund" style={faltStil} />
          </div>
        </Sektion>
      )}
    </Ark>
  );
}

/**
 * Arket "Vilken maskin?" för ett lass. `iListan` = raden är redan läst (tryck på raden överst); annars (länken i notisen,
 * /lastbil?lass=<id>) läses just det lasset, oavsett status, så ett redan besvarat lass säger det i stället för att försvinna.
 */
export default function LassArk({ lassId, iListan, onStang, onKlar }: { lassId: string; iListan: LassRad | null; onStang: () => void; onKlar: (kvitto: string) => void }) {
  const ett = useEttLass(iListan ? null : lassId);
  const rad = iListan ?? (ett.lage.lage === 'klar' ? ett.lage.rad : null);

  if (!rad) {
    return (
      <Ark rubrik="Vilken maskin?" onStang={onStang}>
        {ett.lage.lage === 'fel' && <Meddelande fel onForsokIgen={ett.forsokIgen}>Kunde inte läsa lasset just nu.</Meddelande>}
        {ett.lage.lage === 'saknas' && <Meddelande>Det lasset finns inte längre.</Meddelande>}
        {ett.lage.lage === 'laddar' && <Meddelande>Läser lasset …</Meddelande>}
      </Ark>
    );
  }
  if (rad.status !== 'vantar_maskin') {
    return (
      <Ark rubrik="Redan besvarat" onStang={onStang}>
        <Meddelande>{redanText({ status: rad.status, av: rad.besvarad_av, tid: rad.besvarad_tid })}</Meddelande>
        <button type="button" onClick={onStang} style={{ ...KNAPP.sekundar, width: '100%', justifyContent: 'center' }}>Stäng</button>
      </Ark>
    );
  }
  return <Svar rad={rad} onStang={onStang} onKlar={onKlar} />;
}

