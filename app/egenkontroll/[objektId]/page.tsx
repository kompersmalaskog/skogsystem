'use client';

// Egenkontroll - rundan for ett objekt. Avskalad: ingen karta i denna PR.
//
// Rundan skapas FORST nar planeraren trycker "Starta egenkontroll" - aldrig
// av att vyn oppnas. Att bara titta pa ett objekt far inte lamna spar i
// databasen, och det partiella unika indexet gor en oavsiktlig runda dyr:
// den blockerar varje nytt forsok tills nagon stadar bort den.

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
  GRUPPER,
  type RundVy,
  type EgenkontrollPunkt,
  type PlanStatus,
} from '@/lib/egenkontroll';
import { avvikelseText } from '../format';

/** Status i TEXT. Fargen nedan upprepar detta - den bar aldrig ensam. */
const STATUS_TEXT: Record<string, { text: string; farg: string }> = {
  ok: { text: 'OK', farg: T.green },
  avvikelse: { text: 'Avvikelse', farg: T.red },
};

function statusEtikett(status: string | null): { text: string; farg: string } {
  if (status && STATUS_TEXT[status]) return STATUS_TEXT[status];
  return { text: 'Obesvarad', farg: T.t2 };
}

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

  const svara = async (punkt: EgenkontrollPunkt, status: PlanStatus) => {
    // Trycket pa redan valt svar ar en no-op: ingen skrivning, ingen blink.
    if (punkt.status === status) return;
    setSparStatus((s) => ({ ...s, [punkt.id]: true }));
    setSparFel(null);
    try {
      const sparad = await svaraPaPunkt(punkt.id, status);
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

  const grupper = useMemo(() => gruppera(vy?.punkter ?? []), [vy?.punkter]);
  const antalPunkter = vy?.punkter.length ?? 0;
  const antalBesvarade = vy?.punkter.filter((p) => p.status !== null).length ?? 0;
  const antalAvvikelser = vy?.punkter.filter((p) => p.status === 'avvikelse').length ?? 0;

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
                  avlägg som planerades.
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
                  {antalBesvarade} av {antalPunkter} klara
                </div>
                <p style={{ fontSize: 15, color: antalAvvikelser > 0 ? T.red : T.t2, margin: '0 0 8px' }}>
                  {avvikelseText(antalAvvikelser)}
                </p>

                {antalPunkter === 0 && (
                  <div style={{ background: T.group, borderRadius: 12, padding: 16, marginTop: 12 }}>
                    <div style={{ fontSize: 15, marginBottom: 6 }}>
                      Rundan är startad men har inga punkter.
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
                      {punkter.map((p) => {
                        const etikett = statusEtikett(p.status);
                        const sparar = !!sparStatus[p.id];
                        return (
                          <div
                            key={p.id}
                            style={{ background: T.group, borderRadius: 12, padding: '12px 14px' }}
                          >
                            <div style={{ fontSize: 16, fontWeight: 500 }}>{p.rubrik}</div>
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
                              <SvarsKnapp
                                etikett="OK"
                                aktiv={p.status === 'ok'}
                                farg={T.green}
                                sparar={sparar}
                                onClick={() => svara(p, 'ok')}
                              />
                              <SvarsKnapp
                                etikett="Avvikelse"
                                aktiv={p.status === 'avvikelse'}
                                farg={T.red}
                                sparar={sparar}
                                onClick={() => svara(p, 'avvikelse')}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
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
