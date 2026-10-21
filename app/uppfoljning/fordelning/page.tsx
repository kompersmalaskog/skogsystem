'use client';

/**
 * /uppfoljning/fordelning — apteringen.
 *
 * Tre vyer i samma sida (adressen bär vilken):
 *  - översikten (ingen parameter): fel virke i m³ för senaste månaden, staplar
 *    per månad, högst en höjdpunkt, "Alla objekt" (Vyer.tsx, logiken i oversikt.ts);
 *  - ?vy=alla[&manad=2026-10]: listan med alla trakter per månad;
 *  - ?objekt=<nyckel>: trakten — vältor, ansvarskort, guide, matris (Detalj.tsx).
 *
 * Siffrorna räknas ur databasen när HPR-filen importeras (lib/hpr/vy-lager) och
 * sidan läser bara färdiga kort — den räknar aldrig själv. Senast visade lista
 * ligger på enheten och visas direkt; ny data byts in tyst. Ett kort från förra
 * filen står kvar medan den färska räknas.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AVSTAND, FARG, KNAPP, KOLUMN_CSS, KORT, TYP, TNUM, VY_ROT, designCss, medSafeBotten } from '@/lib/design/tokens';
import VyKolumn from '@/components/design/VyKolumn';
import type { ObjektVy, ObjektKort, ProduktVy, VantandeObjekt } from './types';
import Detalj from './Detalj';
import { AllaObjektVy, OversiktVy } from './Vyer';
import { m3 } from './oversikt';

/** Senast visade lista på enheten — visas direkt nästa gång, uppdateras tyst.
 *  v2: korten bär felM3 (fel virke); en v1-lista hade visat översikten utan tal. */
const LISTA_NYCKEL = 'fordelning_lista_v2';
interface ListaSvar { objekt: ObjektKort[]; vantar: VantandeObjekt[]; attRakna: number }
function lasSparadLista(): ListaSvar | null {
  try {
    const t = localStorage.getItem(LISTA_NYCKEL);
    if (!t) return null;
    const d = JSON.parse(t);
    return Array.isArray(d?.objekt) ? { objekt: d.objekt, vantar: d.vantar ?? [], attRakna: 0 } : null;
  } catch { return null; }
}
function sparaLista(d: ListaSvar) {
  try { localStorage.setItem(LISTA_NYCKEL, JSON.stringify({ objekt: d.objekt, vantar: d.vantar })); } catch { /* fullt/privat läge */ }
}

/** Detaljvyer som redan visats i den här sessionen — tillbaka in = direkt. */
const detaljMinne = new Map<string, ObjektVy>();

/** Läs JSON och kasta med serverns felmeddelande om svaret inte är ok. */
async function lasJson(r: Response) {
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error || `Servern svarade ${r.status}`);
  return d;
}

function FelRad({ text, onIgen }: { text: string; onIgen: () => void }) {
  return (
    <section style={KORT}>
      <div style={{ ...TYP.listtitel }}>Kunde inte läsa apteringen</div>
      <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>{text}</div>
      <button type="button" onClick={onIgen} style={KNAPP.primar}>Försök igen</button>
    </section>
  );
}

function DetaljVy({ objectKey, onTillbaka }: { objectKey: string; onTillbaka: () => void }) {
  const [vy, setVy] = useState<ObjektVy | null>(() => detaljMinne.get(objectKey) ?? null);
  const [fel, setFel] = useState<string | null>(null);
  const [valdProdukt, setValdProdukt] = useState(0);
  const [försök, setFörsök] = useState(0);

  useEffect(() => {
    let av = false;
    setFel(null);
    const hämta = (rakna: boolean): Promise<void> =>
      fetch(`/api/fordelning/${encodeURIComponent(objectKey)}${rakna ? '?rakna=1' : ''}`)
        .then(lasJson)
        .then((d): Promise<void> | void => {
          if (av) return;
          if (!d?.objekt) throw new Error('Objektet saknar fördelningsdata');
          const nytt: ObjektVy = { ...d.objekt, uppdateras: !!d.uppdateras };
          detaljMinne.set(objectKey, nytt);
          setVy(nytt);
          // Från förra filen: visa den nu, hämta den färska i bakgrunden.
          if (d.uppdateras && !rakna) return hämta(true);
        });
    hämta(false).catch((e: unknown) => { if (!av) setFel(e instanceof Error ? e.message : String(e)); });
    return () => { av = true; };
  }, [objectKey, försök]);

  const tillbaka = <button type="button" onClick={onTillbaka} style={{ ...KNAPP.lank }}>‹ Alla objekt</button>;
  if (fel && !vy) return <>{tillbaka}<FelRad text={fel} onIgen={() => setFörsök((n) => n + 1)} /></>;
  if (!vy) return <>{tillbaka}<p style={{ ...TYP.meta, color: FARG.text2 }}>Hämtar trakten…</p></>;

  const p: ProduktVy | undefined = vy.produkter[valdProdukt];
  const felPct = vy.felM3 != null && vy.bedomdM3 ? Math.round((100 * Math.round(vy.felM3)) / Math.round(vy.bedomdM3)) : null;
  return (
    <div>
      {tillbaka}
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.xs}px`, ...TYP.rubrik }}>{vy.objektNamn}</h1>
      <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginBottom: AVSTAND.s }}>
        {vy.felM3 != null && vy.bedomdM3 != null
          ? `${m3(vy.felM3)} fel virke · ${felPct} % av ${m3(vy.bedomdM3)}`
          : `${m3(vy.volymM3)}`}
      </div>
      {vy.lage === 2 && vy.mening && <div style={{ ...TYP.text, marginBottom: AVSTAND.s }}>{vy.mening}</div>}
      {vy.uppdateras && <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>Ny fil · uppdateras…</div>}
      {fel && <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>Kunde inte uppdatera – visar senast hämtade</div>}

      {vy.produkter.length > 1 && (
        <div style={{ display: 'flex', gap: AVSTAND.s, margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px`, flexWrap: 'wrap' }}>
          {vy.produkter.map((pr, i) => (
            <button key={pr.productKey} type="button" onClick={() => setValdProdukt(i)} aria-pressed={i === valdProdukt}
              style={{ ...KNAPP.sekundar, width: 'auto', ...TYP.meta, color: i === valdProdukt ? FARG.bg : FARG.text, background: i === valdProdukt ? FARG.text : FARG.fyllning }}>
              {pr.namn} · {m3(pr.totalVolumeM3)}
            </button>
          ))}
        </div>
      )}

      {p && <Detalj vy={vy} produkt={p} />}
    </div>
  );
}

function FordelningInner() {
  const router = useRouter();
  const sök = useSearchParams();
  const vald = sök.get('objekt');
  const visaAlla = sök.get('vy') === 'alla';
  const startManad = sök.get('manad');
  const [lista, setLista] = useState<ListaSvar | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [räknar, setRäknar] = useState(0);
  const räknarRef = React.useRef(false);

  // Visa senast hämtade lista direkt (efter montering — localStorage finns inte på servern).
  useEffect(() => { const s = lasSparadLista(); if (s) setLista((l) => l ?? s); }, []);

  /** Räkna kort som är äldre än senaste filen — en omgång i taget tills inget är kvar. */
  const räknaOm = useCallback(async (antal: number) => {
    if (räknarRef.current) return;
    räknarRef.current = true;
    setRäknar(antal);
    try {
      for (let varv = 0; varv < 10; varv++) {
        const d = await fetch('/api/fordelning/berakna', { method: 'POST' }).then(lasJson);
        const ny: ListaSvar = await fetch('/api/fordelning').then(lasJson);
        setLista(ny);
        sparaLista(ny);
        setRäknar(d.kvar);
        if (!d.kvar || !d.raknade) break;
      }
    } catch {
      // Korten står kvar; nästa öppning försöker igen.
    } finally {
      räknarRef.current = false;
      setRäknar(0);
    }
  }, []);

  const ladda = useCallback(async () => {
    setFel(null);
    try {
      const d: ListaSvar = await fetch('/api/fordelning').then(lasJson);
      setLista(d);
      sparaLista(d);
      if (d.attRakna > 0) räknaOm(d.attRakna);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
    }
  }, [räknaOm]);

  useEffect(() => { if (!vald) ladda(); }, [vald, ladda]);

  const öppna = (k: string) => router.push(`/uppfoljning/fordelning?objekt=${encodeURIComponent(k)}`);
  const tillAlla = (manad?: string) => router.push(`/uppfoljning/fordelning?vy=alla${manad ? `&manad=${manad}` : ''}`);
  const avsluta = async (k: string) => {
    await fetch(`/api/fordelning/${encodeURIComponent(k)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markera_avslutad' }),
    }).then(lasJson);
    await ladda();
  };

  const wrap = (inner: React.ReactNode) => (
    <div style={{ ...VY_ROT, paddingTop: AVSTAND.l, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
      <style>{designCss}{KOLUMN_CSS}</style>
      <VyKolumn>{inner}</VyKolumn>
    </div>
  );

  if (vald) return wrap(<DetaljVy objectKey={vald} onTillbaka={() => router.push('/uppfoljning/fordelning?vy=alla')} />);

  const status = räknar > 0 ? `Räknar ${räknar} objekt med ny fil…` : fel && lista ? 'Kunde inte uppdatera – visar senast hämtade' : null;

  if (!lista) {
    const rubrik = <h1 style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.titel }}>{visaAlla ? 'Alla objekt' : 'Aptering'}</h1>;
    if (fel) return wrap(<>{rubrik}<FelRad text={fel} onIgen={ladda} /></>);
    return wrap(<>{rubrik}<p style={{ ...TYP.meta, color: FARG.text2 }}>Hämtar apteringen…</p></>);
  }

  if (visaAlla) {
    return wrap(
      <AllaObjektVy kort={lista.objekt} vantar={lista.vantar} status={status} startManad={startManad}
        onTillbaka={() => router.push('/uppfoljning/fordelning')} onOppna={öppna} onAvsluta={avsluta} />
    );
  }
  return wrap(
    <OversiktVy kort={lista.objekt} antalObjekt={lista.objekt.length + lista.vantar.length} status={status}
      onTillbaka={() => router.push('/uppfoljning')} onAlla={tillAlla} />
  );
}

export default function FordelningPage() {
  return (
    <React.Suspense fallback={<div style={{ ...VY_ROT }} />}>
      <FordelningInner />
    </React.Suspense>
  );
}
