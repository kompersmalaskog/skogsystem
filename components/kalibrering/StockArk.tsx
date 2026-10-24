'use client';
// En stock ur en kontroll: längd, diameter (lollipop över mätpunkterna), mätpunkterna och volymen. Volymen (maskin mot operatör) låg förr i
// Senaste-stockarket, som gått upp i det här; räknandet bor i lib/kalibrering/kontroll.
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, RADIE, TYP } from '@/lib/design/tokens';
import { avvikelseTon } from '@/lib/kalibrering/bedomning';
import { dec, fmtAvvikelse } from '@/lib/kalibrering/format';
import { stockDetalj } from '@/lib/kalibrering/kontroll';
import { Info, Meta, Status, TonVarde } from './delar';
import { Lollipop } from './diagram';

const DIAG_TON = { ok: 'ok', warn: 'hi', bad: 'hot' } as const;

export function StockArk({ stock, tolLen }: { stock: StockRow; tolLen: number }) {
  const d = stockDetalj(stock, tolLen);
  const lenM = stock.maskin_langd_cm != null ? `${dec(stock.maskin_langd_cm / 100, 1)} m` : '–';
  const mpText = stock.matpunkter.length === 1 ? '1 mätpunkt' : `${stock.matpunkter.length} mätpunkter`;
  const diaTon = !d.diaKlavad ? 'ok' : d.diagnos?.tone === 'bad' ? 'hot' : d.diagnos?.tone === 'warn' ? 'hi' : 'ok';
  // Operatörsvolym kräver att operatören klavat BÅDE längd och diameter. Utan det kan volymen (och diffen) inte finnas.
  const volKlavad = d.lenKlavad && d.diaKlavad && stock.operator_volym_sub != null;

  return (
    <>
      <Meta>{`${stock.sortiment_namn ?? '–'} · ${lenM} · ${mpText}`}</Meta>
      {stock.stock_nummer === 1 && <div style={{ ...TYP.micro, color: FARG.text2, textAlign: 'right', marginTop: AVSTAND.s }}>Rotstock</div>}

      <div style={{ marginTop: AVSTAND.l }}>
        <Sektion rubrik="Längd" kort={false}>
          <div style={{ ...TYP.tal }}>
            <TonVarde ton={d.lenKlavad && d.sLenBad ? 'hot' : 'ok'}>{d.lenKlavad ? `${fmtAvvikelse(d.sLen, 'cm')} cm` : 'Ej klavad'}</TonVarde>
          </div>
          <Meta style={{ marginTop: AVSTAND.s }}>
            Maskin {stock.maskin_langd_cm ?? '–'} cm · {d.lenKlavad ? `Operatör ${stock.operator_langd_cm} cm` : 'ej klavad av operatör'}
          </Meta>
        </Sektion>

        <Sektion rubrik="Diameter" kort={false}>
          <div style={{ ...TYP.rubrik }}>
            <TonVarde ton={diaTon}>
              {!d.diaKlavad ? 'Ej klavad'
                : d.hasMp && d.maxAvvikPos !== null ? `störst fel: ${fmtAvvikelse(d.maxAvvik, 'mm')} mm vid ${d.maxAvvikPos} cm`
                : `${fmtAvvikelse(d.maxAvvik, 'mm')} mm`}
            </TonVarde>
          </div>
          {d.hasMp ? (
            <>
              <Lollipop punkter={d.mpAvvik} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: AVSTAND.s, padding: `0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
                <span>{d.minPos} cm</span><span>{d.maxPos} cm</span>
              </div>
              {d.diagnos && (
                <div style={{ marginTop: AVSTAND.m, padding: AVSTAND.m, background: FARG.tonad, borderRadius: RADIE.rad, ...TYP.meta, color: FARG.text }}>
                  <Status ton={DIAG_TON[d.diagnos.tone]} ord={d.diagnos.text} ljus />
                </div>
              )}
            </>
          ) : d.diaKlavad ? (
            <Meta style={{ marginTop: AVSTAND.s }}>Endast toppmätning · Maskin {stock.maskin_toppdia_mm ?? '–'} mm · Operatör {stock.operator_toppdia_mm} mm</Meta>
          ) : (
            <Meta style={{ marginTop: AVSTAND.s }}>Ej klavad av operatör</Meta>
          )}
        </Sektion>

        {d.hasMp && (
          <Sektion rubrik="Per mätpunkt" kort={false}>
            {d.mpAvvik.map((p, i) => (
              <Rad key={i} sista={i === d.mpAvvik.length - 1} titel={`${p.position_cm} cm`} under={`Maskin ${p.mVal} · Operatör ${p.oVal}`}
                hoger={<TonVarde ton={avvikelseTon(p.avvikelse, 'dia')}>{fmtAvvikelse(p.avvikelse, 'mm')}</TonVarde>} />
            ))}
          </Sektion>
        )}

        {stock.maskin_volym_sub != null && (
          <Info ikon="inventory_2" titel="Volym (m³fub)">
            Maskin: {dec(stock.maskin_volym_sub, 4)} • Operatör: {volKlavad ? dec(stock.operator_volym_sub!, 4) : '–'}
            {volKlavad && stock.volym_avvikelse != null ? ` • Diff: ${dec(stock.volym_avvikelse, 4)}` : ''}
          </Info>
        )}
      </div>
    </>
  );
}
