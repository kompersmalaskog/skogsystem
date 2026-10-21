'use client';
// Stammen som den ligger: stockarna rot → topp (bredd = längd, form-färg = stockens avvikelse), planområdena som skraffering och en tabell
// över dem. Samma innehåll som den gamla "Stam N"-modalen; räknandet bor i lib/kalibrering/kontroll.
import type { KontrollResponse } from '@/app/api/kalibrering/kontroll/route';
import Flikkontroll from '@/components/design/Flikkontroll';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { dec, fmtAvvikelse } from '@/lib/kalibrering/format';
import { findPlanomraden, planerPerStock, stamStockForm } from '@/lib/kalibrering/kontroll';
import { stockText } from '@/lib/kalibrering/text';
import { Meta } from './delar';
import { StockForm } from './diagram';

export default function StamArk({ data, stamNummer, onByt, onStock }: { data: KontrollResponse; stamNummer: number; onByt: (n: number) => void; onStock: (stockId: number) => void }) {
  const stamStockar = data.stockar.filter(st => st.stam_nummer === stamNummer).sort((a, b) => a.stock_nummer - b.stock_nummer);
  if (stamStockar.length === 0) return null;

  // Alla stam-nummer i kontrollen (för växlaren)
  const alleStammar = Array.from(new Set(data.stockar.map(st => st.stam_nummer))).sort((a, b) => a - b);
  const sortimentSet = new Set(stamStockar.map(st => st.sortiment_namn).filter((x): x is string => !!x));
  const sortimentText = Array.from(sortimentSet).join(' · ') || '–';
  const totalM = dec(stamStockar.reduce((a, st) => a + (st.maskin_langd_cm ?? 0), 0) / 100, 1);

  // Skala för stock-storlek — relativ inom stammen så förhållandena syns utan absoluta px-värden som tappar sig i extrema fall.
  const maxLangd = Math.max(...stamStockar.map(st => st.maskin_langd_cm ?? 0), 1);
  const maxDia = Math.max(...stamStockar.map(st => st.maskin_toppdia_mm ?? 0), 1);

  // Stamhållning — planområden i den täta diameterprofilen. Profil finns bara för kontrollstammar; sektionen göms när den saknas.
  const stamData = data.stammar.find(st => st.stam_nummer === stamNummer);
  const planer = findPlanomraden(stamData?.stem_diameter_profile ?? []);
  const perStock = planerPerStock(planer, stamStockar);

  return (
    <>
      <Meta>{`${stockText(stamStockar.length)} · ${sortimentText} · ${totalM} m`}</Meta>

      {alleStammar.length > 1 && (
        <div style={{ overflowX: 'auto', margin: `${AVSTAND.l}px 0` }}>
          <Flikkontroll flikar={alleStammar.map(n => [String(n), `Stam ${n}`] as const)} aktiv={String(stamNummer)} onVal={v => { if (Number(v) !== stamNummer) onByt(Number(v)); }} />
        </div>
      )}

      {planer.length > 0 && (
        <Meta style={{ padding: AVSTAND.m, background: FARG.tonad, borderRadius: RADIE.rad, margin: `${AVSTAND.l}px 0` }}>
          Stockens färg = hur mycket den drar. Streckade fält = där mätorganen tappar kontakt och diametern fastnar.
        </Meta>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l, padding: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>
        {stamStockar.map((st, idx) => {
          const f = stamStockForm(st);
          // Äkta proportioner: bredd = längd relativt längsta stocken (längsta = 100 %). Hela raden är tryckyta.
          const breddPct = ((st.maskin_langd_cm ?? maxLangd) / maxLangd) * 100;
          const hojdPx = 16 + ((st.maskin_toppdia_mm ?? maxDia) / maxDia) * 18;
          const lenM = st.maskin_langd_cm != null ? dec(st.maskin_langd_cm / 100, 1) : '–';
          const avvikText = f.hasAvvikData ? `${fmtAvvikelse(f.sDia, 'mm')} mm` : 'mätning saknas';
          return (
            <button key={st.id} type="button" onClick={() => onStock(st.id)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', color: FARG.text, width: '100%' }}>
              <StockForm ton={f.ton} breddPct={breddPct} hojdPx={hojdPx} segment={perStock[idx] ?? []} stockLangdCm={st.maskin_langd_cm ?? 0} />
              <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.s, textAlign: 'center' }}>
                Stock {st.stock_nummer} · {st.sortiment_namn ?? '–'} · {lenM} m · {avvikText}
              </div>
            </button>
          );
        })}
      </div>

      {planer.length > 0 && (
        <div style={{ marginTop: AVSTAND.l }}>
          <Sektion rubrik="Planområden" kort={false}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: `${AVSTAND.s}px ${AVSTAND.l}px`, ...TYP.meta, ...TNUM }}>
              <span style={{ ...TYP.micro, color: FARG.text2 }}>Läge på stammen</span>
              <span style={{ ...TYP.micro, color: FARG.text2, textAlign: 'right' }}>Längd</span>
              <span style={{ ...TYP.micro, color: FARG.text2, textAlign: 'right' }}>Diameter</span>
              {planer.map((p, idx) => [
                <span key={`p${idx}`} style={{ color: FARG.text }}>{dec(p.startCm / 100, 1)} – {dec(p.endCm / 100, 1)} m</span>,
                <span key={`l${idx}`} style={{ color: FARG.text2, textAlign: 'right' }}>{p.lengthCm} cm</span>,
                <span key={`d${idx}`} style={{ color: FARG.text2, textAlign: 'right' }}>{p.diameterMm} mm</span>,
              ])}
            </div>
          </Sektion>
        </div>
      )}
    </>
  );
}
