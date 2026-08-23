'use client';

// Gallringskvitto — sidan markägaren får efter utförd gallring.
//
// LJUS, inte mörk. Resten av appen är svart för att läsas i hytt; det här är
// ett dokument som ska skrivas ut på vitt papper. Renderas det mörkt på skärmen
// och ljust i skrivaren vet ingen vad de får förrän det ligger i facket. Sidan
// visar därför pappret som det kommer se ut — samma mått, samma färger.
//
// Ingen PDF-generator och inget nytt beroende. Webbläsarens "Skriv ut → Spara
// som PDF" gör jobbet, på iPad likaväl som på dator.
//
// TRE SAKER SOM INTE FÅR TAS BORT
//
// 1. Att andelarna är STAMANDEL står utskrivet. Gallringsvyn visar volymandel
//    för samma trakt (Tall 61 % mot 55 % på Hålabäck). Utan basen utskriven
//    ser dokumenten ut att säga emot varandra.
// 2. "Detta är inte mätt"-rutan. Den ser negativ ut men är det som gör kvittot
//    trovärdigt — den drar gränsen mellan vad maskinen mätte och vad som skulle
//    kräva att någon gick i beståndet med klave.
// 3. Att kvittot avser avslutad SKÖRDNING. Skotningen kan pågå, och en
//    markägare som ser virke kvar i skogen ska förstå varför.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { datumspann, fmtAntal, fmtDecimal, fmtVolym, kortDatum } from '@/lib/gallring';
import {
  hamtaKvitto,
  idagLokalt,
  medelstam,
  sortimentMedSumma,
  uttagenGrundytaPerHa,
  type Kvitto,
} from '@/lib/kvitto';
import { tradslagStil } from '@/lib/tradslag';

// Pappersfärger. Egna och avsiktligt skilda från appens T-tokens — de är
// definierade för svart bakgrund och skulle bli oläsliga på vitt.
const P = {
  blad: '#FFFFFF',
  skarm: '#3A3A3C', // skärmytan runt bladet, så pappret syns som ett papper
  text: '#1A1A1A',
  svag: '#5A5A5A',
  linje: '#D8D8D8',
  ram: '#9A9A9A',
  ff: "-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif",
};

const FORETAG = 'Kompersmåla Skog AB';

/** Etikett + värde. Utelämnas helt när värdet saknas — ett kvitto med tomma
 *  rader ser ut som ett ofullständigt dokument. */
function Fakta({ etikett, varde }: { etikett: string; varde: string | null }) {
  if (!varde) return null;
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 11, lineHeight: 1.6 }}>
      <span style={{ color: P.svag, minWidth: 78 }}>{etikett}</span>
      <span style={{ color: P.text }}>{varde}</span>
    </div>
  );
}

function Rubrik({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        color: P.svag,
        margin: '0 0 6px',
        paddingBottom: 3,
        borderBottom: `1px solid ${P.linje}`,
      }}
    >
      {children}
    </h2>
  );
}

/** Nyckeltal. Saknas värdet står det varför — aldrig en tom ruta. */
function Nyckeltal({ etikett, varde, not }: { etikett: string; varde: string; not?: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: P.text }}>{varde}</div>
      <div style={{ fontSize: 9.5, color: P.svag, marginTop: 1 }}>{etikett}</div>
      {not && <div style={{ fontSize: 8.5, color: P.svag, marginTop: 1 }}>{not}</div>}
    </div>
  );
}

export default function KvittoPage() {
  const params = useParams<{ vo: string }>();
  const vo = decodeURIComponent(String(params?.vo ?? ''));

  const [k, setK] = useState<Kvitto | null>(null);
  const [saknas, setSaknas] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    setSaknas(false);
    try {
      const d = await hamtaKvitto(vo);
      if (!d) setSaknas(true);
      setK(d);
    } catch (e) {
      setK(null);
      setFel(e instanceof Error ? e.message : 'Kunde inte hämta kvittot.');
    } finally {
      setLaddar(false);
    }
  }, [vo]);

  useEffect(() => {
    ladda();
  }, [ladda]);

  const g = k?.gallring;
  const avslutad = g?.skordningAvslutad ?? null;
  const sortiment = k ? sortimentMedSumma(k) : null;
  const grundytaHa = k ? uttagenGrundytaPerHa(k) : null;
  const stam = k ? medelstam(k) : null;
  const stamTotalt = k?.stamandelar.reduce((s, t) => s + t.stammar, 0) ?? 0;
  const d = g?.diameter ?? null;
  const omatta = g ? g.stammar - (d?.matta ?? 0) : 0;

  return (
    <>
      {/* Skärmytan runt bladet försvinner i utskrift, liksom appens fasta
          header, bottennavigering och knapparna på sidan. Kvar blir bara
          dokumentet. */}
      <style>{`
        @page { size: A4 portrait; margin: 14mm; }
        @media print {
          header, nav, .kvitto-doldivid-utskrift { display: none !important; }
          body { background: #fff !important; }
          .kvitto-skarm { background: #fff !important; padding: 0 !important; }
          .kvitto-blad {
            box-shadow: none !important;
            width: auto !important;
            min-height: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .kvitto-brytsihop { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div
        className="kvitto-skarm"
        style={{ minHeight: '100vh', background: P.skarm, padding: '12px 12px 120px', fontFamily: P.ff }}
      >
        <div
          className="kvitto-doldivid-utskrift"
          style={{ maxWidth: 210 * 3.78, margin: '0 auto 12px', display: 'flex', gap: 8 }}
        >
          <Link
            href={`/gallring/${encodeURIComponent(vo)}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 44,
              padding: '0 16px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              textDecoration: 'none',
              fontSize: 15,
            }}
          >
            Tillbaka
          </Link>
          {/* Utskriftsknappen finns bara när det FINNS ett dokument. På
              spärrsidan, felsidan och den tomma sidan vore den en knapp som
              skriver ut ett meddelande om att inget går att skriva ut. */}
          {k && g && avslutad && (
            <button
              onClick={() => window.print()}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: '#0A84FF',
                color: '#fff',
                fontSize: 16,
                fontFamily: P.ff,
                cursor: 'pointer',
              }}
            >
              Skriv ut / spara som PDF
            </button>
          )}
        </div>

        <div
          className="kvitto-blad"
          style={{
            width: '100%',
            maxWidth: 210 * 3.78, // A4-bredd i CSS-px vid 96 dpi
            minHeight: 297 * 3.78,
            margin: '0 auto',
            background: P.blad,
            color: P.text,
            padding: '18mm 16mm',
            boxSizing: 'border-box',
            boxShadow: '0 2px 16px rgba(0,0,0,0.35)',
          }}
        >
          {laddar && <div style={{ fontSize: 12, color: P.svag }}>Hämtar trakten…</div>}

          {!laddar && fel && (
            <div style={{ fontSize: 12 }}>
              <p style={{ margin: '0 0 12px' }}>{fel}</p>
              <button
                onClick={ladda}
                style={{
                  minHeight: 44,
                  padding: '0 16px',
                  borderRadius: 8,
                  border: `1px solid ${P.ram}`,
                  background: '#fff',
                  fontSize: 14,
                  fontFamily: P.ff,
                  cursor: 'pointer',
                }}
              >
                Försök igen
              </button>
            </div>
          )}

          {!laddar && !fel && saknas && (
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              Ingen gallring med VO {vo} hittades. Antingen har objektet en annan huvudtyp
              än Gallring, eller så saknar det importerad produktion.
            </div>
          )}

          {/* Ett kvitto på en pågående trakt är fel dokument. Sidan renderar
              det inte ens via direkt-URL — knappen i objektvyn är bara den ena
              av två spärrar. */}
          {!laddar && !fel && k && g && !avslutad && (
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <h1 style={{ fontSize: 16, margin: '0 0 10px' }}>Trakten är inte färdigskördad</h1>
              <p style={{ margin: '0 0 10px' }}>
                {g.namn} har inget avslutsdatum för skördningen, så maskinen rapporterar
                att arbetet pågår. Ett kvitto på en pågående trakt visar bara det som
                hunnit köras och skulle underskatta uttaget.
              </p>
              <p style={{ margin: 0, color: P.svag }}>
                Kvittot går att utfärda när skördningen är avslutad. Hittills är{' '}
                {fmtAntal(g.stammar)} stammar och {fmtVolym(g.volymM3fub)} m³fub uttagna.
              </p>
            </div>
          )}

          {!laddar && !fel && k && g && avslutad && sortiment && (
            <>
              {/* 1. Rubrik */}
              <header
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 16,
                  borderBottom: `2px solid ${P.text}`,
                  paddingBottom: 8,
                  marginBottom: 14,
                }}
              >
                <div>
                  <h1
                    style={{
                      fontSize: 19,
                      fontWeight: 700,
                      letterSpacing: 1.4,
                      margin: 0,
                      textTransform: 'uppercase',
                    }}
                  >
                    Gallringskvitto
                  </h1>
                  <div style={{ fontSize: 11, color: P.svag, marginTop: 2 }}>{FORETAG}</div>
                </div>
                <div style={{ fontSize: 10, color: P.svag, textAlign: 'right', lineHeight: 1.6 }}>
                  Utfärdat {kortDatum(idagLokalt())}
                </div>
              </header>

              {/* 2 + 3. Objekt och utförande */}
              <div style={{ display: 'flex', gap: 24, marginBottom: 14 }} className="kvitto-brytsihop">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Rubrik>Objekt</Rubrik>
                  <Fakta etikett="Trakt" varde={k.objekt.namn ?? g.namn} />
                  <Fakta etikett="Fastighet" varde={k.objekt.fastighet} />
                  <Fakta etikett="Markägare" varde={k.objekt.markagare} />
                  <Fakta etikett="Traktnr" varde={k.objekt.traktnr} />
                  <Fakta etikett="VO" varde={g.vo} />
                  {/* Kontraktsnumret trycks bara när det skiljer sig från VO.
                      På Hålabäck är båda 11219961, och samma siffra två gånger
                      under olika etiketter läses som ett fel. */}
                  <Fakta
                    etikett="Kontrakt"
                    varde={
                      k.objekt.kontraktsnummer && k.objekt.kontraktsnummer !== g.vo
                        ? k.objekt.kontraktsnummer
                        : null
                    }
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Rubrik>Utfört</Rubrik>
                  <Fakta etikett="Period" varde={datumspann(g)} />
                  <Fakta
                    etikett="Dagar"
                    varde={g.antalDagar > 1 ? `${fmtAntal(g.antalDagar)} arbetsdagar` : null}
                  />
                  <Fakta etikett="Maskin" varde={g.maskiner.join(', ') || null} />
                  <Fakta etikett="Förare" varde={g.forare.join(', ') || null} />
                  <Fakta etikett="Areal" varde={g.arealHa ? `${fmtDecimal(g.arealHa, 2)} ha` : null} />
                  <Fakta etikett="Skördning" varde={`avslutad ${kortDatum(avslutad)}`} />
                </div>
              </div>

              {/* 4. Huvudtalet — traktens uttag ur fakt_produktion, samma tal
                  som gallringsvyn visar. ALDRIG sortimentssumman: den kommer
                  ur fakt_sortiment, saknas helt på tre trakter och skulle då
                  trycka 0,0 m³fub på en trakt som avverkat 309 m³. */}
              <div
                className="kvitto-brytsihop"
                style={{
                  border: `1px solid ${P.ram}`,
                  borderRadius: 4,
                  padding: '10px 14px',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 10, color: P.svag, letterSpacing: 0.6 }}>
                  UTTAG TOTALT
                </div>
                <div style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, marginTop: 2 }}>
                  {fmtVolym(sortiment.uttag)}{' '}
                  <span style={{ fontSize: 15, fontWeight: 400, color: P.svag }}>m³fub</span>
                </div>

                {/* 5. Fyra nyckeltal */}
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid ${P.linje}`,
                  }}
                >
                  <Nyckeltal etikett="Stammar" varde={fmtAntal(g.stammar)} />
                  <Nyckeltal
                    etikett="Dgv, grundytevägd"
                    varde={d ? `${Math.round(d.dgvMm)} mm` : '—'}
                  />
                  {/* Per-hektar-tal kräver uppmätt areal. Saknas den visas
                      grundytan i m² i stället — ett mätt tal — men aldrig
                      delat med en gissad areal. */}
                  {grundytaHa !== null ? (
                    <Nyckeltal
                      etikett="Uttagen grundyta"
                      varde={`${fmtDecimal(grundytaHa, 2)} m²/ha`}
                    />
                  ) : d ? (
                    <Nyckeltal
                      etikett="Uttagen grundyta"
                      varde={`${fmtDecimal(d.grundytaM2, 1)} m²`}
                      not="areal ej angiven"
                    />
                  ) : (
                    <Nyckeltal etikett="Uttagen grundyta" varde="—" />
                  )}
                  <Nyckeltal
                    etikett="Medelstam"
                    varde={stam !== null ? `${fmtDecimal(stam, 3)} m³fub` : '—'}
                  />
                </div>
              </div>

              {/* 6. Sortiment */}
              <section style={{ marginBottom: 12 }} className="kvitto-brytsihop">
                <Rubrik>Sortiment</Rubrik>
                {sortiment.rader.length === 0 ? (
                  <p style={{ fontSize: 10.5, color: P.svag, margin: 0, lineHeight: 1.6 }}>
                    Sortimentsfördelning saknas i underlaget för den här trakten. Uttaget
                    ovan är oberoende av det — det kommer från maskinens produktionsrapport.
                  </p>
                ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr style={{ color: P.svag, fontSize: 9.5 }}>
                      <th style={{ textAlign: 'left', fontWeight: 400, padding: '2px 0' }}>
                        Sortiment
                      </th>
                      <th style={{ textAlign: 'right', fontWeight: 400, width: 62 }}>Stockar</th>
                      <th style={{ textAlign: 'right', fontWeight: 400, width: 72 }}>m³fub</th>
                      <th style={{ width: 96 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {sortiment.rader.map((s) => (
                      <tr key={`${s.grupp}-${s.namn}`} style={{ borderTop: `1px solid ${P.linje}` }}>
                        <td style={{ padding: '4px 0' }}>
                          {s.grupp ? `${s.grupp} · ${s.namn}` : s.namn}
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtAntal(s.stockar)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtDecimal(s.visadVolym, 2)}</td>
                        <td style={{ paddingLeft: 10 }}>
                          <div style={{ height: 7, background: '#EDEDED', borderRadius: 2 }}>
                            <div
                              style={{
                                width: `${
                                  sortiment.summa > 0 ? (s.visadVolym / sortiment.summa) * 100 : 0
                                }%`,
                                height: '100%',
                                background: '#4A4A4A',
                                borderRadius: 2,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: `2px solid ${P.text}`, fontWeight: 700 }}>
                      <td style={{ padding: '4px 0' }}>Summa</td>
                      <td style={{ textAlign: 'right' }}>
                        {fmtAntal(sortiment.rader.reduce((a, s) => a + s.stockar, 0))}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmtDecimal(sortiment.summa, 2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
                )}
                {/* Sortimentssumman och traktens uttag kommer ur två skilda
                    mätvägar (HPR mot MOM) och är identiska på bara 1 av 25
                    gallringstrakter. Skiljer de sig står det HÄR, i klartext.
                    Att låta läsaren upptäcka det med miniräknare vore värre. */}
                {sortiment.rader.length > 0 && !sortiment.tacker && (
                  <p style={{ fontSize: 9.5, color: P.svag, margin: '4px 0 0', lineHeight: 1.6 }}>
                    Sortimentsredovisningen omfattar {fmtDecimal(sortiment.summa, 2)} m³fub av
                    traktens {fmtVolym(sortiment.uttag)} m³fub. Mellanskillnaden är virke där
                    sortimentsuppgift saknas i maskinens underlag; volymen ingår i uttaget
                    ovan.
                  </p>
                )}
              </section>

              {/* 7. Trädslag — STAMANDEL, och basen står i rubriken */}
              <section style={{ marginBottom: 12 }} className="kvitto-brytsihop">
                <Rubrik>Uttag per trädslag — andel av antalet stammar</Rubrik>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {k.stamandelar.map((t, i) => {
                      const stil = tradslagStil(t.namn, i);
                      const andel = stamTotalt > 0 ? t.stammar / stamTotalt : 0;
                      const pct = Math.round(andel * 100);
                      return (
                        <tr key={t.namn} style={{ borderTop: `1px solid ${P.linje}` }}>
                          <td style={{ padding: '4px 0', width: 18 }}>
                            {/* Utskrift = ljus bakgrund, alltså ritas konturen.
                                Björk är vit och försvinner annars helt. */}
                            <span
                              style={{
                                display: 'inline-block',
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                background: stil.fyll,
                                border: `1px solid ${stil.kontur ?? P.ram}`,
                                boxSizing: 'border-box',
                              }}
                            />
                          </td>
                          <td>{t.namn}</td>
                          <td style={{ textAlign: 'right', width: 70 }}>
                            {fmtAntal(t.stammar)} st
                          </td>
                          <td style={{ textAlign: 'right', width: 46, fontWeight: 700 }}>
                            {andel > 0 && pct === 0 ? '<1' : pct}&nbsp;%
                          </td>
                          <td style={{ paddingLeft: 10, width: 96 }}>
                            <div style={{ height: 7, background: '#EDEDED', borderRadius: 2 }}>
                              <div
                                style={{
                                  width: `${andel * 100}%`,
                                  height: '100%',
                                  background: stil.fyll,
                                  border: stil.kontur ? `1px solid ${stil.kontur}` : 'none',
                                  borderRadius: 2,
                                  boxSizing: 'border-box',
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ fontSize: 9.5, color: P.svag, margin: '4px 0 0' }}>
                  Andelarna avser antalet stammar. Volymandelen ser annorlunda ut eftersom
                  grova stammar bär mer virke per träd.
                </p>
              </section>

              {/* 9. Detta är inte mätt */}
              <section
                className="kvitto-brytsihop"
                style={{
                  border: `1px solid ${P.ram}`,
                  borderRadius: 4,
                  padding: '9px 12px',
                  marginBottom: 12,
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 4 }}>
                  DETTA ÄR INTE MÄTT
                </div>
                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 10.5, lineHeight: 1.6 }}>
                  <li>Trädslagsfördelning i det kvarvarande beståndet</li>
                  <li>Stickvägsandel och stickvägsbredd</li>
                </ul>
                <p style={{ fontSize: 10.5, color: P.svag, margin: '5px 0 0', lineHeight: 1.6 }}>
                  Uppgifterna kräver mätning i stående bestånd och går inte att räkna fram ur
                  maskinens data. De kan beställas som tilläggstjänst.
                </p>
              </section>

              {/* 10. Fotnot */}
              <footer style={{ fontSize: 9, color: P.svag, lineHeight: 1.65 }}>
                <p style={{ margin: 0 }}>
                  Samtliga tal är mätta av skördaren vid avverkningstillfället och hämtade ur
                  maskinens produktionsfiler (StanForD 2010). Volym anges i m³fub, fast mått
                  under bark. Dgv är grundytevägd medeldiameter i brösthöjd. Uttagen grundyta
                  är summan av stammarnas tvärsnittsyta i brösthöjd
                  {g.arealHa ? ', fördelad på traktens areal' : ''}.
                  {d && omatta > 0
                    ? ` Diameterberoende tal bygger på ${fmtAntal(d.matta)} av ${fmtAntal(
                        g.stammar,
                      )} stammar; för övriga saknas enskild stamdata i importen.`
                    : ''}
                </p>
                <p style={{ margin: '5px 0 0' }}>
                  Kvittot avser <strong>avslutad skördning</strong> {kortDatum(avslutad)}.
                  Skotningen kan pågå, så virke kan finnas kvar vid väg eller i beståndet.
                </p>
                <p style={{ margin: '5px 0 0' }}>
                  {FORETAG} · Utfärdat {kortDatum(idagLokalt())}
                  {k.objekt.bolag ? ` · Uppdragsgivare ${k.objekt.bolag}` : ''}
                </p>
              </footer>
            </>
          )}
        </div>
      </div>
    </>
  );
}
