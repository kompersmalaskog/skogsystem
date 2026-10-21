'use client';

/**
 * /uppfoljning/fordelning — apteringsuppföljningen (etapp 2).
 * Läge 1 (inom mål, tyst) · läge 2 (avvikelse + mening) · läge 3 (detalj).
 * Siffrorna räknas ur databasen när HPR-filen importeras (lib/hpr/vy-lager)
 * och sidan läser bara färdiga kort — den räknar aldrig själv. Senast visade
 * lista ligger på enheten och visas direkt; ny data byts in tyst. Ett kort
 * från förra filen står kvar med "uppdateras…" medan den färska räknas.
 * Designkontraktet styr genomgående.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ObjektVy, ObjektKort, ProduktVy, VantandeObjekt } from './types';
import Detalj from './Detalj';
import { Objektkort, Avslutsrad, fmtGrad } from './Kort';

const GREY = '#8e8e93';
const GREY2 = '#636366';
const CARD = '#1c1c1e';
const SEP = 'rgba(255,255,255,0.06)';
const WARN = '#ff9f0a';
const RED = '#ff453a';
const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

const kommatal = (n: number) => n.toString().replace('.', ',');

/** Senast visade lista på enheten — visas direkt nästa gång, uppdateras tyst. */
const LISTA_NYCKEL = 'fordelning_lista_v1';
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
    <div style={{ background: CARD, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 15, color: '#fff', marginBottom: 4 }}>Kunde inte läsa apteringen</div>
      <div style={{ fontSize: 13, color: GREY, marginBottom: 12, lineHeight: 1.4 }}>{text}</div>
      <button onClick={onIgen} style={{ background: '#fff', color: '#000', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600, padding: '12px 18px', minHeight: 44, cursor: 'pointer' }}>
        Försök igen
      </button>
    </div>
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

  if (fel && !vy) return <FelRad text={fel} onIgen={() => setFörsök((n) => n + 1)} />;
  if (!vy) return <div style={{ color: GREY, fontSize: 14, padding: 16 }}>Hämtar objektet…</div>;

  const p: ProduktVy | undefined = vy.produkter[valdProdukt];
  return (
    <div>
      <button onClick={onTillbaka} style={{ background: 'none', border: 'none', color: GREY, fontSize: 15, cursor: 'pointer', padding: '4px 0 12px' }}>‹ Alla objekt</button>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 2px' }}>{vy.objektNamn}</h1>
      <div style={{ fontSize: 14, color: vy.lage === 2 ? WARN : GREY, marginBottom: 4 }}>
        {fmtGrad(vy.gradePct)} · {Math.round(vy.volymM3)} m³ {vy.lage === 2 ? '· avvikelse' : '· inom mål'}
      </div>
      {vy.lage === 2 && vy.mening && <div style={{ fontSize: 15, color: '#fff', marginBottom: 6, lineHeight: 1.5 }}>{vy.mening}</div>}
      {vy.headline && <div style={{ fontSize: 12, color: GREY2, marginBottom: 16 }}>{vy.headline}</div>}
      {vy.uppdateras && <div style={{ fontSize: 13, color: GREY2, marginBottom: 16 }}>Ny fil · uppdateras…</div>}
      {fel && <div style={{ fontSize: 13, color: GREY2, marginBottom: 16 }}>Kunde inte uppdatera – visar senast hämtade</div>}

      {vy.produkter.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {vy.produkter.map((pr, i) => (
            <button key={pr.productKey} onClick={() => setValdProdukt(i)}
              style={{ background: i === valdProdukt ? '#2c2c2e' : 'transparent', border: `1px solid ${SEP}`, color: i === valdProdukt ? '#fff' : GREY, fontSize: 13, borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }}>
              {pr.namn} · {Math.round(pr.totalVolumeM3)} m³
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
  const [lista, setLista] = useState<ListaSvar | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [räknar, setRäknar] = useState(0);
  const räknarRef = React.useRef(false);

  // Visa senast hämtade lista direkt (efter montering — localStorage finns inte på servern).
  useEffect(() => { const s = lasSparadLista(); if (s) setLista((l) => l ?? s); }, []);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Korten står kvar med "uppdateras…"; nästa öppning försöker igen.
    } finally {
      räknarRef.current = false;
      setRäknar(0);
    }
  }, []);

  useEffect(() => { if (!vald) ladda(); }, [vald, ladda]);

  const öppna = (k: string) => router.push(`/uppfoljning/fordelning?objekt=${encodeURIComponent(k)}`);
  const tillbaka = () => router.push('/uppfoljning/fordelning');
  const avsluta = async (k: string) => {
    await fetch(`/api/fordelning/${encodeURIComponent(k)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markera_avslutad' }),
    });
    ladda();
  };

  const wrap = (inner: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: ff, padding: '16px 16px 100px', maxWidth: 560, margin: '0 auto' }}>{inner}</div>
  );

  if (vald) return wrap(<DetaljVy objectKey={vald} onTillbaka={tillbaka} />);

  const huvud = (
    <>
      <button onClick={() => router.push('/uppfoljning')} style={{ background: 'none', border: 'none', color: GREY, fontSize: 15, cursor: 'pointer', padding: '4px 0 12px', minHeight: 44 }}>‹ Uppföljning</button>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 20px' }}>Aptering</h1>
    </>
  );

  if (!lista) {
    if (fel) return wrap(<>{huvud}<FelRad text={fel} onIgen={ladda} /></>);
    return wrap(<>{huvud}<div style={{ color: GREY, fontSize: 14 }}>Hämtar apteringen…</div></>);
  }

  const objekt = lista.objekt;
  const påminnelser = objekt.filter((o) => o.status === 'active' && (o.dagarSedanFil ?? 0) >= 14);
  const läge2 = objekt.filter((o) => o.lage === 2);
  const läge1 = objekt.filter((o) => o.lage === 1);

  return wrap(
    <>
      {huvud}

      {(räknar > 0 || fel) && (
        <div style={{ fontSize: 13, color: GREY2, margin: '-12px 0 16px 4px' }}>
          {räknar > 0
            ? `Räknar ${räknar} objekt med ny fil…`
            : 'Kunde inte uppdatera – visar senast hämtade'}
        </div>
      )}

      {påminnelser.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {påminnelser.map((o) => <Avslutsrad key={o.objectKey} vy={o} onAvsluta={avsluta} />)}
        </div>
      )}

      {läge2.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: GREY, margin: '0 0 12px 4px' }}>Att titta på</div>
          {läge2.map((o) => <Objektkort key={o.objectKey} vy={o} onÖppna={öppna} />)}
        </div>
      )}

      {läge1.length > 0 && (
        <div style={{ marginTop: läge2.length ? 20 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: GREY, margin: '0 0 12px 4px' }}>Inom mål</div>
          {läge1.map((o) => <Objektkort key={o.objectKey} vy={o} onÖppna={öppna} />)}
        </div>
      )}

      {lista.vantar.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: GREY, margin: '0 0 12px 4px' }}>Räknas</div>
          {lista.vantar.map((o) => (
            <div key={o.objectKey} style={{ background: CARD, borderRadius: 12, padding: 16, marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{o.objektNamn ?? 'Okänt objekt'}</span>
              <span style={{ fontSize: 13, color: GREY2, whiteSpace: 'nowrap' }}>Räknas…</span>
            </div>
          ))}
        </div>
      )}

      {objekt.length === 0 && lista.vantar.length === 0 && (
        <div style={{ color: GREY, fontSize: 14, lineHeight: 1.5 }}>
          Inga objekt med apteringsmål ännu. De kommer hit när skördarens HPR-fil med fördelningsmatris importerats.
        </div>
      )}
    </>
  );
}

export default function FordelningPage() {
  return (
    <React.Suspense fallback={<div style={{ minHeight: '100vh', background: '#000' }} />}>
      <FordelningInner />
    </React.Suspense>
  );
}
