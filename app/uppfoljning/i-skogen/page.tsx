'use client';
// /uppfoljning/i-skogen — "Ligger i skogen" som egen sida (Martin 2026-11-21: "en sammanställning på
// alla avverkningar som ligger eller skördas", "så man slipper gå in på varje trakt").
// Varje trakt visar BARA hur länge virket legat, när skördaren och skotaren körde och vädret under
// tiden — volym och läge står redan i Uppföljning. Samma innehåll som A4 via "Dela som PDF".
// Modellen (urval, rader, A4) bor i lib/iSkogenSida; sidan ritar bara.
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, INAKTIV, KNAPP, ROT_MIN_HOJD, TYP, kolumnRot } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import PdfForhandsvisning from '@/app/helikopter/_components/PdfForhandsvisning';
import { useUppfoljningList } from '../hooks/useUppfoljningList';
import { dagOrd, KLARA_VISAS_DAGAR } from '../lib/iSkogen';
import { skogKort, skogDokument, skogenAvObjekt, svarText, tidRader, vaderPerPeriod, vaderRad, type SkogKort } from '../lib/iSkogenSida';
import { useForstaDag } from './useForstaDag';
import { useVaderAlla } from './useVaderAlla';

function svenskIdag(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
}

export default function ISkogenSida() {
  const router = useRouter();
  const { objekt, loading, error } = useUppfoljningList();
  const idag = svenskIdag();
  // Bara trakterna på sidan får sin första fällningsdag läst.
  const visade = useMemo(() => {
    const { skogen } = skogenAvObjekt(objekt, Date.now());
    return [...skogen.rader.map(r => r.o), ...skogen.klara.map(k => k.o)];
  }, [objekt]);
  const forsta = useForstaDag(visade);
  const kort = useMemo(() => skogKort(forsta ? objekt : [], Date.now(), idag, forsta ?? undefined), [objekt, idag, forsta]);
  const alla = useMemo(() => [...kort.iSkogen, ...kort.framme], [kort]);
  const { vader, forsokIgen } = useVaderAlla(alla);
  const [pdf, setPdf] = useState(false);
  // Ett tryck på en trakt öppnar tiden och vädret i ett ark här — aldrig traktens uppföljning
  // (Martin 2026-11-22: "jag vill bara se all infon om tiden och vädret").
  const [vald, setVald] = useState<SkogKort | null>(null);

  const langst = kort.iSkogen.reduce<number | null>((m, k) => (k.dagar == null ? m : Math.max(m ?? 0, k.dagar)), null);
  const nagotFel = alla.some(k => { const s = vader.get(k.nyckel); return s && !s.ok && s.orsak === 'las'; });
  const vaderKlart = alla.every(k => vader.has(k.nyckel));

  const kortRad = (k: SkogKort, i: number, lista: SkogKort[]) => (
    <Rad
      key={k.nyckel}
      titel={k.namn}
      hoger={k.dagar == null ? undefined : `${k.dagar} ${dagOrd(k.dagar)}`}
      under={
        <span style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          {k.steg.map(s => <span key={s}>{s}</span>)}
          <span style={{ color: FARG.text3 }} data-skogen-vader>{vaderRad(vader.get(k.nyckel))}</span>
        </span>
      }
      onTryck={() => setVald(k)}
      sista={i === lista.length - 1}
      attr={{ 'data-skogen-trakt': k.nyckel }}
    />
  );

  return (
    <div style={{ ...kolumnRot('smal'), minHeight: ROT_MIN_HOJD, paddingBottom: AVSTAND.xxl }} data-i-skogen>
      <button
        onClick={() => router.push('/uppfoljning')}
        style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: 0, background: 'none', border: 'none', color: FARG.bla, cursor: 'pointer', fontFamily: 'inherit', ...TYP.text }}
      >
        ‹ Uppföljning
      </button>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>Ligger i skogen</h1>

      {loading || (!error && !forsta) ? (
        <div style={{ ...TYP.meta, color: FARG.text2 }}>Läser trakterna …</div>
      ) : error ? (
        <div style={{ ...TYP.meta, color: FARG.orange }}>Kunde inte läsa trakterna.</div>
      ) : (
        <>
          <div style={{ ...TYP.text, color: FARG.text2, marginBottom: AVSTAND.xl }} data-skogen-svar>{svarText(kort.iSkogen.length, langst)}</div>

          {kort.iSkogen.length > 0 && (
            <Sektion rubrik="Längst legat först" not="Dagar sedan skördaren blev klar.">
              {kort.iSkogen.map(kortRad)}
            </Sektion>
          )}

          {kort.framme.length > 0 && (
            <div style={{ marginTop: AVSTAND.xl }}>
              <Sektion rubrik={`Framme vid avlägget · senaste ${KLARA_VISAS_DAGAR} dagarna`} not="Dagar från att skördaren blev klar till sista lasset.">
                {kort.framme.map(kortRad)}
              </Sektion>
            </div>
          )}

          {nagotFel && (
            <button onClick={forsokIgen} style={{ display: 'block', margin: `${AVSTAND.l}px 0 0`, minHeight: 44, padding: 0, background: 'none', border: 'none', color: FARG.bla, cursor: 'pointer', fontFamily: 'inherit', ...TYP.meta }}>
              Hämta vädret igen
            </button>
          )}

          {alla.length > 0 && (
            <>
              <button
                onClick={() => setPdf(true)}
                disabled={!vaderKlart}
                style={{ ...KNAPP.primar, marginTop: AVSTAND.xl, ...(vaderKlart ? {} : INAKTIV) }}
                data-skogen-pdf
              >
                Dela som PDF
              </button>
              <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s, textAlign: 'center' }}>
                {vaderKlart ? 'Samma innehåll som här, på en A4.' : 'Väntar på vädret …'}
              </div>
            </>
          )}
        </>
      )}

      {vald && (() => {
        const svar = vader.get(vald.nyckel);
        const perioder = vaderPerPeriod(vald.tid, svar, idag);
        const tid = tidRader(vald.tid, idag);
        return (
          <Ark rubrik={vald.namn} onStang={() => setVald(null)} stang="Klar">
            <div data-skogen-ark>
              <Sektion rubrik="Från stubbe till avlägg" kort={false}>
                {tid.map((r, i) => (
                  <Rad key={r.nyckel} titel={r.titel} hoger={r.hoger} under={r.under} sista={i === tid.length - 1} attr={{ 'data-skogen-tid': r.nyckel }} />
                ))}
              </Sektion>
              <Sektion rubrik="Vädret" kort={false} not="Beräknat för traktens plats (Open-Meteo).">
                {perioder && perioder.length > 0
                  ? perioder.map((r, i) => (
                    <Rad key={r.nyckel} titel={r.titel} hoger={r.hoger} under={r.under} sista={i === perioder.length - 1} attr={{ 'data-skogen-period': r.nyckel }} />
                  ))
                  : <Rad titel="Hela tiden" under={vaderRad(svar)} sista />}
              </Sektion>
            </div>
          </Ark>
        );
      })()}

      {pdf && (
        <PdfForhandsvisning
          skapa={async () => {
            const { skapaArbetsmiljoPdf } = await import('@/lib/arbetsmiljo/pdf');
            return skapaArbetsmiljoPdf(skogDokument(kort, vader, idag));
          }}
          filnamn={`ligger-i-skogen-${idag}`}
          titel="Ligger i skogen"
          onStang={() => setPdf(false)}
        />
      )}
    </div>
  );
}
