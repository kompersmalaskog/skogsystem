'use client';
// "GÖR SÅ HÄR" — kortet överst i Läget. Appen säger vad som ska göras i maskinen, inte bara vad datan visar: ETT nästa steg, aldrig en lista.
//   Stor ikon, en stor mening, en rad under om varför. "Steg 1 av 3" med ett streck per steg.
//   Kolla   : "Klart, allt såg bra ut" / "Bytte något".       Ändra : punkterna som ska ändras + "Jag har ändrat".
//   Klava   : prickar som fylls när stammar klavas.          Inget : "Inget att göra. Fortsätt klava som vanligt."
// Ordningen (grepp/tryck före kurva, en veckas väntan, 10 stammar) bor i lib/kalibrering/forslagKort — föraren ser aldrig reglerna.
// Allt bakom kortet (besked per punkt, osäkerhet) är ett tryck bort: raden "Justeringsförslag" öppnar arket. Appen skriver aldrig till maskinen;
// "Jag har ändrat" och svaren på Kolla-steget sparas som åtgärdsmarkörer (kalibrering_atgard) — markören ÄR svaret.
import { useState } from 'react';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Svarsrad from '@/components/design/Svarsrad';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { FORSLAG } from '@/lib/kalibrering/forslag';
import { INGET_RAD, INGET_RUBRIK, stegText, vantaText, type Steg } from '@/lib/kalibrering/forslagKort';
import { BYTE_TEXT, KONTROLL_TEXT, TRYCK_TEXT, kurvaText } from '@/lib/kalibrering/forslagMarkorer';
import { Lugn } from './delar';

/** Texterna som sparas när föraren svarar på ett steg. Samma form som lib/kalibrering/forslagMarkorer läser tillbaka. */
export const svarTexter = (steg: Steg, svar: 'ja' | 'bytte'): string[] => {
  switch (steg.slag) {
    case 'kolla': return [svar === 'bytte' ? BYTE_TEXT : KONTROLL_TEXT];
    case 'tryck': return [TRYCK_TEXT];
    case 'kurva': return steg.punkter.map(p => kurvaText(p.tradslag, p.punkt, p.andringMm));
    case 'klava': return [];
  }
};

/** Ett streck per steg; det första (nästa) är fyllt. Färg bär inget ensam: "Steg 1 av 3" står bredvid. */
function Streck({ antal }: { antal: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', gap: AVSTAND.xs, marginTop: AVSTAND.s }}>
      {Array.from({ length: antal }, (_, i) => (
        <div key={i} data-streck={i === 0 ? 'fylld' : 'tom'} style={{ flex: 1, height: AVSTAND.xs, borderRadius: RADIE.stapel, background: i === 0 ? FARG.text : FARG.fyllning }} />
      ))}
    </div>
  );
}

/** Tio prickar för tio stammar; de klavade är fyllda. */
function Prickar({ har, av }: { har: number; av: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, flexWrap: 'wrap', marginBottom: AVSTAND.xl }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: AVSTAND.s }}>
        {Array.from({ length: av }, (_, i) => (
          <span key={i} data-prick={i < har ? 'fylld' : 'tom'}
            style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: i < har ? FARG.text : FARG.fyllning }} />
        ))}
      </div>
      <span style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>{Math.min(har, av)} av {av} klara</span>
    </div>
  );
}

export default function GorSaHar({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const f = d.forslag;
  const [fel, setFel] = useState(false);

  const svara = async (steg: Steg, svar: 'ja' | 'bytte') => {
    setFel(false);
    if (d.forslagSparar) return;
    const ok = await d.sparaForslagMarkor(svarTexter(steg, svar));
    if (!ok) setFel(true);
  };

  if (!f) {
    return d.forslagFel
      ? (
        <section style={{ marginBottom: AVSTAND.xl }}>
          <Svarsrad rubrik="Det som ska göras kunde inte läsas" rad="Läget nedanför finns kvar. Försök igen om en stund." fri avvikelse />
          <button type="button" onClick={d.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
        </section>
      )
      : <section style={{ marginBottom: AVSTAND.xl }}><Lugn ikon="hourglass_empty" marginTop={0}>Läser vad som ska göras…</Lugn></section>;
  }

  const { kort } = f;
  const steg = kort.lage === 'steg' ? kort.steg[0] : null;
  const text = steg ? stegText(steg) : null;
  const vanta = kort.lage === 'vanta' && kort.vantaTill ? vantaText(kort.vantaTill) : null;
  const inget = kort.lage === 'inget';
  // Kan inte greppet läsas vet vi inte om knivar och valsar ska kollas: då säger vi det i stället för att påstå att allt är i ordning.
  const greppVarning = !f.greppLast && (inget || !!vanta) ? 'Greppet kunde inte läsas — knivar och valsar är inte kontrollerade.' : null;

  const ikon = steg && text ? text.ikon : inget ? 'check_circle' : 'schedule';
  const rubrik = text?.rubrik ?? vanta?.rubrik ?? INGET_RUBRIK;
  const rad = text?.varfor ?? vanta?.varfor ?? INGET_RAD;

  return (
    <section data-testid="gor-sa-har" aria-label="Gör så här" style={{ marginBottom: AVSTAND.xl }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: AVSTAND.s }}>
        <h2 style={{ margin: 0, ...TYP.micro, color: FARG.text2 }}>Gör så här</h2>
        {steg && <span data-testid="steg-av" style={{ ...TYP.meta, ...TNUM, color: FARG.text2 }}>Steg 1 av {kort.steg.length}</span>}
      </div>
      {steg && <Streck antal={kort.steg.length} />}

      <Tillstand nyckel={steg?.id ?? kort.lage}>
        <div style={{ marginTop: AVSTAND.xl }}>
          <Ikon namn={ikon} storlek={IKON.stor} farg={inget ? FARG.gron : FARG.text} />
        </div>
        <Svarsrad stor fri rubrik={rubrik} varning={greppVarning}
          rad={text?.notering ? <>{rad}<div data-testid="kolla-notering" style={{ ...TYP.meta, marginTop: AVSTAND.xs }}>{text.notering}</div></> : rad} />
        {steg?.slag === 'kurva' && text && (
          <Sektion rubrik="Ändra på kurvan">
            {text.rader.map((r, i) => {
              const [punkt, ...resten] = r.split(/[\s\u00a0]mm[\s\u00a0]/);
              return <Rad key={r} sista={i === text.rader.length - 1} pil={false} titel={`${punkt} mm`} hoger={resten.join(' mm ')} />;
            })}
          </Sektion>
        )}
        {steg?.slag === 'klava' && <Prickar har={steg.punkt.stammar} av={FORSLAG.MIN_STAMMAR} />}

        {steg?.slag === 'kolla' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s, alignItems: 'stretch' }}>
            <button type="button" onClick={() => svara(steg, 'ja')} disabled={d.forslagSparar} style={{ ...KNAPP.primar, ...(d.forslagSparar ? INAKTIV : null) }}>
              {d.forslagSparar ? 'Sparar…' : 'Klart, allt såg bra ut'}
            </button>
            <button type="button" onClick={() => svara(steg, 'bytte')} disabled={d.forslagSparar} style={{ ...KNAPP.tertiar, justifyContent: 'center', ...(d.forslagSparar ? INAKTIV : null) }}>
              Bytte något
            </button>
          </div>
        )}
        {(steg?.slag === 'tryck' || steg?.slag === 'kurva') && (
          <button type="button" onClick={() => svara(steg, 'ja')} disabled={d.forslagSparar} style={{ ...KNAPP.primar, ...(d.forslagSparar ? INAKTIV : null) }}>
            {d.forslagSparar ? 'Sparar…' : 'Jag har ändrat'}
          </button>
        )}
        {fel && <Lugn ikon="error">Det gick inte att spara. Försök igen.</Lugn>}
      </Tillstand>

      {/* Detaljen bakom kortet: besked per punkt. Blått = navigerar. */}
      <button type="button" onClick={ark.oppnaForslag} style={{ ...KNAPP.lank, marginTop: AVSTAND.s }}>
        Justeringsförslag per punkt
        <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.bla} />
      </button>
    </section>
  );
}
