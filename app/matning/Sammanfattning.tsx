'use client';

// Sammanfattningen över en hel mätning.
//
// ETT TAL DOMINERAR: medelgrundytan. Det är svaret på frågan Martin gick ut
// för att besvara — hur mycket står kvar.
//
// SPRIDNINGEN ÄR DET NÄST VIKTIGASTE, och den står i ord. Ett tal ensamt
// säger inte om 4 m²/ha är mycket eller lite; det beror på medlet. Texten
// skiljer "det här går att lita på" från "gå ut och mät fler punkter".
//
// Ofullständiga varv räknas inte in i medel och spridning — de är
// underskattningar och skulle dra ned medlet och blåsa upp spridningen på ett
// sätt som ser ut som variation i beståndet. De redovisas separat i stället
// för att tigas ihjäl.

import { useCallback, useEffect, useState } from 'react';
import { T } from '@/lib/utbildning';
import { tradslagStil } from '@/lib/tradslag';
import { fmtDecimal } from '@/lib/gallring';

/**
 * Ett tal ur databasen, skrivet som svenska skriver tal.
 *
 * Number() först: PostgREST kan returnera numeric som sträng, och då hade
 * fmtDecimal tyst gett tillbaka strängen oförändrad — med punkt i stället för
 * komma, mitt bland tal som formaterats rätt. Blir det inget tal alls skrivs
 * ett streck, aldrig NaN.
 *
 * Decimalen skrivs bara ut när den finns. En punkts grundyta är antalet träd
 * gånger faktorn — vid faktor 1 alltså alltid ett helt tal, och "14,0 m²/ha"
 * skulle påstå en precision mätningen inte har. Medelvärdet är ett räknat tal
 * och behåller sin decimal när det har en.
 */
function tal(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return '—';
  return fmtDecimal(n, Number.isInteger(n) ? 0 : 1);
}

/** Andelarna står under varandra och läses som en kolumn. Där behåller alla
 *  sin decimal — "15 %" mitt bland "55,7 %" ser ut som ett annat sorts tal. */
function pct(v: number | string | null | undefined): string {
  const n = Number(v);
  return v == null || !Number.isFinite(n) ? '—' : fmtDecimal(n, 1);
}
import {
  hamtaSammanfattning,
  spridningsText,
  type SammanfattningResultat,
} from '@/lib/matning/sammanfattning';

export default function Sammanfattning({
  matningId,
  traktNamn,
  onStang,
}: {
  matningId: string;
  traktNamn: string;
  onStang: () => void;
}) {
  const [r, setR] = useState<SammanfattningResultat | null>(null);

  const ladda = useCallback(async () => {
    setR(null);
    try {
      setR(await hamtaSammanfattning(matningId));
    } catch (e) {
      setR({ status: 'fel', meddelande: e instanceof Error ? e.message : 'Okänt fel' });
    }
  }, [matningId]);

  useEffect(() => { void ladda(); }, [ladda]);

  const ruta: React.CSSProperties = {
    background: '#1C1C1E', borderRadius: 16, padding: 18, marginBottom: 12,
    fontSize: 17, lineHeight: 1.5, color: '#E5E5EA',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff, padding: '16px 16px 120px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4, margin: '8px 0 4px' }}>{traktNamn}</h1>
      <p style={{ fontSize: 16, color: '#C7C7CC', margin: '0 0 20px' }}>Kvarvarande grundyta</p>

      {r === null && <div style={ruta}>Räknar…</div>}

      {r?.status === 'vyer_saknas' && (
        <div style={{ ...ruta, border: '2px solid #FF9F0A' }}>
          <strong style={{ color: '#fff', display: 'block', marginBottom: 6 }}>
            Sammanfattningen kan inte räknas
          </strong>
          Vyerna som räknar medel och spridning finns inte i databasen än. Kör migrationen
          20260826_matning_objekt_uuid_och_vyer.sql — mätningarna är sparade och påverkas inte.
        </div>
      )}

      {r?.status === 'fel' && (
        <div style={{ ...ruta, border: '2px solid #FF9F0A' }}>
          <strong style={{ color: '#fff', display: 'block', marginBottom: 6 }}>Kunde inte läsa</strong>
          {r.meddelande}
        </div>
      )}

      {r?.status === 'tom' && (
        <div style={ruta}>
          Mätningen hittades inte i databasen. Har punkterna synkats?
        </div>
      )}

      {r?.status === 'ok' && (() => {
        const s = r.sammanfattning;
        return (
          <>
            {/* Talet. Finns ingen sluten punkt finns inget medel, och då står
                det vad som saknas — ett streck över "medel över 0 punkter" ser ut
                som ett fel i appen, inte som ett ogjort varv. */}
            {s.punkter_slutna === 0 ? (
              <div style={{ ...ruta, border: '2px solid #FF9F0A', marginBottom: 14 }}>
                <strong style={{ color: '#fff', display: 'block', marginBottom: 6, fontSize: 20 }}>
                  Inget medel att visa
                </strong>
                Ingen av punkterna har ett slutet varv. Grundytan går inte att räkna på
                ett halvt varv — gå tillbaka och mät hela varvet på minst en punkt.
              </div>
            ) : (
              <div style={{ ...ruta, background: '#0E2A16', border: '2px solid #30D158', marginBottom: 14 }}>
                <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1, color: '#fff' }}>
                  {tal(s.medel_grundyta)}
                  <span style={{ fontSize: 22, fontWeight: 600, marginLeft: 10 }}>m²/ha</span>
                </div>
                <div style={{ fontSize: 16, color: '#C7C7CC', marginTop: 8 }}>
                  medel över {s.punkter_slutna} {s.punkter_slutna === 1 ? 'punkt' : 'punkter'}
                </div>
              </div>
            )}

            {/* Spridningen, i ord. */}
            <div style={ruta}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {s.spridning != null ? `± ${tal(s.spridning)} m²/ha` : 'Spridning saknas'}
              </div>
              {spridningsText(s)}
              {s.lagsta != null && s.hogsta != null && (
                <div style={{ fontSize: 16, color: '#C7C7CC', marginTop: 8 }}>
                  Lägsta punkt {tal(s.lagsta)}, högsta {tal(s.hogsta)} m²/ha
                </div>
              )}
            </div>

            {/* Ofullständiga varv — redovisas, aldrig dolda. */}
            {s.punkter_ofullstandiga > 0 && (
              <div style={{ ...ruta, border: '2px solid #FF9F0A' }}>
                <strong style={{ color: '#fff', display: 'block', marginBottom: 4 }}>
                  {s.punkter_ofullstandiga} {s.punkter_ofullstandiga === 1 ? 'punkt' : 'punkter'} med
                  ofullständigt varv
                </strong>
                De räknas inte in i medlet ovan. Ett varv som inte gick runt ger en för låg
                grundyta, och att blanda in den skulle se ut som variation i beståndet.
              </div>
            )}

            {/* Per trädslag — andel av ANTALET stammar, för det är vad relaskopet mäter. */}
            {r.tradslag.length > 0 && (
              <>
                <div style={{ fontSize: 14, letterSpacing: 0.6, color: '#C7C7CC', margin: '18px 0 8px' }}>
                  TRÄDSLAG — ANDEL AV ANTALET STAMMAR
                </div>
                {r.tradslag.map((t, i) => {
                  const stil = tradslagStil(t.tradslag, i);
                  return (
                    <div key={t.tradslag} style={{ background: '#1C1C1E', borderRadius: 12, padding: '14px 16px', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span
                          style={{
                            width: 18, height: 18, borderRadius: 4, background: stil.fyll,
                            border: `2px solid ${stil.kontur ?? 'rgba(0,0,0,0.6)'}`, boxSizing: 'border-box',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ flex: 1, fontSize: 18, color: '#fff' }}>{t.tradslag}</span>
                        <span style={{ fontSize: 19, fontWeight: 700, color: '#fff' }}>{pct(t.andel_pct)} %</span>
                      </div>
                      <div style={{ fontSize: 15, color: '#C7C7CC', marginTop: 6 }}>
                        {t.antal_trad} räknade stammar · {tal(t.grundyta_m2_per_ha)} m²/ha
                      </div>
                      <div style={{ height: 7, background: '#2C2C2E', borderRadius: 3, marginTop: 8, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${t.andel_pct}%`, height: '100%', background: stil.fyll,
                            border: stil.kontur ? `1px solid ${stil.kontur}` : 'none', boxSizing: 'border-box',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* Punkterna, så en avvikare går att peka ut. */}
            {r.punkter.length > 0 && (
              <>
                <div style={{ fontSize: 14, letterSpacing: 0.6, color: '#C7C7CC', margin: '18px 0 8px' }}>
                  PUNKTER
                </div>
                {r.punkter.map((p) => (
                  <div
                    key={p.punkt_nummer}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#1C1C1E', borderRadius: 12, padding: '13px 16px', marginBottom: 6,
                      minHeight: 60,
                    }}
                  >
                    <span style={{ fontSize: 17 }}>
                      Punkt {p.punkt_nummer}
                      <span style={{ fontSize: 15, color: '#C7C7CC', marginLeft: 8 }}>
                        {p.antal_trad} träd
                      </span>
                    </span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>
                      {tal(p.grundyta_m2_per_ha)} m²/ha
                      {!p.varv_slutet && (
                        <span style={{ fontSize: 14, color: '#FF9F0A', marginLeft: 10 }}>
                          {p.varv_grader != null ? `${Math.round(Math.abs(p.varv_grader))}°` : 'ofullständigt'}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        );
      })()}

      <button
        onClick={onStang}
        style={{
          width: '100%', minHeight: 68, marginTop: 20, borderRadius: 16, border: 'none',
          background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 18, fontWeight: 600,
        }}
      >
        Tillbaka
      </button>
    </div>
  );
}
