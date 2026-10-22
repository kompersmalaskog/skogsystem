'use client';
// Kartan i "Var gallrades det?" — en riktig karta som går att zooma och panorera (nyp, dubbeltryck, scrollhjul).
// Lagren, underifrån: flygfotot (Lantmäteriet, samma rutor som planeringens karta, skarpa på alla zoomnivåer),
// ytorna i tre färger (rastret ur lib/gallradYta.ts lagt som en bild över kartans hörn), de avverkade stammarna
// (av från början), Vidas gräns vit streckad, och numren på bitarna. Ett tryck på ett nummer = samma som raden under.
//
// Rastret ligger i lokala meter och kartan i Web Mercator; över en trakt skiljer de sig under en promille, så bilden
// läggs rakt över rutans fyra hörn (samma antagande som markägarrapportens karta).
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { FARG, RADIE } from '@/lib/design/tokens';
import { tomKartaStil } from '@/lib/objektKarta';
import { RUTA, type GallradYta } from '@/lib/gallradYta';

const MapLibreMap = dynamic(() => import('@/components/MapLibreMap'), { ssr: false });

export const KARTA_HOJD_PX = 380;
/** Ytornas täckning ovanpå flygfotot: fotot ska synas igenom, färgen ändå läsas. */
const YTA_ALFA_PA_FOTO = 0.45;
const STAM_RADIE_PX = 2.5;
const NUMMER_RADIE_PX = 13;
const GRANS_BREDD_PX = 2;
const KANT_PX = 1;
/** Marginal runt rutan när kartan öppnas. */
const KANT_MARGINAL_PX = 24;
const STRECK = [3, 2];
const NUMMER_TEXT_PX = 14;

type Farg = { gallrat: string; annat: string; ejGallrat: string };

/** Rutnätets punkt (x österut, y söderut, i rutor) → [lng, lat] inom kartans hörn. */
export function rutaTillLngLat(yta: GallradYta, x: number, y: number): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = yta.karta.lnglat;
  return [minLng + (x / yta.karta.bredd) * (maxLng - minLng), maxLat - (y / yta.karta.hojd) * (maxLat - minLat)];
}

/** Första och andra gallring (lib/gallringDelar.ts): den gallrade marken färgas per del i stället för en färg. */
export type KartDelar = { rutor: Uint8Array; farg: [string, string] };

/** Ytorna som en bild (en pixel per ruta). Null utan canvas (jsdom). */
function ytorBild(yta: GallradYta, farg: Farg, delar?: KartDelar): string | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const ctx = c?.getContext?.('2d');
  if (!c || !ctx) return null;
  const { bredd, hojd, rutor } = yta.karta;
  c.width = bredd;
  c.height = hojd;
  const per: Record<number, string> = {
    [RUTA.gallrat]: farg.gallrat, [RUTA.utanforGallring]: farg.gallrat,
    [RUTA.utanforAnnat]: farg.annat, [RUTA.ejGallrat]: farg.ejGallrat,
  };
  for (let y = 0; y < hojd; y++) for (let x = 0; x < bredd; x++) {
    const del = delar ? delar.rutor[y * bredd + x] : 0;
    const f = del ? delar!.farg[del - 1] : per[rutor[y * bredd + x]];
    if (!f) continue;
    ctx.fillStyle = f;
    ctx.fillRect(x, y, 1, 1);
  }
  return c.toDataURL('image/png');
}

const synlig = (pa: boolean) => (pa ? 'visible' : 'none');

export default function GallradYtaKarta({ yta, farg, flygfoto, stammar, onBit, delar }: {
  yta: GallradYta; farg: Farg; flygfoto: boolean; stammar: boolean; onBit?: (nyckel: string) => void;
  /** Visa första och andra gallring. Då ritas inga bitnummer — kartan svarar på en fråga i taget. */
  delar?: KartDelar;
}) {
  const [karta, setKarta] = useState<any | null>(null);
  // Kartan kräver WebGL — utan det (jsdom, mycket gamla enheter) ritas bara ramen.
  const [kanRita, setKanRita] = useState(false);
  useEffect(() => { setKanRita(typeof window !== 'undefined' && 'WebGLRenderingContext' in window); }, []);
  const onBitRef = useRef(onBit);
  onBitRef.current = onBit;
  const stil = useMemo(() => tomKartaStil('satellite'), []);
  const [minLng, minLat, maxLng, maxLat] = yta.karta.lnglat;
  const mitt: [number, number] = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];

  // Lagren läggs en gång per karta och yta; en ny yta (efter ett svar) byter bara källornas data.
  useEffect(() => {
    if (!karta) return;
    const hörn: [[number, number], [number, number], [number, number], [number, number]] =
      [[minLng, maxLat], [maxLng, maxLat], [maxLng, minLat], [minLng, minLat]];
    const bild = ytorBild(yta, farg, delar);
    const gransFc = {
      type: 'FeatureCollection' as const,
      features: yta.karta.ringar.map((r) => ({
        type: 'Feature' as const, properties: {},
        geometry: { type: 'LineString' as const, coordinates: [...r, r[0]].map((p) => rutaTillLngLat(yta, p.x, p.y)) },
      })),
    };
    const stamFc = {
      type: 'FeatureCollection' as const,
      features: yta.karta.stammar.map((s) => ({
        type: 'Feature' as const, properties: { raknas: s.raknas },
        geometry: { type: 'Point' as const, coordinates: rutaTillLngLat(yta, s.x, s.y) },
      })),
    };
    const bitFc = {
      type: 'FeatureCollection' as const,
      features: (delar ? [] : [...yta.utanfor, ...yta.ejGallrat]).map((b) => ({
        type: 'Feature' as const, properties: { nyckel: b.nyckel, nr: String(b.nr) },
        geometry: { type: 'Point' as const, coordinates: rutaTillLngLat(yta, b.mitt.x, b.mitt.y) },
      })),
    };
    const satt = (id: string, data: any) => {
      const k = karta.getSource(id);
      if (k) k.setData(data); else karta.addSource(id, { type: 'geojson', data });
    };
    if (bild) {
      const k = karta.getSource('gy-ytor');
      if (k) k.updateImage({ url: bild, coordinates: hörn });
      else karta.addSource('gy-ytor', { type: 'image', url: bild, coordinates: hörn });
      if (!karta.getLayer('gy-ytor')) {
        karta.addLayer({ id: 'gy-ytor', type: 'raster', source: 'gy-ytor', paint: { 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } });
      }
    }
    satt('gy-stammar', stamFc);
    satt('gy-grans', gransFc);
    satt('gy-bitar', bitFc);
    if (!karta.getLayer('gy-stammar')) {
      karta.addLayer({
        id: 'gy-stammar', type: 'circle', source: 'gy-stammar',
        paint: {
          'circle-radius': STAM_RADIE_PX, 'circle-color': FARG.text,
          'circle-opacity': ['case', ['get', 'raknas'], 1, 0.5],
          'circle-stroke-color': FARG.bg, 'circle-stroke-width': KANT_PX,
        },
      });
      karta.addLayer({
        id: 'gy-grans', type: 'line', source: 'gy-grans',
        paint: { 'line-color': FARG.text, 'line-width': GRANS_BREDD_PX, 'line-dasharray': STRECK },
      });
      karta.addLayer({
        id: 'gy-bitar-cirkel', type: 'circle', source: 'gy-bitar',
        paint: { 'circle-radius': NUMMER_RADIE_PX, 'circle-color': FARG.bg, 'circle-stroke-color': FARG.text, 'circle-stroke-width': KANT_PX },
      });
      karta.addLayer({
        id: 'gy-bitar-nr', type: 'symbol', source: 'gy-bitar',
        layout: { 'text-field': ['get', 'nr'], 'text-size': NUMMER_TEXT_PX, 'text-allow-overlap': true, 'text-ignore-placement': true },
        paint: { 'text-color': FARG.text },
      });
      karta.on('click', 'gy-bitar-cirkel', (e: any) => {
        const n = e.features?.[0]?.properties?.nyckel;
        if (n) onBitRef.current?.(n);
      });
      karta.on('mouseenter', 'gy-bitar-cirkel', () => { karta.getCanvas().style.cursor = 'pointer'; });
      karta.on('mouseleave', 'gy-bitar-cirkel', () => { karta.getCanvas().style.cursor = ''; });
      karta.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: KANT_MARGINAL_PX, duration: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [karta, yta, delar]);

  // Lagren av och på, och ytornas täckning efter om fotot syns.
  useEffect(() => {
    if (!karta) return;
    if (karta.getLayer('satellite-layer')) karta.setLayoutProperty('satellite-layer', 'visibility', synlig(flygfoto));
    if (karta.getLayer('gy-stammar')) karta.setLayoutProperty('gy-stammar', 'visibility', synlig(stammar));
    if (karta.getLayer('gy-ytor')) karta.setPaintProperty('gy-ytor', 'raster-opacity', flygfoto ? YTA_ALFA_PA_FOTO : 1);
  }, [karta, flygfoto, stammar, yta]);

  return (
    <div data-gallrad-karta="" data-flygfoto={flygfoto ? 'ja' : 'nej'} data-stammar={stammar ? 'ja' : 'nej'}
      role="region" aria-label="Karta över den gallrade ytan. Nyp eller dubbeltryck för att zooma."
      style={{ position: 'relative', height: KARTA_HOJD_PX, borderRadius: RADIE.kort, overflow: 'hidden', background: FARG.upphojt }}>
      {kanRita && (
        <MapLibreMap onMapReady={setKarta} onMapRemoved={() => setKarta(null)}
          initialCenter={mitt} initialZoom={15} mapStyle={stil as any} style={{ position: 'absolute', inset: 0 }} />
      )}
    </div>
  );
}
