'use client';
// Delar av Starta jobb — bara utseende och små lokala tillstånd. All data och alla skrivningar bor i page.tsx.
// Byggt på components/design (Sektion, Rad, Falt, Flikkontroll, Ark) som Arbetsrapporten och markägarvyn — inga egna kort,
// flikar eller fält. Mått och färger ur lib/design/tokens. Färg bär aldrig ensam: varje läge har också ord.

import React, { useState } from 'react';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TRAFFYTA, TYP, VIKT } from '@/lib/design/tokens';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { JOBBTYPER, URSPRUNG_VAL, avstandText, type JobbTyp, type JobbUrsprung, type VirkesobjektRad } from '@/lib/startaJobb';
import { maskinRader, type Forvantat, type MaskinSpar } from '@/lib/startaJobbLage';
import type { JobbVy } from '@/lib/startaJobbLista';
import type { PlatsTraff } from '@/lib/platsSok';
import PlatsKarta, { type KartPlats } from '@/components/starta/PlatsKarta';

/** Sökfältets form (Falts fyllning och radie) för fält som inte har en etikett ovanför — sökfält. */
export const falt: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`,
  borderRadius: RADIE.rad, border: 'none', background: FARG.fyllning, color: FARG.text, outline: 'none', fontFamily: 'inherit', ...TYP.text,
};

/** Formulärgrupp: etikett (TYP.meta, text2) över fritt innehåll — Falts form, för val som inte är textfält. */
export function FaltEtikett({ etikett, stod, children }: { etikett: string; stod?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>{etikett}</div>
      {children}
      {stod != null && <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0 ${AVSTAND.xs}px` }}>{stod}</div>}
    </div>
  );
}

/** Typ: fyra val med hela orden (2 × 2 — "Slutavverkning" ryms inte i en fyrdelad flikkontroll på telefon). Vald = Flikkontrollens fyllning. */
export function TypVal({ valt, onVal }: { valt: JobbTyp; onVal: (t: JobbTyp) => void }) {
  return (
    <div role="radiogroup" aria-label="Typ" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: AVSTAND.xs, background: FARG.linje, borderRadius: RADIE.rad, padding: AVSTAND.xs }}>
      {JOBBTYPER.map((t) => {
        const aktiv = t.typ === valt;
        return (
          <button key={t.typ} type="button" role="radio" aria-checked={aktiv} data-testid={`val-${t.typ}`} onClick={() => onVal(t.typ)}
            style={{ minHeight: TRAFFYTA.min, border: 'none', borderRadius: RADIE.rad, background: aktiv ? FARG.fyllning : 'transparent', color: aktiv ? FARG.text : FARG.text2, ...TYP.meta, fontWeight: aktiv ? VIKT.halvfet : VIKT.normal, fontFamily: 'inherit', cursor: 'pointer' }}>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export const UrsprungVal = ({ valt, onVal }: { valt: JobbUrsprung; onVal: (u: JobbUrsprung) => void }) =>
  <Flikkontroll flikar={URSPRUNG_VAL.map((u) => [u.varde, u.label] as const)} aktiv={valt} onVal={onVal} />;

export const SkotningVal = ({ egen, onVal }: { egen: boolean; onVal: (egen: boolean) => void }) =>
  <Flikkontroll flikar={[['vi', 'Vi skotar'], ['egen', 'Egen skotning']] as const} aktiv={egen ? 'egen' : 'vi'} onVal={(v) => onVal(v === 'egen')} />;

/** GROT: välj virkesobjektet på samma trakt. Närmaste står överst och är märkt — men inget väljs förrän man trycker. */
export function HorTill({ alternativ, valt, onVal, harPosition }: {
  alternativ: (VirkesobjektRad & { avstandM: number | null })[]; valt: string | null; onVal: (id: string | null) => void; harPosition: boolean;
}) {
  const bock = (aktiv: boolean) => (aktiv ? 'Vald' : undefined);
  return (
    <div role="radiogroup" aria-label="Hör till objekt" style={{ background: FARG.fyllning, borderRadius: RADIE.rad, padding: `0 ${AVSTAND.l}px` }}>
      <Rad titel="Inget" hoger={bock(valt === null)} onTryck={() => onVal(null)} pil={false} sista={alternativ.length === 0} attr={{ 'data-testid': 'hortill-inget', role: 'radio', 'aria-checked': String(valt === null) }} />
      {alternativ.map((o, i) => (
        <Rad key={o.id} titel={o.namn || 'Objekt'} under={[i === 0 && o.avstandM != null ? 'Närmaste' : '', avstandText(o.avstandM), o.vo_nummer || ''].filter(Boolean).join(' · ')}
          hoger={bock(valt === o.id)} onTryck={() => onVal(o.id)} pil={false} sista={i === alternativ.length - 1}
          attr={{ 'data-testid': `hortill-${o.id}`, role: 'radio', 'aria-checked': String(valt === o.id) }} />
      ))}
      {alternativ.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2, padding: `0 0 ${AVSTAND.m}px` }}>{harPosition ? 'Inga virkesobjekt med plats hittades i närheten.' : 'Sätt en position så visas det närmaste virkesobjektet först.'}</div>}
    </div>
  );
}

/** Position på telefon/dator: sök fastighet/ort ovanför kartan, peka på kartan, eller "Använd min position". Krävs. */
export function PlatsVal({ plats, platsText, onPlats, onSok, onHar }: {
  plats: KartPlats | null;
  platsText: string | null;
  onPlats: (p: KartPlats | null, text: string | null) => void;
  onSok: (q: string) => Promise<{ traffar: PlatsTraff[] } | { fel: string }>;
  onHar: () => Promise<{ plats: KartPlats; noggrannhetM: number | null } | { fel: string }>;
}) {
  const [q, setQ] = useState('');
  const [sokar, setSokar] = useState(false);
  const [traffar, setTraffar] = useState<PlatsTraff[] | null>(null);
  const [meddelande, setMeddelande] = useState<string | null>(null);
  const [haerBusy, setHaerBusy] = useState(false);

  const sok = async () => {
    if (q.trim().length < 2) { setMeddelande('Skriv minst två tecken.'); return; }
    setSokar(true); setMeddelande(null); setTraffar(null);
    const r = await onSok(q.trim());
    setSokar(false);
    if ('fel' in r) { setMeddelande(r.fel); return; }
    setTraffar(r.traffar);
    if (r.traffar.length === 0) setMeddelande('Hittade ingen plats med det namnet — peka på kartan i stället.');
  };
  const har = async () => {
    setHaerBusy(true); setMeddelande(null);
    const r = await onHar();
    setHaerBusy(false);
    if ('fel' in r) { setMeddelande(r.fel); return; }
    onPlats(r.plats, `Min position${r.noggrannhetM != null ? ` (±${Math.round(r.noggrannhetM)} m)` : ''}`);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: AVSTAND.s }}>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sok(); }}
          placeholder="Sök fastighet eller ort" aria-label="Sök fastighet eller ort" style={{ ...falt, flex: 1 }} />
        <button type="button" data-testid="sok-knapp" onClick={() => void sok()} style={{ ...KNAPP.sekundar, width: 'auto', ...(sokar ? INAKTIV : null) }}>{sokar ? 'Söker …' : 'Sök'}</button>
      </div>
      {traffar && traffar.length > 0 && (
        <div style={{ marginTop: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.rad, padding: `0 ${AVSTAND.l}px` }}>
          {traffar.map((t, i) => (
            <Rad key={`${t.etikett}-${i}`} titel={t.etikett} sista={i === traffar.length - 1} attr={{ 'data-testid': `sok-traff-${i}` }}
              onTryck={() => { onPlats({ lat: t.lat, lng: t.lng }, t.etikett); setTraffar(null); }} />
          ))}
        </div>
      )}
      <div style={{ marginTop: AVSTAND.s }}>
        <PlatsKarta plats={plats} onVal={(p) => onPlats(p, 'Vald på kartan')} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
        <span data-testid="vald-plats" style={{ ...TYP.meta, color: FARG.text2, paddingLeft: AVSTAND.xs }}>
          {plats ? (platsText || 'Position vald') : 'Peka på kartan där jobbet är'}
        </span>
        <button type="button" onClick={() => void har()} style={{ ...KNAPP.tertiar, ...(haerBusy ? INAKTIV : null) }}>{haerBusy ? 'Hämtar …' : 'Använd min position'}</button>
      </div>
      {meddelande && <div role="status" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, paddingLeft: AVSTAND.xs }}>{meddelande}</div>}
    </div>
  );
}

/** Förslaget "P-1018 har fått Vida-objekt X — slå ihop?". Slå ihop / Inte samma; ingenting flyttas förrän man trycker. */
export function ForslagKort({ text, orsak, upptagen, onJa, onNej }: {
  text: string; orsak: 'hyttspar' | 'position'; upptagen: boolean; onJa: () => void; onNej: () => void;
}) {
  return (
    <Sektion rubrik="Vida har levererat">
      <div data-testid="sla-ihop-forslag" style={{ padding: `${AVSTAND.m}px 0` }}>
        <div style={TYP.listtitel}>{text}</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
          {orsak === 'hyttspar' ? 'Jobbets hyttspår ligger inom objektets traktgräns.' : 'Jobbets plats ligger inom objektets traktgräns.'}
          {' '}Slå ihop flyttar hyttspår, markeringar, anteckningar, media och tilldelning och tar bort jobbet.
        </div>
        <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m, ...(upptagen ? INAKTIV : null) }}>
          <button type="button" data-testid="sla-ihop-ja" onClick={onJa} style={{ ...KNAPP.primar, flex: 1 }}>{upptagen ? 'Slår ihop …' : 'Slå ihop'}</button>
          <button type="button" data-testid="sla-ihop-nej" onClick={onNej} style={{ ...KNAPP.sekundar, flex: 1 }}>Inte samma</button>
        </div>
      </div>
    </Sektion>
  );
}

/** Raden under jobbets namn: läget i ord. "Startad — ingen maskin har skickat data" är orange (det är fel); resten text2. */
export function LageUnder({ jobb }: { jobb: Pick<JobbVy, 'lage' | 'lageText'> }) {
  return <span data-lage={jobb.lage} style={jobb.lage === 'ingen_data' ? { color: FARG.orange } : undefined}>{jobb.lageText}</span>;
}

/** En lista med jobb i ett kort: namn, läget i ord under, VO-numret till höger. */
export function JobbRader({ jobb, onValj, dampad }: { jobb: JobbVy[]; onValj: (j: JobbVy) => void; dampad?: boolean }) {
  return (
    <>
      {jobb.map((j, i) => (
        <Rad key={j.nyckel} titel={j.namn} under={<LageUnder jobb={j} />} hoger={j.vo} dampad={dampad} sista={i === jobb.length - 1}
          onTryck={() => onValj(j)} attr={{ 'data-testid': `jobb-${j.vo}` }} />
      ))}
    </>
  );
}

/** Raderna under "Maskiner" i jobbets vy. */
export function MaskinSektion({ forvantat, maskiner, idagAr }: { forvantat: Forvantat; maskiner: MaskinSpar[]; idagAr: number }) {
  const rader = maskinRader(forvantat, maskiner, idagAr);
  return (
    <Sektion rubrik={forvantat === 'en_maskin' ? 'Maskin' : 'Maskiner'}>
      {rader.map((r, i) => (
        <Rad key={`${r.titel}-${i}`} titel={r.titel} under={r.under} dampad={r.saknas} sista={i === rader.length - 1} />
      ))}
    </Sektion>
  );
}
