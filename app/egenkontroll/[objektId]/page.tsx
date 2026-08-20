'use client';

// Egenkontroll - rundan for ett objekt. Avskalad: ingen karta i denna PR.
//
// Rundan skapas FORST nar planeraren trycker "Starta egenkontroll" - aldrig
// av att vyn oppnas. Att bara titta pa ett objekt far inte lamna spar i
// databasen, och det partiella unika indexet gor en oavsiktlig runda dyr:
// den blockerar varje nytt forsok tills nagon stadar bort den.
//
// TVA DELAR. Del 1 = planpunkterna, kontroll MOT PLANEN, svaras OK/Avvikelse.
// Del 2 = Utforandet, hantverket, svaras Bra/Godkant/Kan bli battre. De far
// aldrig dela svarsskala: "Kan bli battre" ar ingen avvikelse.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import SectionHeader from '@/components/SectionHeader';
import PageContainer from '@/components/PageContainer';
import { T } from '@/lib/utbildning';
import {
  hamtaRunda,
  generateEgenkontroll,
  svaraPaPunkt,
  utforandeUnderrad,
  GRUPPER,
  type RundVy,
  type EgenkontrollPunkt,
  type PunktDel,
  type PunktStatus,
} from '@/lib/egenkontroll';
import { avvikelseText } from '../format';

// GULT, INTE ROTT, for "Kan bli battre". Ingen har brutit mot nagot - blir det
// rott slutar folk satta det, och da far vi "Godkant" pa allt och verktyget ar
// dott. Rott ar reserverat for avvikelser mot planen i Del 1.
// #FFD60A ar samma gult som datahalsobannern pa startsidan; T.orange betyder
// redan "gar ut snart" pa utbildningssidorna.
const GUL = '#FFD60A';

/** Status i TEXT. Fargen upprepar bara det som redan star - den bar aldrig ensam. */
const STATUS_TEXT: Record<string, { text: string; farg: string }> = {
  ok: { text: 'OK', farg: T.green },
  avvikelse: { text: 'Avvikelse', farg: T.red },
  bra: { text: 'Bra', farg: T.green },
  godkant: { text: 'Godkänt', farg: T.blue },
  battre: { text: 'Kan bli bättre', farg: GUL },
};

function statusEtikett(status: string | null): { text: string; farg: string } {
  if (status && STATUS_TEXT[status]) return STATUS_TEXT[status];
  return { text: 'Obesvarad', farg: T.t2 };
}

/** Knapparna per del. Aldrig fler an dessa - tre val ar redan gransen i hytt. */
const SVARSALTERNATIV: Record<PunktDel, { status: PunktStatus; etikett: string; farg: string }[]> = {
  plan: [
    { status: 'ok', etikett: 'OK', farg: T.green },
    { status: 'avvikelse', etikett: 'Avvikelse', farg: T.red },
  ],
  utforande: [
    { status: 'bra', etikett: 'Bra', farg: T.green },
    { status: 'godkant', etikett: 'Godkänt', farg: T.blue },
    { status: 'battre', etikett: 'Kan bli bättre', farg: GUL },
  ],
};

/**
 * Grupp och sedan ordning. Presentationsordning valjs HAR, i vyn - ordning
 * ar punktens plats i rundan, inte ett lofte om hur den ska visas. Grupper
 * som inte finns i GRUPPER hamnar sist i stallet for att forsvinna.
 */
function gruppera(punkter: EgenkontrollPunkt[]): { grupp: string; punkter: EgenkontrollPunkt[] }[] {
  const per = new Map<string, EgenkontrollPunkt[]>();
  for (const p of punkter) {
    const g = p.grupp ?? 'Övrigt';
    if (!per.has(g)) per.set(g, []);
    per.get(g)!.push(p);
  }
  const rang = (g: string) => {
    const i = (GRUPPER as readonly string[]).indexOf(g);
    return i === -1 ? GRUPPER.length : i;
  };
  return Array.from(per.entries())
    .map(([grupp, ps]) => ({ grupp, punkter: [...ps].sort((a, b) => a.ordning - b.ordning) }))
    .sort((a, b) => rang(a.grupp) - rang(b.grupp) || (a.grupp < b.grupp ? -1 : 1));
}

function SvarsKnapp({
  etikett,
  aktiv,
  farg,
  sparar,
  onClick,
}: {
  etikett: string;
  aktiv: boolean;
  farg: string;
  sparar: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={sparar}
      aria-pressed={aktiv}
      style={{
        flex: 1,
        minHeight: 44, // handske i skog - traffytan far inte krympa
        borderRadius: 10,
        border: `1.5px solid ${aktiv ? farg : 'rgba(255,255,255,0.14)'}`,
        background: aktiv ? farg : 'transparent',
        color: aktiv ? '#000' : T.t1,
        fontSize: 16,
        fontWeight: 600,
        fontFamily: T.ff,
        opacity: sparar ? 0.5 : 1,
      }}
    >
      {etikett}
    </button>
  );
}

/**
 * Kortet. Storleken ar bekraftad i falt - andra den inte.
 *
 * Planerarens kommentar star under rubriken, mindre och nedtonad, utan
 * etikett. Saknas den ritas ingenting alls - ingen tom rad, ingen
 * platshallare som lurar ogat att leta.
 */
function PunktKort({
  punkt,
  sparar,
  onSvara,
}: {
  punkt: EgenkontrollPunkt;
  sparar: boolean;
  onSvara: (status: PunktStatus) => void;
}) {
  const etikett = statusEtikett(punkt.status);
  const underrad = punkt.del === 'utforande' ? utforandeUnderrad(punkt.punkt_typ) : null;
  const hjalptext = punkt.plan_kommentar ?? underrad;
  const alternativ = SVARSALTERNATIV[punkt.del as PunktDel] ?? SVARSALTERNATIV.plan;

  return (
    <div style={{ background: T.group, borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ fontSize: 16, fontWeight: 500 }}>{punkt.rubrik}</div>
      {hjalptext && (
        <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.4, marginTop: 3 }}>
          {hjalptext}
        </div>
      )}
      <div
        style={{
          fontSize: 13,
          color: etikett.farg,
          fontWeight: 600,
          margin: '2px 0 10px',
        }}
      >
        {sparar ? 'Sparar…' : etikett.text}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {alternativ.map((a) => (
          <SvarsKnapp
            key={a.status}
            etikett={a.etikett}
            aktiv={punkt.status === a.status}
            farg={a.farg}
            sparar={sparar}
            onClick={() => onSvara(a.status)}
          />
        ))}
      </div>
    </div>
  );
}

export default function EgenkontrollRundaPage() {
  const params = useParams<{ objektId: string }>();
  const objektId = params.objektId;

  const [vy, setVy] = useState<RundVy | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [startar, setStartar] = useState(false);
  const [sparStatus, setSparStatus] = useState<Record<string, boolean>>({});
  const [sparFel, setSparFel] = useState<string | null>(null);

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    try {
      setVy(await hamtaRunda(objektId));
    } catch (e) {
      setVy(null);
      setFel(e instanceof Error ? e.message : 'Kunde inte hämta egenkontrollen.');
    } finally {
      setLaddar(false);
    }
  }, [objektId]);

  useEffect(() => {
    ladda();
  }, [ladda]);

  const starta = async () => {
    setStartar(true);
    setSparFel(null);
    try {
      await generateEgenkontroll(objektId);
      await ladda();
    } catch (e) {
      setSparFel(e instanceof Error ? e.message : 'Kunde inte starta egenkontrollen.');
    } finally {
      setStartar(false);
    }
  };

  const svara = async (punkt: EgenkontrollPunkt, status: PunktStatus) => {
    // Trycket pa redan valt svar ar en no-op: ingen skrivning, ingen blink.
    if (punkt.status === status) return;
    setSparStatus((s) => ({ ...s, [punkt.id]: true }));
    setSparFel(null);
    try {
      // Delen skickas med sa en punkt inte kan fa fel statusklass.
      const sparad = await svaraPaPunkt(punkt.id, status, punkt.del as PunktDel);
      // Ersatt raden med den som DB faktiskt returnerade - skarmen visar det
      // som star i databasen, aldrig det vi hoppades skriva.
      setVy((v) =>
        v ? { ...v, punkter: v.punkter.map((p) => (p.id === sparad.id ? sparad : p)) } : v,
      );
    } catch (e) {
      setSparFel(e instanceof Error ? e.message : 'Kunde inte spara svaret.');
    } finally {
      setSparStatus((s) => ({ ...s, [punkt.id]: false }));
    }
  };

  const planpunkter = useMemo(
    () => (vy?.punkter ?? []).filter((p) => p.del === 'plan'),
    [vy?.punkter],
  );
  const utforandepunkter = useMemo(
    () => (vy?.punkter ?? []).filter((p) => p.del === 'utforande').sort((a, b) => a.ordning - b.ordning),
    [vy?.punkter],
  );

  const grupper = useMemo(() => gruppera(planpunkter), [planpunkter]);
  const antalPlan = planpunkter.length;
  const besvaradePlan = planpunkter.filter((p) => p.status !== null).length;
  const antalAvvikelser = planpunkter.filter((p) => p.status === 'avvikelse').length;
  const antalUtforande = utforandepunkter.length;
  const besvaradeUtforande = utforandepunkter.filter((p) => p.status !== null).length;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff }}>
      <PageContainer width="smal" style={{ paddingBottom: 120, paddingTop: 8 }}>
        <Link
          href="/egenkontroll"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            minHeight: 44,
            color: T.blue,
            textDecoration: 'none',
            fontSize: 17,
            marginLeft: -6,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 24 }}>
            chevron_left
          </span>
          Egenkontroll
        </Link>

        {laddar && (
          <div style={{ padding: '32px 4px', color: T.t2, fontSize: 15 }}>Hämtar rundan…</div>
        )}

        {!laddar && fel && (
          <div style={{ background: T.group, borderRadius: 12, padding: 16, marginTop: 12 }}>
            <div style={{ fontSize: 15, marginBottom: 12 }}>{fel}</div>
            <button
              onClick={ladda}
              style={{
                minHeight: 44,
                width: '100%',
                borderRadius: 10,
                border: 'none',
                background: T.blue,
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                fontFamily: T.ff,
              }}
            >
              Försök igen
            </button>
          </div>
        )}

        {!laddar && !fel && vy && (
          <>
            <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5, margin: '4px 0 4px' }}>
              {vy.objektNamn}
            </h1>

            {!vy.egenkontroll ? (
              <>
                <p style={{ fontSize: 15, color: T.t2, lineHeight: 1.5, margin: '0 0 20px' }}>
                  Ingen egenkontroll är startad. När du startar skapas checklistan
                  ur objektets planering — hänsyn, kulturlämningar, basvägar och
                  avlägg som planerades — plus punkterna om själva utförandet.
                </p>
                <button
                  onClick={starta}
                  disabled={startar}
                  style={{
                    width: '100%',
                    minHeight: 52,
                    borderRadius: 12,
                    border: 'none',
                    background: T.green,
                    color: '#000',
                    fontSize: 17,
                    fontWeight: 700,
                    fontFamily: T.ff,
                    opacity: startar ? 0.5 : 1,
                  }}
                >
                  {startar ? 'Startar…' : 'Starta egenkontroll'}
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: 22, fontWeight: 600, margin: '2px 0 2px' }}>
                  {besvaradePlan} av {antalPlan} klara
                </div>
                <p style={{ fontSize: 15, color: antalAvvikelser > 0 ? T.red : T.t2, margin: '0 0 8px' }}>
                  {avvikelseText(antalAvvikelser)}
                </p>

                {antalPlan === 0 && (
                  <div style={{ background: T.group, borderRadius: 12, padding: 16, marginTop: 12 }}>
                    <div style={{ fontSize: 15, marginBottom: 6 }}>
                      Rundan har inga punkter mot planen.
                    </div>
                    <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.45 }}>
                      Objektet saknade markeringar som blir kontrollpunkter — hänsyn,
                      kulturlämningar, basvägar eller avlägg.
                    </div>
                  </div>
                )}

                {grupper.map(({ grupp, punkter }) => (
                  <div key={grupp}>
                    <SectionHeader>{grupp}</SectionHeader>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {punkter.map((p) => (
                        <PunktKort
                          key={p.id}
                          punkt={p}
                          sparar={!!sparStatus[p.id]}
                          onSvara={(status) => svara(p, status)}
                        />
                      ))}
                    </div>
                  </div>
                ))}

                {/* Del 2. Doljs HELT nar rundan saknar utforandepunkter - en
                    runda som startades fore denna PR far dem aldrig, sa det
                    finns ingenting att forklara sig ur. */}
                {antalUtforande > 0 && (
                  <div>
                    <SectionHeader>Utförandet</SectionHeader>
                    <div style={{ fontSize: 15, color: T.t2, padding: '0 16px 8px' }}>
                      {besvaradeUtforande} av {antalUtforande}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {utforandepunkter.map((p) => (
                        <PunktKort
                          key={p.id}
                          punkt={p}
                          sparar={!!sparStatus[p.id]}
                          onSvara={(status) => svara(p, status)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* App-egen felruta - aldrig alert(), den blockeras tyst i inbaddade lagen. */}
        {sparFel && (
          <div
            role="alert"
            style={{
              position: 'fixed',
              left: 12,
              right: 12,
              bottom: 88,
              background: T.red,
              color: '#fff',
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 14,
              lineHeight: 1.4,
              zIndex: 900,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <span style={{ flex: 1 }}>{sparFel}</span>
            <button
              onClick={() => setSparFel(null)}
              style={{
                minHeight: 44,
                minWidth: 44,
                border: 'none',
                background: 'transparent',
                color: '#fff',
                fontSize: 15,
                fontWeight: 700,
                fontFamily: T.ff,
              }}
            >
              Stäng
            </button>
          </div>
        )}
      </PageContainer>
    </div>
  );
}
