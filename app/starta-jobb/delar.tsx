'use client';
// Delar av Starta jobb-sidan — bara utseende och små lokala tillstånd. All data och alla skrivningar bor i page.tsx.
// Alla mått/färger ur lib/design/tokens (inga nya literaler). Färg bär aldrig ensam: varje läge har också ord.

import React, { useState } from 'react';
import { AVSTAND, FARG, KNAPP, INAKTIV, KORT, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { JOBBTYPER, URSPRUNG_VAL, avstandText, jobbTypLabel, type JobbTyp, type JobbUrsprung, type VirkesobjektRad } from '@/lib/startaJobb';
import type { PlatsTraff } from '@/lib/platsSok';
import PlatsKarta, { type KartPlats } from '@/components/starta/PlatsKarta';

export const falt: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
  borderRadius: RADIE.rad, border: 'none', background: FARG.kort, color: FARG.text, outline: 'none', fontFamily: 'inherit', ...TYP.text,
};

/** Gruppens rubrik (versaler, grå) + innehåll. */
export function Grupp({ rubrik, valfri, children }: { rubrik: string; valfri?: boolean; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: AVSTAND.sektion }}>
      <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>{rubrik}{valfri ? ' · valfritt' : ''}</div>
      {children}
    </section>
  );
}

/** Ett val bland få: vald = inverterad (vit på svart som primärknappen), ej vald = fylld grå. Radiogrupp för skärmläsare. */
export function Val<T extends string>({ varden, valt, onVal, kolumner = 2 }: {
  varden: { varde: T; label: string }[]; valt: T | null; onVal: (v: T) => void; kolumner?: number;
}) {
  return (
    <div role="radiogroup" style={{ display: 'grid', gridTemplateColumns: `repeat(${kolumner}, 1fr)`, gap: AVSTAND.s }}>
      {varden.map((v) => {
        const aktiv = v.varde === valt;
        return (
          <button key={v.varde} type="button" role="radio" aria-checked={aktiv} data-testid={`val-${v.varde}`} onClick={() => onVal(v.varde)}
            style={{ ...KNAPP.sekundar, ...(aktiv ? { background: FARG.text, color: FARG.bg } : null) }}>
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

export const TypVal = ({ valt, onVal }: { valt: JobbTyp | null; onVal: (t: JobbTyp) => void }) =>
  <Val varden={JOBBTYPER.map((t) => ({ varde: t.typ, label: t.label }))} valt={valt} onVal={onVal} />;

export function UrsprungVal({ valt, onVal }: { valt: JobbUrsprung; onVal: (u: JobbUrsprung) => void }) {
  const hjalp = URSPRUNG_VAL.find((u) => u.varde === valt)?.hjalp;
  return (
    <>
      <Val varden={URSPRUNG_VAL.map((u) => ({ varde: u.varde, label: u.label }))} valt={valt} onVal={onVal} />
      {hjalp && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{hjalp}</div>}
    </>
  );
}

/** GROT: välj virkesobjektet på samma trakt. Närmaste står överst och är märkt — men inget väljs förrän man trycker. */
export function HorTill({ alternativ, valt, onVal, harPosition }: {
  alternativ: (VirkesobjektRad & { avstandM: number | null })[]; valt: string | null; onVal: (id: string | null) => void; harPosition: boolean;
}) {
  const rad = (id: string | null, titel: string, meta: string) => {
    const aktiv = valt === id;
    return (
      <button key={id ?? 'inget'} type="button" role="radio" aria-checked={aktiv} data-testid={`hortill-${id ?? 'inget'}`} onClick={() => onVal(id)}
        style={{ ...KNAPP.sekundar, justifyContent: 'space-between', textAlign: 'left', ...(aktiv ? { background: FARG.text, color: FARG.bg } : null) }}>
        <span>{titel}</span>
        <span style={{ ...TYP.meta, opacity: 0.7 }}>{meta}</span>
      </button>
    );
  };
  return (
    <div role="radiogroup" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      {rad(null, 'Inget', '')}
      {alternativ.map((o, i) => rad(o.id, o.namn || 'Objekt', [i === 0 && o.avstandM != null ? 'Närmaste' : '', avstandText(o.avstandM)].filter(Boolean).join(' · ')))}
      {alternativ.length === 0 && <div style={{ ...TYP.meta, color: FARG.text2 }}>{harPosition ? 'Inga virkesobjekt med plats hittades.' : 'Sätt en position så visas det närmaste virkesobjektet först.'}</div>}
      <div style={{ ...TYP.meta, color: FARG.text2 }}>Då visas virkesobjektets traktgräns, ytor, anteckningar och skördarens spår även på GROT-jobbet.</div>
    </div>
  );
}

export type PlatsLage = 'karta' | 'sok' | 'har';

/** Position på telefon/dator: peka på kartan (standard), sök fastighet/ort, eller "Här". Går att lämna tomt. */
export function PlatsVal({ plats, platsText, onPlats, onSok, onHar, startKarta, sokStatus }: {
  plats: KartPlats | null;
  platsText: string | null;
  onPlats: (p: KartPlats | null, text: string | null) => void;
  onSok: (q: string) => Promise<{ traffar: PlatsTraff[] } | { fel: string }>;
  onHar: () => Promise<{ plats: KartPlats; noggrannhetM: number | null } | { fel: string }>;
  startKarta?: KartPlats | null;
  sokStatus?: string | null;
}) {
  const [lage, setLage] = useState<PlatsLage>('karta');
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
    onPlats(r.plats, `Enhetens position${r.noggrannhetM != null ? ` (±${Math.round(r.noggrannhetM)} m)` : ''}`);
  };

  return (
    <div>
      <Val<PlatsLage> varden={[{ varde: 'karta', label: 'Peka på kartan' }, { varde: 'sok', label: 'Sök fastighet' }, { varde: 'har', label: 'Här' }]} valt={lage} onVal={(l) => { setLage(l); setMeddelande(null); }} kolumner={3} />
      <div style={{ marginTop: AVSTAND.m }}>
        {lage === 'karta' && <PlatsKarta plats={plats} start={startKarta} onVal={(p) => onPlats(p, 'Från kartan')} />}
        {lage === 'sok' && (
          <div>
            <div style={{ display: 'flex', gap: AVSTAND.s }}>
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void sok(); }}
                placeholder="Fastighet, by eller adress" aria-label="Sök fastighet" style={{ ...falt, flex: 1 }} />
              <button type="button" onClick={() => void sok()} style={{ ...KNAPP.sekundar, width: 'auto', ...(sokar ? INAKTIV : null) }}>{sokar ? 'Söker …' : 'Sök'}</button>
            </div>
            {sokStatus && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{sokStatus}</div>}
            {traffar && traffar.length > 0 && (
              <div style={{ marginTop: AVSTAND.s, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
                {traffar.map((t, i) => (
                  <button key={`${t.etikett}-${i}`} type="button" data-testid={`sok-traff-${i}`} onClick={() => { onPlats({ lat: t.lat, lng: t.lng }, t.etikett); setLage('karta'); setTraffar(null); }}
                    style={{ ...KNAPP.sekundar, justifyContent: 'flex-start', textAlign: 'left' }}>{t.etikett}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {lage === 'har' && (
          <div>
            <button type="button" onClick={() => void har()} style={{ ...KNAPP.sekundar, ...(haerBusy ? INAKTIV : null) }}>{haerBusy ? 'Hämtar position …' : 'Använd enhetens position'}</button>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Bara om du står på platsen — annars blir jobbet fel placerat.</div>
          </div>
        )}
        {meddelande && <div role="status" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>{meddelande}</div>}
      </div>
      <div data-testid="vald-plats" style={{ ...TYP.meta, color: plats ? FARG.text : FARG.text2, marginTop: AVSTAND.m, display: 'flex', justifyContent: 'space-between', gap: AVSTAND.s, alignItems: 'center' }}>
        <span>{plats ? `Position: ${plats.lat.toFixed(4)}, ${plats.lng.toFixed(4)}${platsText ? ` · ${platsText}` : ''}` : 'Ingen position vald — jobbet skapas utan.'}</span>
        {plats && <button type="button" onClick={() => onPlats(null, null)} style={KNAPP.tertiar}>Ta bort</button>}
      </div>
    </div>
  );
}

/** Förslaget "P-1018 har fått Vida-objekt X — slå ihop?". Ja/Nej; ingenting flyttas förrän Ja. */
export function ForslagKort({ text, orsak, upptagen, onJa, onNej, kompakt }: {
  text: string; orsak: 'hyttspar' | 'position'; upptagen: boolean; onJa: () => void; onNej: () => void; kompakt?: boolean;
}) {
  return (
    <div data-testid="sla-ihop-forslag" style={{ ...(kompakt ? { marginTop: AVSTAND.m, paddingTop: AVSTAND.m, borderTop: `1px solid ${FARG.linje}` } : KORT) }}>
      <div style={{ ...TYP.listtitel }}>{text}</div>
      <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
        {orsak === 'hyttspar' ? 'Jobbets hyttspår ligger inom objektets traktgräns.' : 'Jobbets plats ligger inom objektets traktgräns.'}
        {' '}Ja flyttar hyttspår, markeringar, anteckningar, media och tilldelning och tar bort jobbet.
      </div>
      <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m, ...(upptagen ? INAKTIV : null) }}>
        <button type="button" data-testid="sla-ihop-ja" onClick={onJa} style={{ ...KNAPP.primar, width: 'auto', flex: 1 }}>{upptagen ? 'Slår ihop …' : 'Slå ihop'}</button>
        <button type="button" data-testid="sla-ihop-nej" onClick={onNej} style={{ ...KNAPP.sekundar, width: 'auto' }}>Nej</button>
      </div>
    </div>
  );
}

/** Chip med ord (aldrig bara färg). */
export function Marke({ text }: { text: string }) {
  return <span style={{ ...TYP.micro, color: FARG.text2, background: FARG.fyllning, borderRadius: RADIE.rad, padding: `${AVSTAND.xs}px ${AVSTAND.s}px` }}>{text}</span>;
}

export const typText = (typ: string | null | undefined) => jobbTypLabel(typ);
