'use client';
// "Från stubbe till avlägg" i trakten: tre steg (skördaren fällde, virket
// väntade, skotaren körde) och vädret under hela tiden. Stegen räknas i
// lib/iSkogen (rent, testat), vädret hämtas från /api/uppfoljning/vader.
import { useEffect, useState } from 'react';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { ROLLFARG_SKORDARE, ROLLFARG_SKOTARE } from '@/lib/sparStil';
import { period, stegFor, type Steg, type StegIndata } from './lib/iSkogen';
import { tempText, type VaderSvar } from './lib/vader';

const PRICK: Record<Steg['slag'], string> = { skordare: ROLLFARG_SKORDARE, vantan: FARG.text3, skotare: ROLLFARG_SKOTARE };

function svenskIdag(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

export function useVader(vo: string | null | undefined, fran: string | null, till: string | null) {
  const [svar, setSvar] = useState<VaderSvar | null>(null);
  const [forsok, setForsok] = useState(0);
  useEffect(() => {
    if (!vo || !fran || !till) { setSvar({ ok: false, orsak: vo ? 'saknar_datum' : 'saknar_plats' }); return; }
    let avbruten = false;
    setSvar(null);
    fetch(`/api/uppfoljning/vader?vo=${encodeURIComponent(vo)}&fran=${fran}&till=${till}`)
      .then(r => r.json())
      .then((j: VaderSvar) => { if (!avbruten) setSvar(j); })
      .catch(e => { if (!avbruten) setSvar({ ok: false, orsak: 'las', fel: String(e) }); });
    return () => { avbruten = true; };
  }, [vo, fran, till, forsok]);
  return { svar, forsokIgen: () => setForsok(n => n + 1) };
}

function Rad({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: AVSTAND.m, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderBottom: last ? 'none' : `1px solid ${FARG.linje}` }}>
      <span style={{ ...TYP.text }}>{k}</span>
      <span style={{ ...TYP.text, color: FARG.text2, ...TNUM, textAlign: 'right' }}>{v}</span>
    </div>
  );
}

export function LiggetidVader({ indata, vo }: { indata: StegIndata; vo: string | null | undefined }) {
  const idag = svenskIdag();
  const steg = stegFor(indata, idag);
  const p = period(indata, idag);
  const { svar, forsokIgen } = useVader(vo, p?.fran ?? null, p?.till ?? null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l, padding: `0 ${AVSTAND.xl}px ${AVSTAND.l}px` }}>
      {steg.length > 0 && (
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: AVSTAND.l }} data-liggetid-steg>
          {steg.map((s, i) => (
            <div key={s.slag} style={{ position: 'relative', display: 'flex', gap: AVSTAND.l, paddingBottom: i === steg.length - 1 ? 0 : AVSTAND.xl }}>
              {i < steg.length - 1 && (
                <span aria-hidden="true" style={{ position: 'absolute', left: 7, top: 22, bottom: -AVSTAND.xs, width: 2, background: FARG.linje }} />
              )}
              <span aria-hidden="true" style={{ flex: 'none', width: 16, height: 16, borderRadius: RADIE.cirkel, background: PRICK[s.slag], marginTop: 2 }} />
              <span>
                <span style={{ display: 'block', ...TYP.listtitel }}>{s.rubrik}</span>
                <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, ...TNUM }}>{s.under}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div data-liggetid-vader>
        <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.l}px ${AVSTAND.s}px` }}>Vädret under tiden</div>
        <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
          {svar == null ? (
            <div style={{ ...TYP.meta, color: FARG.text2, padding: AVSTAND.l }}>Hämtar vädret …</div>
          ) : !svar.ok ? (
            svar.orsak === 'las' ? (
              <button onClick={forsokIgen} style={{ display: 'block', width: '100%', minHeight: 44, padding: AVSTAND.l, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.meta, color: FARG.text2 }}>
                Kunde inte hämta vädret · <span style={{ color: FARG.bla }}>Försök igen</span>
              </button>
            ) : (
              <div style={{ ...TYP.meta, color: FARG.text2, padding: AVSTAND.l }}>
                {svar.orsak === 'saknar_plats' ? 'Trakten har ingen position – vädret går inte att hämta.' : 'Inga datum att räkna vädret på än.'}
              </div>
            )
          ) : (
            <>
              <Rad k="Regn" v={svar.summa.regnMm == null ? 'saknas' : `${svar.summa.regnMm} mm${svar.summa.regnDagar > 0 ? ` · ${svar.summa.regnDagar} ${svar.summa.regnDagar === 1 ? 'dag' : 'dagar'} med regn` : ''}`} />
              <Rad k="Temperatur" v={tempText(svar.summa.tMin, svar.summa.tMax) ?? 'saknas'} last />
            </>
          )}
        </div>
        {svar?.ok && (
          <div style={{ ...TYP.meta, color: FARG.text3, margin: `${AVSTAND.s}px ${AVSTAND.l}px 0` }}>
            Beräknat för traktens plats{svar.summa.saknas > 0 ? ` · ${svar.summa.saknas} ${svar.summa.saknas === 1 ? 'dag' : 'dagar'} saknas` : ''}.
          </div>
        )}
      </div>
    </div>
  );
}
