'use client';
// Kompakt objektlista för sidokolumnen på stor skärm (≥1100 px), bredvid
// objektvyn — som Mail / markägarrapporten. Egen källa (useUppfoljningList),
// samma data och samma kvarM3-formel som indexlistan, så siffrorna stämmer.
// Telefon och iPad stående ser den aldrig (ramen gömmer kolumnen < 1100 px);
// indexlistan på /uppfoljning är orörd.
//
// Samma uppdelning som indexlistans "På backen · per maskin" (MaskinUppdelning):
// grupperat på tilldelad skotare, varje maskin med sin summa "X m³ på backen",
// objekten under med "kvar m³", skotare med mest överst, "Ej tilldelad" sist.
// Därunder en "Klart"-grupp. Allt på tokens.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { typLabel, arRisjobb } from '@/lib/objekt/typ';
import { paBackenKvar } from '@/lib/skotat';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');

// Samma formel som indexlistan (lib/skotat.paBackenKvar): skördat − skotat,
// egen skotning räknas inte som vårt väntande arbete.
function kvarM3(o: UppfoljningObjekt): number {
  return paBackenKvar(o.volymSkordare, o.volymSkotare, o.egenSkotning === true);
}

type Grupp = { namn: string | null; objs: UppfoljningObjekt[]; summa: number };

export default function UppfoljningSidolista({ valt }: { valt: string | null }) {
  const router = useRouter();
  const { objekt, loading, error } = useUppfoljningList();
  const [sok, setSok] = useState('');

  const { grupper, klart } = useMemo(() => {
    const t = sok.trim().toLowerCase();
    const traffar = (o: UppfoljningObjekt) =>
      !t || o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t);

    // På backen = vårt oskotade virke: inte avslutat, inte extern/egen skotning,
    // inte risjobb, och något kvar (skördat − skotat).
    const paBacken = objekt.filter(o =>
      traffar(o) && !o.skotningAvslutad && !o.externSkotning && !o.egenSkotning && !arRisjobb(o) && kvarM3(o) > 0);

    const m = new Map<string, UppfoljningObjekt[]>();
    for (const o of paBacken) {
      const k = o.tilldeladSkotare || ' ej';
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(o);
    }
    const grupper: Grupp[] = Array.from(m.entries()).map(([namn, objs]) => ({
      namn: namn === ' ej' ? null : namn,
      // Äldst överst (sista avverkning stigande).
      objs: objs.slice().sort((a, b) =>
        !a.sistaAvverkning ? 1 : !b.sistaAvverkning ? -1 : a.sistaAvverkning.localeCompare(b.sistaAvverkning)),
      summa: objs.reduce((s, o) => s + kvarM3(o), 0),
    }));
    // Mest på backen överst; Ej tilldelad alltid sist.
    grupper.sort((a, b) => (a.namn === null ? 1 : b.namn === null ? -1 : b.summa - a.summa));

    const klart = objekt.filter(o => traffar(o) && o.skotningAvslutad);
    return { grupper, klart };
  }, [objekt, sok]);

  const aktivFor = (o: UppfoljningObjekt) => valt != null && urlIdFor(o) === valt;

  const rad = (o: UppfoljningObjekt, visaKvar: boolean) => {
    const aktiv = aktivFor(o);
    const kvar = kvarM3(o);
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
        {visaKvar ? (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.xs, flexShrink: 0, ...TNUM }}>
            <span style={{ ...TYP.listtitel }}>{sv(kvar)}</span>
            <span style={{ ...TYP.meta, color: FARG.text2 }}>kvar m³</span>
          </span>
        ) : (
          <span style={{ flexShrink: 0, ...TYP.meta, color: FARG.text2 }}>klar</span>
        )}
      </button>
    );
  };

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
          {grupper.length > 0 && (
            <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>På backen · per maskin</div>
          )}
          {grupper.map(g => (
            <section key={g.namn || 'ej'} style={{ marginBottom: AVSTAND.l }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.s, padding: `0 ${AVSTAND.m}px ${AVSTAND.xs}px` }}>
                <span style={{ ...TYP.listtitel, color: g.namn ? FARG.text : FARG.orange, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.namn || 'Ej tilldelad'}</span>
                <span style={{ ...TYP.meta, color: FARG.text2, ...TNUM, flexShrink: 0 }}>{sv(g.summa)} m³ på backen</span>
              </div>
              <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                {g.objs.map(o => rad(o, true))}
              </div>
            </section>
          ))}

          {klart.length > 0 && (
            <section style={{ marginBottom: AVSTAND.l }}>
              <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>Klart</div>
              <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
                {klart.map(o => rad(o, false))}
              </div>
            </section>
          )}

          {grupper.length === 0 && klart.length === 0 && (
            <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Inga objekt.</div>
          )}
        </>
      )}
    </div>
  );
}

const TRAFFYTA_ROW = 56;
