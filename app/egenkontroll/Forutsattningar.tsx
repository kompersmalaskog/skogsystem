'use client';

// Forutsattningsraden: vad som radde nar trakten kordes.
//
// VADRET HOR HEMMA I HEADERN, INTE I AVVIKELSEFORMULARET. Bredvid knappen dar
// man kryssar korspar som avvikelse laser hjarnan ursakten innan den har
// tittat pa sparet, och egenkontrollen blir en forklaringsmaskin i stallet
// for en kontroll. Har uppe ramar samma siffra in hela rundan utan att styra
// ett enskilt svar.
//
// RADEN BAR BADA NEDERBORDSTALEN, inte bara det fore. Hossjomala visar varfor:
// 11 mm foll de fjorton dygnen fore, men 43 mm foll MEDAN skotaren korde,
// varav 18,8 mm pa ett enda dygn. En rad med bara fore-talet hade beskrivit
// trakten som torr, vilket ar precis fel.
//
// Delas av rundvyn och dokumentet pa objektet sa de tva aldrig kan saga olika
// saker om samma runda - samma skal som ProvyteSammanstallning.

import { useEffect, useState } from 'react';
import { T } from '@/lib/utbildning';
import { DAGAR_FORE, type VaderSnapshot } from '@/lib/egenkontrollvader';
import type { MaskinSnapshot } from '@/lib/egenkontroll';

const MANADER = ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** "8–26 maj", "24 apr–7 maj", "26 dec 2025–3 jan 2026". */
function period(fran: string | null, till: string | null): string | null {
  if (!fran || !till) return null;
  const [aY, aM, aD] = fran.split('-').map(Number);
  const [bY, bM, bD] = till.split('-').map(Number);
  if (!aY || !bY) return null;
  const m = (i: number) => MANADER[i - 1] ?? '';
  if (aY !== bY) return `${aD} ${m(aM)} ${aY}–${bD} ${m(bM)} ${bY}`;
  if (aM !== bM) return `${aD} ${m(aM)}–${bD} ${m(bM)}`;
  return `${aD}–${bD} ${m(aM)}`;
}

function mm(v: number | null | undefined): string {
  return v == null ? '—' : `${Math.round(v)} mm`;
}

function grader(v: number | null): string {
  if (v == null) return '—';
  const t = Math.round(v * 10) / 10;
  return `${t > 0 ? '+' : ''}${String(t).replace('.', ',')} °C`;
}

/**
 * Bandtexten.
 *
 * null betyder OKANT, inte "utan band" - snapshotten skriver null sa fort
 * band-faltet ar falskt, eftersom vi inte kan skilja "korde utan band" fran
 * "ingen rorde faltet" (se byggMaskinSnapshot). "Utan band" och "uppgift
 * saknas" far aldrig se likadana ut, sa de har var sin text.
 */
function bandText(band: boolean | null | undefined, par: string | null | undefined): string {
  if (band == null) return 'Band uppgift saknas';
  if (band === false) return 'Utan band';
  return par ? `Band ${par} par` : 'Band, antal par okänt';
}

/** Kort skal till att vadret saknas — samma ordning som statusarna. */
function saknasKort(vader: VaderSnapshot | null): string {
  if (!vader) return 'Vädret sparades inte';
  if (vader.status === 'saknar_koordinat') return 'Objektet saknar koordinat';
  if (vader.status === 'saknar_skotdatum') return 'Skotdatum saknas';
  return 'Vädret kunde inte hämtas';
}

/** Hela skalet, med vad man gor at det. De tre atgardas OLIKA. */
function saknasLangt(vader: VaderSnapshot | null): string {
  if (!vader) {
    return 'Vädret sparades inte när rundan startades. Det hämtas en gång vid start och fylls inte i i efterhand — dokumentet ska säga samma sak om två år som i dag.';
  }
  if (vader.status === 'saknar_koordinat') {
    return 'Objektet saknar koordinat, så det går inte att säga vilket väder som rådde. Sätt en koordinat på objektet, så följer vädret med nästa runda.';
  }
  if (vader.status === 'saknar_skotdatum') {
    return 'Vi vet inte när trakten skotades. Objektet är inte kopplat till maskindatan, och utan den finns ingen ärlig källa till skotningsdatumen — objektets egna datum är skördens.';
  }
  return `Vädret kunde inte hämtas när rundan startades${vader.fel ? ` (${vader.fel})` : ''}. Det hämtas bara en gång, så raden fylls inte i i efterhand.`;
}

function Rubrik({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.6, color: T.t2, textTransform: 'uppercase', marginBottom: 4 }}>
      {children}
    </div>
  );
}

/** Dygnsserien. Fore-fonstret och skotningsfonstret ar visuellt atskilda —
 *  och namngivna under, sa fargen aldrig ar ensam informationsbarare. */
function Dygnsdiagram({ vader }: { vader: VaderSnapshot }) {
  const fore = vader.dygn.filter((d) => vader.skot_start != null && d.datum < vader.skot_start);
  const under = vader.dygn.filter((d) => vader.skot_start != null && d.datum >= vader.skot_start);
  if (fore.length === 0 && under.length === 0) return null;

  const topp = Math.max(1, ...vader.dygn.map((d) => d.nederbord_mm ?? 0));
  const HOJD = 56;

  const grupp = (dygn: typeof fore, farg: string) => (
    <div style={{ flex: dygn.length, display: 'flex', alignItems: 'flex-end', gap: 1, height: HOJD }}>
      {dygn.map((d) => (
        <div
          key={d.datum}
          title={`${d.datum}: ${d.nederbord_mm ?? 0} mm`}
          style={{
            flex: 1,
            // Minst 1 px sa ett torrt dygn syns som ett dygn, inte som en lucka.
            height: Math.max(1, Math.round(((d.nederbord_mm ?? 0) / topp) * HOJD)),
            background: farg,
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );

  return (
    <div style={{ margin: '10px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
        {grupp(fore, T.t2)}
        {grupp(under, T.blue)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <div style={{ flex: fore.length, fontSize: 11.5, color: T.t2 }}>
          {fore.length} dygn före
        </div>
        <div style={{ flex: under.length, fontSize: 11.5, color: T.blue }}>
          {under.length} dygn skotning
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: T.t2, marginTop: 2 }}>
        Högsta dygn {mm(topp)}
      </div>
    </div>
  );
}

function Innehall({ vader, maskiner }: { vader: VaderSnapshot | null; maskiner: MaskinSnapshot | null }) {
  const ok = vader?.status === 'ok';
  return (
    <div style={{ paddingTop: 10 }}>
      {ok && vader ? (
        <>
          <Rubrik>Nederbörd</Rubrik>
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1, lineHeight: 1.1 }}>
            {mm(vader.mm_fore)}
          </div>
          <div style={{ fontSize: 13.5, color: T.t2, lineHeight: 1.45 }}>
            de {DAGAR_FORE} dygnen före skotningen började
          </div>

          <Dygnsdiagram vader={vader} />

          <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{mm(vader.mm_under)}</span>
              <span style={{ color: T.t2 }}> under skotningen{period(vader.skot_start, vader.skot_slut) ? ` (${period(vader.skot_start, vader.skot_slut)})` : ''}</span>
            </div>
            {/* Ingen tjale-flagga. Tjale ar ett MARKtillstand - en luftgrad
                under noll ar inte samma sak, och Hossjomalas enda minusgrad
                lag tio dygn fore fonstret. Vyn skriver ut det den vet. */}
            <div style={{ color: T.t2 }}>
              {vader.frostnatter == null
                ? 'Temperatur saknas'
                : `${vader.frostnatter} frostnätter under skotningen, lägsta ${grader(vader.min_temp)}`}
            </div>
            {period(vader.skord_start, vader.skord_slut) && (
              <div style={{ color: T.t2 }}>
                Skördat {period(vader.skord_start, vader.skord_slut)}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 14, color: T.orange, lineHeight: 1.5 }}>
          {saknasLangt(vader)}
        </div>
      )}

      {maskiner && (
        <div style={{ marginTop: 14 }}>
          <Rubrik>Maskiner</Rubrik>
          <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
            <div>
              <span style={{ color: T.t2 }}>Skördare </span>
              {maskiner.skordare_maskin ?? 'uppgift saknas'}
              <span style={{ color: T.t2 }}> · {bandText(maskiner.skordare_band, maskiner.skordare_band_par)}</span>
            </div>
            <div>
              <span style={{ color: T.t2 }}>Skotare </span>
              {maskiner.skotare_maskin ?? 'uppgift saknas'}
              <span style={{ color: T.t2 }}> · {bandText(maskiner.skotare_band, maskiner.skotare_band_par)}</span>
              {/* Breddat lastreder och extra vagn visas BARA nar de ar sanna.
                  Ett falskt varde kommer fran samma formularsdefault som
                  bandfaltet (app/planering/page.tsx) och duger inte som
                  underlag for att pasta motsatsen. */}
              {maskiner.skotare_lastreder_breddat === true && (
                <span style={{ color: T.t2 }}> · breddat lastreder</span>
              )}
              {maskiner.skotare_extra_vagn === true && (
                <span style={{ color: T.t2 }}> · extra vagn</span>
              )}
            </div>
            {(maskiner.barighet || maskiner.terrang) && (
              <div style={{ color: T.t2 }}>
                {maskiner.barighet && `Bärighet ${maskiner.barighet}`}
                {maskiner.barighet && maskiner.terrang && ' · '}
                {maskiner.terrang && `terräng ${maskiner.terrang}`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Forutsattningar({
  vader,
  maskiner,
  rundaId,
  /** true = dokumentet: alltid utfallt, ingen knapp, ingen ihagkomst. */
  kompakt,
}: {
  vader: VaderSnapshot | null;
  maskiner: MaskinSnapshot | null;
  rundaId: string;
  kompakt?: boolean;
}) {
  // UTFALLD FORSTA GANGEN, sedan som man valde. Man ska se forutsattningarna
  // en gang och slippa dem resten av rundan. Nyckeln ar per RUNDA, sa en ny
  // runda pa samma objekt borjar utfalld igen.
  const nyckel = `egenkontroll_forutsattningar_${rundaId}`;
  const [oppen, setOppen] = useState(true);

  // Lases i en effekt, inte i useState-initieraren: servern har ingen
  // localStorage och ett annat startvarde dar ger hydreringsvarning.
  useEffect(() => {
    if (kompakt) return;
    try {
      const sparat = localStorage.getItem(nyckel);
      if (sparat === '0') setOppen(false);
    } catch { /* privat lage - da far den vara utfalld */ }
  }, [nyckel, kompakt]);

  const vaxla = () => {
    setOppen((f) => {
      const nytt = !f;
      try { localStorage.setItem(nyckel, nytt ? '1' : '0'); } catch { /* ignore */ }
      return nytt;
    });
  };

  if (!vader && !maskiner) return null;

  const ok = vader?.status === 'ok';
  const nar = ok ? period(vader!.skot_start, vader!.skot_slut) : null;
  const delar = [
    nar ? `Skotat ${nar}` : saknasKort(vader),
    // Bada talen. Se filhuvudet.
    ok ? `${mm(vader!.mm_fore)} före, ${mm(vader!.mm_under)} under` : null,
    // Skotarens band - raden handlar om skotningen, och det ar skotaren som
    // gjort sparen man star och tittar pa.
    maskiner ? bandText(maskiner.skotare_band, maskiner.skotare_band_par) : null,
  ].filter(Boolean);

  if (kompakt) {
    return (
      <div style={{ fontFamily: T.ff }}>
        <Innehall vader={vader} maskiner={maskiner} />
      </div>
    );
  }

  return (
    <div style={{ background: T.group, borderRadius: 12, padding: '2px 14px 12px', marginBottom: 10, fontFamily: T.ff }}>
      <button
        onClick={vaxla}
        aria-expanded={oppen}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          minHeight: 44, padding: 0, border: 'none', background: 'transparent',
          color: T.t1, fontFamily: T.ff, textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, lineHeight: 1.45, color: ok ? T.t1 : T.orange }}>
          {delar.join(' · ')}
        </span>
        <span
          className="material-symbols-outlined"
          aria-hidden="true"
          style={{ fontSize: 22, color: T.t2, transform: oppen ? 'rotate(180deg)' : 'none' }}
        >
          expand_more
        </span>
      </button>

      {oppen && <Innehall vader={vader} maskiner={maskiner} />}
    </div>
  );
}
