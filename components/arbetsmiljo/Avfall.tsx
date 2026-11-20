'use client';

// Farligt avfall — svarar på EN fråga: "När lämnade vi senast, och till vem?".
// Föraren: Lämnat avfall → var och vad (ett ark) → Lämnat → ger telefonen till mottagaren, som skriver sitt namn, skriver under med
// fingret och trycker Mottaget → kvittot. Först då sparas lämningen (i telefonen först, sedan servern — avfallKo.ts).
// Listan: de senaste, Årets lista (alla, PDF för tillsynen) och — admin — Mottagare.
// Texterna, vikterna och avfallskoderna: lib/arbetsmiljo/avfall.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';
import Underskrift from './Underskrift';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { komprimeraMarkeringFoto } from '@/lib/markeringFoto';
import {
  AVFALL_TYPER, arSvar, bildLank, fmtKg, forAr, forvald, hamtaLamningar, hamtaMottagare, klockslag, kortDatum, lamningTitel,
  lamningUnder, laggTillMottagare, poster, posterText, sortera, svar, svenskAr, uppskattaKg, type Lamning, type Mottagare,
} from '@/lib/arbetsmiljo/avfall';
import { laggIKo, skickaKo, skickaPost, vantande, type KoPost } from '@/lib/arbetsmiljo/avfallKo';

const SENAST_NYCKEL = 'avfall_mottagare_v1';
const ANNAT = '__annat';

type Data = { mottagare: Mottagare[]; lamningar: Lamning[] };
type Vy = null | 'lamna' | 'kvittera' | 'klart';

function lasSenast(): string | null { try { return window.localStorage.getItem(SENAST_NYCKEL); } catch { return null; } }
function sparaSenast(id: string) { try { window.localStorage.setItem(SENAST_NYCKEL, id); } catch { /* bara en bekvämlighet */ } }

function blobTillDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
}

function Raknare({ etikett, varde, onAndra, testid }: { etikett: string; varde: number; onAndra: (f: (v: number) => number) => void; testid: string }) {
  const knapp = { width: TRAFFYTA.min, height: TRAFFYTA.min, borderRadius: RADIE.cirkel, border: 'none', background: FARG.fyllning, color: FARG.text, ...TYP.rubrik, cursor: 'pointer', fontFamily: 'inherit' } as const;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 56, padding: `0 ${AVSTAND.s}px 0 ${AVSTAND.l}px`, borderBottom: `1px solid ${FARG.linje}` }}>
      <span style={{ flex: 1, ...TYP.text, color: FARG.text }}>{etikett}</span>
      <button type="button" aria-label={`${etikett}: en färre`} onClick={() => onAndra(v => Math.max(0, v - 1))} style={{ ...knapp, ...(varde === 0 ? INAKTIV : {}) }} disabled={varde === 0}>−</button>
      <span data-testid={testid} style={{ width: 32, textAlign: 'center', ...TYP.rubrik, color: FARG.text }}>{varde}</span>
      <button type="button" aria-label={`${etikett}: en till`} onClick={() => onAndra(v => Math.min(99, v + 1))} style={knapp}>+</button>
    </div>
  );
}

function Bock({ etikett, pa, onAndra, testid, sista }: { etikett: string; pa: boolean; onAndra: (v: boolean) => void; testid: string; sista?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={pa} data-testid={testid} onClick={() => onAndra(!pa)}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 56, padding: `0 ${AVSTAND.l}px`, border: 'none', borderBottom: sista ? 'none' : `1px solid ${FARG.linje}`, background: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' }}>
      <span style={{ flex: 1 }}>{etikett}</span>
      <span aria-hidden="true" style={{ width: 28, height: 28, borderRadius: RADIE.cirkel, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', background: pa ? FARG.text : 'transparent', border: pa ? 'none' : `2px solid ${FARG.text3}` }}>
        {pa && <svg width="14" height="14" viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={FARG.bg} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </span>
    </button>
  );
}

export default function Avfall() {
  const { medarbetare } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';
  const [data, setData] = useState<Data | null | 'fel'>(null);
  const [koLista, setKoLista] = useState<Lamning[]>([]);
  const [vy, setVy] = useState<Vy>(null);
  // Formuläret
  const [mottagareId, setMottagareId] = useState<string | null>(null);
  const [annatStalle, setAnnatStalle] = useState('');
  const [slang, setSlang] = useState(0);
  const [dunkar, setDunkar] = useState(0);
  const [trasor, setTrasor] = useState(false);
  const [annat, setAnnat] = useState(false);
  const [annatText, setAnnatText] = useState('');
  const [foljesedel, setFoljesedel] = useState<File | null>(null);
  // Kvittensen
  const [kvitteradNamn, setKvitteradNamn] = useState('');
  const [underskrift, setUnderskrift] = useState<string | null>(null);
  const [kvittoSkickat, setKvittoSkickat] = useState(true);
  const [kvittoTid, setKvittoTid] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  // Arken
  const [valdId, setValdId] = useState<string | null>(null);
  const [arsLista, setArsLista] = useState<number | null>(null);
  const [pdf, setPdf] = useState(false);
  const [mottagareArk, setMottagareArk] = useState(false);
  const [nyMottagare, setNyMottagare] = useState('');
  const [bilder, setBilder] = useState<{ underskrift: string | null; foljesedel: string | null }>({ underskrift: null, foljesedel: null });
  const fotoRef = useRef<HTMLInputElement>(null);

  const hamta = useCallback(async () => {
    if (!medarbetare) return;
    // Först det som väntar i telefonen, så det skickas innan listan läses.
    await skickaKo(supabase).catch(() => 0);
    setKoLista(vantande());
    const [mottagare, lamningar] = await Promise.all([hamtaMottagare(supabase), hamtaLamningar(supabase)]);
    if (!mottagare || !lamningar) { setData('fel'); return; }
    setData({ mottagare, lamningar });
  }, [medarbetare]);

  useEffect(() => { void hamta(); }, [hamta]);
  useEffect(() => {
    const igen = () => { void hamta(); };
    window.addEventListener('online', igen);
    const synlig = () => { if (document.visibilityState === 'visible') igen(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { window.removeEventListener('online', igen); document.removeEventListener('visibilitychange', synlig); };
  }, [hamta]);

  const ok = data && data !== 'fel' ? data : null;
  const allaLamningar = ok ? [...koLista.filter(k => !ok.lamningar.some(l => l.id === k.id)), ...ok.lamningar] : koLista;
  const vald = valdId ? allaLamningar.find(l => l.id === valdId) ?? null : null;

  // Bilderna i en öppnad lämning (andras ser bara arbetsledningen).
  useEffect(() => {
    setBilder({ underskrift: null, foljesedel: null });
    if (!vald || vald.vantar) return;
    let aktiv = true;
    void Promise.all([bildLank(supabase, vald.underskriftSokvag), vald.foljesedelSokvag ? bildLank(supabase, vald.foljesedelSokvag) : Promise.resolve(null)])
      .then(([u, f]) => { if (aktiv) setBilder({ underskrift: u, foljesedel: f }); });
    return () => { aktiv = false; };
  }, [vald?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const valdaPoster = poster({ slang, dunkar, trasor, annat, annatText });
  const kg = uppskattaKg(valdaPoster);
  const mottagareNamn = mottagareId === ANNAT ? annatStalle.trim() : ok?.mottagare.find(m => m.id === mottagareId)?.namn ?? '';
  const kanLamna = valdaPoster.length > 0 && !!mottagareNamn;
  const kanKvittera = !!kvitteradNamn.trim() && !!underskrift && !sparar;

  const oppnaLamna = () => {
    if (!ok) return;
    setFel(null);
    setMottagareId(forvald(ok.mottagare, lasSenast()) ?? ANNAT);
    setAnnatStalle(''); setSlang(0); setDunkar(0); setTrasor(false); setAnnat(false); setAnnatText(''); setFoljesedel(null);
    setKvitteradNamn(''); setUnderskrift(null);
    setVy('lamna');
  };

  const mottaget = async () => {
    if (!medarbetare || !kanKvittera) return;
    setSparar(true); setFel(null);
    let foljesedelUrl: string | null = null;
    if (foljesedel) {
      try { foljesedelUrl = await blobTillDataUrl(await komprimeraMarkeringFoto(foljesedel)); } catch { foljesedelUrl = null; }
    }
    const post: KoPost = {
      id: crypto.randomUUID(), medarbetareId: medarbetare.id, mottagareId: mottagareId === ANNAT ? null : mottagareId,
      mottagareNamn: mottagareNamn.slice(0, 80), poster: valdaPoster, kg, kvitteradNamn: kvitteradNamn.trim().slice(0, 80),
      underskrift: underskrift!, foljesedel: foljesedelUrl, skapad: new Date().toISOString(), lamnadAvNamn: medarbetare.namn?.split(/\s+/)[0] ?? null,
    };
    if (!laggIKo(post)) {
      // Telefonen kunde inte spara: skicka direkt, annars får mottagaren skriva under igen.
      const gick = await skickaPost(supabase, post).catch(() => false);
      setSparar(false);
      if (!gick) { setFel('Kunde inte spara. Kontrollera täckningen och tryck Mottaget igen.'); return; }
      setKvittoSkickat(true);
    } else {
      const kvar = await skickaKo(supabase).catch(() => 1);
      setSparar(false);
      setKvittoSkickat(kvar === 0 || !vantande().some(v => v.id === post.id));
    }
    setKvittoTid(post.skapad);
    if (mottagareId && mottagareId !== ANNAT) sparaSenast(mottagareId);
    setVy('klart');
    void hamta();
  };

  const s = ok ? svar(allaLamningar) : null;
  const iAr = svenskAr(new Date().toISOString());
  const senaste = sortera(allaLamningar).slice(0, 3);
  const arsListan = arsLista != null ? forAr(allaLamningar.filter(l => !l.vantar), arsLista) : [];
  const arsSvar = arSvar(arsListan);

  // ── Kvittensen: telefonen hos mottagaren. Helskärm, inget annat på skärmen. ──────────────────────────────────────────
  if (vy === 'kvittera') {
    return (
      <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
        <style>{designCss}</style>
        <div data-avfall-kvittera style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.xl, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
          <header>
            <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Ge telefonen till {mottagareNamn}</p>
            <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel, color: FARG.text }}>Har ni tagit emot det här?</h1>
            <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Från Kompersmåla Skog · i dag {klockslag(new Date().toISOString())}</p>
          </header>
          <Sektion rubrik="Lämnas">
            {valdaPoster.map(p => (
              <Rad key={p.typ} titel={p.typ === 'annat' ? (p.text || 'Annat') : AVFALL_TYPER[p.typ].namn}
                hoger={p.antal != null ? `${p.antal} st` : p.typ === 'trasor' ? 'med olja' : undefined} />
            ))}
            <Rad titel="Vikt" hoger={`ca ${fmtKg(kg)} kg`} sista />
          </Sektion>
          <Falt etikett="Ditt namn" value={kvitteradNamn} onChange={setKvitteradNamn} placeholder="Förnamn och efternamn" name="mottagare-namn" />
          <Underskrift onAndrad={setUnderskrift} />
          {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>{fel}</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            <button type="button" data-avfall-mottaget disabled={!kanKvittera} onClick={() => void mottaget()}
              style={{ ...KNAPP.primar, ...(!kanKvittera ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Mottaget'}</button>
            <button type="button" data-avfall-stammer-inte onClick={() => { setFel(null); setVy('lamna'); }} style={KNAPP.lank}>Stämmer inte</button>
            <p style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', margin: 0 }}>Ingen app och inget nummer behövs.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Kvittot ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (vy === 'klart') {
    return (
      <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
        <style>{designCss}</style>
        <div data-avfall-klart style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.xxl * 2, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))`, display: 'flex', flexDirection: 'column', gap: AVSTAND.xl }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: AVSTAND.l, textAlign: 'center' }}>
            <div aria-hidden="true" style={{ width: 88, height: 88, borderRadius: RADIE.cirkel, background: FARG.gron, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="44" height="44" viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={FARG.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </div>
            <h1 style={{ margin: 0, ...TYP.titel, color: FARG.text }}>{mottagareNamn} har tagit emot det</h1>
            <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Kvitterat av {kvitteradNamn.trim()} {klockslag(kvittoTid ?? new Date().toISOString())}</p>
          </div>
          <Sektion rubrik="Lämningen">
            <Rad titel="Vad" hoger={posterText(valdaPoster)} />
            <Rad titel="Vikt" hoger={`ca ${fmtKg(kg)} kg`} sista />
          </Sektion>
          <p data-avfall-klart-not style={{ margin: 0, ...TYP.text, color: kvittoSkickat ? FARG.text2 : FARG.orange }}>
            {kvittoSkickat ? 'Anteckningen är klar och sparas i tre år.' : 'Sparad i telefonen. Den skickas av sig själv när telefonen får nät.'}
          </p>
          <button type="button" data-avfall-klar onClick={() => setVy(null)} style={KNAPP.sekundar}>Klar</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Farligt avfall</p>
          <h1 data-testid="avfall-svar" style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel, color: s?.ton ? FARG.orange : FARG.text }}>
            {data === null ? 'Läser …' : data === 'fel' ? 'Kunde inte läsa avfallet' : s!.text}
          </h1>
          {s?.under && <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{s.under}</p>}
          {data === 'fel' && (
            <button type="button" onClick={() => { setData(null); void hamta(); }} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
          )}
        </header>

        {ok && (
          <>
            <button type="button" data-avfall-ny onClick={oppnaLamna} style={{ ...KNAPP.primar, width: '100%' }}>Lämnat avfall</button>
            {senaste.length > 0 && (
              <Sektion rubrik="Senaste">
                {senaste.map((l, i) => (
                  <Rad key={l.id} titel={lamningTitel(l)} under={lamningUnder(l)} sista={i === senaste.length - 1}
                    hoger={l.vantar ? <span style={{ color: FARG.orange }}>Väntar</span> : <span style={{ color: FARG.gron }}>✓ Kvitterat</span>}
                    attr={{ 'data-avfall-rad': l.id }} onTryck={() => setValdId(l.id)} />
                ))}
              </Sektion>
            )}
            <Sektion rubrik="Listan">
              <Rad titel="Årets lista" hoger={String(forAr(allaLamningar.filter(l => !l.vantar), iAr).length)} pil
                attr={{ 'data-avfall-arslista': '1' }} onTryck={() => setArsLista(iAr)} sista={!arAdmin} />
              {arAdmin && (
                <Rad titel="Mottagare" hoger={ok.mottagare.map(m => m.namn).join(', ') || 'Inga'} pil sista
                  attr={{ 'data-avfall-mottagare': '1' }} onTryck={() => setMottagareArk(true)} />
              )}
            </Sektion>
          </>
        )}
      </div>

      {/* Lämnat: var och vad. EN knapp, Lämnat, som lämnar över telefonen. */}
      {vy === 'lamna' && ok && (
        <Ark rubrik="Lämnat avfall" onStang={() => setVy(null)}
          fot={<>
            <button type="button" data-avfall-lamnat disabled={!kanLamna} onClick={() => { setFel(null); setVy('kvittera'); }}
              style={{ ...KNAPP.primar, ...(!kanLamna ? INAKTIV : {}) }}>Lämnat</button>
            <p style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center', margin: 0 }}>Sedan ger du telefonen till den som tar emot.</p>
          </>}>
          <p style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.s}px` }}>Var?</p>
          <Flikkontroll flikar={[...ok.mottagare.map(m => [m.id, m.namn] as const), [ANNAT, 'Annat'] as const]} aktiv={mottagareId} onVal={setMottagareId} />
          {mottagareId === ANNAT && <div style={{ marginTop: AVSTAND.m }}><Falt etikett="Var lämnade du?" value={annatStalle} onChange={setAnnatStalle} placeholder="T.ex. Stena i Växjö" /></div>}
          <p style={{ ...TYP.micro, color: FARG.text2, margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px` }}>Vad?</p>
          <div style={{ background: FARG.upphojt, borderRadius: RADIE.kort, overflow: 'hidden' }}>
            <Raknare etikett="Hydraulslangar" varde={slang} onAndra={setSlang} testid="avfall-slang" />
            <Bock etikett="Trasor och absorbent" pa={trasor} onAndra={setTrasor} testid="avfall-trasor" />
            <Raknare etikett="Tomma oljedunkar" varde={dunkar} onAndra={setDunkar} testid="avfall-dunkar" />
            <Bock etikett="Annat" pa={annat} onAndra={setAnnat} testid="avfall-annat" sista />
          </div>
          {annat && <div style={{ marginTop: AVSTAND.m }}><Falt etikett="Vad var det?" value={annatText} onChange={setAnnatText} placeholder="T.ex. oljefilter, batteri" /></div>}
          <p data-testid="avfall-kg" style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
            {valdaPoster.length > 0 ? `Ca ${fmtKg(kg)} kg – appen räknar ungefär ur det du valt.` : 'Välj vad du lämnar.'}
          </p>
          <div style={{ marginTop: AVSTAND.xl }}>
            <Sektion rubrik="Följesedel" kort={false}>
              <Rad titel="Fota följesedeln" under={foljesedel ? foljesedel.name : 'Om du fick en'} sista
                hoger={<span style={{ color: FARG.text2 }}>{foljesedel ? 'Ta ny' : 'Valfritt'}</span>}
                attr={{ 'data-avfall-foto': '1' }} onTryck={() => fotoRef.current?.click()} />
            </Sektion>
          </div>
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true"
            onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; if (f && f.type.startsWith('image/')) setFoljesedel(f); }} />
        </Ark>
      )}

      {/* En lämning: det som står i liggaren, och kvittot. */}
      {vald && (
        <Ark rubrik={lamningTitel(vald)} stang="Klar" onStang={() => setValdId(null)}>
          <Sektion rubrik="Lämningen" kort={false}>
            <Rad titel="Vad" hoger={posterText(vald.poster)} />
            <Rad titel="Vikt" hoger={`ca ${fmtKg(vald.kg)} kg`} />
            <Rad titel="Lämnat" hoger={`${kortDatum(vald.lamnadTid)} ${klockslag(vald.lamnadTid)}${vald.lamnadAvNamn ? ` · ${vald.lamnadAvNamn}` : ''}`} />
            <Rad titel="Mottaget av" hoger={vald.kvitteradNamn} sista />
          </Sektion>
          {vald.vantar && <p style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>Sparad i telefonen. Den skickas när telefonen får nät.</p>}
          {bilder.underskrift && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bilder.underskrift} alt={`Underskrift av ${vald.kvitteradNamn}`} data-avfall-underskrift-bild
              style={{ display: 'block', width: '100%', marginTop: AVSTAND.l, borderRadius: RADIE.kort, background: FARG.upphojt }} />
          )}
          {bilder.foljesedel && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bilder.foljesedel} alt="Följesedeln" style={{ display: 'block', width: '100%', marginTop: AVSTAND.l, borderRadius: RADIE.kort }} />
          )}
        </Ark>
      )}

      {/* Årets lista: alla lämningar, PDF för tillsynen. */}
      {arsLista != null && !pdf && (
        <Ark rubrik={`Farligt avfall ${arsLista}`} stang="Klar" onStang={() => setArsLista(null)}
          fot={arsListan.length > 0 ? <button type="button" data-avfall-pdf onClick={() => setPdf(true)} style={KNAPP.primar}>Dela som PDF</button> : undefined}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.xl }}>
            <button type="button" aria-label="Förra året" onClick={() => setArsLista(arsLista - 1)} style={{ ...KNAPP.lank, minWidth: TRAFFYTA.min }}>‹</button>
            <span style={{ ...TYP.listtitel, color: FARG.text }}>{arsLista}</span>
            <button type="button" aria-label="Nästa år" disabled={arsLista >= iAr} onClick={() => setArsLista(arsLista + 1)}
              style={{ ...KNAPP.lank, minWidth: TRAFFYTA.min, ...(arsLista >= iAr ? INAKTIV : {}) }}>›</button>
          </div>
          <p data-testid="avfall-ar-svar" style={{ ...TYP.titel, color: FARG.text, margin: `${AVSTAND.m}px 0 0` }}>{arsSvar.text}</p>
          <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{arsSvar.under}</p>
          {arsListan.length > 0 && (
            <div style={{ marginTop: AVSTAND.l }}>
              <Sektion rubrik="Lämningar" kort={false}>
                {arsListan.map((l, i) => (
                  <Rad key={l.id} titel={lamningTitel(l)} under={`${lamningUnder(l)}${l.lamnadAvNamn ? ` · ${l.lamnadAvNamn}` : ''}`}
                    hoger={<span style={{ color: FARG.gron }}>✓</span>} sista={i === arsListan.length - 1}
                    onTryck={() => { setArsLista(null); setValdId(l.id); }} />
                ))}
              </Sektion>
            </div>
          )}
        </Ark>
      )}
      {pdf && arsLista != null && (
        <PdfForhandsvisning
          skapa={async () => {
            const [{ avfallDokument }, { skapaArbetsmiljoPdf }] = await Promise.all([import('@/lib/arbetsmiljo/avfall'), import('@/lib/arbetsmiljo/pdf')]);
            return skapaArbetsmiljoPdf(avfallDokument(allaLamningar, arsLista));
          }}
          filnamn={`farligt-avfall-${arsLista}`}
          titel={`Farligt avfall ${arsLista}`}
          onStang={() => setPdf(false)}
        />
      )}

      {/* Mottagare (admin): där vi lämnar. */}
      {mottagareArk && ok && (
        <Ark rubrik="Mottagare" stang="Klar" onStang={() => { setMottagareArk(false); setNyMottagare(''); setFel(null); }}>
          <Sektion rubrik="Där ni lämnar" kort={false}>
            {ok.mottagare.map((m, i) => <Rad key={m.id} titel={m.namn} sista={i === ok.mottagare.length - 1} />)}
          </Sektion>
          <div style={{ marginTop: AVSTAND.l }}>
            <Falt etikett="Nytt ställe" value={nyMottagare} onChange={setNyMottagare} placeholder="T.ex. Stena i Växjö" />
            <button type="button" data-avfall-ny-mottagare disabled={sparar || !nyMottagare.trim()}
              onClick={async () => {
                setSparar(true); setFel(null);
                const e = await laggTillMottagare(supabase, nyMottagare);
                setSparar(false);
                if (e) { setFel(e); return; }
                setNyMottagare('');
                void hamta();
              }}
              style={{ ...KNAPP.sekundar, width: '100%', ...(sparar || !nyMottagare.trim() ? INAKTIV : {}) }}>Lägg till</button>
          </div>
          {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.l}px 0 0` }}>
            Spara mottagarens papper på att de tar emot ert farliga avfall. Det gäller som avtal.
          </p>
        </Ark>
      )}
    </div>
  );
}
