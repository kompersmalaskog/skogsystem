'use client';

import { useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, LAYOUT, RAD, RADIE, TNUM, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import { GRUPP_RUBRIK, type DestGrupp, type DestRad } from './destinationer';
import { KARTAPPAR, kartLank, lankAttr, type Kartapp } from './kartapp';
import { avstandText, posRad, type MaskinRad } from './maskinPos';

export const slagFarg = (slag: 'skordare' | 'skotare' | null): string => (slag === 'skordare' ? ROLLFARG_SKORDARE : slag === 'skotare' ? ROLLFARG_SKOTARE : FARG.text3);
export const slagText = (slag: 'skordare' | 'skotare' | null): string => (slag === 'skordare' ? 'Skördare' : slag === 'skotare' ? 'Skotare' : 'Maskin');

const faltStil = { ...TYP.text, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: AVSTAND.m, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, minHeight: TRAFFYTA.min };

/** Översta raden: Avbryt till vänster, flödets namn till höger. Sticky i flödet (aldrig fixed + uppmätt padding). */
export function Topp({ onAvbryt, deaktiverad }: { onAvbryt: () => void; deaktiverad?: boolean }) {
  return (
    <div style={{ position: 'sticky', top: LAYOUT.topbar, zIndex: 50, background: FARG.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${AVSTAND.s}px 0` }}>
      <button type="button" data-hamta-avbryt onClick={onAvbryt} disabled={deaktiverad} style={{ ...KNAPP.lank, ...(deaktiverad ? INAKTIV : {}) }}>Avbryt</button>
      <span style={{ ...TYP.meta, color: FARG.text2 }}>Hämta en maskin</span>
    </div>
  );
}

/**
 * Handlingsraden längst ner i ett steg med en lång lista ("Vart ska X?"): primärknappen och det som hör till den ligger FAST vid
 * skärmens nederkant, så att den aldrig hamnar under tjugo trakter. Sticky i flödet (aldrig fixed + uppmätt padding) och med
 * hemindikatorhänsyn (`medSafeBotten`).
 */
export function Fot({ children }: { children: ReactNode }) {
  return (
    <div data-hamta-fot style={{ position: 'sticky', bottom: 0, zIndex: 40, background: FARG.bg, borderTop: `1px solid ${FARG.linje}`, padding: `${AVSTAND.s}px 0 ${medSafeBotten(AVSTAND.m)}`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      {children}
    </div>
  );
}

export function Rubrik({ children, under }: { children: ReactNode; under?: ReactNode }) {
  return (
    <div style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px` }}>
      <h1 style={{ margin: 0, ...TYP.titel }}>{children}</h1>
      {under && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{under}</p>}
    </div>
  );
}

export function Meta({ children, orange }: { children: ReactNode; orange?: boolean }) {
  return <p style={{ ...TYP.meta, color: orange ? FARG.orange : FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{children}</p>;
}

export function Fel({ children }: { children: ReactNode }) {
  return <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>{children}</p>;
}

function Chevron() {
  return <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text, color: FARG.text3 }}>chevron_right</span>;
}

/** Navigeringsikonen i maskinraden (pilen i kartappens stil). */
function NavIkon() {
  return <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.rad, color: FARG.text2 }}>navigation</span>;
}

/** Primärknappen som ÄR navigeringen: länken öppnar kartappen direkt ur förarens tryck (ingen popup-blockering). */
export function KartKnapp({ app, lat, lng, etikett, onTryck, id }: { app: Kartapp; lat: number | null; lng: number | null; etikett: string; onTryck: () => void; id: string }) {
  if (lat == null || lng == null) {
    return <button type="button" disabled data-kartknapp={id} style={{ ...KNAPP.primar, ...INAKTIV }}>{etikett}</button>;
  }
  return (
    <a data-kartknapp={id} {...lankAttr(kartLank(app, lat, lng))} onClick={onTryck} style={{ ...KNAPP.primar, textDecoration: 'none' }}>{etikett}</a>
  );
}

/** "Giant · Skördare · står på Bågskyttebanan RP" — en rad per maskin, närmast först. Hela raden är trycket. */
export function MaskinListeRad({ rad, plats, nuMs, onVal }: { rad: MaskinRad; plats: string | null; nuMs: number; onVal: () => void }) {
  const p = posRad(rad.pos, nuMs);
  return (
    <button type="button" data-maskin={rad.maskin_id} onClick={onVal}
      style={{ ...RAD, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer', padding: `${AVSTAND.m}px 0` }}>
      <span aria-hidden style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: slagFarg(rad.slag), flex: 'none' }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYP.listtitel, display: 'block' }}>{rad.namn}</span>
        <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{slagText(rad.slag)}{plats ? ` · står på ${plats}` : ''}</span>
        <span style={{ ...TYP.meta, color: p.osaker ? FARG.orange : FARG.text2, display: 'block' }}>{p.text}</span>
      </span>
      {rad.km != null && <span style={{ ...TYP.listtitel, color: FARG.text, ...TNUM, whiteSpace: 'nowrap' }}>{avstandText(rad.km)}</span>}
      {rad.pos && <NavIkon />}
    </button>
  );
}

export function EnkelRad({ namn, sub, onTryck, ikon, id }: { namn: string; sub?: string; onTryck: () => void; ikon?: ReactNode; id?: string }) {
  return (
    <button type="button" data-rad={id} onClick={onTryck}
      style={{ ...RAD, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer', padding: `${AVSTAND.m}px 0` }}>
      {ikon}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYP.listtitel, display: 'block' }}>{namn}</span>
        {sub && <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{sub}</span>}
      </span>
      <Chevron />
    </button>
  );
}

/** "Vart ska X?"-listan: grupperad (Väntar på maskinen · Andra trakter · Platser · Avslutade vid sök), vald rad har bock. */
export function DestLista({ rader, valdNyckel, onVal, sok, onSok, laddar }: {
  rader: readonly DestRad[]; valdNyckel: string | null; onVal: (r: DestRad) => void; sok: string; onSok: (s: string) => void; laddar?: boolean;
}) {
  const nyckel = (r: DestRad) => (r.typ === 'objekt' ? `o:${r.objekt.id}` : `p:${r.plats.id}`);
  const grupper = (['vantar', 'ovriga', 'platser', 'avslutade'] as DestGrupp[])
    .map(g => ({ g, rader: rader.filter(r => r.grupp === g) }))
    .filter(x => x.rader.length > 0);
  return (
    <>
      <div style={{ margin: `0 0 ${AVSTAND.l}px` }}>
        <input value={sok} onChange={e => onSok(e.target.value)} placeholder="Sök trakt eller plats" aria-label="Sök trakt eller plats" style={faltStil} />
      </div>
      {laddar && <Meta>Läser trakterna …</Meta>}
      {!laddar && grupper.length === 0 && (
        <Meta>{sok.trim() ? 'Inget matchar sökningen. Avslutade trakter hittas också här.' : 'Inga aktiva trakter eller platser. Sök efter en avslutad trakt, eller lägg till en plats under Flyttplatser.'}</Meta>
      )}
      {grupper.map(({ g, rader: rs }) => (
        <Sektion key={g} rubrik={GRUPP_RUBRIK[g]}>
          {rs.map(r => {
            const namn = r.typ === 'objekt' ? r.objekt.namn : r.plats.namn;
            const valt = valdNyckel === nyckel(r);
            return (
              <button key={nyckel(r)} type="button" role="option" aria-selected={valt} data-dest={nyckel(r)} onClick={() => onVal(r)}
                style={{ ...RAD, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer', padding: `${AVSTAND.m}px 0` }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ ...TYP.listtitel, display: 'block' }}>{namn}</span>
                  <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{r.sub}</span>
                </span>
                {valt && <span className="material-symbols-outlined" aria-label="Vald" style={{ fontSize: IKON.rad, color: FARG.text }}>check</span>}
              </button>
            );
          })}
        </Sektion>
      ))}
    </>
  );
}

/** Kvittorad: "✓ Lassat 14:05 · Ändra". Ordet bär betydelsen, bocken förstärker. */
export function Kvittorad({ text, andraText = 'Ändra', onAndra, id, sparar }: { text: string; andraText?: string; onAndra: () => void; id: string; sparar?: boolean }) {
  return (
    <div data-kvitto={id} style={{ ...KORT, padding: `0 ${AVSTAND.l}px`, marginTop: AVSTAND.m, display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min }}>
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.rad, color: FARG.gron }}>check_circle</span>
      <span style={{ ...TYP.listtitel, flex: 1, color: FARG.text }}>{text}</span>
      <button type="button" onClick={onAndra} disabled={sparar} style={{ ...KNAPP.lank, ...(sparar ? INAKTIV : {}) }}>{andraText}</button>
    </div>
  );
}

/** Kartappsvalet — bara på Apple-enheter (Apple Kartor finns inte annars). Valet sparas per enhet. */
export function KartappArk({ valt, onVal, onStang }: { valt: Kartapp; onVal: (k: Kartapp) => void; onStang: () => void }) {
  return (
    <Ark rubrik="Kartapp" onStang={onStang}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.m}px` }}>Hämta-flödet öppnar den här appen med vägbeskrivningen. Valet gäller den här enheten.</p>
      <div role="listbox" aria-label="Kartapp">
        {KARTAPPAR.map(k => (
          <button key={k.id} type="button" role="option" aria-selected={valt === k.id} data-kartapp={k.id} onClick={() => { onVal(k.id); onStang(); }}
            style={{ ...RAD, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${FARG.linje}`, textAlign: 'left', color: FARG.text, font: 'inherit', cursor: 'pointer' }}>
            <span style={{ ...TYP.listtitel, flex: 1 }}>{k.namn}</span>
            {valt === k.id && <span className="material-symbols-outlined" aria-label="Vald" style={{ fontSize: IKON.rad }}>check</span>}
          </button>
        ))}
      </div>
    </Ark>
  );
}

/** "Maskin som inte är vår": namn + kund. Faktureras alltid (kunduppdrag), så kund krävs. */
export function ExternArk({ onKlar, onStang }: { onKlar: (namn: string, kund: string) => void; onStang: () => void }) {
  const [namn, setNamn] = useState('');
  const [kund, setKund] = useState('');
  const ok = namn.trim() !== '' && kund.trim() !== '';
  return (
    <Ark rubrik="Maskin som inte är vår" onStang={onStang}
      fot={<button type="button" data-extern-klar disabled={!ok} onClick={() => onKlar(namn.trim(), kund.trim())} style={{ ...KNAPP.primar, ...(ok ? {} : INAKTIV) }}>Hämta den</button>}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }}>Flytten sparas som kunduppdrag och faktureras alltid. Kund krävs.</p>
      <Sektion rubrik="Maskin" kort={false}>
        <input autoFocus value={namn} onChange={e => setNamn(e.target.value)} placeholder="Namn, t.ex. Skotare Anderssons" aria-label="Maskinens namn" style={faltStil} />
      </Sektion>
      <Sektion rubrik="Kund" kort={false}>
        <input value={kund} onChange={e => setKund(e.target.value)} placeholder="Vem faktureras?" aria-label="Kund" style={faltStil} />
      </Sektion>
    </Ark>
  );
}

/** Rimlighetsvakten (blockerar aldrig — föraren beslutar): GPS-punkten ligger långt från där maskinen/trakten ska vara. */
export function PosVarningArk({ text, gpsText, kartaText, onGps, onKarta, onStang }: {
  text: string; gpsText: string; kartaText: string; onGps: () => void; onKarta: () => void; onStang: () => void;
}) {
  return (
    <Ark rubrik="Stämmer platsen?" onStang={onStang}
      fot={(
        <>
          <button type="button" data-posvarning="karta" onClick={onKarta} style={KNAPP.primar}>{kartaText}</button>
          <button type="button" data-posvarning="gps" onClick={onGps} style={KNAPP.sekundar}>{gpsText}</button>
        </>
      )}>
      <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>{text}</p>
    </Ark>
  );
}

/** "Fortsätta rundan som just stängdes eller börja en ny?" — ställs aldrig tyst. */
export function RundaFragaArk({ onFortsatt, onNy, onStang }: { onFortsatt: () => void; onNy: () => void; onStang: () => void }) {
  return (
    <Ark rubrik="Fortsätta rundan?" onStang={onStang}
      fot={(
        <>
          <button type="button" data-runda="fortsatt" onClick={onFortsatt} style={KNAPP.primar}>Fortsätt rundan</button>
          <button type="button" data-runda="ny" onClick={onNy} style={KNAPP.sekundar}>Börja en ny runda</button>
        </>
      )}>
      <p style={{ ...TYP.text, color: FARG.text, margin: 0 }}>Bilens runda stängdes för mindre än en timme sedan. Hör den här maskinen till samma runda?</p>
    </Ark>
  );
}
