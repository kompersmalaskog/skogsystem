'use client';
// EN meny för uppföljningen — samma komponent på telefon/landningssidan
// (full) och i sidokolumnen på stor skärm (kompakt). Ersätter både den gamla
// indexsidans egen layout och UppfoljningSidolista, så det bara finns ETT
// ställe att underhålla och designen är lika överallt.
//
// Logiken (sektionsindelning, kort-summor, på-backen-urval, ris-schablon,
// avslutade) är IDENTISK med gamla indexsidan — bara flyttad hit och klädd i
// design-tokens. Så siffrorna är desamma som "innan", bara ny look.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, RADIE, TNUM, TRAFFYTA, TYP, overgang } from '@/lib/design/tokens';
import { typLabel, arRisjobb } from '@/lib/objekt/typ';
import { uppskattaGrotM3fub, klampaGrotFaktor, GROT_UTTAGSFAKTOR_DEFAULT, GROT_UTTAGSFAKTOR_MIN, GROT_UTTAGSFAKTOR_MAX } from '@/lib/grot';
import { type UppfoljningObjekt } from './lib/transform';
import { risLage, risLista, risKvarM3, HAMTAT_VISAS_DAGAR } from './lib/ris';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';
import { liggetidText as liggetid } from './lib/liggetid';
import { langstLegat, dagOrd } from './lib/iSkogen';
import { skogenAvObjekt } from './lib/iSkogenSida';
import { kvarM3, sektionAv, type Sektion } from './lib/sektion';
import { svenskIdag } from './lib/datum';

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');
const TRAFFYTA_ROW = 56;

// Avslutningsdatum för månadsgruppering (senaste vi har).
function klartDatum(o: UppfoljningObjekt): string | null {
  return o.skotareSlut || o.skordareSlut || o.sistaAvverkning || null;
}

// Liggetid ur sista avverkningsdag (lib/liggetid: samma regel som detaljvyn).
function liggetidText(o: UppfoljningObjekt): string {
  return liggetid(o.sistaAvverkning, Date.now());
}

type Vald = 'slutavverkning' | 'gallring' | 'ris' | null;
type Grupp = { namn: string | null; objs: UppfoljningObjekt[]; summa: number };
type Manad = { key: string; label: string; objs: UppfoljningObjekt[] };

export default function UppfoljningMeny({ valt = null }: { valt?: string | null }) {
  const router = useRouter();
  const { objekt, loading, error, forsokIgen } = useUppfoljningList();

  const [vald, setVald] = useState<Vald>(null);
  const [sok, setSok] = useState('');
  const [visaAvslutade, setVisaAvslutade] = useState(false);
  const [visaFaktor, setVisaFaktor] = useState(false);
  const [grotFaktor, setGrotFaktor] = useState(GROT_UTTAGSFAKTOR_DEFAULT);

  // Samma sessionStorage-nycklar som förut → valet/söket/faktorn följer med
  // mellan indexsidan och sidokolumnen.
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('uppfoljning:vald');
      if (v !== null) { const p = JSON.parse(v); setVald(p === 'skogen' ? null : p); } // 'skogen' var ett läge innan sidan fanns
      const s = sessionStorage.getItem('uppfoljning:sok');
      if (s !== null) setSok(JSON.parse(s));
      const gf = sessionStorage.getItem('uppfoljning:grotFaktor');
      if (gf !== null) setGrotFaktor(klampaGrotFaktor(JSON.parse(gf)));
    } catch { /* ingen sparad vy → default */ }
  }, []);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:vald', JSON.stringify(vald)); } catch {} }, [vald]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:sok', JSON.stringify(sok)); } catch {} }, [sok]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:grotFaktor', JSON.stringify(grotFaktor)); } catch {} }, [grotFaktor]);

  const matchSok = (o: UppfoljningObjekt) => {
    const t = sok.trim().toLowerCase();
    return !t || o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t);
  };
  const matchTyp = (o: UppfoljningObjekt) =>
    vald === 'slutavverkning' ? o.typ === 'slutavverkning'
    : vald === 'gallring' ? o.typ === 'gallring'
    : vald === 'ris' ? arRisjobb(o)
    : true;

  // Sektioner — varje objekt i EXAKT en (invarianten från indexsidan).
  const sektioner = useMemo(() => {
    const b: Record<Sektion, UppfoljningObjekt[]> = { skordare: [], oskotat: [], ovrigt: [], avslutade: [] };
    for (const o of objekt) b[sektionAv(o)].push(o);
    return b;
  }, [objekt]);

  // Ris att skota (lib/ris): kvar = inget lass än eller skotas nu; hämtat = grot_hamtad satt.
  const idag = svenskIdag();
  const ris = useMemo(() => risLista(objekt, grotFaktor, idag), [objekt, grotFaktor, idag]);

  // Kort-summor — TOTALEN på backen per typ (inkl. pågående skörd). Virke = mätt
  // kvar (skördat − skotat); ris = schablon. Ärlig nolla: ingen typ → kortet "—".
  const kort = useMemo(() => {
    let sM3 = 0, sN = 0, gM3 = 0, gN = 0;
    for (const o of [...sektioner.skordare, ...sektioner.oskotat]) {
      if (arRisjobb(o) || kvarM3(o) <= 0) continue;
      if (o.typ === 'gallring') { gM3 += kvarM3(o); gN++; } else { sM3 += kvarM3(o); sN++; }
    }
    const risM3 = ris.kvar.reduce((a, o) => a + risKvarM3(o, grotFaktor), 0);
    return { sM3, sN, gM3, gN, risM3, risN: ris.kvar.length };
  }, [sektioner, ris, grotFaktor]);

  // På-backen-virke (oskotat + pågående skörd), filtrerat på valt kort + sök.
  const paBackenVirke = useMemo(() => [...sektioner.skordare, ...sektioner.oskotat].filter(o => !arRisjobb(o) && kvarM3(o) > 0), [sektioner]);
  const skordasSet = useMemo(() => new Set(sektioner.skordare), [sektioner]);
  const uppdelning = useMemo(() => paBackenVirke.filter(o => matchTyp(o) && matchSok(o)), [paBackenVirke, vald, sok]);

  // Per skotare (= per maskin): grupperat på tilldelad skotare, mest överst.
  const grupper = useMemo<Grupp[]>(() => {
    const m = new Map<string, UppfoljningObjekt[]>();
    for (const o of uppdelning) { const k = o.tilldeladSkotare || ' ej'; if (!m.has(k)) m.set(k, []); m.get(k)!.push(o); }
    const lista = Array.from(m.entries()).map(([namn, objs]) => ({
      namn: namn === ' ej' ? null : namn,
      objs: objs.slice().sort((a, b) => {
        const sa = skordasSet.has(a), sb = skordasSet.has(b);
        if (sa !== sb) return sa ? 1 : -1; // oskotade först, skördas-ännu sist
        if (!a.sistaAvverkning) return 1;
        if (!b.sistaAvverkning) return -1;
        return a.sistaAvverkning.localeCompare(b.sistaAvverkning);
      }),
      summa: objs.reduce((s, o) => s + kvarM3(o), 0),
    }));
    lista.sort((a, b) => (a.namn === null ? 1 : b.namn === null ? -1 : b.summa - a.summa));
    return lista;
  }, [uppdelning, skordasSet]);

  // Ligger i skogen (lib/iSkogen): allt virke som skördas eller ligger kvar, oavsett typ och skotare.
  // Samma urval som sidan /uppfoljning/i-skogen (EN funktion, lib/iSkogenSida).
  const skogen = useMemo(() => skogenAvObjekt(objekt, Date.now()).skogen, [objekt]);
  const skogenLangst = useMemo(() => langstLegat(skogen.rader), [skogen]);

  const risSynlig = useMemo(() => ris.kvar.filter(matchSok), [ris, sok]);
  const risHamtatSynlig = useMemo(() => ris.hamtat.filter(matchSok), [ris, sok]);
  const [visaHamtat, setVisaHamtat] = useState(false);

  // Avslutade (filtrerat på kort + sök) grupperat per månad, nyast överst.
  const manader = useMemo<Manad[]>(() => {
    const avsl = sektioner.avslutade.filter(o => matchTyp(o) && matchSok(o));
    const mm = new Map<string, UppfoljningObjekt[]>();
    for (const o of avsl) {
      const d = klartDatum(o);
      const key = d ? d.slice(0, 7) : 'okänt';
      if (!mm.has(key)) mm.set(key, []);
      mm.get(key)!.push(o);
    }
    return Array.from(mm.entries())
      .map(([key, objs]) => ({
        key,
        label: key === 'okänt' ? 'Utan datum' : new Date(key + '-01').toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }),
        objs: objs.slice().sort((a, b) => (klartDatum(b) || '').localeCompare(klartDatum(a) || '')),
      }))
      .sort((a, b) => (a.key === 'okänt' ? 1 : b.key === 'okänt' ? -1 : b.key.localeCompare(a.key)));
  }, [sektioner, vald, sok]);
  const antalAvslutade = useMemo(() => manader.reduce((s, m) => s + m.objs.length, 0), [manader]);

  const steg = (d: number) => setGrotFaktor(klampaGrotFaktor(Math.round((grotFaktor + d) * 100) / 100));
  const faktorStr = grotFaktor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const aktivFor = (o: UppfoljningObjekt) => valt != null && urlIdFor(o) === valt;
  const oppna = (o: UppfoljningObjekt) => { const id = urlIdFor(o); if (id) router.push(`/uppfoljning/${encodeURIComponent(id)}`); };

  // ── En objektrad ──
  const rad = (o: UppfoljningObjekt, hoger: 'kvar' | 'volym' | 'schablon' | { tal: string; enhet: string } | null, under?: string, underFarg?: string) => {
    const aktiv = aktivFor(o);
    const annu = skordasSet.has(o);
    const undertext = under ?? (annu ? 'skördas ännu' : liggetidText(o));
    return (
      <button
        key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer}
        onClick={() => oppna(o)}
        aria-current={aktiv ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA_ROW,
          padding: `${AVSTAND.m}px ${AVSTAND.m}px`, textAlign: 'left', cursor: 'pointer',
          border: 'none', background: aktiv ? FARG.upphojt : 'transparent',
          borderRadius: aktiv ? RADIE.rad : 0, color: FARG.text, fontFamily: 'inherit',
        }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', ...TYP.listtitel, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</span>
          <span style={{ display: 'block', ...TYP.meta, color: underFarg ?? (annu ? FARG.gron : FARG.text2), marginTop: AVSTAND.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{undertext}</span>
          {o.skotareAvvikelse && (
            <span style={{ display: 'block', ...TYP.micro, color: FARG.text3, marginTop: AVSTAND.xs, textTransform: 'none', letterSpacing: 0 }}>Skotad av {o.skotareAvvikelse.lass} · tilldelad {o.skotareAvvikelse.tilldelad}</span>
          )}
        </span>
        {hoger === null ? null : typeof hoger === 'object' ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.listtitel }}>{hoger.tal}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>{hoger.enhet}</span>
          </span>
        ) : hoger === 'kvar' ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.listtitel }}>{sv(kvarM3(o))}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>kvar m³</span>
          </span>
        ) : hoger === 'schablon' ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.meta, color: FARG.text2, fontWeight: 700 }}>≈</span>
            <span style={{ ...TYP.listtitel }}>{sv(uppskattaGrotM3fub(o.volymSkordare, grotFaktor) || 0)}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>m³fub</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.listtitel, color: FARG.text2 }}>{sv(arRisjobb(o) ? o.volymSkotare : o.volymSkordare)}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>{arRisjobb(o) ? 'm³ ris' : 'm³'}</span>
          </span>
        )}
      </button>
    );
  };

  // ── Typ-kort (klickbara filter) ──
  const kortData: { nyckel: Vald; label: string; m3: number; n: number; schablon?: boolean }[] = [
    { nyckel: 'slutavverkning', label: 'Slutavv.', m3: kort.sM3, n: kort.sN },
    { nyckel: 'gallring', label: 'Gallring', m3: kort.gM3, n: kort.gN },
    { nyckel: 'ris', label: 'Grot', m3: kort.risM3, n: kort.risN, schablon: true },
  ];

  const innehall = (
    <>
      <h1 style={{ ...TYP.titel, margin: `0 ${AVSTAND.m}px ${AVSTAND.m}px` }}>Uppföljning</h1>

      <div style={{ padding: `0 ${AVSTAND.m}px ${AVSTAND.m}px` }}>
        <input
          value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök objekt" inputMode="search" autoComplete="off"
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`,
            background: FARG.fyllning, border: 'none', outline: 'none', borderRadius: RADIE.rad,
            color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark',
          }}
        />
      </div>

      {loading ? (
        <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Läser objekt …</div>
      ) : error ? (
        <div style={{ padding: `${AVSTAND.l}px ${AVSTAND.m}px` }}>
          <div style={{ ...TYP.listtitel, color: FARG.orange }}>Kunde inte läsa objekten</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Kontrollera anslutningen.</div>
          <button onClick={forsokIgen} style={{ marginTop: AVSTAND.s, minHeight: TRAFFYTA.min, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.meta, color: FARG.bla }}>Försök igen</button>
        </div>
      ) : (
        <>
          {/* Typ-kort — klickbara filter (som gamla SummaKort). */}
          <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>På backen · per typ</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: AVSTAND.s, margin: `0 ${AVSTAND.m}px ${AVSTAND.l}px` }}>
            {kortData.map(k => {
              const aktiv = vald === k.nyckel;
              const tom = k.n === 0;
              return (
                <button
                  key={k.label}
                  onClick={() => setVald(v => (v === k.nyckel ? null : k.nyckel))}
                  aria-pressed={aktiv}
                  style={{
                    textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                    background: aktiv ? FARG.upphojt : FARG.kort, borderRadius: RADIE.kort,
                    border: `1px solid ${aktiv ? FARG.text3 : 'transparent'}`,
                    padding: `${AVSTAND.m}px ${AVSTAND.s}px`, color: FARG.text,
                  }}
                >
                  <div style={{ ...TYP.micro, color: FARG.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.label}</div>
                  {tom ? (
                    <div style={{ ...TYP.rubrik, color: FARG.text3, marginTop: AVSTAND.xs }}>—</div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, marginTop: AVSTAND.xs, ...TNUM }}>
                      {k.schablon && <span style={{ ...TYP.meta, color: FARG.text2, fontWeight: 700 }}>≈</span>}
                      <span style={{ ...TYP.rubrik, color: FARG.text }}>{sv(k.m3)}</span>
                      <span style={{ ...TYP.meta, color: FARG.text2 }}>m³</span>
                    </div>
                  )}
                  {k.schablon ? (
                    <span
                      role="button" tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); setVisaFaktor(f => !f); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setVisaFaktor(f => !f); } }}
                      style={{ display: 'inline-block', ...TYP.micro, color: FARG.text2, marginTop: AVSTAND.xs, textTransform: 'none', letterSpacing: 0, cursor: 'pointer' }}
                    >
                      schablon · ×{faktorStr}
                    </span>
                  ) : (
                    <div style={{ ...TYP.micro, color: FARG.text2, marginTop: AVSTAND.xs, textTransform: 'none', letterSpacing: 0 }}>{tom ? 'inget kvar' : `${k.n} obj`}</div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Ligger i skogen — ett eget, brett kort: det är ingen typ utan alla typer. */}
          <button
            onClick={() => router.push('/uppfoljning/i-skogen')}
            data-skogen-kort
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.m,
              width: `calc(100% - ${AVSTAND.m * 2}px)`, minHeight: TRAFFYTA_ROW, margin: `0 ${AVSTAND.m}px ${AVSTAND.l}px`,
              textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
              background: FARG.kort, borderRadius: RADIE.kort, border: 'none',
              padding: `${AVSTAND.m}px ${AVSTAND.m}px`, color: FARG.text,
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', ...TYP.micro, color: FARG.text2 }}>Ligger i skogen</span>
              <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                {skogen.rader.length === 0 ? 'inget virke i skogen' : `${skogen.rader.length} trakter · längst legat`}
              </span>
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
              {skogenLangst != null && <span style={{ ...TYP.rubrik }}>{skogenLangst}</span>}
              {skogenLangst != null && <span style={{ ...TYP.meta, color: FARG.text2 }}>{dagOrd(skogenLangst)}</span>}
              <span aria-hidden="true" style={{ ...TYP.listtitel, color: FARG.text3, marginLeft: AVSTAND.xs }}>›</span>
            </span>
          </button>

          {/* Grot-faktor — öppnas från schablon-taggen (oförändrad regel). */}
          {visaFaktor && (
            <div style={{ background: FARG.kort, borderRadius: RADIE.kort, margin: `0 ${AVSTAND.m}px ${AVSTAND.l}px`, padding: AVSTAND.m }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...TYP.meta, color: FARG.text }}>Grot-uttagsfaktor</div>
                  <div style={{ ...TYP.micro, color: FARG.text3, textTransform: 'none', letterSpacing: 0 }}>Skogforsk {GROT_UTTAGSFAKTOR_MIN.toLocaleString('sv-SE')}–{GROT_UTTAGSFAKTOR_MAX.toLocaleString('sv-SE')} av stamvolym</div>
                </div>
                <button onClick={() => steg(-0.01)} disabled={grotFaktor <= GROT_UTTAGSFAKTOR_MIN + 1e-9} style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, borderRadius: RADIE.knapp, border: `1px solid ${FARG.linje}`, background: 'transparent', color: grotFaktor <= GROT_UTTAGSFAKTOR_MIN + 1e-9 ? FARG.text3 : FARG.text, cursor: 'pointer', fontFamily: 'inherit', ...TYP.rubrik, lineHeight: 1 }} aria-label="Minska">−</button>
                <span style={{ ...TYP.listtitel, ...TNUM, minWidth: 40, textAlign: 'center' }}>{faktorStr}</span>
                <button onClick={() => steg(0.01)} disabled={grotFaktor >= GROT_UTTAGSFAKTOR_MAX - 1e-9} style={{ width: TRAFFYTA.min, height: TRAFFYTA.min, borderRadius: RADIE.knapp, border: `1px solid ${FARG.linje}`, background: 'transparent', color: grotFaktor >= GROT_UTTAGSFAKTOR_MAX - 1e-9 ? FARG.text3 : FARG.text, cursor: 'pointer', fontFamily: 'inherit', ...TYP.rubrik, lineHeight: 1 }} aria-label="Öka">+</button>
              </div>
              <div style={{ ...TYP.micro, color: FARG.text3, marginTop: AVSTAND.s, textTransform: 'none', letterSpacing: 0, lineHeight: 1.45 }}>
                Grot är en uppskattning (Skogforsk-schablon: stamvolym × faktor), inte en mätning. Faktisk volym registreras vid skotning.
              </div>
            </div>
          )}

          {vald && (
            <button onClick={() => setVald(null)} style={{ display: 'block', margin: `0 ${AVSTAND.m}px ${AVSTAND.m}px`, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.meta, color: FARG.bla }}>✕ Visa alla typer</button>
          )}

          {/* Ris valt → ris-listan; annars per skotare. */}
          {vald === 'ris' ? (
            <section style={{ marginBottom: AVSTAND.l }}>
              <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>Ris att skota</div>
              {risSynlig.length === 0 ? (
                <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Inget ris kvar att skota.</div>
              ) : (
                <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                  {risSynlig.map(o => {
                    const l = risLage(o, grotFaktor);
                    if (l.lage === 'skotas') {
                      return rad(o, { tal: sv(l.m3), enhet: l.delas ? 'm³ hela risjobbet' : 'm³ hämtat' },
                        l.delas ? 'Skotas nu · risjobbet gäller fler trakter' : 'Skotas nu', FARG.gron);
                    }
                    return rad(o, 'schablon', 'Ris kvar · ' + liggetidText(o));
                  })}
                </div>
              )}
              {risSynlig.length > 0 && (
                <div style={{ ...TYP.micro, color: FARG.text3, margin: `${AVSTAND.s}px ${AVSTAND.m}px 0`, textTransform: 'none', letterSpacing: 0, lineHeight: 1.45 }}>
                  ≈ är en uppskattning tills första lasset. Raden blir Hämtat när risjobbet är färdigskotat.
                </div>
              )}
              {risHamtatSynlig.length > 0 && (
                <div style={{ marginTop: AVSTAND.l }}>
                  <button
                    onClick={() => setVisaHamtat(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%', padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    <span style={{ ...TYP.micro, color: FARG.text2 }}>Hämtat senaste {HAMTAT_VISAS_DAGAR} dagarna ({risHamtatSynlig.length})</span>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={FARG.text2} strokeWidth="2" strokeLinecap="round" style={{ transform: visaHamtat ? 'rotate(90deg)' : 'none', transition: overgang('transform') }}>
                      <polyline points="4 2 8 6 4 10" />
                    </svg>
                  </button>
                  {visaHamtat && (
                    <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                      {risHamtatSynlig.map(o => {
                        const l = risLage(o, grotFaktor);
                        if (l.lage !== 'hamtat') return null;
                        const datum = new Date(l.datum).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
                        return rad(o, l.m3 != null ? { tal: sv(l.m3), enhet: 'm³ hämtat' } : null, `Hämtat ${datum}`);
                      })}
                    </div>
                  )}
                </div>
              )}
            </section>
          ) : (
            <>
              {grupper.length > 0 && (
                <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>Per skotare</div>
              )}
              {grupper.map(g => (
                <section key={g.namn || 'ej'} style={{ marginBottom: AVSTAND.l }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.s, padding: `0 ${AVSTAND.m}px ${AVSTAND.xs}px` }}>
                    <span style={{ ...TYP.listtitel, color: g.namn ? FARG.text : FARG.orange, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.namn || 'Ej tilldelad'}</span>
                    <span style={{ ...TYP.meta, color: FARG.text2, ...TNUM, flexShrink: 0 }}>{sv(g.summa)} m³ på backen</span>
                  </div>
                  <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                    {g.objs.map(o => rad(o, 'kvar'))}
                  </div>
                </section>
              ))}
              {grupper.length === 0 && (
                <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>{vald ? 'Inget på backen av den typen.' : 'Inget på backen.'}</div>
              )}
            </>
          )}

          {/* Avslutade per månad (hopfällt). */}
          {antalAvslutade > 0 && (
            <section style={{ marginBottom: AVSTAND.l }}>
              <button
                onClick={() => setVisaAvslutade(v => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%', padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{ ...TYP.micro, color: FARG.text2 }}>Avslutade ({antalAvslutade})</span>
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={FARG.text2} strokeWidth="2" strokeLinecap="round" style={{ transform: visaAvslutade ? 'rotate(90deg)' : 'none', transition: overgang('transform') }}>
                  <polyline points="4 2 8 6 4 10" />
                </svg>
              </button>
              {visaAvslutade && manader.map(mn => (
                <div key={mn.key} style={{ marginTop: AVSTAND.s }}>
                  <div style={{ ...TYP.micro, color: FARG.text3, margin: `0 ${AVSTAND.m}px ${AVSTAND.xs}px`, textTransform: 'capitalize' }}>{mn.label}</div>
                  <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                    {mn.objs.map(o => rad(o, 'volym', 'Avslutat'))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );

  // Ramen (UppfoljningRam) styr bredd och padding: full bredd (centrerad, max
  // smal kolumn) på smal skärm, 360 px sidokolumn på stor. Komponenten ritar
  // bara innehållet.
  return <>{innehall}</>;
}
