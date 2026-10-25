'use client';

// Ackord — "Tjänade vi mer på att få betalt per kubik?" (barnregeln, Martin
// 2026-10-24). Första skärmen har inga fackord: frågan, Ja/Nej, ett tal i
// kronor och en rad per skog med stapel. Tryck på en rad = arket med
// maskinerna; "Visa alla siffror" = kubik, kr/m³, timmar och priskvittot.
//
// EN räkning: lib/ekonomi/ackordVy (en maskins del = ackord − timpeng i
// hela kronor, allt annat summerar delarna). Därför visar Skog, Klass och
// Maskin samma tal överst, och talet överst är summan av raderna som visas.
// Ackord och timpeng räknas i lib/ekonomi/objektJamforelse — vyn räknar
// inget själv.
//
// Klass var förut en egen flik (Per klass). Det är samma data ur en annan
// vinkel, så den är en växel här; /ekonomi/per-klass leder hit med ?vy=klass.
//
// PERIODER: Månad/Kvartal/År. Varje rad är ett helt avräknat objekt, så även
// en månad med två rader är sann ("de här avräknades då").

import { useEffect, useState, useCallback } from 'react';
import {
  hamtaObjektJamforelse, OSAKER_TIM, MAX_SKOTAD_M3_PER_G15H,
  type ObjektRad,
} from '@/lib/ekonomi/objektJamforelse';
import {
  skogRader, klassRader, maskinRader, summa, ackordSvar, vantarText, perM3, klassText,
  type SkogRad, type KlassRad, type MaskinRad,
} from '@/lib/ekonomi/ackordVy';
import { type PeriodType, getPeriodLabel } from '@/lib/ekonomi/period';
import { getPeriodDates } from '@/lib/ekonomi/period';
import { FORESTLINK_KR_PER_TIM } from '@/lib/ekonomi/forestlink';
import { EkonomiSida, Periodvaxlare, Laddar, FelRuta, MAXBREDD_BRED } from '../delade/mall';
import { SvarHuvud, Belopp, MittStapel } from '../delade/svar';
import { rubrikCell, talCell, gridRad } from '../delade/tabell';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Flikkontroll from '@/components/design/Flikkontroll';
import { FARG, TYP, TNUM, VIKT, AVSTAND } from '@/lib/design/tokens';

type Vy = 'skog' | 'klass' | 'maskin';
const VYER: readonly (readonly [Vy, string])[] = [['skog', 'Skog'], ['klass', 'Klass'], ['maskin', 'Maskin']];
const VY_RUBRIK: Record<Vy, string> = { skog: 'Varje skog', klass: 'Varje klass', maskin: 'Varje maskin' };

type Valt =
  | { typ: 'skog'; rad: SkogRad }
  | { typ: 'klass'; rad: KlassRad }
  | { typ: 'maskin'; rad: MaskinRad }
  | { typ: 'siffror' } | { typ: 'info' } | { typ: 'vantar' } | { typ: 'ejjamf' };

const heltal = (n: number) => Math.round(n).toLocaleString('sv-SE');
const kr = (n: number) => `${heltal(n)} kr`;
const tim = (n: number) => n.toFixed(1).replace('.', ',');

/** Läs ?vy= ur adressen (Per klass leder hit med ?vy=klass). */
export function vyUrAdress(search: string): Vy {
  const v = new URLSearchParams(search).get('vy');
  return v === 'klass' || v === 'maskin' ? v : 'skog';
}

// Objektdetaljens maskinrader: en rad per maskin, avrundad för sig — summan
// är skogens tal. Exporterad för test.
export function maskinDiffRader(o: ObjektRad) {
  const rader = o.maskiner.map(d => ({ maskin_id: d.maskin_id, roll: d.roll, diff: Math.round(d.ackord - d.timpeng) }));
  return { rader, summa: rader.reduce((s, r) => s + r.diff, 0) };
}

// Priskvittot grupperar motorns grund-rader på label. En okänd label hamnar
// under "Övrigt" — en rad får aldrig tappas tyst. Exporterad för test.
const KVITTO_GRUPPER: [string, string[]][] = [
  ['Volym', ['Skördad volym', 'Skotad volym']],
  ['Grundpris', ['Medelstam']],
  ['Tillägg', ['Terräng', 'Skotavstånd', 'Sortimentgrupper', 'Kvalitetssäkring']],
  ['Tid', ['G15 skördare', 'G15 skotare']],
];
export function grupperaKvitto(grund: ObjektRad['grund']) {
  const anvanda = new Set<number>();
  const grupper = KVITTO_GRUPPER.map(([namn, labels]) => ({
    namn,
    rader: grund.filter((g, i) => {
      if (labels.includes(g.label)) { anvanda.add(i); return true; }
      return false;
    }),
  })).filter(g => g.rader.length > 0);
  const ovriga = grund.filter((_, i) => !anvanda.has(i));
  if (ovriga.length > 0) grupper.push({ namn: 'Övrigt', rader: ovriga });
  return grupper;
}

export default function MotAckordClient() {
  const [period, setPeriod] = useState<PeriodType>('M');
  const [periodOffset, setPeriodOffset] = useState(0);
  const [vy, setVyState] = useState<Vy>('skog');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [objektRader, setObjektRader] = useState<ObjektRad[]>([]);
  const [vantarNamn, setVantarNamn] = useState<string[]>([]);
  const [timpengAntal, setTimpengAntal] = useState(0);
  const [ejJamforbara, setEjJamforbara] = useState<{ namn: string; orsak: string }[]>([]);
  const [maskinNamnMap, setMaskinNamnMap] = useState<Record<string, { namn: string; typ: string | null }>>({});
  const [valt, setValt] = useState<Valt | null>(null);
  const [allaSiffror, setAllaSiffror] = useState(false); // nivå 3 i skogens ark
  const [merInfo, setMerInfo] = useState(false);

  useEffect(() => { setVyState(vyUrAdress(window.location.search)); }, []);
  const setVy = (v: Vy) => {
    setVyState(v);
    try {
      const u = new URL(window.location.href);
      if (v === 'skog') u.searchParams.delete('vy'); else u.searchParams.set('vy', v);
      window.history.replaceState(null, '', u.toString());
    } catch { /* adressen är en bekvämlighet */ }
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = getPeriodDates(period, periodOffset);
      const data = await hamtaObjektJamforelse(start, end);
      setObjektRader(data.rader);
      setEjJamforbara(data.ejJamforbara);
      setVantarNamn(data.vantarNamn);
      setTimpengAntal(data.timpengAntal);
      setMaskinNamnMap(data.maskinNamnMap);
    } catch (err: any) {
      console.error('Ackord: fetch error', err);
      setError(err?.message || String(err));
      setObjektRader([]);
    }
    setLoading(false);
  }, [period, periodOffset]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Två maskiner kan dela namn (två H8E) — då står maskin-id:t bredvid.
  const rensaNamn = (namn: string) => namn.replace(/\s*\((skördare|skotare)\)\s*$/i, '');
  const maskinNamn = (mid: string) => {
    const namn = rensaNamn(maskinNamnMap[mid]?.namn || mid);
    const dubblett = Object.entries(maskinNamnMap).some(([id, m]) => id !== mid && rensaNamn(m.namn) === namn);
    return dubblett ? `${namn} · ${mid}` : namn;
  };

  const skogar = skogRader(objektRader);
  const klasser = klassRader(objektRader);
  const maskiner = maskinRader(objektRader, maskinNamn);
  const total = summa(skogar);
  const svar = ackordSvar(total);
  const periodText = getPeriodLabel(period, periodOffset);

  const klassTimmar = (k: KlassRad) => k.skogar.reduce((s, r) => s + r.objekt.maskiner.reduce((t, d) => t + d.timmar, 0), 0);

  const radUnder = (krTal: number, andel: number, text?: string | null) => (
    <>
      {text && <span>{text}</span>}
      <MittStapel kr={krTal} andel={andel} />
    </>
  );

  const stang = () => { setValt(null); setAllaSiffror(false); setMerInfo(false); };

  return (
    <EkonomiSida maxBredd={MAXBREDD_BRED}>
      <Periodvaxlare
        perioder={['M', 'K', 'A']}
        period={period}
        offset={periodOffset}
        onPeriod={p => { setPeriod(p); setPeriodOffset(0); }}
        onOffset={setPeriodOffset}
        onInfo={() => setValt({ typ: 'info' })}
      />

      {loading && <Laddar />}

      {!loading && error && (
        <FelRuta titel="Kunde inte läsa ackordet" fel={error} onRetry={fetchData} />
      )}

      {!loading && !error && (
        <div style={{ padding: `0 ${AVSTAND.sidmarginal}px` }}>
          {skogar.length === 0 ? (
            <SvarHuvud
              fraga="Tjänade vi mer på att få betalt per kubik?"
              svar="Inget att jämföra"
              under={`Ingen skog blev klar i ${periodText}.`}
              vantar={vantarText(vantarNamn.length)}
            />
          ) : (
            <SvarHuvud
              fraga="Tjänade vi mer på att få betalt per kubik?"
              svar={svar.svar}
              under={<Belopp kr={total} />}
              vantar={vantarText(vantarNamn.length)}
            />
          )}

          {skogar.length > 0 && (
            <>
              <div style={{ marginBottom: AVSTAND.xl }}>
                <Flikkontroll flikar={VYER} aktiv={vy} onVal={setVy} />
              </div>

              <Sektion rubrik={VY_RUBRIK[vy]} not={vy === 'skog' ? 'Grönt åt höger = mer än per timme. Rött åt vänster = mindre.' : undefined}>
                {vy === 'skog' && skogar.map((r, i) => (
                  <Rad key={r.nyckel} titel={r.namn} hoger={<Belopp kr={r.kr} />}
                    under={radUnder(r.kr, r.andel, r.objekt.egenSkotning ? 'egen skotning' : null)}
                    onTryck={() => setValt({ typ: 'skog', rad: r })} sista={i === skogar.length - 1}
                    attr={{ 'data-rad': 'skog' }} />
                ))}
                {vy === 'klass' && klasser.map((r, i) => (
                  <Rad key={r.nyckel} titel={r.namn} hoger={<Belopp kr={r.kr} />}
                    under={radUnder(r.kr, r.andel, `${r.skogar.length} ${r.skogar.length === 1 ? 'skog' : 'skogar'}${klassTimmar(r) < OSAKER_TIM ? ' · få timmar, osäkert' : ''}`)}
                    onTryck={() => setValt({ typ: 'klass', rad: r })} sista={i === klasser.length - 1}
                    attr={{ 'data-rad': 'klass' }} />
                ))}
                {vy === 'maskin' && maskiner.map((r, i) => (
                  <Rad key={r.nyckel} titel={r.namn} hoger={<Belopp kr={r.kr} />}
                    under={radUnder(r.kr, r.andel, `${r.roll}${r.timmar < OSAKER_TIM ? ' · få timmar, osäkert' : ''}`)}
                    onTryck={() => setValt({ typ: 'maskin', rad: r })} sista={i === maskiner.length - 1}
                    attr={{ 'data-rad': 'maskin' }} />
                ))}
              </Sektion>

              <Sektion rubrik="Siffrorna">
                <Rad titel="Visa alla siffror" under="Kubik, kronor per kubik och timmar" onTryck={() => setValt({ typ: 'siffror' })} sista />
              </Sektion>
            </>
          )}

          {(vantarNamn.length > 0 || ejJamforbara.length > 0 || timpengAntal > 0) && (
            <Sektion rubrik="Inte med">
              {vantarNamn.length > 0 && (
                <Rad titel="Inte klara än" hoger={String(vantarNamn.length)} onTryck={() => setValt({ typ: 'vantar' })}
                  sista={ejJamforbara.length === 0 && timpengAntal === 0} />
              )}
              {ejJamforbara.length > 0 && (
                <Rad titel="Går inte att jämföra" hoger={String(ejJamforbara.length)} onTryck={() => setValt({ typ: 'ejjamf' })}
                  sista={timpengAntal === 0} />
              )}
              {timpengAntal > 0 && (
                <Rad titel="Betalas redan per timme" under="Gallring och timpengsjobb har inget att jämföra med" hoger={String(timpengAntal)} sista />
              )}
            </Sektion>
          )}
        </div>
      )}

      {/* ── Arken — ett åt gången ── */}

      {valt?.typ === 'skog' && (() => {
        const o = valt.rad.objekt;
        const delar = maskinDiffRader(o);
        return (
          <Ark rubrik={o.namn} stang="Klar" onStang={stang}>
            <p style={{ margin: 0, ...TYP.rubrik }}><Belopp kr={delar.summa} /></p>
            <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.xl}px`, ...TYP.meta, color: FARG.text2 }}>
              än per timme · {heltal(o.volym)} m³{o.egenSkotning ? ' · egen skotning – markägaren skotar själv' : ''}
            </p>
            <Sektion rubrik="Varje maskin" kort={false}>
              {delar.rader.map((d, i) => (
                <Rad key={d.maskin_id} titel={maskinNamn(d.maskin_id)} under={d.roll} hoger={<Belopp kr={d.diff} />} sista={i === delar.rader.length - 1} />
              ))}
            </Sektion>

            <Sektion rubrik="Siffrorna" kort={false}>
              <Rad titel={allaSiffror ? 'Dölj siffrorna' : 'Visa alla siffror'} onTryck={() => setAllaSiffror(v => !v)} pil={!allaSiffror} sista />
            </Sektion>

            {allaSiffror && (
              <>
                <Sektion rubrik="Ackord och timpeng" kort={false}>
                  <Rad titel="Ackord" hoger={kr(o.ackord)} hogerUnder={perM3(o.ackord, o.volym) != null ? `${perM3(o.ackord, o.volym)} kr/m³` : undefined} />
                  <Rad titel="Per timme" hoger={kr(o.timpeng)} hogerUnder={perM3(o.timpeng, o.volym) != null ? `${perM3(o.timpeng, o.volym)} kr/m³` : undefined} sista />
                </Sektion>
                {grupperaKvitto(o.grund).map(g => (
                  <Sektion key={g.namn} rubrik={g.namn === 'Grundpris' && o.klass != null ? `Grundpris · ${klassText(o.klass)}` : g.namn} kort={false}>
                    {g.rader.map((r, i) => (
                      <Rad key={r.label} titel={r.label}
                        hoger={<span style={{ color: r.manuell ? FARG.orange : FARG.text }}>{r.text}</span>}
                        sista={i === g.rader.length - 1} />
                    ))}
                  </Sektion>
                ))}
                <Sektion rubrik="Varje maskin i detalj" kort={false}
                  not={<span>Orange = satt för hand eller uppskattat. Ackord = kubik × pris för klassen med tilläggen; per timme = G15-timmar × timpris{o.maskiner.some(d => d.forestlinkKr > 0) ? ` (med ForestLink +${FORESTLINK_KR_PER_TIM} kr/tim)` : ''}.</span>}>
                  {o.maskiner.map((d, i) => (
                    <Rad key={d.maskin_id} titel={`${maskinNamn(d.maskin_id)} · ${d.roll}`}
                      under={
                        <span>
                          {heltal(d.volym)} m³ · {tim(d.timmar)} tim × {heltal(d.timpris)} kr
                          {d.manuellTid && <span style={{ color: FARG.orange }}> · tid satt för hand</span>}
                          {d.timmar > 0 && d.timmar < OSAKER_TIM && ' · få timmar, osäkert'}
                        </span>
                      }
                      hoger={kr(d.ackord)} hogerUnder={`per timme ${kr(d.timpeng)}`} sista={i === o.maskiner.length - 1} />
                  ))}
                </Sektion>
                <Sektion rubrik="Rätta" kort={false}>
                  <Rad titel="Öppna i Redigering" under="Volym, tid och tillägg rättas där" href={`/redigering?objekt=${encodeURIComponent(o.objekt_id)}`} sista />
                </Sektion>
              </>
            )}
          </Ark>
        );
      })()}

      {valt?.typ === 'klass' && (
        <Ark rubrik={valt.rad.namn} stang="Klar" onStang={stang}>
          <p style={{ margin: 0, ...TYP.rubrik }}><Belopp kr={valt.rad.kr} /></p>
          <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.xl}px`, ...TYP.meta, color: FARG.text2 }}>än per timme · {heltal(valt.rad.volym)} m³</p>
          <Sektion rubrik="Skördare och skotare" kort={false}>
            <Rad titel="Skördaren" hoger={<Belopp kr={valt.rad.skordare} />} />
            <Rad titel="Skotaren" hoger={<Belopp kr={valt.rad.skotare} />} sista />
          </Sektion>
          <Sektion rubrik="Skogarna" kort={false}>
            {valt.rad.skogar.map((s, i) => (
              <Rad key={s.nyckel} titel={s.namn} hoger={<Belopp kr={s.kr} />} onTryck={() => setValt({ typ: 'skog', rad: s })} sista={i === valt.rad.skogar.length - 1} />
            ))}
          </Sektion>
        </Ark>
      )}

      {valt?.typ === 'maskin' && (
        <Ark rubrik={valt.rad.namn} stang="Klar" onStang={stang}>
          <p style={{ margin: 0, ...TYP.rubrik }}><Belopp kr={valt.rad.kr} /></p>
          <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.xl}px`, ...TYP.meta, color: FARG.text2 }}>än per timme · {valt.rad.roll}</p>
          <Sektion rubrik="Per timme" kort={false}
            not={valt.rad.timmar < OSAKER_TIM ? `Under ${OSAKER_TIM} G15-timmar – talen per timme är osäkra.` : undefined}>
            <Rad titel="G15-timmar" hoger={tim(valt.rad.timmar)} />
            <Rad titel="Ackord per timme" hoger={valt.rad.timmar > 0 ? kr(valt.rad.ackord / valt.rad.timmar) : '—'} />
            <Rad titel="Betalt per timme" hoger={valt.rad.timmar > 0 ? kr(valt.rad.timpeng / valt.rad.timmar) : '—'} sista />
          </Sektion>
          <Sektion rubrik="Skogarna" kort={false}>
            {valt.rad.skogar.map((s, i) => {
              const skog = skogar.find(x => x.nyckel === s.objekt.objekt_id);
              return (
                <Rad key={s.objekt.objekt_id} titel={s.objekt.namn} hoger={<Belopp kr={s.kr} />}
                  onTryck={skog ? () => setValt({ typ: 'skog', rad: skog }) : undefined} sista={i === valt.rad.skogar.length - 1} />
              );
            })}
          </Sektion>
        </Ark>
      )}

      {valt?.typ === 'siffror' && (
        <Ark rubrik={`Alla siffror · ${periodText}`} stang="Klar" onStang={stang}>
          <AllaSiffror vy={vy} skogar={skogar} klasser={klasser} maskiner={maskiner} total={total} />
        </Ark>
      )}

      {valt?.typ === 'vantar' && (
        <Ark rubrik="Inte klara än" stang="Klar" onStang={stang}>
          <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
            Skördning eller skotning pågår. Skogen kommer med när båda är klara.
          </p>
          {vantarNamn.map((n, i) => <Rad key={i} titel={n} sista={i === vantarNamn.length - 1} />)}
        </Ark>
      )}

      {valt?.typ === 'ejjamf' && (
        <Ark rubrik="Går inte att jämföra" stang="Klar" onStang={stang}>
          <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
            Tiden eller volymen hänger inte ihop, så skogen står utanför talen tills den rättats i Redigering.
          </p>
          {ejJamforbara.map((o, i) => <Rad key={i} titel={o.namn} under={o.orsak} sista={i === ejJamforbara.length - 1} />)}
        </Ark>
      )}

      {valt?.typ === 'info' && (
        <Ark rubrik="Så räknas det" stang="Klar" onStang={stang}>
          <div style={{ ...TYP.text, color: FARG.text, display: 'grid', gap: AVSTAND.m }}>
            <p style={{ margin: 0 }}>Ackord är det vi får betalt per kubik. Per timme är vad samma arbete hade gett om vi fått betalt för timmarna.</p>
            <p style={{ margin: 0 }}>Bara skogar där både skördning och skotning är klara räknas.</p>
            <p style={{ margin: 0 }}>Talet överst är summan av raderna.</p>
          </div>
          <div style={{ marginTop: AVSTAND.l }}>
            <Rad titel={merInfo ? 'Mindre om hur det räknas' : 'Mer om hur det räknas'} onTryck={() => setMerInfo(v => !v)} pil={!merInfo} sista />
          </div>
          {merInfo && (
            <div style={{ ...TYP.meta, color: FARG.text2, display: 'grid', gap: AVSTAND.m, marginTop: AVSTAND.m }}>
              <p style={{ margin: 0 }}>Ackord = skördad volym × skördarpris och skotad volym × skotarpris för närmaste klass, plus trakt-, sortiment-, skotningsavstånds-, terräng- och kvalitetssäkringstillägg. 3-meters massaved och manuella poster ingår inte, flyttersättning redovisas separat.</p>
              <p style={{ margin: 0 }}>Per timme = G15-timmar × maskinens timpris, med ForestLink-tillägget (+{FORESTLINK_KR_PER_TIM} kr/tim) för maskiner som har det.</p>
              <p style={{ margin: 0 }}>Varje maskins del avrundas till hela kronor. En skog är summan av sina maskiner, en klass summan av sina skogar — därför visar Skog, Klass och Maskin samma tal.</p>
              <p style={{ margin: 0 }}>En skog räknas i den period skotningen blev klar. Med egen skotning (markägaren skotar) räknas den när skördningen är klar, och bara skördaren jämförs.</p>
              <p style={{ margin: 0 }}>Står skotad volym och skotartid inte i proportion (över {MAX_SKOTAD_M3_PER_G15H} m³ per timme) eller saknas timpris står skogen under &quot;Går inte att jämföra&quot;. Under {OSAKER_TIM} G15-timmar märks talen per timme som osäkra.</p>
            </div>
          )}
        </Ark>
      )}
    </EkonomiSida>
  );
}

// ── "Visa alla siffror" — tabellen för den växel som är vald ──
// Totalt kr är radens kronor (samma tal som raden och talet överst). kr/m³ och
// kr/tim är upplysningar: avrundade för sig, de summerar inte.
function AllaSiffror({ vy, skogar, klasser, maskiner, total }: {
  vy: Vy; skogar: SkogRad[]; klasser: KlassRad[]; maskiner: MaskinRad[]; total: number;
}) {
  const liten = { ...talCell, ...TYP.meta } as const;
  const rubrik = { ...rubrikCell } as const;
  const summaRad = (cells: React.ReactNode[], grid: React.CSSProperties) => (
    <div style={{ ...grid, borderTop: `1px solid ${FARG.linje}`, marginTop: AVSTAND.s, paddingTop: AVSTAND.s }}>
      {cells.map((c, i) => <div key={i} style={{ ...(i === 0 ? { ...TYP.meta, color: FARG.text } : liten), fontWeight: VIKT.halvfet }}>{c}</div>)}
    </div>
  );
  const tecken = (n: number) => <span style={{ color: n > 0 ? FARG.gron : n < 0 ? FARG.rod : FARG.text2 }}>{`${n < 0 ? '−' : n > 0 ? '+' : ''}${heltal(Math.abs(n))}`}</span>;

  if (vy === 'maskin') {
    const grid = gridRad('minmax(0, 1.6fr) repeat(4, minmax(0, 1fr))');
    return (
      <div style={TNUM}>
        <div style={{ ...grid, marginBottom: AVSTAND.s }}>
          <div style={{ ...rubrik, textAlign: 'left' }}>Maskin</div>
          <div style={rubrik}>G15-tim</div><div style={rubrik}>Ackord kr/tim</div><div style={rubrik}>Per tim kr/tim</div><div style={rubrik}>Totalt kr</div>
        </div>
        {maskiner.map(m => (
          <div key={m.nyckel} style={{ ...grid, padding: `${AVSTAND.xs}px 0` }}>
            <div style={{ ...TYP.meta, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.namn}</div>
            <div style={liten}>{tim(m.timmar)}</div>
            <div style={liten}>{m.timmar > 0 ? heltal(m.ackord / m.timmar) : '—'}</div>
            <div style={liten}>{m.timmar > 0 ? heltal(m.timpeng / m.timmar) : '—'}</div>
            <div style={liten}>{tecken(m.kr)}</div>
          </div>
        ))}
        {summaRad(['Totalt', tim(maskiner.reduce((s, m) => s + m.timmar, 0)), '', '', tecken(total)], grid)}
      </div>
    );
  }

  const rader = vy === 'skog'
    ? skogar.map(s => ({ nyckel: s.nyckel, namn: s.namn, volym: s.volym, ackord: s.objekt.ackord, timpeng: s.objekt.timpeng, kr: s.kr }))
    : klasser.map(k => ({
      nyckel: k.nyckel, namn: k.namn, volym: k.volym,
      ackord: k.skogar.reduce((s, r) => s + r.objekt.ackord, 0),
      timpeng: k.skogar.reduce((s, r) => s + r.objekt.timpeng, 0),
      kr: k.kr,
    }));
  const grid = gridRad('minmax(0, 1.6fr) repeat(4, minmax(0, 1fr))');
  return (
    <div style={TNUM}>
      <div style={{ ...grid, marginBottom: AVSTAND.s }}>
        <div style={{ ...rubrik, textAlign: 'left' }}>{vy === 'skog' ? 'Skog' : 'Klass'}</div>
        <div style={rubrik}>m³</div><div style={rubrik}>Ackord kr/m³</div><div style={rubrik}>Per tim kr/m³</div><div style={rubrik}>Totalt kr</div>
      </div>
      {rader.map(r => (
        <div key={r.nyckel} style={{ ...grid, padding: `${AVSTAND.xs}px 0` }}>
          <div style={{ ...TYP.meta, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.namn}</div>
          <div style={liten}>{heltal(r.volym)}</div>
          <div style={liten}>{perM3(r.ackord, r.volym) ?? '—'}</div>
          <div style={liten}>{perM3(r.timpeng, r.volym) ?? '—'}</div>
          <div style={liten}>{tecken(r.kr)}</div>
        </div>
      ))}
      {summaRad(['Totalt', heltal(rader.reduce((s, r) => s + r.volym, 0)), '', '', tecken(total)], grid)}
      <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
        Totalt är radens kronor, samma tal som på raden. Kronor per kubik är avrundade för sig och summerar inte.
      </p>
    </div>
  );
}
