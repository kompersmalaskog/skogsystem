'use client';

// RITAD KARTA, steg 1 (Martin 2026-10-29: "som Apple-kartan och Snapchat"). En egen sida, /karta-ritad?objekt=<id>, bredvid planeringen —
// den rör inte planeringsvyn. Skogen ritas ur laserdatan (höjd → klass, mjuka kanter), träden som symboler, det skördaren fällt som avverkat,
// vatten/vägar/hus som platta vektorer. Flygfotot ett tryck bort. Laserdatans år står längst ner.
// Bara titta: inget sparas.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { lasVidaGrans } from '@/lib/egenkontrollOrigo';
import { hamtaStammoln } from '@/lib/egenkontroll';
import KartHuvud from '@/components/design/KartHuvud';
import { AVSTAND, FARG, LAYOUT, RADIE, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import type { Rutnat } from '@/lib/ritadKarta/skog';
import { byggRitat } from '@/lib/ritadKarta/bygg';
import { fpsOrd, matFps, type FpsMatt } from '@/lib/ritadKarta/fps';
import { BAKGRUND, HIMMEL, KLASS_FARG, KRONA_FARG_UTTRYCK, LJUS, LUTAD_PITCH, KLASS_NAMN, RELIEF_KALLA, RELIEF_PAINT, TERRANG_OVERDRIFT, TRAD_FARG, VEKTOR_KALLA, VEKTOR_LAGER, ritaGran } from '@/lib/ritadKarta/stil';

const MapLibreMap = dynamic(() => import('@/components/MapLibreMap'), { ssr: false });

const STIL = {
  version: 8 as const,
  sources: {
    vektor: VEKTOR_KALLA,
    relief: RELIEF_KALLA,
    flygfoto: { type: 'raster' as const, tiles: ['/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'], tileSize: 256, maxzoom: 18, attribution: '&copy; Lantmäteriet' },
  },
  layers: [{ id: 'rk-bakgrund', type: 'background' as const, paint: { 'background-color': BAKGRUND } }],
  sky: HIMMEL,
  light: LJUS,
};

type Lage = { typ: 'laser' } | { typ: 'fel'; text: string } | { typ: 'klar'; rn: Rutnat; stammar: number };

function RitadKarta() {
  const sp = useSearchParams();
  const objektId = sp.get('objekt');
  const visaFps = sp.get('fps') === '1';
  const [fps, setFps] = useState<FpsMatt>(null);
  const [karta, setKarta] = useState<any | null>(null);
  const [namn, setNamn] = useState('');
  const [ringar, setRingar] = useState<[number, number][][] | null>(null);
  const [lage, setLage] = useState<Lage>({ typ: 'laser' });
  const [stammar, setStammar] = useState<{ lat: number; lng: number }[]>([]);
  const [foto, setFoto] = useState(false);
  const [forklaring, setForklaring] = useState(false);
  // Lutad karta = skogen står upp i 3D och träden göms (en symbol kan inte stå i 3D-skogen). Platt = träden som symboler.
  const [lutad, setLutad] = useState(false);
  const flugit = useRef(false);

  // Objektet, traktgränsen och stammarna.
  useEffect(() => {
    if (!objektId) { setLage({ typ: 'fel', text: 'Inget objekt valt.' }); return; }
    let stopp = false;
    (async () => {
      const { data: o } = await supabase.from('objekt').select('namn, vo_nummer, typ').eq('id', objektId).maybeSingle();
      if (stopp) return;
      setNamn((o as any)?.namn ?? 'Trakten');
      const g = await lasVidaGrans(supabase as any, objektId);
      if (stopp) return;
      if (g.typ !== 'ok' || !g.ringar?.length) { setLage({ typ: 'fel', text: g.typ === 'fel' ? 'Kunde inte läsa traktgränsen.' : 'Trakten har ingen traktgräns från Vida.' }); return; }
      setRingar(g.ringar);
      // Bara en slutavverkning ritas som avverkad: i en gallring står skogen kvar (en stam i varje ruta skulle annars göra hela trakten till hygge).
      if ((o as any)?.typ !== 'slutavverkning') return;
      try { const s = await hamtaStammoln((o as any)?.vo_nummer); if (!stopp) setStammar(s.punkter); } catch { /* utan stammar: inget avverkat ritas */ }
    })();
    return () => { stopp = true; };
  }, [objektId]);

  // Laserdatan.
  const hamtaLaser = useCallback(async () => {
    if (!ringar) return;
    setLage({ typ: 'laser' });
    try {
      const r = await fetch('/api/ritad-karta/laser', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ringar }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLage({ typ: 'fel', text: j?.error || 'Kunde inte hämta laserdatan.' }); return; }
      setLage({ typ: 'klar', rn: j as Rutnat, stammar: 0 });
    } catch {
      setLage({ typ: 'fel', text: 'Kunde inte hämta laserdatan.' });
    }
  }, [ringar]);
  useEffect(() => { hamtaLaser(); }, [hamtaLaser]);

  const rn = lage.typ === 'klar' ? lage.rn : null;
  // Samma bygge som bakgrunden "Ritad" i planeringen och maskinen (lib/ritadKarta/bygg).
  const ritat = useMemo(() => (rn ? byggRitat(rn, stammar) : null), [rn, stammar]);

  // Lagren: skog (bild) under vatten och vägar, träd och traktgräns överst.
  useEffect(() => {
    if (!karta || !ritat || !ringar) return;
    const m = karta;
    const lagg = () => {
      for (const id of ['rk-trad', 'rk-grans', 'rk-grans-kant', 'rk-kronor', ...VEKTOR_LAGER.map((l) => l.id), 'rk-relief', 'rk-skog', 'rk-foto']) if (m.getLayer(id)) m.removeLayer(id);
      for (const id of ['rk-skog', 'rk-trad', 'rk-grans', 'rk-kronor']) if (m.getSource(id)) m.removeSource(id);
      for (const [k, f] of Object.entries(TRAD_FARG)) { const id = `rk-gran-${k}`; if (!m.hasImage(id)) { const im = ritaGran(f); if (im) m.addImage(id, im, { pixelRatio: 2 }); } }
      m.addSource('rk-skog', { type: 'image', url: ritat.url, coordinates: ritat.horn });
      m.addLayer({ id: 'rk-foto', type: 'raster', source: 'flygfoto', layout: { visibility: foto ? 'visible' : 'none' } });
      m.addLayer({ id: 'rk-skog', type: 'raster', source: 'rk-skog', paint: { 'raster-resampling': 'linear', 'raster-fade-duration': 0 }, layout: { visibility: foto ? 'none' : 'visible' } });
      // Terrängskuggningen ovanpå skogen: backar och sänkor syns som i Apple-kartan.
      m.addLayer({ id: 'rk-relief', type: 'hillshade', source: 'relief', paint: RELIEF_PAINT, layout: { visibility: foto ? 'none' : 'visible' } });
      for (const l of VEKTOR_LAGER) m.addLayer({ ...l, layout: { ...((l as any).layout ?? {}), visibility: foto ? 'none' : 'visible' } } as any);
      // Skogen i 3D: en krona per ruta i två våningar, dragen till rutans laserhöjd. Syns bara när kartan lutas (se effekten för lutningen).
      m.addSource('rk-kronor', { type: 'geojson', data: { type: 'FeatureCollection', features: ritat.kronor.map((y) => ({ type: 'Feature', properties: { k: y.klass, h: y.hojd, b: y.bas, t: y.ton }, geometry: { type: 'Polygon', coordinates: [y.ring] } })) } });
      m.addLayer({
        id: 'rk-kronor', type: 'fill-extrusion', source: 'rk-kronor',
        layout: { visibility: 'none' },
        paint: {
          'fill-extrusion-color': KRONA_FARG_UTTRYCK as any,
          'fill-extrusion-height': ['get', 'h'],
          'fill-extrusion-base': ['get', 'b'],
          'fill-extrusion-vertical-gradient': true,
        },
      });
      m.addSource('rk-grans', { type: 'geojson', data: { type: 'FeatureCollection', features: ringar.map((r) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r } })) } });
      m.addLayer({ id: 'rk-grans-kant', type: 'line', source: 'rk-grans', paint: { 'line-color': '#000', 'line-opacity': 0.6, 'line-width': 5 } });
      m.addLayer({ id: 'rk-grans', type: 'line', source: 'rk-grans', paint: { 'line-color': '#fff', 'line-width': 2, 'line-dasharray': [3, 2] } });
      m.addSource('rk-trad', { type: 'geojson', data: { type: 'FeatureCollection', features: ritat.trad.map((t) => ({ type: 'Feature', properties: { s: t.storlek, k: t.klass }, geometry: { type: 'Point', coordinates: [t.lng, t.lat] } })) } });
      m.addLayer({
        id: 'rk-trad', type: 'symbol', source: 'rk-trad', minzoom: 15,
        layout: {
          'icon-image': ['concat', 'rk-gran-', ['get', 'k']],
          'icon-size': ['interpolate', ['linear'], ['zoom'], 15, ['*', ['get', 's'], 0.45], 17, ['*', ['get', 's'], 0.95], 19, ['*', ['get', 's'], 1.7]],
          'icon-anchor': 'bottom', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 's']],
          visibility: foto ? 'none' : 'visible',
        },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.6, 1] },
      });
      if (!flugit.current) {
        flugit.current = true;
        const alla = ringar.flat();
        const lng = alla.map((p) => p[0]), lat = alla.map((p) => p[1]);
        m.fitBounds([[Math.min(...lng), Math.min(...lat)], [Math.max(...lng), Math.max(...lat)]], { padding: 80, duration: 0, maxZoom: 16.5 });
      }
    };
    if (m.isStyleLoaded()) lagg(); else m.once('load', lagg);
  }, [karta, ritat, ringar]); // foto styrs av egen effekt nedan

  // Flygfoto ett tryck bort: byter bara synlighet.
  useEffect(() => {
    if (!karta) return;
    const synlig = (id: string, pa: boolean) => { if (karta.getLayer(id)) karta.setLayoutProperty(id, 'visibility', pa ? 'visible' : 'none'); };
    synlig('rk-foto', foto);
    for (const id of ['rk-skog', 'rk-relief', ...VEKTOR_LAGER.map((l) => l.id)]) synlig(id, !foto);
    synlig('rk-trad', !foto && !lutad);
    synlig('rk-kronor', !foto && lutad);
  }, [karta, foto, ritat, lutad]);

  // Lutningen avgör läget: över LUTAD_PITCH står skogen upp och backarna överdrivs lite. Lutar man med två fingrar byter kartan själv.
  useEffect(() => {
    if (!karta) return;
    // Brantare än planeringens 60° så horisonten och himlen syns.
    karta.setMaxPitch?.(72);
    const kolla = () => setLutad(karta.getPitch() > LUTAD_PITCH);
    karta.on('pitch', kolla);
    kolla();
    return () => { karta.off('pitch', kolla); };
  }, [karta]);
  useEffect(() => {
    if (!karta) return;
    const t = karta.getTerrain?.();
    if (t?.source) karta.setTerrain({ source: t.source, exaggeration: lutad ? TERRANG_OVERDRIFT : 1 });
  }, [karta, lutad]);
  // Mätaren (?fps=1): kartans egna bilder, läst var halvsekund.
  useEffect(() => {
    if (!karta || !visaFps) return;
    const tider: number[] = [];
    const bild = () => { tider.push(performance.now()); if (tider.length > 240) tider.splice(0, tider.length - 240); };
    karta.on('render', bild);
    const t = setInterval(() => setFps(matFps(tider, performance.now())), 500);
    return () => { karta.off('render', bild); clearInterval(t); };
  }, [karta, visaFps]);

  const vaxla3d = () => { if (karta) karta.easeTo({ pitch: lutad ? 0 : 64, duration: 800 }); };

  const knapp = { ...TYP.listtitel, minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.knapp, border: 'none', background: FARG.kort, color: FARG.text, cursor: 'pointer', fontFamily: 'inherit' } as const;

  return (
    <div data-testid="ritad-karta" style={{ position: 'fixed', inset: 0, background: BAKGRUND }}>
      <MapLibreMap onMapReady={setKarta} onMapRemoved={() => setKarta(null)} initialCenter={[14.7, 56.5]} initialZoom={12} mapStyle={STIL as any} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: `calc(${LAYOUT.safeTopp} + ${AVSTAND.s}px)`, left: AVSTAND.m, right: AVSTAND.m }}>
        <KartHuvud flytande tillbakaHref={objektId ? `/planering?objekt=${objektId}` : '/planering'} tillbakaEtikett="Till planeringen" titel={namn || 'Ritad karta'}
          meta={rn?.ar ? `laser ${rn.ar}` : undefined} />
      </div>
      {lage.typ !== 'klar' && (
        <div style={{ position: 'absolute', left: AVSTAND.m, right: AVSTAND.m, top: '45%', textAlign: 'center' }}>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{lage.typ === 'laser' ? 'Ritar skogen …' : lage.text}</div>
          {lage.typ === 'fel' && ringar && <button type="button" onClick={hamtaLaser} style={{ ...knapp, marginTop: AVSTAND.m }}>Försök igen</button>}
        </div>
      )}
      {visaFps && (
        <div data-testid="ritad-fps" style={{ position: 'absolute', left: AVSTAND.m, top: `calc(${LAYOUT.safeTopp} + ${TRAFFYTA.primar + AVSTAND.l}px)`, background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.s, ...TYP.meta, color: FARG.text }}>
          {fpsOrd(fps)}{ritat ? ` · ${ritat.kronor.length.toLocaleString('sv-SE')} 3D-delar` : ''}
        </div>
      )}
      {forklaring && (
        <div data-testid="ritad-forklaring" style={{ position: 'absolute', left: AVSTAND.m, bottom: `calc(${medSafeBotten(AVSTAND.m)} + ${TRAFFYTA.primar + AVSTAND.s}px)`, background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.m, maxWidth: 300 }}>
          {(Object.keys(KLASS_NAMN) as (keyof typeof KLASS_NAMN)[]).map((k) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, minHeight: 28 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, background: `rgb(${KLASS_FARG[k].slice(0, 3).join(',')})`, flexShrink: 0 }} />
              <span style={{ ...TYP.meta, color: FARG.text }}>{KLASS_NAMN[k]}</span>
            </div>
          ))}
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{rn?.ar ? `Höjden är från laserskanningen ${rn.ar}. Det skördaren fällt är ritat som avverkat.` : 'Höjden är från laserskanningen.'}</div>
        </div>
      )}
      <div style={{ position: 'absolute', left: AVSTAND.m, right: AVSTAND.m, bottom: medSafeBotten(AVSTAND.m), display: 'flex', gap: AVSTAND.s, justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => setForklaring((v) => !v)} style={knapp} aria-pressed={forklaring}>Vad är vad</button>
        {!foto && <button type="button" data-testid="ritad-3d" onClick={vaxla3d} style={knapp} aria-pressed={lutad}>{lutad ? '2D' : '3D'}</button>}
        <button type="button" data-testid="ritad-foto" onClick={() => setFoto((v) => !v)} style={knapp} aria-pressed={foto}>{foto ? 'Ritad karta' : 'Flygfoto'}</button>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><RitadKarta /></Suspense>;
}
