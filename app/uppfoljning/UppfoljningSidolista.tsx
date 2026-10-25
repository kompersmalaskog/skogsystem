'use client';
// Kompakt objektlista för sidokolumnen på stor skärm (≥1100 px), bredvid
// objektvyn — som Mail / markägarrapporten. Egen källa (useUppfoljningList),
// samma data och samma kvarM3-formel som indexlistan, så siffrorna stämmer.
// Telefon och iPad stående ser den aldrig (ramen gömmer kolumnen < 1100 px);
// indexlistan på /uppfoljning är orörd.
//
// Menyn, som Martin ville ha den — SOM INNAN, bara ny design: överst hur mycket
// som ligger på backen PER TYP (Slutavverkning / Gallring / Grot) som KLICKBARA
// kort — ett tryck filtrerar listan till bara den typens objekt (samma som
// indexsidans SummaKort). Under det objekten PER SKOTARE (grupperat på tilldelad
// skotare, mest överst, Ej tilldelad sist), och underst AVSLUTADE per månad
// (hopfällt). Typ-totalerna räknas ur SAMMA på-backen-mängd, så de summerar ihop.
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, RADIE, TNUM, TYP, overgang } from '@/lib/design/tokens';
import { typLabel, arRisjobb } from '@/lib/objekt/typ';
import { paBackenKvar } from '@/lib/skotat';
import { uppskattaGrotM3fub, klampaGrotFaktor, GROT_UTTAGSFAKTOR_DEFAULT } from '@/lib/grot';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');

// Samma formel som indexlistan (lib/skotat.paBackenKvar): skördat − skotat,
// egen skotning räknas inte som vårt väntande arbete.
function kvarM3(o: UppfoljningObjekt): number {
  return paBackenKvar(o.volymSkordare, o.volymSkotare, o.egenSkotning === true);
}

// Avslutningsdatum — det senaste vi har (skotarens slut → skördarens slut →
// sista avverkningsdag). Styr både sortering och vilken månad objektet hamnar i.
function klartDatum(o: UppfoljningObjekt): string | null {
  return o.skotareSlut || o.skordareSlut || o.sistaAvverkning || null;
}

// Filternyckel per objekt — samma som indexsidans matchTyp (o.typ), '__okand__'
// för objekt utan känd typ så de ändå går att filtrera på sitt eget kort.
function typNyckel(o: UppfoljningObjekt): string {
  return o.typ || '__okand__';
}

type Grupp = { namn: string | null; objs: UppfoljningObjekt[]; summa: number };
// 'ris' = grot-kortet, ett UPPSKATTAT tal (≈, orange). nyckel driver filtret.
type TypTotal = { nyckel: string; label: string; summa: number; antal: number; schablon?: boolean };
type Manad = { key: string; label: string; objs: UppfoljningObjekt[] };

export default function UppfoljningSidolista({ valt }: { valt: string | null }) {
  const router = useRouter();
  const { objekt, loading, error } = useUppfoljningList();
  const [sok, setSok] = useState('');
  const [visaAvslutade, setVisaAvslutade] = useState(false);
  // Valt typ-kort (null = alla). Ett tryck på samma kort rensar filtret.
  const [vald, setVald] = useState<string | null>(null);
  // Samma grot-uttagsfaktor som indexlistan (sessionStorage), så grot-kortets
  // schablon aldrig visar en annan siffra än "Ris kvar på hygget" där.
  const [grotFaktor, setGrotFaktor] = useState(GROT_UTTAGSFAKTOR_DEFAULT);
  useEffect(() => {
    try {
      const gf = sessionStorage.getItem('uppfoljning:grotFaktor');
      if (gf !== null) setGrotFaktor(klampaGrotFaktor(JSON.parse(gf)));
    } catch { /* ingen sparad faktor → default */ }
  }, []);

  const { typTotaler, grupper, manader, antalAvslutade, risLista } = useMemo(() => {
    const t = sok.trim().toLowerCase();
    const traffar = (o: UppfoljningObjekt) =>
      !t || o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t);

    // På backen = vårt oskotade virke: inte avslutat, inte extern/egen skotning,
    // inte risjobb, och något kvar (skördat − skotat).
    const paBackenAll = objekt.filter(o =>
      traffar(o) && !o.skotningAvslutad && !o.externSkotning && !o.egenSkotning && !arRisjobb(o) && kvarM3(o) > 0);

    // Typ-korten — ur HELA på-backen-mängden (totalerna står kvar oavsett filter,
    // som indexsidans SummaKort). Keyade på o.typ så kortet kan filtrera.
    const tm = new Map<string, TypTotal>();
    for (const o of paBackenAll) {
      const nyckel = typNyckel(o);
      if (!tm.has(nyckel)) tm.set(nyckel, { nyckel, label: o.typ ? typLabel(o.typ) : 'Okänd typ', summa: 0, antal: 0 });
      const row = tm.get(nyckel)!;
      row.summa += kvarM3(o);
      row.antal += 1;
    }
    const typTotaler = Array.from(tm.values()).sort((a, b) => b.summa - a.summa);

    // Grot — UPPSKATTAT tal. Exakt indexlistans "Ris kvar"-urval och Skogforsk-
    // schablon. Eget filter ('ris') → ris-listan nedan. Finns inget → inget kort.
    const risObjektAll = objekt.filter(o => traffar(o) && o.grotAnpassad && o.volymSkordare > 0 && !o.grotHamtad);
    const risSumma = risObjektAll.reduce((a, o) => a + (uppskattaGrotM3fub(o.volymSkordare, grotFaktor) || 0), 0);
    if (risObjektAll.length > 0 && risSumma > 0) {
      typTotaler.push({ nyckel: 'ris', label: 'Grot', summa: risSumma, antal: risObjektAll.length, schablon: true });
    }
    // Ris-listan (äldst först, som indexsidans "Ris kvar på hygget").
    const risLista = risObjektAll.slice().sort((a, b) =>
      !a.sistaAvverkning ? 1 : !b.sistaAvverkning ? -1 : a.sistaAvverkning.localeCompare(b.sistaAvverkning));

    // Filtrera virket + avslutade på valt typ-kort (ris har sin egen lista ovan).
    const virkeFilt = vald && vald !== 'ris' ? paBackenAll.filter(o => typNyckel(o) === vald) : paBackenAll;

    // Per skotare — grupperat på tilldelad skotare.
    const m = new Map<string, UppfoljningObjekt[]>();
    for (const o of virkeFilt) {
      const k = o.tilldeladSkotare || ' ej';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    const grupper: Grupp[] = Array.from(m.entries()).map(([namn, objs]) => ({
      namn: namn === ' ej' ? null : namn,
      objs: objs.slice().sort((a, b) =>
        !a.sistaAvverkning ? 1 : !b.sistaAvverkning ? -1 : a.sistaAvverkning.localeCompare(b.sistaAvverkning)),
      summa: objs.reduce((s, o) => s + kvarM3(o), 0),
    }));
    grupper.sort((a, b) => (a.namn === null ? 1 : b.namn === null ? -1 : b.summa - a.summa));

    // Avslutade per månad — nyast månad överst, nyast objekt överst i månaden.
    const avslutadeAll = objekt.filter(o => traffar(o) && o.skotningAvslutad);
    const avslutadeFilt = vald && vald !== 'ris' ? avslutadeAll.filter(o => typNyckel(o) === vald) : avslutadeAll;
    const mm = new Map<string, UppfoljningObjekt[]>();
    for (const o of avslutadeFilt) {
      const d = klartDatum(o);
      const key = d ? d.slice(0, 7) : 'okänt';
      if (!mm.has(key)) mm.set(key, []);
      mm.get(key)!.push(o);
    }
    const manader: Manad[] = Array.from(mm.entries())
      .map(([key, objs]) => ({
        key,
        label: key === 'okänt'
          ? 'Utan datum'
          : new Date(key + '-01').toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' }),
        objs: objs.slice().sort((a, b) => (klartDatum(b) || '').localeCompare(klartDatum(a) || '')),
      }))
      .sort((a, b) => (a.key === 'okänt' ? 1 : b.key === 'okänt' ? -1 : b.key.localeCompare(a.key)));

    return { typTotaler, grupper, manader, antalAvslutade: avslutadeFilt.length, risLista };
  }, [objekt, sok, grotFaktor, vald]);

  const valjKort = (nyckel: string) => setVald(v => (v === nyckel ? null : nyckel));
  const aktivFor = (o: UppfoljningObjekt) => valt != null && urlIdFor(o) === valt;

  const rad = (o: UppfoljningObjekt, hoger: 'kvar' | 'volym' | 'schablon') => {
    const aktiv = aktivFor(o);
    return (
      <button
        key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer}
        onClick={() => router.push(`/uppfoljning/${encodeURIComponent(urlIdFor(o))}`)}
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
          <span style={{ display: 'block', ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {o.typ ? typLabel(o.typ) : '—'}
          </span>
        </span>
        {hoger === 'kvar' ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.listtitel }}>{sv(kvarM3(o))}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>kvar m³</span>
          </span>
        ) : hoger === 'schablon' ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.meta, color: FARG.orange, fontWeight: 700 }}>≈</span>
            <span style={{ ...TYP.listtitel, color: FARG.orange }}>{sv(uppskattaGrotM3fub(o.volymSkordare, grotFaktor) || 0)}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>m³fub</span>
          </span>
        ) : (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.listtitel, color: FARG.text2 }}>{sv(o.volymSkordare)}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>m³</span>
          </span>
        )}
      </button>
    );
  };

  const visaRis = vald === 'ris';

  return (
    <div style={{ padding: `${AVSTAND.m}px 0 ${AVSTAND.xxl}px` }}>
      <div style={{ padding: `0 ${AVSTAND.m}px ${AVSTAND.m}px` }}>
        <input
          value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök objekt" inputMode="search" autoComplete="off"
          style={{
            width: '100%', boxSizing: 'border-box', minHeight: 40, padding: `0 ${AVSTAND.m}px`,
            background: FARG.fyllning, border: 'none', outline: 'none', borderRadius: RADIE.rad,
            color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark',
          }}
        />
      </div>

      {loading ? (
        <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Läser objekt …</div>
      ) : error ? (
        <div style={{ ...TYP.meta, color: FARG.orange, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Kunde inte läsa listan.</div>
      ) : (
        <>
          {typTotaler.length > 0 && (
            <>
              <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>På backen · per typ</div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(typTotaler.length, 3)}, 1fr)`, gap: AVSTAND.s, margin: `0 ${AVSTAND.m}px ${AVSTAND.l}px` }}>
                {typTotaler.map(tt => {
                  const aktiv = vald === tt.nyckel;
                  return (
                    <button
                      key={tt.nyckel}
                      onClick={() => valjKort(tt.nyckel)}
                      aria-pressed={aktiv}
                      style={{
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        background: aktiv ? FARG.upphojt : FARG.kort, borderRadius: RADIE.kort,
                        border: `1px solid ${aktiv ? FARG.text3 : 'transparent'}`,
                        padding: `${AVSTAND.m}px ${AVSTAND.s}px`, color: FARG.text,
                      }}
                    >
                      <div style={{ ...TYP.micro, color: FARG.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tt.label}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, marginTop: AVSTAND.xs, ...TNUM }}>
                        {tt.schablon && <span style={{ ...TYP.meta, color: FARG.orange, fontWeight: 700 }}>≈</span>}
                        <span style={{ ...TYP.rubrik, color: tt.schablon ? FARG.orange : FARG.text }}>{sv(tt.summa)}</span>
                        <span style={{ ...TYP.meta, color: FARG.text2 }}>m³</span>
                      </div>
                      <div style={{ ...TYP.micro, color: FARG.text2, marginTop: AVSTAND.xs, textTransform: 'none', letterSpacing: 0 }}>{tt.schablon ? `schablon · ${tt.antal} obj` : `${tt.antal} objekt`}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {vald && (
            <button
              onClick={() => setVald(null)}
              style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, margin: `0 ${AVSTAND.m}px ${AVSTAND.m}px`, padding: 0, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.meta, color: FARG.bla }}
            >
              ✕ Visa alla typer
            </button>
          )}

          {/* Ris-listan (grot valt): schablon per objekt, äldst först. */}
          {visaRis && (
            <section style={{ marginBottom: AVSTAND.l }}>
              <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>Ris kvar på hygget · äldst först</div>
              {risLista.length === 0 ? (
                <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Inget ris kvar.</div>
              ) : (
                <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                  {risLista.map(o => rad(o, 'schablon'))}
                </div>
              )}
            </section>
          )}

          {/* Per skotare + avslutade (allt utom när Grot är valt). */}
          {!visaRis && (
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

              {antalAvslutade > 0 && (
                <section style={{ marginBottom: AVSTAND.l }}>
                  <button
                    onClick={() => setVisaAvslutade(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: AVSTAND.s, width: '100%',
                      padding: `${AVSTAND.s}px ${AVSTAND.m}px`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <span style={{ ...TYP.micro, color: FARG.text2 }}>Avslutade ({antalAvslutade})</span>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke={FARG.text2} strokeWidth="2" strokeLinecap="round"
                      style={{ transform: visaAvslutade ? 'rotate(90deg)' : 'none', transition: overgang('transform') }}>
                      <polyline points="4 2 8 6 4 10" />
                    </svg>
                  </button>
                  {visaAvslutade && manader.map(mn => (
                    <div key={mn.key} style={{ marginTop: AVSTAND.s }}>
                      <div style={{ ...TYP.micro, color: FARG.text3, margin: `0 ${AVSTAND.m}px ${AVSTAND.xs}px`, textTransform: 'capitalize' }}>{mn.label}</div>
                      <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                        {mn.objs.map(o => rad(o, 'volym'))}
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {grupper.length === 0 && antalAvslutade === 0 && (
                <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>
                  {vald ? 'Inga objekt av den typen.' : 'Inga objekt.'}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

const TRAFFYTA_ROW = 56;
