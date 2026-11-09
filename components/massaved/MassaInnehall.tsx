'use client';

// MASSAVEDENS LÄNGD — innehållet. Samma komponent i hyttens ark (tryck på "Massa idag 4,5 m" i namnfältet) och på
// admins sida /massaved. All räkning i lib/massaLangd; här ritas bara. Inget mål och ingen färg på talen (Martin 2026-11-09).
//
// Uppifrån: svaret (förarens snitt, stort) · Per trädslag (idag · förra veckan) · Hur långa blev stockarna? (Alla/Gran/Tall/Björk)
// · Alla förare (Idag/7 dagar/30 dagar), den egna raden märkt "du"; ett tryck på en förare fäller ut trädslagen, en åt gången.

import { useMemo, useState } from 'react';
import Flikkontroll from '@/components/design/Flikkontroll';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { AVSTAND, FARG, KNAPP, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { tradslagFarg, tradslagLabel } from '@/lib/tradslag';
import {
  dagOrd, fordelning, forraVeckan, iPeriod, mellan, meterText, perForare, perTradslag, personNyckel, summera,
  PERIODER, type MassaRad, type Period,
} from '@/lib/massaLangd';

const STAPEL_HOJD_PX = 8;

export interface MassaInnehallProps {
  rader: MassaRad[] | null;
  fel: string | null;
  idag: string;
  /** Förarens nyckel (personNyckel) och förnamn. null = admin utan egna rader: inget eget tal överst. */
  jag: { nyckel: string; namn: string } | null;
  /** maskin_id → namn ("H8E -26"). */
  maskinNamn: Record<string, string>;
  onForsok: () => void;
  /** I ett ark är ytan redan ett kort: raderna ligger direkt på den. */
  iArk?: boolean;
}

function Prick({ tradslag }: { tradslag: string }) {
  return <span aria-hidden="true" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: RADIE.cirkel, background: tradslagFarg(tradslag), boxShadow: `inset 0 0 0 1px ${FARG.linje}`, marginRight: AVSTAND.s, verticalAlign: 'middle' }} />;
}

export default function MassaInnehall({ rader, fel, idag, jag, maskinNamn, onForsok, iArk }: MassaInnehallProps) {
  const [tradVal, setTradVal] = useState<string>('alla');
  const [period, setPeriod] = useState<Period>('idag');
  const [oppenForare, setOppenForare] = useState<string | null>(null);
  const kort = !iArk;

  const vy = useMemo(() => {
    if (!rader) return null;
    const fv = forraVeckan(idag);
    const mina = jag ? rader.filter(r => personNyckel(r) === jag.nyckel) : [];
    const senast = mina.reduce((m, r) => (r.dag > m ? r.dag : m), '');
    const minDag = senast ? mina.filter(r => r.dag === senast) : [];
    const minFv = mellan(mina, fv.fran, fv.till);
    const ttMin = perTradslag(minDag);
    const ttFv = new Map(perTradslag(minFv).map(t => [t.tradslag, t]));
    // Fördelningen: förarens senaste dag om hen har en, annars alla förare idag.
    const fordUnderlag = minDag.length ? minDag : iPeriod(rader, 'idag', idag);
    const trad = [...new Set(fordUnderlag.map(r => tradslagLabel(r.tradslag)))];
    return { senast, snitt: summera(minDag), fv: summera(minFv), ttMin, ttFv, fordUnderlag, trad };
  }, [rader, idag, jag]);

  if (fel && !rader) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, padding: `${AVSTAND.l}px 0` }}>
        <div style={{ ...TYP.text, color: FARG.text }}>{fel}</div>
        <button type="button" onClick={onForsok} style={{ ...KNAPP.sekundar, alignSelf: 'flex-start' }}>Försök igen</button>
      </div>
    );
  }
  if (!rader || !vy) return <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.l}px 0` }}>Läser massaveden …</div>;

  const valtTrad = tradVal !== 'alla' && vy.trad.includes(tradVal) ? tradVal : 'alla';
  const ford = fordelning(valtTrad === 'alla' ? vy.fordUnderlag : vy.fordUnderlag.filter(r => tradslagLabel(r.tradslag) === valtTrad));
  const forare = perForare(iPeriod(rader, period, idag));
  const periodOrd = period === 'idag' ? 'idag' : period === 'vecka' ? 'de senaste 7 dagarna' : 'de senaste 30 dagarna';

  return (
    <div data-testid="massa-innehall">
      {/* Svaret */}
      {jag && (
        <div style={{ padding: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          {vy.snitt ? (
            <>
              <div data-testid="massa-snitt" style={{ ...TYP.tal, color: FARG.text }}>{meterText(vy.snitt.cm)}</div>
              <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.s }}>
                i snitt {dagOrd(vy.senast, idag)} · {jag.namn} · {vy.snitt.antal} stockar
              </div>
              <div data-testid="massa-forra-veckan" style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>
                {vy.fv ? `Förra veckan ${meterText(vy.fv.cm)}` : 'Ingen massaved förra veckan'}
              </div>
            </>
          ) : (
            <div style={{ ...TYP.text, color: FARG.text2 }}>Ingen massaved från {jag.namn} de senaste 30 dagarna.</div>
          )}
        </div>
      )}

      {jag && vy.ttMin.length > 0 && (
        <Sektion rubrik="Per trädslag" kort={kort}>
          {vy.ttMin.map((t, i) => {
            const f = vy.ttFv.get(t.tradslag);
            return (
              <Rad key={t.tradslag} sista={i === vy.ttMin.length - 1}
                titel={<><Prick tradslag={t.tradslag} />{t.tradslag}</>}
                under={f ? `Förra veckan ${meterText(f.cm)}` : 'Förra veckan –'}
                hoger={meterText(t.cm)} hogerUnder={`${t.antal} st`} />
            );
          })}
        </Sektion>
      )}

      {ford.length > 0 && (
        <Sektion rubrik="Hur långa blev stockarna?" kort={kort}
          not={vy.senast && jag && vy.fordUnderlag.length ? `${jag.namn} ${dagOrd(vy.senast, idag)}.` : 'Alla förare idag.'}>
          {vy.trad.length > 1 && (
            <div style={{ padding: `${AVSTAND.s}px 0` }}>
              <Flikkontroll flikar={[['alla', 'Alla'], ...vy.trad.map(t => [t, t] as const)]} aktiv={valtTrad} onVal={setTradVal} />
            </div>
          )}
          {ford.map((k, i) => (
            <div key={k.dm} data-testid="massa-klass" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: 44, borderBottom: i === ford.length - 1 ? 'none' : `1px solid ${FARG.linje}` }}>
              <span style={{ ...TYP.text, color: FARG.text, width: 64, flexShrink: 0, ...TNUM }}>{k.etikett}</span>
              <span aria-hidden="true" style={{ flex: 1, height: STAPEL_HOJD_PX, borderRadius: RADIE.stapel, background: FARG.fyllning, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${k.procent}%`, background: FARG.text2, borderRadius: RADIE.stapel }} />
              </span>
              <span style={{ ...TYP.text, color: FARG.text, width: 48, textAlign: 'right', flexShrink: 0, ...TNUM }}>{k.procent} %</span>
            </div>
          ))}
        </Sektion>
      )}

      <Sektion rubrik="Alla förare" kort={kort} not={forare.length ? 'Längst snitt först. Tryck på en förare för trädslagen.' : undefined}>
        <div style={{ padding: `${AVSTAND.s}px 0` }}>
          <Flikkontroll flikar={PERIODER} aktiv={period} onVal={setPeriod} />
        </div>
        {forare.length === 0 && <div style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.m}px 0` }}>Ingen massaved {periodOrd}.</div>}
        {forare.map((f, i) => {
          const du = jag?.nyckel === f.nyckel;
          const oppen = oppenForare === f.nyckel;
          return (
            <div key={f.nyckel} data-testid="massa-forare" data-du={du ? '1' : undefined}>
              <Rad sista={i === forare.length - 1 && !oppen} pil={false}
                onTryck={() => setOppenForare(oppen ? null : f.nyckel)}
                titel={du ? <>{f.namn} <span style={{ ...TYP.meta, color: FARG.text2 }}>· du</span></> : f.namn}
                under={`${f.maskiner.map(m => maskinNamn[m] ?? m).join(', ')} · ${f.antal} stockar`}
                hoger={meterText(f.cm)} />
              {oppen && (
                <div style={{ padding: `0 0 ${AVSTAND.s}px ${AVSTAND.l}px`, borderBottom: i === forare.length - 1 ? 'none' : `1px solid ${FARG.linje}` }}>
                  {f.tradslag.map(t => (
                    <div key={t.tradslag} style={{ display: 'flex', alignItems: 'center', minHeight: 36, ...TYP.text, color: FARG.text2 }}>
                      <span style={{ flex: 1 }}><Prick tradslag={t.tradslag} />{t.tradslag} · {t.antal} st</span>
                      <span style={{ color: FARG.text, ...TNUM }}>{meterText(t.cm)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Sektion>
      {fel && <div style={{ ...TYP.meta, color: FARG.text2 }}>{fel} – visar det som lästes senast.</div>}
    </div>
  );
}
