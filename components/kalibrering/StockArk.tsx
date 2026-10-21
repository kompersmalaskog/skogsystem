'use client';
// De två stockarken: StockArk (en stock ur en kontroll — lollipop över mätpunkterna) och SenasteStockArk (en stock ur Senaste-fliken —
// maskin mot operatör, mätjämförelse och volym). Samma innehåll som de gamla modalerna; räknandet bor i lib/kalibrering/kontroll.
import type { StockRow } from '@/app/api/kalibrering/kontroll/route';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { AVVIKELSE } from '@/lib/kalibrering/ordlista';
import { avvikelseTon } from '@/lib/kalibrering/bedomning';
import { dec, fmtAvvikelse } from '@/lib/kalibrering/format';
import { senasteStockVarde, stockDetalj } from '@/lib/kalibrering/kontroll';
import type { DetaljKontrollStock } from '@/lib/kalibrering/typer';
import { Info, Meta, Status, TalGrid, TonVarde, TON_FARG } from './delar';
import { Lollipop } from './diagram';

const DIAG_TON = { ok: 'ok', warn: 'hi', bad: 'hot' } as const;

export function StockArk({ stock, tolLen }: { stock: StockRow; tolLen: number }) {
  const d = stockDetalj(stock, tolLen);
  const lenM = stock.maskin_langd_cm != null ? `${dec(stock.maskin_langd_cm / 100, 1)} m` : '–';
  const mpText = stock.matpunkter.length === 1 ? '1 mätpunkt' : `${stock.matpunkter.length} mätpunkter`;
  const diaTon = !d.diaKlavad ? 'ok' : d.diagnos?.tone === 'bad' ? 'hot' : d.diagnos?.tone === 'warn' ? 'hi' : 'ok';

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
      </div>
    </>
  );
}

/** Stock ur Senaste-fliken: maskin mot operatör, mätjämförelse, mätpunkter längs stocken och volym. */
export function SenasteStockArk({ stock }: { stock: DetaljKontrollStock }) {
  const v = senasteStockVarde(stock);
  const ord = (t: 'ok' | 'cold' | 'hi' | 'hot') => v.badgeText(t);
  const totalt = v.mps.length + (v.diaKlavad ? 1 : 0);
  // Operatörsvolym kräver att operatören klavat BÅDE längd och diameter. Utan det kan volymen (och diffen) inte finnas.
  const volKlavad = v.lenKlavad && v.diaKlavad && stock.operator_volym_sub != null;

  const stapel = (bredd: number, hojd: number, text: string, kant: string) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: bredd, maxWidth: '100%', height: hojd, background: FARG.upphojt, borderRadius: RADIE.rad, border: `1px solid ${kant}`, ...TYP.listtitel, ...TNUM }}>{text}</div>
  );

  return (
    <>
      <Meta>{`Stam ${stock.stam_nummer} • ${stock.kontroll_datum}`}</Meta>

      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, margin: `${AVSTAND.l}px 0` }}>
        <div>
          <Meta style={{ marginBottom: AVSTAND.xs }}>Maskin</Meta>
          {stapel(v.maskinW, v.maskinH, `${stock.maskin_langd_cm} cm`, v.diaTon === 'ok' ? FARG.linje : TON_FARG[v.diaTon])}
        </div>
        <div>
          <Meta style={{ marginBottom: AVSTAND.xs }}>Operatör</Meta>
          {stapel(v.operatorW, v.operatorH, v.opLen, FARG.linje)}
        </div>
      </div>

      <TalGrid rubrik="Mätjämförelse" celler={[
        { etikett: 'Längd maskin', varde: stock.maskin_langd_cm, enhet: 'cm' },
        { etikett: 'Längd operatör', varde: v.lenKlavad ? stock.operator_langd_cm : '–', enhet: v.lenKlavad ? 'cm' : undefined },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: AVSTAND.s, padding: AVSTAND.m, background: FARG.tonad, borderRadius: RADIE.kort, marginTop: AVSTAND.l }}>
        <div style={{ textAlign: 'center' }}>
          <Meta style={{ marginBottom: AVSTAND.xs }}>{AVVIKELSE.langd}</Meta>
          <div style={{ ...TYP.listtitel, ...TNUM }}>{v.lenKlavad ? `${fmtAvvikelse(stock.langd_avvikelse_cm, 'cm')} cm` : '–'}</div>
          <div style={{ marginTop: AVSTAND.xs, display: 'flex', justifyContent: 'center' }}><Status ton={v.lenTon} ord={v.lenKlavad ? ord(v.lenTon) : 'Ej klavad'} /></div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Meta style={{ marginBottom: AVSTAND.xs }}>Topp ⌀ maskin</Meta>
          <div style={{ ...TYP.listtitel, ...TNUM }}>{stock.maskin_toppdia_mm} mm</div>
          <Meta style={{ marginTop: AVSTAND.xs }}>op: {v.opDia}</Meta>
        </div>
        <div style={{ textAlign: 'center' }}>
          <Meta style={{ marginBottom: AVSTAND.xs }}>{AVVIKELSE.topp}</Meta>
          <div style={{ ...TYP.listtitel, ...TNUM }}>{v.diaKlavad ? `${fmtAvvikelse(stock.dia_avvikelse_mm, 'mm')} mm` : '–'}</div>
          <div style={{ marginTop: AVSTAND.xs, display: 'flex', justifyContent: 'center' }}><Status ton={v.diaTon} ord={v.diaKlavad ? ord(v.diaTon) : 'Ej klavad'} /></div>
        </div>
      </div>

      {v.mps.length > 0 && (
        <div style={{ marginTop: AVSTAND.l }}>
          <Sektion rubrik="Mätpunkter längs stocken" kort={false}
            not={v.diaKlavad ? `Toppen ovan är 1 av ${totalt} diametermått — alla ingår i statistiken` : `${v.mps.length} diametermått på stocken — alla ingår i statistiken`}>
            {v.mps.map((m, i) => {
              const kl = m.diameter_operator_mm != null && m.diameter_operator_mm !== 0;
              const dd = kl ? (m.diameter_maskin_mm as number) - (m.diameter_operator_mm as number) : null;
              return (
                <Rad key={m.position_cm} sista={i === v.mps.length - 1} titel={`${m.position_cm} cm`}
                  under={`Maskin ${m.diameter_maskin_mm} mm${kl ? ` · Operatör ${m.diameter_operator_mm} mm` : ' · ej klavad av operatör'}`}
                  hoger={dd != null ? <TonVarde ton={avvikelseTon(dd, 'dia')}>{`${fmtAvvikelse(dd, 'mm')} mm`}</TonVarde> : 'ej klavad'} />
              );
            })}
          </Sektion>
        </div>
      )}

      {stock.maskin_volym_sub != null && (
        <div style={{ marginTop: AVSTAND.l }}>
          <Info ikon="inventory_2" titel="Volym (m³fub)">
            Maskin: {dec(stock.maskin_volym_sub, 4)} • Operatör: {volKlavad ? dec(stock.operator_volym_sub!, 4) : '–'}
            {volKlavad && stock.volym_avvikelse != null ? ` • Diff: ${dec(stock.volym_avvikelse, 4)}` : ''}
          </Info>
        </div>
      )}
    </>
  );
}
