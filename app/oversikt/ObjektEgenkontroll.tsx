'use client';

// Egenkontrollen som DOKUMENT pa objektets helsida.
//
// Ligger direkt efter Hansyn: planerad hansyn ovanfor, utfallet under. Detta
// ar inte en vy att jobba i - ingen redigering, inga knappar. Rundan besvaras
// i /egenkontroll, har lases den.
//
// Egen fil med avsikt: den delade OversiktObjektLista.tsx ror vi med tva rader
// (import + komponenten), sa parallella PR:ar pa objektvyn inte trasslar.

import { useEffect, useState } from 'react';
import { T } from '@/lib/utbildning';
import {
  hamtaRunda,
  hamtaFoton,
  utforandeUnderrad,
  AVVIKELSE_ETIKETT,
  GRUPPER,
  type EgenkontrollPunkt,
  type Egenkontroll,
  type EgenkontrollFoto,
  type AvvikelseTyp,
} from '@/lib/egenkontroll';
import { signeraFoto } from '@/lib/egenkontrollfoto';

const GUL = '#FFD60A';

/** Samma text och farg som i rundan - ett svar far inte heta olika pa tva stallen. */
const STATUS_TEXT: Record<string, { text: string; farg: string }> = {
  ok: { text: 'OK', farg: T.green },
  avvikelse: { text: 'Avvikelse', farg: T.red },
  bra: { text: 'Bra', farg: T.green },
  godkant: { text: 'Godkänt', farg: T.blue },
  battre: { text: 'Kan bli bättre', farg: GUL },
};

const MANADER = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

function datum(iso: string | null): string {
  if (!iso) return 'datum saknas';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'datum saknas';
  return `${d.getDate()} ${MANADER[d.getMonth()]} ${d.getFullYear()}`;
}

function typEtikett(typ: string): string {
  return typ === 'gallring' ? 'Gallring' : 'Slutavverkning';
}

function Rad({ punkt, fotoUrler }: { punkt: EgenkontrollPunkt; fotoUrler: string[] }) {
  const etikett = STATUS_TEXT[punkt.status ?? ''] ?? { text: 'Obesvarad', farg: T.t2 };
  const underrad =
    punkt.plan_kommentar ??
    (punkt.del === 'utforande' ? utforandeUnderrad(punkt.punkt_typ) : null);
  const typ = punkt.avvikelse_typ
    ? AVVIKELSE_ETIKETT[punkt.avvikelse_typ as AvvikelseTyp] ?? punkt.avvikelse_typ
    : null;
  const harPosition = punkt.lat != null && punkt.lng != null;

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '7px 0' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: T.t1 }}>{punkt.rubrik}</div>
        {underrad && (
          <div style={{ fontSize: 13, color: T.t2, lineHeight: 1.4, marginTop: 2 }}>
            {underrad}
          </div>
        )}
        {/* Typen i text - det markagaren ska kunna lasa utan att tolka farger. */}
        {typ && (
          <div style={{ fontSize: 13, color: T.red, fontWeight: 600, marginTop: 2 }}>{typ}</div>
        )}
        {punkt.kommentar && (
          <div style={{ fontSize: 13, color: T.t2, lineHeight: 1.4, marginTop: 2 }}>
            {punkt.kommentar}
          </div>
        )}
        {harPosition && (
          <div style={{ fontSize: 12, color: T.t2, marginTop: 2 }}>
            {punkt.lat!.toFixed(4)}, {punkt.lng!.toFixed(4)}
          </div>
        )}
        {fotoUrler.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            {fotoUrler.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                style={{ width: 72, height: 72, borderRadius: 8, objectFit: 'cover' }}
              />
            ))}
          </div>
        )}
      </div>
      {/* Texten bar beskedet - fargen upprepar det bara. */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: etikett.farg,
          whiteSpace: 'nowrap',
          paddingTop: 1,
        }}
      >
        {etikett.text}
      </div>
    </div>
  );
}

/**
 * Grupperar som i rundan: planpunkterna per grupp i faltordning, darefter
 * Utforandet. Samma ordning pa bada stallen - den som gatt rundan ska kanna
 * igen dokumentet.
 */
function gruppera(punkter: EgenkontrollPunkt[]): { rubrik: string; punkter: EgenkontrollPunkt[] }[] {
  const plan = punkter.filter((p) => p.del === 'plan');
  const utforande = punkter.filter((p) => p.del === 'utforande');

  const per = new Map<string, EgenkontrollPunkt[]>();
  for (const p of plan) {
    const g = p.grupp ?? 'Övrigt';
    if (!per.has(g)) per.set(g, []);
    per.get(g)!.push(p);
  }
  const rang = (g: string) => {
    const i = (GRUPPER as readonly string[]).indexOf(g);
    return i === -1 ? GRUPPER.length : i;
  };
  const grupper = Array.from(per.entries())
    .map(([rubrik, ps]) => ({ rubrik, punkter: [...ps].sort((a, b) => a.ordning - b.ordning) }))
    .sort((a, b) => rang(a.rubrik) - rang(b.rubrik) || (a.rubrik < b.rubrik ? -1 : 1));

  if (utforande.length > 0) {
    grupper.push({
      rubrik: 'Utförandet',
      punkter: [...utforande].sort((a, b) => a.ordning - b.ordning),
    });
  }
  return grupper;
}

export default function ObjektEgenkontroll({ objektId }: { objektId: string }) {
  const [runda, setRunda] = useState<Egenkontroll | null>(null);
  const [punkter, setPunkter] = useState<EgenkontrollPunkt[]>([]);
  const [laddat, setLaddat] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [fotoPerPunkt, setFotoPerPunkt] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let avbruten = false;
    (async () => {
      try {
        const vy = await hamtaRunda(objektId);
        if (avbruten) return;
        setRunda(vy.egenkontroll);
        setPunkter(vy.punkter);

        // Bilderna signeras med TTL, aldrig publik lank. Kan en bild inte
        // signeras utelamnas den - ett arligt tomt tillstand slar en trasig
        // bildikon (samma linje som lib/kartfiler.ts).
        if (vy.egenkontroll) {
          const foton = await hamtaFoton(vy.egenkontroll.id);
          const par = await Promise.all(
            foton.map(async (f: EgenkontrollFoto) => ({
              punktId: f.punkt_id,
              url: await signeraFoto(f.sokvag),
            })),
          );
          if (avbruten) return;
          const karta: Record<string, string[]> = {};
          for (const q of par) {
            if (!q.punktId || !q.url) continue;
            (karta[q.punktId] ??= []).push(q.url);
          }
          setFotoPerPunkt(karta);
        }
      } catch (e) {
        if (avbruten) return;
        // Ett fel far aldrig se ut som "ingen egenkontroll gjord" - da tror
        // planeraren att trakten ar okontrollerad.
        setFel(e instanceof Error ? e.message : 'Kunde inte läsa egenkontrollen.');
      } finally {
        if (!avbruten) setLaddat(true);
      }
    })();
    return () => { avbruten = true; };
  }, [objektId]);

  // Innan svaret finns ritas ingenting - sektionen ska inte blinka fram tom.
  if (!laddat) return null;

  if (fel) {
    return (
      <div style={{ fontSize: 14, color: T.orange, lineHeight: 1.45 }}>
        Kunde inte läsa egenkontrollen. {fel}
      </div>
    );
  }

  // Ingen runda alls, eller en som fortfarande pagar: dokumentet finns inte an.
  // Sag vilket av de tva det ar - de betyder olika saker.
  if (!runda) {
    return (
      <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.45 }}>
        Ingen egenkontroll är gjord på objektet.
      </div>
    );
  }
  if (runda.status !== 'klar') {
    const kvar = punkter.filter((p) => p.status === null).length;
    return (
      <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.45 }}>
        Egenkontrollen pågår — {punkter.length - kvar} av {punkter.length} punkter besvarade.
      </div>
    );
  }

  const antalAvvikelser = punkter.filter((p) => p.status === 'avvikelse').length;
  const antalBattre = punkter.filter((p) => p.status === 'battre').length;
  const grupper = gruppera(punkter);

  return (
    <div style={{ fontFamily: T.ff }}>
      <div style={{ fontSize: 14, color: T.t1, marginBottom: 2 }}>
        Klar {datum(runda.klar)} · {typEtikett(runda.objekt_typ)}
      </div>
      <div style={{ fontSize: 13, color: T.t2, marginBottom: 4 }}>
        {runda.utford_av ?? 'utförare okänd'}
      </div>
      <div style={{ fontSize: 13, color: T.t2, marginBottom: 12 }}>
        {punkter.length} punkter
        {' · '}
        <span style={{ color: antalAvvikelser > 0 ? T.red : T.t2, fontWeight: antalAvvikelser > 0 ? 600 : 400 }}>
          {antalAvvikelser} {antalAvvikelser === 1 ? 'avvikelse' : 'avvikelser'}
        </span>
        {' · '}
        <span style={{ color: antalBattre > 0 ? GUL : T.t2, fontWeight: antalBattre > 0 ? 600 : 400 }}>
          {antalBattre} kan bli bättre
        </span>
      </div>

      {grupper.map(({ rubrik, punkter: ps }) => (
        <div key={rubrik} style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.t2, marginBottom: 2 }}>
            {rubrik}
          </div>
          {ps.map((p, i) => (
            <div
              key={p.id}
              style={{ borderTop: i === 0 ? 'none' : `1px solid ${T.sep}` }}
            >
              <Rad punkt={p} fotoUrler={fotoPerPunkt[p.id] ?? []} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
