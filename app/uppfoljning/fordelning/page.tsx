'use client';

/**
 * /uppfoljning/fordelning — apteringsuppföljningen (etapp 2).
 * Läge 1 (inom mål, tyst) · läge 2 (avvikelse + mening) · läge 3 (detalj).
 * Alla siffror live ur databasen. Designkontraktet styr genomgående.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ObjektVy, ProduktVy } from './types';
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

function DetaljVy({ objectKey, onTillbaka }: { objectKey: string; onTillbaka: () => void }) {
  const [vy, setVy] = useState<ObjektVy | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [valdProdukt, setValdProdukt] = useState(0);

  useEffect(() => {
    let av = false;
    setVy(null); setFel(null);
    fetch(`/api/fordelning/${encodeURIComponent(objectKey)}`)
      .then((r) => r.json())
      .then((d) => { if (!av) { if (d.objekt) setVy(d.objekt); else setFel(d.error || 'Kunde inte läsa objektet'); } })
      .catch((e) => { if (!av) setFel(String(e)); });
    return () => { av = true; };
  }, [objectKey]);

  if (fel) return <div style={{ color: RED, fontSize: 14, padding: 16 }}>{fel}</div>;
  if (!vy) return <div style={{ color: GREY, fontSize: 14, padding: 16 }}>Räknar ur databasen…</div>;

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
  const [objekt, setObjekt] = useState<ObjektVy[] | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  const ladda = useCallback(() => {
    setObjekt(null); setFel(null);
    fetch('/api/fordelning?scope=alla')
      .then((r) => r.json())
      .then((d) => { if (d.objekt) setObjekt(d.objekt); else setFel(d.error || 'Kunde inte läsa'); })
      .catch((e) => setFel(String(e)));
  }, []);
  useEffect(() => { ladda(); }, [ladda]);

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

  if (fel) return wrap(<div style={{ color: RED, fontSize: 14 }}>{fel}</div>);
  if (!objekt) return wrap(<div style={{ color: GREY, fontSize: 14 }}>Räknar apteringen ur databasen…</div>);

  const påminnelser = objekt.filter((o) => o.status === 'active' && (o.dagarSedanFil ?? 0) >= 14);
  const läge2 = objekt.filter((o) => o.lage === 2);
  const läge1 = objekt.filter((o) => o.lage === 1);

  return wrap(
    <>
      <button onClick={() => router.push('/uppfoljning')} style={{ background: 'none', border: 'none', color: GREY, fontSize: 15, cursor: 'pointer', padding: '4px 0 12px' }}>‹ Uppföljning</button>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 20px' }}>Aptering</h1>

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

      {objekt.length === 0 && <div style={{ color: GREY, fontSize: 14 }}>Inga objekt med fördelningsmål ännu.</div>}
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
