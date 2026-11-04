'use client';

// AVVIKELSE SOM BEVIS: + › Rita & mät › Avvikelse → kameran öppnas direkt → ett litet ark: fotot, typen (förvald ur det som ligger på
// kartan inom 10 m), en valfri kommentar och Spara. Sedan kvittot: vem, när, och — när servern svarat — vad den såg i körspåren.
// Allt sparas lokalt först (lib/avvikelseKo) och skickas när nätet finns; fotograf och tid sätts av servern, raden och fotot låses.
//
// Kameran måste öppnas av ett riktigt tryck (iOS), därför exponeras `oppna()` via ref och sidan anropar den direkt i plusrutans tryck.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import { AVVIKELSE_NAMN, AVVIKELSE_TYPER, avvikelseTid, korsparMening, type AvvikelseTyp } from '@/lib/avvikelse';
import { AVVIKELSE_SPARAD_EVENT, byggAvvikelse, laggAvvikelseIKo, type AvvikelseRad } from '@/lib/avvikelseKo';
import { komprimeraBild } from '@/lib/egenkontrollfoto';

export interface AvvikelsePos { lat: number; lng: number; noggrannhetM: number | null }
export interface AvvikelseFlodeRef { oppna: () => void }

/** Kortets tid: filens tid när den ser ut att vara kamerans (inom 10 minuter bakåt), annars nu. Servern godtar aldrig en tid i framtiden. */
export function kortetsTid(fil: { lastModified?: number }, nu: number): Date {
  const t = fil.lastModified;
  if (typeof t === 'number' && t <= nu && nu - t <= 10 * 60_000) return new Date(t);
  return new Date(nu);
}

const nyttId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16)));

type Lage = { typ: 'stangd' } | { typ: 'form'; foto: Blob; url: string; tagen: Date; pos: AvvikelsePos | null }
  | { typ: 'kvitto'; id: string; url: string; tagen: Date; typNamn: string; rad: AvvikelseRad | null };

export const AvvikelseFlode = forwardRef<AvvikelseFlodeRef, {
  objektId: string | null;
  /** Positionen just nu (null = ingen fix — då går det inte att spara: ett bevis utan plats är inget bevis). */
  hamtaPos: () => AvvikelsePos | null;
  /** Förvalet ur det som ligger på kartan vid positionen. */
  hamtaForval: (pos: AvvikelsePos | null) => AvvikelseTyp;
  fotograf: string | null;
  maskinNamn: (id: string) => string | null;
}>(function AvvikelseFlode({ objektId, hamtaPos, hamtaForval, fotograf, maskinNamn }, ref) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lage, setLage] = useState<Lage>({ typ: 'stangd' });
  const [typ, setTyp] = useState<AvvikelseTyp>('korskada');
  const [kommentar, setKommentar] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({ oppna: () => { if (inputRef.current) { inputRef.current.value = ''; inputRef.current.click(); } } }), []);

  // Kvittot väntar på serverns svar (körspåren). Kommer det medan arket står uppdateras raden.
  useEffect(() => {
    if (lage.typ !== 'kvitto') return;
    const id = lage.id;
    const fn = (e: Event) => {
      const rad = (e as CustomEvent<AvvikelseRad>).detail;
      if (rad?.id === id) setLage((l) => (l.typ === 'kvitto' && l.id === id ? { ...l, rad } : l));
    };
    window.addEventListener(AVVIKELSE_SPARAD_EVENT, fn);
    return () => window.removeEventListener(AVVIKELSE_SPARAD_EVENT, fn);
  }, [lage.typ === 'kvitto' ? lage.id : null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ingen position när fotot togs: titta igen varannan sekund tills GPS:en hittat en (då går Spara att trycka).
  const vantarPos = lage.typ === 'form' && !lage.pos;
  useEffect(() => {
    if (!vantarPos) return;
    const satt = (p: AvvikelsePos) => setLage((l) => (l.typ === 'form' && !l.pos ? { ...l, pos: p } : l));
    const iv = window.setInterval(() => { const p = hamtaPos(); if (p) satt(p); }, 2000);
    // Planeraren har ofta ingen GPS igång på kartan: be telefonen om en position direkt (fotot är redan taget — samma tryck).
    try {
      navigator.geolocation?.getCurrentPosition(
        (g) => satt({ lat: g.coords.latitude, lng: g.coords.longitude, noggrannhetM: Number.isFinite(g.coords.accuracy) ? g.coords.accuracy : null }),
        () => { /* ingen position — raden säger det */ },
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
      );
    } catch { /* */ }
    return () => window.clearInterval(iv);
  }, [vantarPos, hamtaPos]);

  const stang = () => {
    if (lage.typ !== 'stangd') URL.revokeObjectURL(lage.url);
    setLage({ typ: 'stangd' }); setKommentar(''); setFel(null); setSparar(false);
  };

  const valtFoto = async (fil: File | undefined) => {
    if (!fil) return;
    const tagen = kortetsTid(fil, Date.now());
    const pos = hamtaPos();
    setFel(null);
    try {
      const foto = await komprimeraBild(fil);
      setTyp(hamtaForval(pos));
      setKommentar('');
      setLage({ typ: 'form', foto, url: URL.createObjectURL(foto), tagen, pos });
    } catch {
      setFel('Fotot gick inte att läsa. Försök igen.');
    }
  };

  const spara = async () => {
    if (lage.typ !== 'form' || !objektId || !lage.pos || sparar) return;
    setSparar(true); setFel(null);
    try {
      const id = nyttId();
      const rad = await byggAvvikelse({ id, objektId, typ, kommentar, lat: lage.pos.lat, lng: lage.pos.lng, noggrannhetM: lage.pos.noggrannhetM, tagen: lage.tagen, foto: lage.foto });
      await laggAvvikelseIKo(rad, lage.foto);
      setLage({ typ: 'kvitto', id, url: lage.url, tagen: lage.tagen, typNamn: AVVIKELSE_NAMN[typ], rad: null });
    } catch {
      setFel('Kunde inte spara på enheten. Försök igen.');
    } finally {
      setSparar(false);
    }
  };

  const input = (
    <input ref={inputRef} type="file" accept="image/*" capture="environment" data-testid="avvikelse-kamera"
      style={{ display: 'none' }} onChange={(e) => { void valtFoto(e.target.files?.[0]); }} />
  );

  if (lage.typ === 'stangd') return (
    <>
      {input}
      {fel && (
        <Ark rubrik="Avvikelse" onStang={() => setFel(null)} stang="Klar">
          <p style={{ ...TYP.text, color: FARG.rod, margin: 0 }}>{fel}</p>
        </Ark>
      )}
    </>
  );

  const bild = (
    <img src={lage.url} alt="Fotot av avvikelsen" style={{ display: 'block', width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: RADIE.kort }} />
  );

  if (lage.typ === 'kvitto') {
    const mening = korsparMening(lage.rad?.korspar_fore, maskinNamn);
    return (
      <>
        {input}
        <Ark rubrik="Avvikelse sparad" onStang={stang} stang="Klar">
          <div data-testid="avvikelse-kvitto" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            {bild}
            <div style={{ ...TYP.listtitel, color: FARG.text }}>{lage.typNamn}</div>
            <div style={{ ...TYP.text, color: FARG.text2 }}>
              Tagen {avvikelseTid(lage.tagen.toISOString())}{fotograf ? ` av ${fotograf}` : ''}
              {lage.rad ? ` · skickad ${avvikelseTid(lage.rad.skapad_at)}` : ''}
            </div>
            {lage.rad ? (
              <div data-testid="avvikelse-korspar" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs, padding: AVSTAND.m, background: FARG.upphojt, borderRadius: RADIE.kort }}>
                {(mening ?? []).map((m) => <span key={m} style={{ ...TYP.text, color: FARG.text }}>{m}</span>)}
                <span style={{ ...TYP.meta, color: FARG.text2 }}>Räknat av servern ur våra maskiners körspår, 15 m runt platsen.</span>
              </div>
            ) : (
              <div data-testid="avvikelse-vantar" style={{ ...TYP.text, color: FARG.text2 }}>Sparad på enheten · skickas när nätet finns</div>
            )}
            <div style={{ ...TYP.meta, color: FARG.text2 }}>Avvikelsen och fotot går inte att ändra eller ta bort.</div>
          </div>
        </Ark>
      </>
    );
  }

  const kanSpara = !!objektId && !!lage.pos && !sparar;
  return (
    <>
      {input}
      <Ark rubrik="Avvikelse" onStang={stang}
        fot={<button type="button" data-testid="avvikelse-spara" disabled={!kanSpara} onClick={() => void spara()}
          style={{ ...KNAPP.primar, opacity: kanSpara ? 1 : 0.4 }}>{sparar ? 'Sparar…' : 'Spara'}</button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
          {bild}
          <div role="radiogroup" aria-label="Vad är det?" data-testid="avvikelse-typer" style={{ display: 'flex', flexWrap: 'wrap', gap: AVSTAND.s }}>
            {AVVIKELSE_TYPER.map((t) => {
              const vald = t === typ;
              return (
                <button key={t} type="button" role="radio" aria-checked={vald} data-testid={`avvikelse-typ-${t}`} onClick={() => setTyp(t)}
                  style={{ minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.l}px`, border: 'none', borderRadius: RADIE.knapp, fontFamily: 'inherit', cursor: 'pointer',
                    background: vald ? FARG.text : FARG.fyllning, color: vald ? FARG.bg : FARG.text, ...TYP.listtitel }}>
                  {AVVIKELSE_NAMN[t]}
                </button>
              );
            })}
          </div>
          <textarea value={kommentar} onChange={(e) => setKommentar(e.target.value)} placeholder="Kommentar (valfritt)" maxLength={1000} rows={2}
            data-testid="avvikelse-kommentar"
            style={{ width: '100%', boxSizing: 'border-box', padding: AVSTAND.m, border: 'none', borderRadius: RADIE.kort, background: FARG.upphojt, color: FARG.text, fontFamily: 'inherit', ...TYP.text, resize: 'none' }} />
          {!lage.pos && <div data-testid="avvikelse-ingen-pos" style={{ ...TYP.text, color: FARG.orange }}>Ingen position än – vänta tills GPS:en hittat dig.</div>}
          {fel && <div style={{ ...TYP.text, color: FARG.rod }}>{fel}</div>}
          <div style={{ ...TYP.meta, color: FARG.text2 }}>
            Platsen och tiden sparas med fotot. Det går inte att ändra efteråt.
          </div>
        </div>
      </Ark>
    </>
  );
});
