'use client';
// En gallrad trakt — svaret först: uttaget i m³fub. Under det frågor i vanliga ord, som markägarrapporten:
//   Hur hårt gallrades det? — per hektar på den gallrade ytan och stickvägarna ur GPS-spåren (lib/gallringPerHa.ts);
//                             var trakten både första och andra gallring, per del (lib/gallringDelar.ts)
//   Hur mycket står kvar?   — grundyta före (Skogsstyrelsens laserdata, uppräknad) minus uttaget (KvarEfter.tsx)
//   Vad blev virket?        — fyra grupper i SORTIMENTFARG (mörkast = mest värt), aldrig maskinens koder
//   Hur grovt gallrades det? — Dgv och diameterfördelningen
//   Vilka träd togs ut?      — trädslagen
//   Uttag per dag            — bara flerdagarstrakter
// Bredd: trakten är en container (container queries). Under 640 px trakt-bredd ligger frågorna under varandra och
// trädslag/dagar bakom EN rad som öppnar ett ark; från 640 px (iPad liggande med listan bredvid, dator) ligger alla
// fyra i ett rutnät med två kolumner — där finns plats, så inget göms.
//
// Här finns MEDVETET ingen gallringskvot eller kvarvarande bestånd skattat ur stickvägsträden — se lib/gallring.ts.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AVSTAND, FARG, KNAPP, KOLUMN, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import {
  aktuelltAr,
  fmtAntal,
  fmtDecimal,
  fmtVolym,
  hamtaGallring,
  hamtaPerHa,
  klassLabel,
  sparaYtaSvar,
  type PerHaLast,
  type GallringDetalj,
} from '@/lib/gallring';
import { dagarText, dagMan, procentSomSummerar, sortimentGrupper, traktSpann, veckodagDag } from '@/lib/gallringVy';
import { tradslagStil } from '@/lib/tradslag';
import { UTANFOR_VISA_FRAN } from '@/lib/gallringPerHa';
import GallradYtaArk from './GallradYtaArk';
import KvarEfter from './KvarEfter';
import DelningArk, { delningGaller } from './DelningArk';
import Flikkontroll from '@/components/design/Flikkontroll';
import { DEL_ORD, DELNING_NYCKEL, type DelNamn } from '@/lib/gallringDelar';

/** Traktens bredd där frågorna går från en till två kolumner. */
export const TVA_KOLUMNER_PX = 640;
/** Histogrammets höjd — ett layoutmått, inte ett avstånd. */
const HISTOGRAM_HOJD_PX = 120;

const css = `
.gd { container-type: inline-size; max-width: ${KOLUMN.bred + 2 * AVSTAND.sidmarginal}px; margin: 0 auto; box-sizing: border-box; padding: ${AVSTAND.l}px ${AVSTAND.sidmarginal}px ${AVSTAND.xxl * 2}px; }
.gd-rutnat { display: grid; grid-template-columns: minmax(0, 1fr); column-gap: ${AVSTAND.xl}px; align-items: start; }
.gd-bred { display: none; }
@container (min-width: ${TVA_KOLUMNER_PX}px) {
  .gd-rutnat { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .gd-bred { display: block; }
  .gd-smal { display: none; }
  .gd-knapp { width: auto !important; display: inline-flex !important; }
}
`;

type Lage = { typ: 'laddar' } | { typ: 'fel'; text: string } | { typ: 'saknas' } | { typ: 'klar'; d: GallringDetalj };

export default function Trakt({ vo }: { vo: string }) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });

  const ladda = useCallback(async () => {
    setLage({ typ: 'laddar' });
    try {
      const d = await hamtaGallring(vo);
      // "Hittades inte" och "kunde inte läsa" är olika svar och skrivs olika.
      setLage(d ? { typ: 'klar', d } : { typ: 'saknas' });
    } catch (e) {
      setLage({ typ: 'fel', text: e instanceof Error ? e.message : 'Kunde inte hämta trakten.' });
    }
  }, [vo]);

  useEffect(() => {
    ladda();
  }, [ladda]);

  return (
    <div className="gd" data-trakt={vo}>
      <style>{css}</style>
      {/* Vägen tillbaka finns alltid på smal skärm — också när trakten inte gick att läsa. På bred står listan bredvid. */}
      <Link href="/gallring" className="gr-bara-smal" style={{ ...KNAPP.lank, textDecoration: 'none', gap: AVSTAND.xs, marginBottom: AVSTAND.s }}>
        <Ikon namn="chevron_left" farg={FARG.bla} />
        Gallringar
      </Link>

      {lage.typ === 'laddar' && <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Hämtar trakten…</p>}
      {lage.typ === 'fel' && (
        <div>
          <p style={{ margin: 0, ...TYP.rubrik }}>Kunde inte läsa trakten</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>{lage.text}</p>
          <button type="button" onClick={ladda} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      )}
      {lage.typ === 'saknas' && (
        <div>
          <p style={{ margin: 0, ...TYP.rubrik }}>Ingen gallring med VO {vo}</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text2 }}>
            Objektet har en annan huvudtyp än Gallring, eller så har skördarens filer inte lästs in.
          </p>
        </div>
      )}
      {lage.typ === 'klar' && <Innehall d={lage.d} />}
    </div>
  );
}

function Innehall({ d }: { d: GallringDetalj }) {
  const [arkOppet, setArkOppet] = useState(false);
  const iAr = aktuelltAr();
  const medelstam = d.volymM3fub / Math.max(d.stammar, 1);
  const flerDagar = d.dagar.length > 1;
  const status = d.skordningAvslutad ? `Klar ${dagMan(d.skordningAvslutad)}` : 'Pågår';

  return (
    <>
      <header style={{ marginBottom: AVSTAND.xxl }} data-svar="">
        <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>VO {d.vo} · {status}</p>
        <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.rubrik, overflowWrap: 'anywhere' }}>{d.namn}</h1>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.tal }}>{fmtVolym(d.volymM3fub)} m³fub</p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }}>
          <Delar delar={[
            `${fmtAntal(d.stammar)} stammar`,
            `medelstam ${fmtDecimal(medelstam, 3)} m³`,
          ]} />
        </p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          <Delar delar={[traktSpann(d, iAr), dagarText(d.antalDagar), d.maskiner.join(', '), d.forare.join(', ')]} />
        </p>
        {/* Vyns EN handling. Kvittot går till markägaren och finns bara när skördningen är klar
            (dim_objekt.skordning_avslutad, maskinens eget slutdatum). Annars en rad som säger varför — ingen grå knapp. */}
        {d.skordningAvslutad ? (
          <Link href={`/gallring/${encodeURIComponent(d.vo)}/kvitto`} className="gd-knapp"
            style={{ ...KNAPP.primar, textDecoration: 'none', marginTop: AVSTAND.xl }} data-kvitto="">
            <Ikon namn="receipt_long" farg="inherit" />
            Skapa kvitto
          </Link>
        ) : (
          <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
            Kvitto kan skapas när skördningen är klar.
          </p>
        )}
      </header>

      <div className="gd-rutnat">
        <PerHektar d={d} />
        <Virket d={d} />
        <Grovlek d={d} />
        <div className="gd-bred"><Tradslag d={d} /></div>
        {flerDagar && <div className="gd-bred"><Dagar d={d} /></div>}
      </div>

      {/* Smal: trädslag och dagar ett tryck bort — en sak per skärm. */}
      <div className="gd-smal" style={{ background: FARG.kort, borderRadius: RADIE.kort, padding: `0 ${AVSTAND.l}px` }}>
        <Rad titel={flerDagar ? 'Trädslag och dagar' : 'Trädslag'} under={tradslagKort(d)} onTryck={() => setArkOppet(true)} sista
          attr={{ 'data-mer': '' }} />
      </div>

      {arkOppet && (
        <Ark rubrik={flerDagar ? 'Trädslag och dagar' : 'Trädslag'} stang="Klar" onStang={() => setArkOppet(false)}>
          <Tradslag d={d} iArk />
          {flerDagar && <Dagar d={d} iArk />}
        </Ark>
      )}
    </>
  );
}

/** "Gran 61 % · Tall 30 %" — de två största, så raden säger något utan att öppnas. */
function tradslagKort(d: GallringDetalj): string {
  const pct = procentSomSummerar(d.tradslag.map((t) => t.volym));
  return d.tradslag.slice(0, 2).map((t, i) => `${t.namn} ${pct[i]} %`).join(' · ');
}

// ---------------------------------------------------------------------------
// Frågorna
// ---------------------------------------------------------------------------

type PerHaLage = { typ: 'laddar' } | { typ: 'fel' } | { typ: 'klar'; p: PerHaLast };

const fmtPct = (andel: number) => `${Math.round(andel * 100)} %`;

/** Per hektar och stickvägar. Läses efter trakten (traktgräns, GPS-spår, varje stams position) — resten av
 *  trakten väntar aldrig på den. Talen och reglerna bor i lib/gallringPerHa.ts; här ritas de bara. */
function PerHektar({ d }: { d: GallringDetalj }) {
  const [lage, setLage] = useState<PerHaLage>({ typ: 'laddar' });
  const [kartaOppen, setKartaOppen] = useState(false);
  const [delningOppen, setDelningOppen] = useState(false);
  const [valdDel, setValdDel] = useState<DelNamn>('forsta');
  const ladda = useCallback(async (tyst = false) => {
    if (!tyst) setLage({ typ: 'laddar' });
    try {
      setLage({ typ: 'klar', p: await hamtaPerHa(d) });
    } catch {
      setLage({ typ: 'fel' });
    }
  }, [d]);
  useEffect(() => { ladda(); }, [ladda]);

  const rubrik = 'Hur hårt gallrades det?';
  if (lage.typ === 'laddar') {
    return (
      <Sektion rubrik={rubrik} inset>
        <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }}>Räknar per hektar…</p>
      </Sektion>
    );
  }
  if (lage.typ === 'fel') {
    return (
      <Sektion rubrik={rubrik} inset>
        <div style={{ padding: `${AVSTAND.l}px 0` }} data-perha-fel="">
          <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.text2 }}>Kunde inte räkna per hektar just nu.</p>
          <button type="button" onClick={() => ladda()} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      </Sektion>
    );
  }
  const p = lage.p;
  if (p.lage === 'ingen-grans') {
    return (
      <Sektion rubrik={rubrik} inset>
        <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }} data-perha-ingen-grans="">
          Vidas traktgräns saknas, så inget kan räknas per hektar.
        </p>
      </Sektion>
    );
  }

  const sv = p.stickvag;
  const yta = p.yta;
  const utanforHa = yta ? yta.utanfor.filter((b) => b.galler === 'gallring').reduce((s, b) => s + b.ha, 0) : 0;
  const ejHa = yta ? yta.ejGallrat.reduce((s, b) => s + b.ha, 0) : 0;
  const bitar = yta ? yta.utanfor.length + yta.ejGallrat.length : 0;
  const notDelar = [yta
    ? 'Per hektar räknas på marken som gallrades: Vidas gräns, plus gallring utanför den, minus mark som inte gallrats.'
    : `${fmtDecimal(p.arealHa, 1)} ha enligt Vidas traktgräns.`];
  if (p.andelUtanfor !== null && p.andelUtanfor >= UTANFOR_VISA_FRAN) {
    notDelar.push(`${fmtPct(p.andelUtanfor)} av stammarna står utanför (väg in eller enstaka träd) och räknas inte per hektar.`);
  }
  if (sv.lage === 'ok') notDelar.push(`Stickvägarna ur ${sv.roller.map(rollGenitiv).join(' och ')} GPS-spår, räknade 4 m breda.`);

  const ytaUnder = [
    `Vidas gräns ${fmtDecimal(p.vidaHa, 1)} ha`,
    utanforHa >= 0.05 ? `${fmtDecimal(utanforHa, 1)} ha utanför` : null,
    ejHa >= 0.05 ? `${fmtDecimal(ejHa, 1)} ha inte gallrat` : null,
  ].filter(Boolean).join(' · ');

  // Första och andra gallring: siffrorna per del, med en växel överst. Utan delning (en gallring) hela trakten.
  const delning = p.delning;
  const delIndex = valdDel === 'forsta' ? 0 : 1;
  const del = delning?.delar && p.delarPerHa ? { d: delning.delar[delIndex], ph: p.delarPerHa[delIndex] } : null;
  const visat = del
    ? { volym: del.ph.volymPerHa, stammar: del.ph.stammarPerHa, grundyta: del.ph.grundytaPerHa }
    : { volym: p.volymPerHa, stammar: p.stammarPerHa, grundyta: p.grundytaPerHa };

  // Kvar efter gallringen räknas på samma gallrade yta och samma uttag som raderna här — per del när trakten är delad.
  const skordStart = d.dagar.map((x) => x.datum).sort()[0];
  const kvar = yta && visat.grundyta !== null && skordStart
    ? <KvarEfter yta={yta} uttagPerHa={visat.grundyta} uttagStammarPerHa={visat.stammar} skordStart={skordStart}
        innehaller={del?.d.innehaller} delNamn={del ? DEL_ORD[del.d.namn] : undefined} />
    : null;

  return (
    <>
    <Sektion rubrik={rubrik} not={notDelar.join(' ')} inset>
      <div data-perha="">
        {yta && (
          <Rad titel="Gallrat" hoger={`${fmtDecimal(p.arealHa, 1)} ha`} under={ytaUnder}
            pil={bitar > 0} onTryck={() => setKartaOppen(true)} attr={{ 'data-gallrad-yta': '' }} />
        )}
        {delning && (
          <Rad titel={delning.svar === 'en' ? 'En gallring' : 'Första och andra gallring'}
            under={delning.svar ? `Du har svarat: ${delningGaller(delning).toLowerCase()}` : `${delningGaller(delning)} · appens förslag`}
            onTryck={() => setDelningOppen(true)} attr={{ 'data-delning': delning.svar ?? 'forslag' }} />
        )}
        {del && (
          <div style={{ padding: `${AVSTAND.m}px 0` }}>
            <Flikkontroll flikar={[['forsta', 'Första gallring'], ['andra', 'Andra gallring']] as const}
              aktiv={valdDel} onVal={setValdDel} />
          </div>
        )}
        {del && (
          <Rad titel="Yta" hoger={`${fmtDecimal(del.ph.arealHa, 1)} ha`} hogerUnder={`median ${fmtDecimal(del.d.medianDbhMm / 10, 1)} cm`}
            under={`${del.d.lage.charAt(0).toUpperCase()}${del.d.lage.slice(1)} i trakten`} attr={{ 'data-del-yta': del.d.namn }} />
        )}
        <Rad titel="Uttagen volym" hoger={`${fmtDecimal(visat.volym, 1)} m³fub/ha`} />
        <Rad titel="Uttagna stammar" hoger={`${fmtAntal(Math.round(visat.stammar))} st/ha`} attr={{ 'data-uttag-stammar': String(Math.round(visat.stammar)) }} />
        {visat.grundyta !== null && <Rad titel="Uttagen grundyta" hoger={`${fmtDecimal(visat.grundyta, 1)} m²/ha`} />}
        {sv.lage === 'ok' ? (
          <Rad titel="Stickvägar" hoger={`ca ${fmtPct(sv.andel)}`} hogerUnder={`ca ${Math.round(sv.avstandM)} m isär`} sista
            under={del ? 'Hela trakten' : undefined} attr={{ 'data-stickvag': 'ok' }} />
        ) : (
          <Rad titel="Stickvägar" hoger="–" sista attr={{ 'data-stickvag': sv.lage }}
            under={sv.lage === 'inget-spar' ? 'Inget GPS-spår från maskinerna än' : 'GPS-spåret täcker bara en del av trakten'} />
        )}
      </div>
      {kartaOppen && yta && (
        <GallradYtaArk yta={yta} svarSparas={p.svarSparas} onStang={() => setKartaOppen(false)}
          onSvar={async (nyckel, svar) => { await sparaYtaSvar(d.vo, nyckel, svar); await ladda(true); }} />
      )}
      {delningOppen && yta && delning && (
        <DelningArk yta={yta} delning={delning} arealHa={p.arealHa} svarSparas={p.svarSparas} onStang={() => setDelningOppen(false)}
          onSvar={async (svar, ritad) => { await sparaYtaSvar(d.vo, DELNING_NYCKEL, svar, ritad); await ladda(true); }} />
      )}
    </Sektion>
    {kvar}
    </>
  );
}

function rollGenitiv(roll: string): string {
  return roll === 'skordare' ? 'skördarens' : roll === 'skotare' ? 'skotarens' : `${roll}s`;
}

function Virket({ d }: { d: GallringDetalj }) {
  const grupper = sortimentGrupper(d.sortiment);
  if (grupper.length === 0) {
    return (
      <Sektion rubrik="Vad blev virket?" inset>
        <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }}>
          Sortimenten är inte inlästa för trakten.
        </p>
      </Sektion>
    );
  }
  const pct = procentSomSummerar(grupper.map((g) => g.volym));
  return (
    <Sektion rubrik="Vad blev virket?" not="Ju mörkare färg, desto mer värt." inset>
      <Stapel delar={grupper.map((g) => ({ nyckel: g.nyckel, andel: g.volym, farg: g.farg }))}
        etikett={grupper.map((g, i) => `${g.namn} ${pct[i]} %`).join(', ')} />
      {grupper.map((g, i) => (
        <Rad key={g.nyckel} titel={<MedPrick farg={g.farg}>{g.namn}</MedPrick>}
          under={<Indrag>{fmtAntal(g.stockar)} {g.stockar === 1 ? 'stock' : 'stockar'}</Indrag>}
          hoger={`${fmtVolym(g.volym)} m³`} hogerUnder={`${pct[i]} %`} sista={i === grupper.length - 1} />
      ))}
    </Sektion>
  );
}

function Grovlek({ d }: { d: GallringDetalj }) {
  const dia = d.diameter;
  if (!dia) {
    return (
      <Sektion rubrik="Hur grovt gallrades det?" inset>
        <p style={{ margin: 0, padding: `${AVSTAND.l}px 0`, ...TYP.text, color: FARG.text2 }}>
          Inga stammar med mätt diameter är inlästa, så grovleken kan inte visas.
        </p>
      </Sektion>
    );
  }
  const max = Math.max(...dia.klasser.map((k) => k.antal), 1);
  const saknade = d.stammar - dia.matta;
  // Luckorna i detalj_stam redovisas öppet (lib/gallring.ts) — bara när de finns.
  const not = saknade > 0
    ? `Bygger på ${fmtAntal(dia.matta)} av ${fmtAntal(d.stammar)} stammar – resten saknar diameter i filen.`
    : 'Brösthöjdsdiameter i 2 cm-klasser. Dgv = grundytevägd medeldiameter.';
  return (
    <Sektion rubrik="Hur grovt gallrades det?" not={not} inset>
      <div style={{ padding: `${AVSTAND.l}px 0` }}>
        <p style={{ margin: 0, ...TYP.rubrik, ...TNUM }}>Dgv {fmtDecimal(dia.dgvMm / 10, 1)} cm</p>
        <div role="img" aria-label={dia.klasser.map((k) => `${klassLabel(k)} cm: ${k.antal}`).join(', ')}
          style={{ display: 'flex', alignItems: 'flex-end', gap: AVSTAND.xs, height: HISTOGRAM_HOJD_PX, marginTop: AVSTAND.l }}>
          {dia.klasser.map((k) => (
            <div key={k.franMm} style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
              <span style={{ ...TYP.micro, ...TNUM, color: FARG.text2, marginBottom: AVSTAND.xs }}>{k.antal || ''}</span>
              <div style={{ width: '100%', height: `${(k.antal / max) * 100}%`, minHeight: k.antal > 0 ? 2 : 0, background: FARG.text2, borderRadius: `${RADIE.stapel}px ${RADIE.stapel}px 0 0` }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: AVSTAND.xs, marginTop: AVSTAND.xs }}>
          {dia.klasser.map((k) => (
            // Bara klassens början ("12" = 12–14 cm): hela spannet ryms inte under tolv staplar i en halv kolumn.
            <span key={k.franMm} style={{ flex: 1, minWidth: 0, textAlign: 'center', ...TYP.micro, ...TNUM, color: FARG.text2, whiteSpace: 'nowrap' }}>
              {k.tillMm === null ? `${k.franMm / 10}+` : k.franMm / 10}
            </span>
          ))}
        </div>
      </div>
    </Sektion>
  );
}

function Tradslag({ d, iArk }: { d: GallringDetalj; iArk?: boolean }) {
  const pct = procentSomSummerar(d.tradslag.map((t) => t.volym));
  const delar = d.tradslag.map((t, i) => ({ nyckel: t.namn, andel: t.volym, farg: tradslagStil(t.namn, i).fyll, kontur: tradslagStil(t.namn, i).kontur }));
  return (
    <Sektion rubrik="Vilka träd togs ut?" kort={!iArk} not="Andel av volymen." inset={!iArk}>
      <Stapel delar={delar} etikett={d.tradslag.map((t, i) => `${t.namn} ${pct[i]} %`).join(', ')} />
      {d.tradslag.map((t, i) => (
        <Rad key={t.namn} titel={<MedPrick farg={delar[i].farg} kontur={delar[i].kontur}>{t.namn}</MedPrick>}
          under={<Indrag>{fmtAntal(t.stammar)} stammar</Indrag>}
          hoger={`${fmtVolym(t.volym)} m³`} hogerUnder={`${pct[i]} %`} sista={i === d.tradslag.length - 1} />
      ))}
    </Sektion>
  );
}

function Dagar({ d, iArk }: { d: GallringDetalj; iArk?: boolean }) {
  return (
    <Sektion rubrik="Uttag per dag" kort={!iArk} inset={!iArk}>
      {d.dagar.map((dag, i) => (
        <Rad key={dag.datum} titel={veckodagDag(dag.datum)} hoger={`${fmtVolym(dag.volym)} m³`}
          hogerUnder={`${fmtAntal(dag.stammar)} st`} sista={i === d.dagar.length - 1} />
      ))}
    </Sektion>
  );
}

// ---------------------------------------------------------------------------
// Små delar
// ---------------------------------------------------------------------------

/** Delarna av en helhet. Färgen bär aldrig ensam: raderna under har ordet och talet. */
function Stapel({ delar, etikett }: { delar: { nyckel: string; andel: number; farg: string; kontur?: string | null }[]; etikett: string }) {
  return (
    <div role="img" aria-label={etikett}
      style={{ display: 'flex', gap: AVSTAND.xs, height: AVSTAND.l, borderRadius: RADIE.stapel, overflow: 'hidden', margin: `${AVSTAND.l}px 0 ${AVSTAND.xs}px`, outline: `1px solid ${FARG.linje}` }}>
      {delar.map((d) => <div key={d.nyckel} style={{ flex: `${d.andel} 1 0`, minWidth: AVSTAND.xs, background: d.farg }} />)}
    </div>
  );
}

function MedPrick({ farg, kontur, children }: { farg: string; kontur?: string | null; children: React.ReactNode }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.m }}>
      <span aria-hidden="true" style={{
        display: 'inline-block', width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0,
        boxShadow: `0 0 0 1px ${kontur ?? FARG.linje}`,
      }} />
      {children}
    </span>
  );
}

/** Fakta åtskilda av " · ". Raden bryts bara MELLAN delarna — aldrig mitt i "932 st/ha". */
function Delar({ delar }: { delar: string[] }) {
  return (
    <>
      {delar.filter(Boolean).map((del, i) => (
        <span key={i}>{i > 0 && ' · '}<span style={{ whiteSpace: 'nowrap' }}>{del}</span></span>
      ))}
    </>
  );
}

/** Raden under en rad med prick linjerar med namnet, inte med pricken. */
function Indrag({ children }: { children: React.ReactNode }) {
  return <span style={{ paddingLeft: AVSTAND.m + AVSTAND.m }}>{children}</span>;
}
