'use client';

// SKOTARLÄNKEN (/skotare/<token>) — för en EXTERN skotare som skotar efter vår skördare. Ingen inloggning: länken bär en lång slumpad token.
// Byggd för maskindatorn: Chrome på Windows, stor pekskärm, helskärm, installerbar som app. Bara läsning.
//
// EN skärm: kartan. Överst till vänster svaret — hur mycket som ligger kvar att skota (m³fub, per trädslag). Till höger tre runda knappar:
// helskärm, "Vad betyder kartan" och lagren. Tryck på en symbol, yta, linje eller hög → ett ark med vad det är, vad det betyder, vad planeraren
// skrivit och fotot. Datan läses om var 5:e minut (skördaren kör vidare).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ikon from '@/components/design/Ikon';
import Ark from '@/components/design/Ark';
import Flikkontroll from '@/components/design/Flikkontroll';
import VadBetyderKartan from '@/components/planering/VadBetyderKartan';
import { BASKARTOR } from '@/lib/mapLayers';
import { BACKVAG_STRECK_FARGER } from '@/lib/backvag';
import { backvagIkonNamn, PIL_STIL, ritaBackvagStreck, ritaPilIkon, ritaStolpeIkon } from '@/lib/kartstil';
import { canvasToMapLibreImage, loadMarkerImageForMaplibre, markerIconDefs } from '@/lib/marker-icons';
import { SNEDSTRECK_GRUPPER, snedstreckBild, snedstreckId } from '@/lib/ytaStil';
import { vidaSlagIFeatures } from '@/lib/teckenforklaring';
import { ALLA_PA, KALLA, LAGER, finns as finnsLager, kallor, lagerIdn, lagerOrdning, markeringKort, vidaKort, type Data, type Lager, type LngLat, type TryckKort } from '@/lib/skotarlank/karta';
import type { HogTradslag, SkotarHog } from '@/lib/skotarlank/hogar';
import { hallSkarmenVakenIWebblasare } from '@/lib/skarmVaken';

type Vy = Data & {
  ok: true;
  namn: string;
  mitt: { lat: number; lng: number } | null;
  hogar: { hogar: SkotarHog[]; kvar: HogTradslag[]; kvarM3: number; skordatM3: number } | null;
  origoText: string | null;
  kommentarer: Record<string, string[]>;
  fel: string[];
  uppdaterad: string;
};
type Lage = { typ: 'laddar' } | { typ: 'fel'; status: number; text: string } | { typ: 'ok'; vy: Vy };

const OMLASNING_MS = 5 * 60_000;
const LAGRING_LAGER = 'skotarlank_lager_v1';
const LAGRING_BAS = 'skotarlank_bas_v1';
/** Knapparna på kartan: större än appens minsta, för en pekskärm i en skakande hytt. */
const KNAPP_PX = 60;
const KART_BAKGRUND = '#1b2a17';
/** Så nära (px) fingret måste vara en hög för att den ska räknas som tryckt. */
const HOG_TRAFF_PX = 16;

const tal = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 1 });
const klocka = (iso: string) => new Date(iso).toLocaleTimeString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit' });

function las<T>(nyckel: string, standard: T): T {
  try { const v = JSON.parse(localStorage.getItem(nyckel) || 'null'); return v == null ? standard : (typeof standard === 'object' ? { ...standard, ...v } : v); } catch { return standard; }
}
function spara(nyckel: string, v: unknown) { try { localStorage.setItem(nyckel, JSON.stringify(v)); } catch { /* bara bekvämlighet */ } }

/** Felet i ord: vad skotaren ska göra. */
function felText(status: number): string {
  if (status === 404) return 'Länken finns inte. Be den som skickade den om en ny.';
  if (status === 410) return 'Länken gäller inte längre — trakten är klar eller länken är avstängd. Ring den som skickade den.';
  return 'Kartan går inte att hämta just nu. Kontrollera täckningen — sidan försöker igen av sig själv.';
}

type BasId = 'foto' | 'karta';
function kartStil(token: string, bas: BasId): maplibregl.StyleSpecification {
  const foto = BASKARTOR.find((b) => b.id === 'satellite');
  const karta = BASKARTOR.find((b) => b.id === 'lantmateriet');
  const kalla = (lager: BasId) => ({ type: 'raster' as const, tiles: [`${location.origin}/api/skotare/${token}/karta?lager=${lager}&z={z}&x={x}&y={y}`], tileSize: 256, maxzoom: 18, attribution: '© Lantmäteriet' });
  return {
    version: 8,
    sources: { foto: kalla('foto'), karta: kalla('karta') },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': KART_BAKGRUND } },
      { id: 'bas-foto', type: 'raster', source: 'foto', paint: (foto?.paint ?? {}) as never, layout: { visibility: bas === 'foto' ? 'visible' : 'none' } },
      { id: 'bas-karta', type: 'raster', source: 'karta', paint: (karta?.paint ?? {}) as never, layout: { visibility: bas === 'karta' ? 'visible' : 'none' } },
    ],
  };
}

async function laggTillBilder(map: maplibregl.Map): Promise<void> {
  const laddar: Promise<void>[] = [];
  const lagg = (namn: string, b: unknown) => { try { if (b && !map.hasImage(namn)) map.addImage(namn, b as never); } catch { /* en ikon som saknas fäller inte kartan */ } };
  for (const def of markerIconDefs) {
    const namn = `marker-${def.id}`;
    if (!map.hasImage(namn)) laddar.push(loadMarkerImageForMaplibre(def.id).then((b) => lagg(namn, b)).catch(() => undefined));
  }
  for (const pil of PIL_STIL) lagg(`arrow-${pil.id}`, canvasToMapLibreImage(ritaPilIkon(pil.color)));
  for (const f of BACKVAG_STRECK_FARGER) lagg(backvagIkonNamn(f), canvasToMapLibreImage(ritaBackvagStreck(f)));
  for (const g of SNEDSTRECK_GRUPPER) lagg(snedstreckId(g), snedstreckBild(g));
  lagg('kraftledning-stolpe', canvasToMapLibreImage(ritaStolpeIkon()));
  await Promise.all(laddar);
}

export default function SkotarSida({ token }: { token: string }) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });
  const [lager, setLager] = useState<Record<Lager, boolean>>(ALLA_PA);
  const [bas, setBas] = useState<BasId>('foto');
  const [lagerOppen, setLagerOppen] = useState(false);
  const [forklaringOppen, setForklaringOppen] = useState(false);
  const [kort, setKort] = useState<TryckKort | null>(null);
  const [helskarm, setHelskarm] = useState(false);
  const [installera, setInstallera] = useState<{ prompt: () => Promise<void> } | null>(null);

  const behallare = useRef<HTMLDivElement>(null);
  const kartaRef = useRef<maplibregl.Map | null>(null);
  const [kartaKlar, setKartaKlar] = useState(false);
  const kameraSatt = useRef(false);
  const vyRef = useRef<Vy | null>(null);
  vyRef.current = lage.typ === 'ok' ? lage.vy : vyRef.current;

  // Valen minns per dator.
  useEffect(() => { setLager(las(LAGRING_LAGER, ALLA_PA)); setBas(las<BasId>(LAGRING_BAS, 'foto') === 'karta' ? 'karta' : 'foto'); }, []);

  // --- Datan: nu, och var 5:e minut. Ett läsfel efter att kartan visats tar inte bort kartan.
  const hamta = useCallback(async () => {
    try {
      const r = await fetch(`/api/skotare/${token}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) { setLage({ typ: 'ok', vy: j as Vy }); return; }
      setLage((f) => (f.typ === 'ok' && r.status >= 500 ? f : { typ: 'fel', status: r.status, text: felText(r.status) }));
    } catch {
      setLage((f) => (f.typ === 'ok' ? f : { typ: 'fel', status: 0, text: felText(0) }));
    }
  }, [token]);
  useEffect(() => {
    void hamta();
    const t = setInterval(() => { void hamta(); }, OMLASNING_MS);
    const synlig = () => { if (document.visibilityState === 'visible') void hamta(); };
    document.addEventListener('visibilitychange', synlig);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', synlig); };
  }, [hamta]);

  // Skärmen släcks inte medan kartan är framme (maskindatorn).
  useEffect(() => hallSkarmenVakenIWebblasare(), []);

  // Helskärm och installation.
  useEffect(() => {
    const kolla = () => setHelskarm(!!document.fullscreenElement || window.matchMedia('(display-mode: fullscreen)').matches);
    kolla();
    document.addEventListener('fullscreenchange', kolla);
    const fore = (e: Event) => { e.preventDefault(); const ev = e as Event & { prompt: () => Promise<void> }; setInstallera({ prompt: () => ev.prompt() }); };
    const installerad = () => setInstallera(null);
    window.addEventListener('beforeinstallprompt', fore);
    window.addEventListener('appinstalled', installerad);
    return () => { document.removeEventListener('fullscreenchange', kolla); window.removeEventListener('beforeinstallprompt', fore); window.removeEventListener('appinstalled', installerad); };
  }, []);
  const vaxlaHelskarm = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  // --- Kartan skapas en gång (när datan finns första gången).
  const harData = lage.typ === 'ok';
  useEffect(() => {
    if (!harData || !behallare.current || kartaRef.current) return;
    const v = vyRef.current;
    const start = v?.mitt ?? { lat: 56.6, lng: 15.0 };
    const map = new maplibregl.Map({
      container: behallare.current, style: kartStil(token, las<BasId>(LAGRING_BAS, 'foto') === 'karta' ? 'karta' : 'foto'),
      center: [start.lng, start.lat], zoom: 14, maxPitch: 0, dragRotate: false, attributionControl: { compact: true },
    });
    try { map.touchZoomRotate.disableRotation(); } catch { /* */ }
    kartaRef.current = map;
    // 'load' kan utebli tills kartan ritas om (sett i Chromium utan synlig ändring) — vi väcker den några gånger. Görs EN gång.
    let gjort = false;
    const klarGor = async () => { if (gjort) return; gjort = true; await laggTillBilder(map); setKartaKlar(true); };
    map.on('load', () => { void klarGor(); });
    let vack = 0;
    const vackare = setInterval(() => { if (gjort || ++vack > 25) { clearInterval(vackare); return; } if (map.loaded()) void klarGor(); else map.triggerRepaint(); }, 400);
    map.on('click', (e) => {
      const vy = vyRef.current;
      if (!vy) return;
      // Det under fingret (26 px åt varje håll): symbol före hög före linje före yta.
      const r = 26;
      const traffar = map.queryRenderedFeatures([[e.point.x - r, e.point.y - r], [e.point.x + r, e.point.y + r]])
        .filter((f) => f.source === KALLA.mark || f.source === KALLA.vida || f.source === KALLA.hogar)
        // En hög träffas bara när fingret är PÅ den (högarna ligger tätt; annars går det aldrig att trycka på ytan under dem).
        .filter((f) => {
          if (f.source !== KALLA.hogar || f.geometry.type !== 'Point') return true;
          const q = map.project(f.geometry.coordinates as [number, number]);
          return Math.hypot(q.x - e.point.x, q.y - e.point.y) <= HOG_TRAFF_PX;
        });
      const rang = (f: maplibregl.MapGeoJSONFeature) => {
        const p = f.properties ?? {};
        if (f.source === KALLA.mark) return p.kind === 'symbol' || p.kind === 'pil' ? 0 : p.kind === 'linje' ? 2 : 3;
        if (f.source === KALLA.hogar) return 1;
        return f.geometry.type === 'Point' ? 0 : f.geometry.type.includes('Line') ? 2 : 3;
      };
      traffar.sort((a, b) => rang(a) - rang(b));
      const f = traffar[0];
      if (!f) return;
      const p = f.properties ?? {};
      if (f.source === KALLA.mark && typeof p.i === 'number' && vy.markeringar[p.i]) setKort(markeringKort(vy.markeringar[p.i], vy.kommentarer));
      else if (f.source === KALLA.hogar && typeof p.hi === 'number' && vy.hogar?.hogar[p.hi]) setKort({ typ: 'hog', hog: vy.hogar.hogar[p.hi] });
      else if (f.source === KALLA.vida && typeof p.vi === 'number' && vy.vida[p.vi]) setKort(vidaKort(vy.vida[p.vi].properties));
    });
    return () => { clearInterval(vackare); try { map.remove(); } catch { /* */ } kartaRef.current = null; setKartaKlar(false); };
  }, [harData, token]);

  // Bakgrunden: bara synligheten byts (inga lager behöver läggas om).
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar) return;
    map.setLayoutProperty('bas-foto', 'visibility', bas === 'foto' ? 'visible' : 'none');
    map.setLayoutProperty('bas-karta', 'visibility', bas === 'karta' ? 'visible' : 'none');
  }, [bas, kartaKlar]);

  // --- Källor och lager.
  const vy = lage.typ === 'ok' ? lage.vy : null;
  const k = useMemo(() => (vy ? kallor(vy) : null), [vy]);
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar || !k) return;
    for (const [id, data] of Object.entries(k)) {
      const s = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (s) s.setData(data as never); else map.addSource(id, { type: 'geojson', data: data as never });
    }
    for (const spec of lagerOrdning()) {
      if (map.getLayer(spec.id)) continue;
      try { map.addLayer(spec); } catch (e) { console.error('[skotarkarta] lagret kunde inte läggas till', spec.id, e); }
    }
  }, [k, kartaKlar]);

  // Synligheten följer valen.
  useEffect(() => {
    const map = kartaRef.current;
    if (!map || !kartaKlar || !k) return;
    for (const [val, idn] of Object.entries(lagerIdn()) as [Lager, string[]][]) {
      for (const id of idn) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', lager[val] ? 'visible' : 'none');
    }
  }, [lager, kartaKlar, k]);

  // Kameran: en gång — trakten, spåren och högarna i bild.
  const visaHela = useCallback((animera: boolean) => {
    const map = kartaRef.current;
    const v = vyRef.current;
    if (!map || !v) return;
    const b = new maplibregl.LngLatBounds();
    let n = 0;
    const med = (p: LngLat) => { b.extend(p); n++; };
    v.gran.flat().forEach(med);
    if (n === 0) { v.spar.flat().forEach(med); (v.hogar?.hogar ?? []).forEach((h) => med([h.lng, h.lat])); }
    if (n === 0) { if (v.mitt) map.jumpTo({ center: [v.mitt.lng, v.mitt.lat], zoom: 15 }); return; }
    map.fitBounds(b, { padding: { top: 200, bottom: AVSTAND.xxl, left: AVSTAND.xxl, right: KNAPP_PX + AVSTAND.xxl * 2 }, maxZoom: 17, duration: animera ? 500 : 0 });
  }, []);
  useEffect(() => { if (kartaKlar && k && !kameraSatt.current) { kameraSatt.current = true; visaHela(false); } }, [kartaKlar, k, visaHela]);

  const sattLager = (id: Lager) => setLager((l) => { const ny = { ...l, [id]: !l[id] }; spara(LAGRING_LAGER, ny); return ny; });
  const sattBas = (b: BasId) => { setBas(b); spara(LAGRING_BAS, b); };

  // ---------------------------------------------------------------------------------------------------------------------------------------------
  if (lage.typ !== 'ok') {
    return (
      <main style={{ position: 'fixed', inset: 0, background: FARG.bg, color: FARG.text, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: AVSTAND.xl, fontFamily: 'Inter, -apple-system, system-ui, sans-serif' }}>
        <div style={{ maxWidth: 520, textAlign: 'center' }} data-skotar-lage={lage.typ}>
          {lage.typ === 'laddar'
            ? <p style={{ ...TYP.rubrik, color: FARG.text2 }}>Hämtar kartan över trakten …</p>
            : <>
              <p style={{ ...TYP.rubrik, margin: `0 0 ${AVSTAND.l}px` }}>{lage.text}</p>
              {lage.status !== 404 && lage.status !== 410 && <button type="button" onClick={() => void hamta()} style={{ ...KNAPP.sekundar, minHeight: KNAPP_PX, padding: `0 ${AVSTAND.xl}px` }}>Försök igen</button>}
            </>}
        </div>
      </main>
    );
  }

  const v = lage.vy;
  const finns = k ? finnsLager(v, k) : ALLA_PA;
  const saknas: Record<Lager, string> = {
    spar: 'Skördaren har inget spår här än', hogar: 'Inga högar med position', vagar: v.origoText ? 'Kan inte placeras på kartan' : 'Inga vägar utsatta',
    kraftledning: 'Ingen kraftledning på trakten', symboler: v.origoText ? 'Kan inte placeras på kartan' : 'Inget utsatt', grans: 'Ingen traktgräns',
  };
  const kvar = v.hogar;

  return (
    <main style={{ position: 'fixed', inset: 0, background: FARG.bg, color: FARG.text, fontFamily: 'Inter, -apple-system, system-ui, sans-serif', overflow: 'hidden', touchAction: 'none' }}>
      <div ref={behallare} style={{ position: 'absolute', inset: 0 }} data-skotar-karta="" data-klar={kartaKlar ? '' : undefined} />

      {/* SVARET överst till vänster: hur mycket som ligger kvar att skota. */}
      <section aria-label="Kvar att skota" data-skotar-kvar="" style={{ position: 'absolute', top: AVSTAND.l, left: AVSTAND.l, maxWidth: 'min(460px, calc(100vw - 120px))', padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.sheet, background: 'rgba(28,28,30,0.92)', boxShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>
        <div style={{ ...TYP.listtitel, color: FARG.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.namn}</div>
        {kvar && kvar.kvarM3 > 0 ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, marginTop: AVSTAND.xs }}>
              <span style={{ ...TYP.tal, fontSize: 40 }} data-skotar-kvar-m3="">{tal(kvar.kvarM3)}</span>
              <span style={{ ...TYP.text }}>m³fub kvar att skota</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, marginTop: AVSTAND.s, ...TYP.text, ...TNUM }}>
              {kvar.kvar.map((t) => (
                <span key={t.namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
                  <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: RADIE.cirkel, background: t.farg, boxShadow: '0 0 0 1.5px rgba(255,255,255,0.7)' }} />{t.namn} {tal(t.m3)}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div style={{ ...TYP.text, marginTop: AVSTAND.xs }}>{kvar ? 'Allt skördat är skotat' : 'Inga högar att visa än'}</div>
        )}
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s }}>
          Prickarna är högarna — tryck på en för att se vad som ligger där. Uppdaterad {klocka(v.uppdaterad)}.
        </div>
        {(v.fel.length > 0 || v.origoText) && (
          <div role="status" style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.xs }}>
            {v.fel.length > 0 ? `Kunde inte läsa ${v.fel.join(', ')}. ` : ''}{v.origoText ?? ''}
          </div>
        )}
      </section>

      {/* Knapparna till höger: helskärm, vad betyder kartan, lager. Längst ner: hela trakten. */}
      <div style={{ position: 'absolute', top: AVSTAND.l, right: AVSTAND.l, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        <RundKnapp ikon={helskarm ? 'fullscreen_exit' : 'fullscreen'} text={helskarm ? 'Lämna helskärm' : 'Helskärm'} onClick={vaxlaHelskarm} attr="helskarm" />
        <RundKnapp ikon="help" text="Vad betyder kartan" onClick={() => setForklaringOppen(true)} attr="forklaring" />
        <RundKnapp ikon="layers" text="Lager" onClick={() => setLagerOppen(true)} attr="lager" />
      </div>
      <div style={{ position: 'absolute', bottom: AVSTAND.xxl, right: AVSTAND.l }}>
        <RundKnapp ikon="crop_free" text="Visa hela trakten" onClick={() => visaHela(true)} attr="hela" />
      </div>

      {kort && <KortArk kort={kort} token={token} onStang={() => setKort(null)} />}

      {lagerOppen && (
        <Ark rubrik="Visa på kartan" stang="Klar" onStang={() => setLagerOppen(false)}>
          <div style={{ marginBottom: AVSTAND.l }}>
            <Flikkontroll flikar={[['foto', 'Flygfoto'], ['karta', 'Karta']] as const} aktiv={bas} onVal={(b) => sattBas(b)} />
          </div>
          {LAGER.map((l, i) => (
            <Brytare key={l.id} id={l.id} namn={l.namn} pa={lager[l.id] && finns[l.id]} kan={finns[l.id]} under={finns[l.id] ? undefined : saknas[l.id]}
              sista={i === LAGER.length - 1 && !installera} onVaxla={() => sattLager(l.id)} />
          ))}
          {installera && (
            <button type="button" data-skotar-installera="" onClick={() => { void installera.prompt().finally(() => setInstallera(null)); }}
              style={{ ...KNAPP.sekundar, width: '100%', minHeight: KNAPP_PX, marginTop: AVSTAND.l, gap: AVSTAND.s }}>
              <Ikon namn="install_desktop" farg="inherit" />Lägg kartan som app på datorn
            </button>
          )}
        </Ark>
      )}

      {forklaringOppen && (
        <div role="dialog" aria-modal="true" aria-label="Vad betyder kartan" style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'flex-end' }} onClick={() => setForklaringOppen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(560px, 100vw)', height: '100%', background: FARG.bg, display: 'flex', flexDirection: 'column', paddingTop: AVSTAND.m }}>
            <VadBetyderKartan objektNamn="Kartan" roll="skotare"
              markeringar={v.markeringar as never} vida={vidaSlagIFeatures(v.vida)}
              onTillbaka={() => setForklaringOppen(false)} onStang={() => setForklaringOppen(false)} />
          </div>
        </div>
      )}
    </main>
  );
}

/** Arket för ett tryck: en markering/Vida-objekt, eller en hög. Bara läsning. */
function KortArk({ kort, token, onStang }: { kort: TryckKort; token: string; onStang: () => void }) {
  if (kort.typ === 'hog') {
    const h = kort.hog;
    return (
      <Ark rubrik="Högen" stang="Klar" onStang={onStang}>
        <div data-skotar-hog="">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
            <span style={{ ...TYP.tal }}>{tal(h.m3)}</span><span style={{ ...TYP.text }}>m³fub ligger kvar här</span>
          </div>
          <div style={{ marginTop: AVSTAND.m }}>
            {h.tradslag.map((t, i) => (
              <div key={t.namn} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.primar, borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, ...TYP.text, ...TNUM }}>
                <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: RADIE.cirkel, background: t.farg, flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{t.namn}</span><span>{tal(t.m3)} m³fub</span>
              </div>
            ))}
          </div>
          <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Det skördaren lade här, minus det som redan skotats. Ungefär — högen kan ligga några meter fel.</p>
        </div>
      </Ark>
    );
  }
  return (
    <Ark rubrik={kort.namn} stang="Klar" onStang={onStang}>
      <div data-skotar-markering="" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
        {kort.forklaring && <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>{kort.forklaring}</p>}
        {kort.kommentarer.map((t, i) => (
          <p key={i} style={{ margin: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, ...TYP.text, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{t}</p>
        ))}
        {kort.fotoId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/skotare/${token}/foto?id=${encodeURIComponent(kort.fotoId)}`} alt={kort.namn} style={{ width: '100%', maxHeight: '60vh', objectFit: 'contain', borderRadius: RADIE.kort, display: 'block', background: FARG.kort }} />
        )}
        {kort.kommentarer.length === 0 && !kort.fotoId && <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>Inget skrivet och inget foto.</p>}
      </div>
    </Ark>
  );
}

function RundKnapp({ ikon, text, onClick, attr }: { ikon: string; text: string; onClick: () => void; attr: string }) {
  return (
    <button type="button" onClick={onClick} data-kartknapp={attr} aria-label={text} title={text}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: KNAPP_PX, height: KNAPP_PX, padding: 0, overflow: 'hidden', borderRadius: RADIE.cirkel, border: `1px solid ${FARG.linje}`, background: FARG.kort, color: FARG.text, cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)', touchAction: 'manipulation' }}>
      <Ikon namn={ikon} farg="inherit" storlek={30} />
    </button>
  );
}

/** En rad med en brytare (på/av). En sak som inte finns går inte att slå på, och raden säger varför. */
function Brytare({ namn, pa, kan, under, sista, onVaxla, id }: { namn: string; pa: boolean; kan: boolean; under?: string; sista: boolean; onVaxla: () => void; id: string }) {
  return (
    <button type="button" role="switch" aria-checked={pa} disabled={!kan} onClick={onVaxla} data-lager={id}
      style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: KNAPP_PX, padding: `${AVSTAND.s}px 0`, background: 'none', border: 'none', borderBottom: sista ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, font: 'inherit', textAlign: 'left', cursor: kan ? 'pointer' : 'default', touchAction: 'manipulation' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.listtitel, color: kan ? FARG.text : FARG.text2 }}>{namn}</span>
        {under && <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{under}</span>}
      </span>
      <span aria-hidden="true" style={{ width: 51, height: 31, borderRadius: 16, padding: 2, boxSizing: 'border-box', flexShrink: 0, background: pa ? FARG.gron : FARG.upphojt, opacity: kan ? 1 : 0.4, display: 'flex', justifyContent: pa ? 'flex-end' : 'flex-start' }}>
        <span style={{ width: 27, height: 27, borderRadius: '50%', background: '#fff' }} />
      </span>
    </button>
  );
}
