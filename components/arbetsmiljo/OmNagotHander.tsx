'use client';

// "Om något händer" — 112, var man är, och tre steg per situation. Skissen: canvasen "Arbetsmiljö – skisser" (Hander).
// Spec: "Arbetsmiljö i Skogsystem – spec", Om något händer. Korten och reglerna: lib/arbetsmiljo/nod.ts.
//
// FUNGERAR UTAN TÄCKNING: inga ikoner från nätet (egna SVG), korten står i koden, numren och larmplatserna läses ur det enheten
// sparade senast, positionen kommer från GPS. Bara själva rapporten kräver nät — då står det så och texten finns kvar.
//
// Lägen (adressen bär dem, så en omladdning hamnar rätt): start · ?kort=<id> · ?rapport=1[&kort=<id>] · kvitto.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { AVSTAND, FARG, INAKTIV, KNAPP, KORT, RADIE, ROT_MIN_HOJD, TNUM, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import {
  RUTINKORT, hittaKort, koordinatRader, koordinatText, lasNod, ringText, senasteObjektPaEnheten, sparaNod, telLank, valjLarmplats,
  type NodData, type Position, type Rutinkort,
} from '@/lib/arbetsmiljo/nod';
import { TYP_VAL, hamtaNodData, hamtaRapportor, rapporteraTillbud, type TillbudTyp } from '@/lib/arbetsmiljo/tillbud';
import { laggMaskinkollFoto } from '@/lib/maskinkoll/fotoKo';
import { fotoSokvag } from '@/lib/maskinkoll/regler';

type Lage = { vy: 'start' } | { vy: 'kort'; kort: Rutinkort } | { vy: 'rapport'; kort: Rutinkort | null } | { vy: 'kvitto'; typ: TillbudTyp };

function lasAdress(): Lage {
  if (typeof window === 'undefined') return { vy: 'start' };
  const p = new URLSearchParams(window.location.search);
  const kort = hittaKort(p.get('kort'));
  if (p.get('rapport') === '1') return { vy: 'rapport', kort };
  if (kort) return { vy: 'kort', kort };
  return { vy: 'start' };
}

function skrivAdress(l: Lage) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.delete('kort'); url.searchParams.delete('rapport');
  if (l.vy === 'kort') url.searchParams.set('kort', l.kort.id);
  if (l.vy === 'rapport') { url.searchParams.set('rapport', '1'); if (l.kort) url.searchParams.set('kort', l.kort.id); }
  window.history.replaceState(window.history.state, '', url.toString());
}

function nyttId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

/** Telefonens/datorns position. Behöver inget nät. null = ingen position (nekad, ingen GPS, eller väntar). */
function usePosition(): { pos: Position | null; status: 'soker' | 'ok' | 'saknas' } {
  const [pos, setPos] = useState<Position | null>(null);
  const [status, setStatus] = useState<'soker' | 'ok' | 'saknas'>('soker');
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setStatus('saknas'); return; }
    const id = navigator.geolocation.watchPosition(
      p => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude, noggrannhet: Number.isFinite(p.coords.accuracy) ? Math.round(p.coords.accuracy) : null }); setStatus('ok'); },
      () => setStatus(s => (s === 'ok' ? s : 'saknas')),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { pos, status };
}

export default function OmNagotHander() {
  const [lage, setLage] = useState<Lage>({ vy: 'start' });
  const [nod, setNod] = useState<NodData | null>(null);
  const { pos, status } = usePosition();

  useEffect(() => { setLage(lasAdress()); }, []);

  // Det som sparats på enheten först (fungerar utan nät), sedan nätet om det finns.
  useEffect(() => {
    setNod(lasNod());
    let vid = true;
    hamtaNodData(supabase).then(d => { if (d && vid) { sparaNod(d); setNod(d); } }).catch(() => {});
    return () => { vid = false; };
  }, []);

  const ga = useCallback((l: Lage) => { setLage(l); skrivAdress(l); if (typeof window !== 'undefined') window.scrollTo(0, 0); }, []);

  const larmplats = valjLarmplats(nod?.larmplatser ?? [], pos, pos ? null : senasteObjektPaEnheten());
  const kontakter = nod?.kontakter ?? [];

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        {lage.vy !== 'start' && lage.vy !== 'kvitto' && (
          <button type="button" onClick={() => ga(lage.vy === 'rapport' && lage.kort ? { vy: 'kort', kort: lage.kort } : { vy: 'start' })}
            style={{ ...KNAPP.lank, marginBottom: AVSTAND.s, gap: AVSTAND.xs }}>
            <Pil vanster /> {lage.vy === 'rapport' && lage.kort ? lage.kort.titel : 'Om något händer'}
          </button>
        )}

        {lage.vy === 'start' && (
          <>
            {/* Ingen egen rubrik: toppfältet säger redan "Om något händer". Det viktigaste står först. */}
            <Nodkort pos={pos} status={status} larmplats={larmplats} forst />
            <Etikett>Vad har hänt?</Etikett>
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
              {RUTINKORT.map((k, i) => (
                <RadKnapp key={k.id} sista={i === RUTINKORT.length - 1} onTryck={() => ga({ vy: 'kort', kort: k })} attr={{ 'data-kort': k.id }}>
                  {k.titel}
                </RadKnapp>
              ))}
            </div>
            <Etikett>Efteråt</Etikett>
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
              <RadKnapp sista onTryck={() => ga({ vy: 'rapport', kort: null })} attr={{ 'data-rapportera': '' }}
                under="Något som hände, eller nästan hände">Rapportera vad som hände</RadKnapp>
            </div>
            <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0` }}>Korten fungerar utan täckning.</p>
          </>
        )}

        {lage.vy === 'kort' && (
          <>
            <h1 style={{ ...TYP.titel, margin: 0 }}>{lage.kort.titel}</h1>
            <Nodkort pos={pos} status={status} larmplats={larmplats} kompakt />
            <ol data-steg style={{ listStyle: 'none', margin: `${AVSTAND.xl}px 0 0`, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
              {lage.kort.steg.map((s, i) => (
                <li key={i} style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'flex-start' }}>
                  <span aria-hidden style={{ ...TYP.listtitel, ...TNUM, width: 32, height: 32, borderRadius: RADIE.cirkel, background: FARG.upphojt, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ ...TYP.rubrik, fontWeight: 600, paddingTop: 2 }}>{s}</span>
                </li>
              ))}
            </ol>
            {kontakter.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, marginTop: AVSTAND.xl }}>
                {kontakter.map(k => (
                  <a key={k.telefon} href={telLank(k.telefon)} data-ring={k.namn} style={{ ...KNAPP.sekundar, textDecoration: 'none', gap: AVSTAND.s }}>
                    <Telefon farg={FARG.text} /> {ringText(k)}
                  </a>
                ))}
              </div>
            )}
            <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginTop: AVSTAND.xl }}>
              <RadKnapp sista onTryck={() => ga({ vy: 'rapport', kort: lage.kort })} attr={{ 'data-rapportera': '' }}
                under="När det värsta är över">Rapportera vad som hände</RadKnapp>
            </div>
          </>
        )}

        {lage.vy === 'rapport' && (
          <Rapport kort={lage.kort} pos={pos} onKlar={typ => ga({ vy: 'kvitto', typ })} />
        )}

        {lage.vy === 'kvitto' && (
          <div data-kvitto>
            <h1 style={{ ...TYP.titel, margin: 0 }}>Skickat</h1>
            <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
              Arbetsledningen och skyddsombudet har fått det. Tack – det är så vi undviker att det händer igen.
            </p>
            <Link href="/" style={{ ...KNAPP.primar, textDecoration: 'none' }}>Klar</Link>
          </div>
        )}
      </div>
    </div>
  );
}

/** Ring 112 + det man läser upp. Larmplatsen (där ambulansen ska in) först om trakten har en, annars där man står. */
function Nodkort({ pos, status, larmplats, kompakt, forst }: { pos: Position | null; status: 'soker' | 'ok' | 'saknas'; larmplats: ReturnType<typeof valjLarmplats>; kompakt?: boolean; forst?: boolean }) {
  const huvud = larmplats ? { rubrik: `Larmplats · ${larmplats.namn}`, lat: larmplats.lat, lng: larmplats.lng, under: larmplats.beskrivning } : pos ? { rubrik: 'Här är du', lat: pos.lat, lng: pos.lng, under: null } : null;
  const rader = huvud ? koordinatRader(huvud.lat, huvud.lng) : null;
  return (
    <div data-nodkort style={{ ...KORT, marginTop: forst ? 0 : AVSTAND.l }}>
      {huvud && rader ? (
        <>
          <div style={{ ...TYP.micro, color: FARG.text2 }}>{huvud.rubrik}</div>
          <div data-koordinat={koordinatText(huvud.lat, huvud.lng)} style={{ ...(kompakt ? TYP.rubrik : TYP.tal), ...TNUM, marginTop: AVSTAND.s }}>
            {rader[0]}<br />{rader[1]}
          </div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>Läs upp det här för 112.</div>
          {huvud.under && <div style={{ ...TYP.text, marginTop: AVSTAND.s, whiteSpace: 'pre-wrap' }}>{huvud.under}</div>}
          {larmplats && pos && (
            <div data-har-ar-du style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s, ...TNUM }}>Du står på {koordinatText(pos.lat, pos.lng)}</div>
          )}
        </>
      ) : (
        <div style={{ ...TYP.text, color: FARG.text2 }}>
          {status === 'soker' ? 'Söker din position …' : 'Positionen gick inte att hämta. Säg var du är så gott det går.'}
        </div>
      )}
      <a href="tel:112" data-ring-112 style={{ ...KNAPP.primar, textDecoration: 'none', gap: AVSTAND.s, marginTop: AVSTAND.l }}>
        <Telefon farg={FARG.bg} /> Ring 112
      </a>
    </div>
  );
}

function Rapport({ kort, pos, onKlar }: { kort: Rutinkort | null; pos: Position | null; onKlar: (typ: TillbudTyp) => void }) {
  const [typ, setTyp] = useState<TillbudTyp | null>(kort && kort.id === 'skadad' ? 'olycka' : null);
  const [text, setText] = useState('');
  const [fil, setFil] = useState<File | null>(null);
  const [bild, setBild] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const id = useRef(nyttId());
  const kamera = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (bild) URL.revokeObjectURL(bild); }, [bild]);

  const klar = typ !== null && text.trim() !== '';

  const skicka = async () => {
    if (!typ) return;
    setSparar(true); setFel(null);
    const vem = await hamtaRapportor(supabase);
    if (!vem.ok) { setSparar(false); setFel(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Ingen täckning just nu. Texten finns kvar – skicka när du har täckning.' : vem.fel); return; }
    let fotoUrl: string | null = null;
    if (fil) {
      fotoUrl = fotoSokvag(vem.medarbetareId, 'tillbud', id.current, Date.now());
      try { await laggMaskinkollFoto('tillbud', id.current, fotoUrl, fil); }
      catch { setSparar(false); setFel('Bilden kunde inte sparas. Ta den igen, eller skicka utan bild.'); return; }
    }
    const f = await rapporteraTillbud(supabase, {
      id: id.current, typ, situation: kort?.id ?? null, beskrivning: text, fotoUrl,
      maskinId: vem.maskinId, lat: pos?.lat ?? null, lng: pos?.lng ?? null, medarbetareId: vem.medarbetareId,
    });
    setSparar(false);
    if (f) { setFel(typeof navigator !== 'undefined' && navigator.onLine === false ? 'Ingen täckning just nu. Texten finns kvar – skicka när du har täckning.' : f); return; }
    onKlar(typ);
  };

  return (
    <div data-rapport>
      <h1 style={{ ...TYP.titel, margin: 0 }}>Vad hände?</h1>

      <Etikett>Skadades någon?</Etikett>
      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        {TYP_VAL.map((v, i) => (
          <button key={v.typ} type="button" onClick={() => setTyp(v.typ)} aria-pressed={typ === v.typ} data-typ={v.typ}
            style={{ ...radStil, borderBottom: i === TYP_VAL.length - 1 ? 'none' : `1px solid ${FARG.linje}` }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...TYP.listtitel, display: 'block' }}>{v.titel}</span>
              <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{v.under}</span>
            </span>
            <Bock vald={typ === v.typ} />
          </button>
        ))}
      </div>

      <Etikett>Berätta kort</Etikett>
      <textarea value={text} onChange={e => setText(e.target.value)} aria-label="Berätta kort vad som hände" rows={4}
        placeholder={kort ? `T.ex. vad som hände innan: ${kort.titel.toLowerCase()}` : 'T.ex. trädet föll åt fel håll, två meter från vägen'}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min * 2.5, border: 'none', borderRadius: RADIE.kort, background: FARG.kort, color: FARG.text, padding: AVSTAND.m, fontFamily: 'inherit', ...TYP.text, outline: 'none', resize: 'vertical' }} />

      <Etikett>Bild · valfritt</Etikett>
      <input ref={kamera} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; setFil(f); setBild(URL.createObjectURL(f)); }} />
      {bild ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={bild} alt="Din bild" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: RADIE.kort, background: FARG.upphojt }} />
          <button type="button" onClick={() => { setFil(null); setBild(null); }} style={KNAPP.tertiar}>Ta bort bilden</button>
        </div>
      ) : (
        <button type="button" onClick={() => kamera.current?.click()} style={KNAPP.sekundar}>Ta en bild</button>
      )}

      {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.l}px 0 0` }}>{fel}</p>}
      <button type="button" onClick={() => void skicka()} disabled={!klar || sparar} data-skicka
        style={{ ...KNAPP.primar, marginTop: AVSTAND.xl, ...(!klar || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Skickar …' : 'Skicka till arbetsledningen'}
      </button>
      {!klar && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>{typ ? 'Skriv vad som hände.' : 'Svara om någon skadades.'}</p>}
    </div>
  );
}

const radStil = {
  display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min + AVSTAND.s, padding: `${AVSTAND.s}px 0`,
  background: 'none', border: 'none', color: FARG.text, textAlign: 'left' as const, fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' as const,
};

function RadKnapp({ children, under, onTryck, sista, attr }: { children: ReactNode; under?: string; onTryck: () => void; sista?: boolean; attr?: Record<string, string> }) {
  return (
    <button type="button" onClick={onTryck} {...attr} style={{ ...radStil, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYP.listtitel, display: 'block' }}>{children}</span>
        {under && <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{under}</span>}
      </span>
      <Pil />
    </button>
  );
}

function Etikett({ children }: { children: ReactNode }) {
  return <p style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{children}</p>;
}

// Egna ikoner (SVG i koden) — ikonfonten hämtas från nätet och finns inte utan täckning.
function Telefon({ farg }: { farg: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill={farg} d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
    </svg>
  );
}

function Pil({ vanster }: { vanster?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, transform: vanster ? 'rotate(180deg)' : undefined }}>
      <path d="M9 5l7 7-7 7" fill="none" stroke={vanster ? FARG.bla : FARG.text3} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Bock({ vald }: { vald: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" fill={vald ? FARG.text : 'none'} stroke={vald ? FARG.text : FARG.text3} strokeWidth="2" />
      {vald && <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke={FARG.bg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}
