'use client';
// Serviceloggen — EN vy för listan och maskinen, på appens byggstenar (lib/design/tokens + components/design).
//
// Bredd (samma regel som resten av appen, se CLAUDE.md "Bredd — Kolumnen"):
//  - under BRED_PX: en sak per skärm — listan på /maskin-service, maskinen på /maskin-service/<id>, i KOLUMN.smal;
//  - från BRED_PX (iPad liggande, dator): listan står fast till vänster och vald maskin till höger, allt i KOLUMN.bred.
// Arket "Ny åtgärd" är appens Ark: nerifrån på alla bredder (ingen karta att täcka, som Arbetsrapport).
//
// All tolkning av posterna (typ, svensk rubrik, ihopslagning, datumtext) ligger i lib/servicelogg.ts.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { hamtaAlla } from '@/lib/supabaseAlla';
import { HjulValjare } from './HjulValjare';
import { DIM_MASKIN_NAMN_KOLUMNER, maskinSlag, maskinVisningsnamn } from '@/lib/maskinNamn';
import {
  AVSTAND, FARG, FONT, INAKTIV, KNAPP, KOLUMN, KOLUMN_CSS, RADIE, ROT_MIN_HOJD, TNUM, TRAFFYTA, TYP, VIKT,
  designCss, kolumnRot, medSafeBotten,
} from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Flikkontroll from '@/components/design/Flikkontroll';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import {
  datumText, langdText, lokalDag, maskinSvar, manadRubrik, nyPost, perManad, radUnder, saknas, senastText, slaIhop,
  type Rad as LoggRad, type ServicePost, type Typ,
  bandPlats,
} from '@/lib/servicelogg';

/** Från den här bredden står listan och maskinen bredvid varandra (iPad liggande 1180, dator). */
export const BRED_PX = 1000;
/** Listans bredd när den står bredvid maskinen. */
const LISTA_PX = 340;
/** Så många månader visas innan "Visa alla". */
const MANADER_FORST = 3;

type Maskin = { id: string; maskinId: string; namn: string; slag: 'skordare' | 'skotare' | null };
type Data = { maskiner: Maskin[]; poster: ServicePost[] };

// Senast lästa data ligger kvar mellan sidbytena (lista ↔ maskin) så ingenting blinkar; den läses alltid om.
let cache: Data | null = null;

function useBred(): boolean {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mq = window.matchMedia(`(min-width: ${BRED_PX}px)`);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(`(min-width: ${BRED_PX}px)`).matches),
    () => false,
  );
}

async function lasData(): Promise<Data> {
  const [m, dim, s] = await Promise.all([
    supabase.from('maskiner').select('id, maskin_id, namn').eq('aktiv', true),
    supabase.from('dim_maskin').select(DIM_MASKIN_NAMN_KOLUMNER),
    hamtaAlla<ServicePost>(() => supabase.from('maskin_service').select('*') as any, 'id'),
  ]);
  if (m.error) throw m.error;
  if (dim.error) throw dim.error;
  if (s.error) throw s.error;
  const dimPer = new Map((dim.data ?? []).map((d: any) => [d.maskin_id, d]));
  const maskiner = (m.data ?? []).map((x: any): Maskin => {
    const d = dimPer.get(x.maskin_id);
    return { id: x.id, maskinId: x.maskin_id, namn: (d && maskinVisningsnamn(d as any)) || x.namn || x.maskin_id, slag: maskinSlag((d as any)?.maskin_typ) };
  }).sort((a, b) => a.namn.localeCompare(b.namn, 'sv'));
  return { maskiner, poster: s.data };
}

export default function ServiceVy({ valdId }: { valdId: string | null }) {
  const bred = useBred();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(cache);
  const [fel, setFel] = useState(false);
  const [arkOppet, setArkOppet] = useState(false);
  const idag = lokalDag(new Date());

  const las = useCallback(async () => {
    setFel(false);
    try {
      const d = await lasData();
      cache = d;
      setData(d);
    } catch (e) {
      console.error('[servicelogg] kunde inte läsa', e);
      setFel(true);
    }
  }, []);
  useEffect(() => { las(); }, [las]);

  const raderPer = useMemo(() => {
    const ut = new Map<string, LoggRad[]>();
    if (!data) return ut;
    const per = new Map<string, ServicePost[]>();
    for (const p of data.poster) (per.get(p.maskin_id) ?? per.set(p.maskin_id, []).get(p.maskin_id)!).push(p);
    for (const m of data.maskiner) ut.set(m.id, slaIhop(per.get(m.id) ?? []));
    return ut;
  }, [data]);

  const vald = data?.maskiner.find(m => m.id === valdId) ?? null;

  const rot = (bredd: 'smal' | 'bred') => ({
    ...kolumnRot(bredd), minHeight: ROT_MIN_HOJD, background: FARG.bg, color: FARG.text, fontFamily: FONT,
    padding: `0 ${AVSTAND.sidmarginal}px`, display: 'flex', flexDirection: 'column' as const,
  });
  const stil = <style>{designCss + KOLUMN_CSS}</style>;

  if (!data) {
    return (
      <div style={rot('smal')}>
        {stil}
        <div role="status" style={{ ...TYP.text, color: FARG.text2, padding: `${AVSTAND.xl}px 0` }}>
          {fel ? <FelRad onIgen={las} /> : 'Läser serviceloggen…'}
        </div>
      </div>
    );
  }

  const lista = (
    <Lista maskiner={data.maskiner} raderPer={raderPer} idag={idag} valdId={bred ? valdId : null}
      onVal={bred ? (id) => router.replace(`/maskin-service/${id}`, { scroll: false }) : undefined} />
  );

  const maskinVy = valdId == null ? null : vald ? (
    <MaskinVy maskin={vald} rader={raderPer.get(vald.id) ?? []} idag={idag} visaTillbaka={!bred} onNy={() => setArkOppet(true)} />
  ) : (
    <div style={{ padding: `${AVSTAND.xl}px 0` }}>
      <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Maskinen finns inte i serviceloggen.</p>
      <Link href="/maskin-service" style={{ ...KNAPP.lank, textDecoration: 'none' }}>‹ Alla maskiner</Link>
    </div>
  );

  const ark = arkOppet && vald && (
    <NyAtgardArk maskin={vald} idag={idag} onStang={() => setArkOppet(false)} onSparad={async () => { setArkOppet(false); await las(); }} />
  );

  if (bred) {
    return (
      <div style={{ ...rot('bred'), flexDirection: 'row', gap: AVSTAND.xxl }}>
        {stil}
        <nav aria-label="Maskiner" style={{ width: LISTA_PX, flexShrink: 0, paddingTop: AVSTAND.l }}>
          {fel && <FelRad onIgen={las} />}
          {lista}
        </nav>
        <section style={{ flex: 1, minWidth: 0, maxWidth: KOLUMN.smal, display: 'flex', flexDirection: 'column', paddingTop: AVSTAND.l }}>
          {maskinVy ?? <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xl}px 0 0` }}>Välj en maskin.</p>}
        </section>
        {ark}
      </div>
    );
  }

  return (
    <div style={rot('smal')}>
      {stil}
      {fel && <FelRad onIgen={las} />}
      <div style={{ paddingTop: AVSTAND.l, display: 'flex', flexDirection: 'column', flex: 1 }}>
        {valdId == null ? lista : maskinVy}
      </div>
      {ark}
    </div>
  );
}

function FelRad({ onIgen }: { onIgen: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.text, color: FARG.orange }}>
      Kunde inte läsa serviceloggen.
      <button type="button" onClick={onIgen} style={KNAPP.lank}>Försök igen</button>
    </div>
  );
}

const SLAG_RUBRIK: Record<string, string> = { skordare: 'Skördare', skotare: 'Skotare', ovriga: 'Övriga' };

function Lista({ maskiner, raderPer, idag, valdId, onVal }: {
  maskiner: Maskin[]; raderPer: Map<string, LoggRad[]>; idag: string; valdId: string | null; onVal?: (id: string) => void;
}) {
  const grupper = (['skordare', 'skotare', 'ovriga'] as const)
    .map(slag => ({ slag, maskiner: maskiner.filter(m => (m.slag ?? 'ovriga') === slag) }))
    .filter(g => g.maskiner.length > 0);
  if (maskiner.length === 0) {
    return <p style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Inga aktiva maskiner. Maskiner läggs till i Admin.</p>;
  }
  return (
    <div data-servicelogg-lista="">
      {grupper.map(g => (
        <Sektion key={g.slag} rubrik={SLAG_RUBRIK[g.slag]}>
          {g.maskiner.map((m, i) => {
            const rader = raderPer.get(m.id) ?? [];
            const sista = i === g.maskiner.length - 1;
            const rad = (
              <Rad titel={m.namn} under={senastText(rader, idag)} hoger={rader.length > 0 ? rader.length : undefined} sista={sista}
                {...(onVal ? { onTryck: () => onVal(m.id) } : { href: `/maskin-service/${m.id}` })}
                attr={{ 'data-maskin': m.id, ...(m.id === valdId ? { 'aria-current': 'page' } : {}) }} />
            );
            return m.id === valdId
              ? <div key={m.id} style={{ background: FARG.fyllning, margin: `0 -${AVSTAND.l}px`, padding: `0 ${AVSTAND.l}px`, borderRadius: RADIE.rad }}>{rad}</div>
              : <div key={m.id}>{rad}</div>;
          })}
        </Sektion>
      ))}
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 ${AVSTAND.xs}px ${AVSTAND.xl}px` }}>
        Talet till höger är antal poster. Det mesta kommer in av sig självt från maskinerna.
      </p>
    </div>
  );
}

function MaskinVy({ maskin, rader, idag, visaTillbaka, onNy }: {
  maskin: Maskin; rader: LoggRad[]; idag: string; visaTillbaka: boolean; onNy: () => void;
}) {
  const [allt, setAllt] = useState(false);
  useEffect(() => { setAllt(false); }, [maskin.id]);
  const grupper = perManad(rader);
  const visade = allt ? grupper : grupper.slice(0, MANADER_FORST);
  const dolda = grupper.slice(visade.length).reduce((s, g) => s + g.rader.length, 0);
  const svar = maskinSvar(rader, idag);
  const iAr = +idag.slice(0, 4);

  return (
    <div data-servicelogg-maskin={maskin.id} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      {visaTillbaka && (
        <Link href="/maskin-service" style={{ ...KNAPP.lank, textDecoration: 'none', alignSelf: 'flex-start' }}>‹ Alla maskiner</Link>
      )}
      <h1 style={{ ...TYP.titel, margin: 0 }}>{maskin.namn}</h1>
      {rader.length > 0 && <Svarsrad rubrik={svar.rubrik} rad={svar.rad} />}

      {rader.length === 0 ? (
        <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.xl}px 0` }}>
          Inget registrerat än. Stopp som föraren anger i maskinen kommer in av sig självt; service och annat lägger du till här.
        </p>
      ) : (
        <div>
          {visade.map(g => (
            <Sektion key={g.manad} rubrik={manadRubrik(g.manad, iAr)}>
              {g.rader.map((r, i) => (
                <Rad key={r.id} titel={r.rubrik} under={radUnder(r)} hoger={datumText(r.datum, idag)}
                  hogerUnder={langdText(r.langdSek) ?? undefined} sista={i === g.rader.length - 1} attr={{ 'data-post': r.id }} />
              ))}
            </Sektion>
          ))}
          {dolda > 0 && (
            <button type="button" onClick={() => setAllt(true)} style={{ ...KNAPP.lank, marginBottom: AVSTAND.xl }}>
              Visa alla {rader.length} poster
            </button>
          )}
        </div>
      )}

      <div style={{ position: 'sticky', bottom: 0, marginTop: 'auto', background: FARG.bg, padding: `${AVSTAND.m}px 0 ${medSafeBotten(AVSTAND.xl)}` }}>
        <button type="button" onClick={onNy} style={KNAPP.primar}>Ny åtgärd</button>
      </div>
    </div>
  );
}

const BAND_PA_AV: readonly (readonly ['pa' | 'av', string])[] = [['pa', 'Satt på'], ['av', 'Tog av']];
const TYPER: readonly (readonly [Typ, string])[] = [['service', 'Service'], ['reparation', 'Reparation'], ['band', 'Band'], ['dack', 'Däck']];

const faltStil = {
  width: '100%', boxSizing: 'border-box' as const, background: FARG.fyllning, border: 'none', outline: 'none',
  borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
  minHeight: TRAFFYTA.min, colorScheme: 'dark' as const,
};
const etikett = { display: 'block', ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs };

function NyAtgardArk({ maskin, idag, onStang, onSparad }: { maskin: Maskin; idag: string; onStang: () => void; onSparad: () => void }) {
  const [typ, setTyp] = useState<Typ>('service');
  const [beskrivning, setBeskrivning] = useState('');
  const [datum, setDatum] = useState(idag);
  const [timmar, setTimmar] = useState('');
  const [hjul, setHjul] = useState<string | null>(null);
  const [bandPa, setBandPa] = useState(true);
  const [bandFram, setBandFram] = useState(false);
  const [bandBak, setBandBak] = useState(false);
  const band = { pa: bandPa, plats: bandPlats(bandFram, bandBak) };
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const kvar = saknas(typ, { beskrivning, datum, timmar, hjul, band });
  const kanSpara = kvar.length === 0 && !sparar;

  const spara = async () => {
    if (!kanSpara) return;
    setSparar(true);
    setFel(null);
    const t = Number(timmar.replace(',', '.'));
    const rad = { maskin_id: maskin.id, ...nyPost(typ, { beskrivning, datum, timmar: typ === 'service' ? t : null, hjul, band }) };
    const { error } = await supabase.from('maskin_service').insert(rad);
    setSparar(false);
    if (error) {
      console.error('[servicelogg] kunde inte spara', error);
      setFel('Kunde inte spara. Kontrollera täckningen och försök igen.');
      return;
    }
    onSparad();
  };

  const fot = (
    <>
      {fel && <div role="alert" style={{ ...TYP.meta, color: FARG.orange }}>{fel}</div>}
      <button type="button" onClick={spara} disabled={!kanSpara} aria-disabled={!kanSpara}
        style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
        {sparar ? 'Sparar…' : 'Spara'}
      </button>
      {kvar.length > 0 && <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>Fyll i {kvar.join(' och ')}</div>}
    </>
  );

  return (
    <Ark rubrik={`Ny åtgärd · ${maskin.namn}`} onStang={onStang} fot={fot}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <Flikkontroll flikar={TYPER} aktiv={typ} onVal={setTyp} />

        {typ === 'dack' && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
            <legend style={etikett}>Vilket hjul · sett från förarstolen</legend>
            <HjulValjare lage="hjul" valt={hjul} onVal={setHjul} skotare={maskin.slag === 'skotare'} />
          </fieldset>
        )}

        {typ === 'band' && (
          <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
            <legend style={etikett}>Var sitter bandet · tryck fram, bak eller båda</legend>
            <Flikkontroll flikar={BAND_PA_AV} aktiv={bandPa ? 'pa' : 'av'} onVal={v => setBandPa(v === 'pa')} />
            <HjulValjare lage="band" fram={bandFram} bak={bandBak} skotare={maskin.slag === 'skotare'}
              onBand={ande => (ande === 'fram' ? setBandFram(x => !x) : setBandBak(x => !x))} />
          </fieldset>
        )}

        <div>
          <label htmlFor="sl-vad" style={etikett}>{typ === 'band' ? 'Kommentar · valfritt' : 'Vad gjordes'}</label>
          <textarea id="sl-vad" rows={3} value={beskrivning} onChange={e => setBeskrivning(e.target.value)}
            style={{ ...faltStil, resize: 'none', lineHeight: 1.3 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: typ === 'service' ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: AVSTAND.m }}>
          <div>
            <label htmlFor="sl-datum" style={etikett}>Datum</label>
            <input id="sl-datum" type="date" value={datum} max={idag} onChange={e => setDatum(e.target.value)} style={faltStil} />
          </div>
          {typ === 'service' && (
            <div>
              <label htmlFor="sl-tim" style={etikett}>Timmätaren</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.rad, paddingRight: AVSTAND.l }}>
                <input id="sl-tim" inputMode="decimal" value={timmar} onChange={e => setTimmar(e.target.value)} autoComplete="off"
                  style={{ ...faltStil, background: 'none', ...TNUM }} />
                <span style={{ ...TYP.meta, color: FARG.text2 }}>h</span>
              </div>
            </div>
          )}
        </div>
        {typ === 'service' && (
          <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Skriv det maskinens timmätare visar, så går det att se när nästa service är.</p>
        )}
      </div>
    </Ark>
  );
}
