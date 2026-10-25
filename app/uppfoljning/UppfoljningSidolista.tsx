'use client';
// Kompakt objektlista för sidokolumnen på stor skärm (≥1100 px), bredvid
// objektvyn — som Mail / markägarrapporten. Egen källa (useUppfoljningList),
// samma data som indexlistan. Telefon och iPad stående ser den aldrig (ramen
// göm­mer kolumnen under 1100 px); indexlistan på /uppfoljning är orörd.
//
// Två grupper, i klartext: "Ligger på backen" (det du agerar på, sorterat efter
// mest kvar) och "Klart". Varje rad: namn + typ, och till höger virke på backen
// (orange prick) eller "klar" (dämpad). Vald rad lyfts (FARG.upphojt). Allt på
// tokens; rollfärger/sökruta hålls enkla.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, RADIE, TNUM, TYP, VIKT } from '@/lib/design/tokens';
import { typLabel } from '@/lib/objekt/typ';
import { paBackenKvar } from '@/lib/skotat';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');

function kvarM3(o: UppfoljningObjekt): number {
  return paBackenKvar(o.volymSkordare, o.volymSkotare, o.egenSkotning === true);
}

export default function UppfoljningSidolista({ valt }: { valt: string | null }) {
  const router = useRouter();
  const { objekt, loading, error } = useUppfoljningList();
  const [sok, setSok] = useState('');

  const { paBacken, klart } = useMemo(() => {
    const t = sok.trim().toLowerCase();
    const traffar = (o: UppfoljningObjekt) =>
      !t || o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t);
    const synliga = objekt.filter(traffar);
    const paBacken = synliga
      .filter(o => !o.skotningAvslutad)
      .sort((a, b) => kvarM3(b) - kvarM3(a));
    const klart = synliga.filter(o => o.skotningAvslutad);
    return { paBacken, klart };
  }, [objekt, sok]);

  const rad = (o: UppfoljningObjekt) => {
    const id = urlIdFor(o);
    const aktiv = valt != null && id === valt;
    const kvar = kvarM3(o);
    return (
      <button
        key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer}
        onClick={() => router.push(`/uppfoljning/${encodeURIComponent(id)}`)}
        aria-current={aktiv ? 'page' : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: 56,
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
        <span style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, flexShrink: 0, ...TYP.meta, ...TNUM }}>
          {o.skotningAvslutad ? (
            <span style={{ color: FARG.text2 }}>klar</span>
          ) : kvar > 0 ? (
            <>
              <span style={{ width: 9, height: 9, borderRadius: RADIE.cirkel, background: FARG.orange }} />
              <span style={{ color: FARG.text, fontWeight: VIKT.halvfet }}>{sv(kvar)} m³</span>
            </>
          ) : (
            <span style={{ color: FARG.text2 }}>–</span>
          )}
        </span>
      </button>
    );
  };

  const grupp = (titel: string, lista: UppfoljningObjekt[]) => {
    if (lista.length === 0) return null;
    return (
      <section style={{ marginBottom: AVSTAND.xl }}>
        <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 ${AVSTAND.m}px ${AVSTAND.s}px` }}>{titel}</div>
        <div>{lista.map(rad)}</div>
      </section>
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
          {grupp('Ligger på backen', paBacken)}
          {grupp('Klart', klart)}
          {paBacken.length === 0 && klart.length === 0 && (
            <div style={{ ...TYP.meta, color: FARG.text3, padding: `${AVSTAND.s}px ${AVSTAND.m}px` }}>Inga objekt.</div>
          )}
        </>
      )}
    </div>
  );
}
