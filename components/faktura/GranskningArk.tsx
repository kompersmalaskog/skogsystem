'use client';
// GRANSKNINGEN: tre skärmar i SAMMA ark, en fråga var.
//
//   Sortiment  — "6 sortiment", vad som räknas och vad som inte gör det
//   Pris       — "Hur räknades priset?", prislistans rader att räkna ihop
//   Rätta      — "Antal sortiment", sätt talet själv och se vad det kostar
//
// Formen är design.md: svaret först, ETT stort tal per skärm, högst EN primär
// knapp, blått bara för att navigera eller avbryta. Texterna och talen bor i
// lib/faktura/granskningVy — det här ritar.
//
// EN SKRIVARE. Rättningen går genom sparaFalt (lib/redigering/objektRouter),
// precis som Redigering › Pris och ersättning › "Stämmer appens värden?".
// Det finns alltså inte två ställen som kan skriva sortiment_grupper_manuell
// olika — bara två ställen man kan trycka. Samma modell som sheeten "Flytten".
import { useEffect, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { sparaFalt } from '@/lib/redigering/objektRouter';
import {
  byggSortimentVy, byggPrisVy, byggRattaVy, byggTillaggVy, byggAvstandVy,
  type SortimentIndata, type PrisIndata,
} from '@/lib/faktura/granskningVy';
import { skotAvstandKrPerM3 } from '@/lib/ekonomi/acord';
import type { Granskningsunderlag } from '@/lib/faktura/hamtaUnderlag';
import type { TradslagPerSortiment } from '@/lib/faktura/lasTradslag';
import {
  AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TAL_FONT, TRAFFYTA, TYP,
} from '@/lib/design/tokens';

const kr2 = (n: number | null) =>
  n == null ? '—' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const heltal = (n: number | null) => n == null ? '—' : Math.round(n).toLocaleString('sv-SE');
const m3 = (n: number) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export type Vy = 'sortiment' | 'pris' | 'ratta' | 'terrang' | 'avstand' | 'kontraktsnr';

export type GranskningProps = {
  vy: Vy;
  onVy: (v: Vy | null) => void;
  sortiment: SortimentIndata;
  pris: PrisIndata;
  /** Skotningsavståndets underlag — lassen, prislistan, den manuella siffran. */
  avstand: Granskningsunderlag['avstand'];
  /** dim_objekt.terrang_kr_manuell i kr/m³fub. 0 = tom. */
  terrangKr: number;
  /** Att fakturera just nu — för förhandsbeskedet i rättningen. */
  summa: number | null;
  skotarAntal: number | null;
  skotarPris: number | null;
  /** dim_objekt-id:n i VO-gruppen. Rättningen skrivs på allihop. */
  dimObjektIds: string[];
  voNummer: string;
  /** Körs när något sparats — vyn ska läsa om underlaget. */
  onSparat: () => void;
};

/** Svaret överst: ETT stort tal och en mening som säger vad det betyder. */
function Svar({ tal, enhet, mening }: { tal: string; enhet?: string; mening: string }) {
  return (
    <div style={{ marginBottom: AVSTAND.l }}>
      <p style={{ margin: 0, ...TYP.tal, ...TAL_FONT, color: FARG.text }}>{tal}</p>
      {enhet && <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text }}>{enhet}</p>}
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>{mening}</p>
    </div>
  );
}

/**
 * Trädslagen per sortiment, hämtade FÖRST när granskningen öppnas: läsningen
 * går över detalj_stock och detalj_stam, tusentals rader per trakt, och får
 * aldrig ligga i vägen för priset. Hooken sitter i den komponent som är
 * monterad så länge något ark är öppet, så ett byte mellan skärmarna inte
 * hämtar om. HOOKS FÖRE ALLA TIDIGA RETURER.
 */
function useTradslag(objektIds: string[], behovs: boolean) {
  const [data, setData] = useState<TradslagPerSortiment | null>(null);
  const [fel, setFel] = useState(false);
  const nyckel = objektIds.join(',');
  // Latch: hämta först när en skärm som VISAR trädslagen öppnats, och sedan
  // inte om när man går mellan skärmarna. Terräng, avstånd och
  // kontraktsnummer visar dem inte, och läsningen går över detalj_stock och
  // detalj_stam — tusentals rader per trakt. Den får inte gå i onödan.
  const [begard, setBegard] = useState(behovs);
  if (behovs && !begard) setBegard(true);

  useEffect(() => {
    let levande = true;
    setData(null);
    setFel(false);
    if (!nyckel || !begard) return;
    const q = objektIds.map(id => `objekt=${encodeURIComponent(id)}`).join('&');
    fetch(`/api/faktura/tradslag?${q}`)
      .then(r => r.json())
      .then(j => { if (levande) { if (j?.ok) setData(j.tradslag); else setFel(true); } })
      .catch(() => { if (levande) setFel(true); });
    return () => { levande = false; };
    // objektIds är en ny array varje rendering; nyckeln är innehållet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nyckel, begard]);

  return { data, fel };
}

export default function GranskningArk(p: GranskningProps) {
  // Bara sortimentsskärmen visar trädslagen.
  const art = useTradslag(p.dimObjektIds, p.vy === 'sortiment');
  if (p.vy === 'ratta') return <Ratta {...p} />;
  if (p.vy === 'pris') return <Pris {...p} />;
  if (p.vy === 'terrang') return <Terrang {...p} />;
  if (p.vy === 'avstand') return <Avstand {...p} />;
  if (p.vy === 'kontraktsnr') return <Kontraktsnr {...p} />;
  return <SortimentVyn {...p} art={art} />;
}

/* ════════════════════════════ Sortimenten ════════════════════════════ */

function SortimentVyn(p: GranskningProps & { art: { data: TradslagPerSortiment | null; fel: boolean } }) {
  const v = byggSortimentVy({ ...p.sortiment, tradslag: p.art.data });
  return (
    <Ark rubrik="Sortiment" stang="Klar" onStang={() => p.onVy(null)}>
      <Svar tal={v.svar} enhet="sortiment" mening={v.mening} />

      {v.pengar && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>{v.pengar}</p>
      )}
      {v.manuelltRad && (
        // Orange förstärker; meningen bär hela saken själv.
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.orange }}>{v.manuelltRad}</p>
      )}

      {v.prislistaRad && (
        <Sektion rubrik="Ur prislistan">
          <Rad sista titel={v.prislistaRad} pil={false} />
        </Sektion>
      )}

      <Sektion rubrik="Det här räknas"
        not={p.art.fel ? 'Trädslagen gick inte att läsa just nu.'
          : p.art.data ? undefined : 'Läser trädslag…'}>
        {v.raknade.map((r, i) => (
          <Rad key={r.namn} titel={r.namn} pil={false}
            under={[r.under, r.tradslag].filter(Boolean).join(' · ')}
            hoger={<span style={TAL_FONT}>{m3(r.volym)}</span>} hogerUnder="m³"
            sista={i === v.raknade.length - 1} />
        ))}
      </Sektion>

      {v.ejRaknade.length > 0 && (
        <Sektion rubrik="Det här räknas inte">
          {v.ejRaknade.map((r, i) => (
            <Rad key={r.namn} titel={r.namn} under={r.under} pil={false} dampad
              hoger={<span style={TAL_FONT}>{m3(r.volym)}</span>} hogerUnder="m³"
              sista={i === v.ejRaknade.length - 1} />
          ))}
        </Sektion>
      )}

      <Sektion rubrik="Stämmer det inte?">
        <Rad sista titel="Sätt antalet själv" onTryck={() => p.onVy('ratta')} />
      </Sektion>
    </Ark>
  );
}

/* ══════════════════════════════ Priset ══════════════════════════════ */

function Pris(p: GranskningProps) {
  const v = byggPrisVy(p.pris);
  return (
    <Ark rubrik="Hur räknades priset?" stang="Klar" onStang={() => p.onVy(null)}>
      <Svar tal={kr2(v.total)} enhet="kronor per kubik" mening={v.mening} />
      <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>{v.prisdatumRad}</p>

      {v.rader.length > 0 && (
        <Sektion rubrik="Så blev priset">
          {v.rader.map((r, i) => (
            <Rad key={r.etikett} titel={r.etikett} under={r.under} pil={false}
              hoger={<span style={TAL_FONT}>
                {r.tecken && r.belopp > 0 ? '+' : ''}{kr2(r.belopp)}
              </span>}
              sista={i === v.rader.length - 1} />
          ))}
        </Sektion>
      )}

      {v.total != null && (
        <Sektion rubrik="Summan">
          <Rad titel="Per m³fub" pil={false} hoger={<span style={TAL_FONT}>{kr2(v.total)}</span>} />
          <Rad titel="Skördaren" pil={false} hoger={<span style={TAL_FONT}>{kr2(v.skordare)}</span>} />
          <Rad sista titel="Skotaren" pil={false} hoger={<span style={TAL_FONT}>{kr2(v.skotare)}</span>} />
        </Sektion>
      )}

      <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        {v.fordelningMening}
      </p>

      <Sektion rubrik="Antalet sortiment">
        <Rad sista titel={`${p.sortiment.g.anvant} sortiment`}
          under="Se vilka som räknas" onTryck={() => p.onVy('sortiment')} />
      </Sektion>
    </Ark>
  );
}

/* ═══════════════════════════ Sätt antalet själv ═══════════════════════════ */

function Steg({ tecken, onTryck, av }: { tecken: string; onTryck: () => void; av: boolean }) {
  return (
    <button type="button" onClick={onTryck} disabled={av} aria-label={tecken === '−' ? 'Färre' : 'Fler'}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        // TRAFFYTA.primar: knappstorleken, inte minimiytan — man trycker på
        // dem flera gånger i rad och de står mitt på skärmen.
        width: TRAFFYTA.primar, height: TRAFFYTA.primar, flexShrink: 0,
        border: 'none', borderRadius: RADIE.kort, background: FARG.upphojt,
        // fontFamily, aldrig kortformen `font` — den nollställer fontSize och
        // fontWeight ur TYP och tecknet blir en tunn liten streck.
        // Titelgraden: tecknet ska synas direkt, inte läsas fram.
        color: FARG.text, fontFamily: 'inherit', ...TYP.titel,
        ...(av ? INAKTIV : {}),
      }}>
      {tecken}
    </button>
  );
}

function Ratta(p: GranskningProps) {
  const [antal, setAntal] = useState(p.sortiment.g.anvant);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const v = byggRattaVy({
    g: p.sortiment.g, nyttAntal: antal, nuKr: p.sortiment.sortKr,
    nuSumma: p.summa, skotarAntal: p.skotarAntal, skotarPris: p.skotarPris,
  });

  async function spara() {
    setSparar(true);
    setFel(null);
    // Appens eget tal sparas som NULL — "använd appens värde" är frånvaron av
    // ett manuellt tal, inte ett tal som råkar vara lika stort idag.
    const varde = antal === p.sortiment.g.rakning.antal ? null : antal;
    const r = await sparaFalt(
      { dimObjektIds: p.dimObjektIds, voNummer: p.voNummer },
      { sortiment_grupper_manuell: varde },
      { tabeller: ['dim'] },
    );
    setSparar(false);
    if (!r.ok) { setFel(r.message || 'Ändringen landade inte.'); return; }
    p.onSparat();
    p.onVy(null);
  }

  return (
    <Ark rubrik="Antal sortiment" onStang={() => p.onVy('sortiment')}
      fot={
        <button type="button" onClick={() => void spara()} disabled={!v.andrat || sparar}
          style={{ ...KNAPP.primar, ...(!v.andrat || sparar ? INAKTIV : {}) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      }>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.l, marginBottom: AVSTAND.m }}>
        <Steg tecken="−" av={antal <= 0 || sparar} onTryck={() => setAntal(n => Math.max(0, n - 1))} />
        <div style={{ textAlign: 'center', minWidth: 96 }}>
          <p style={{ margin: 0, ...TYP.tal, ...TAL_FONT, color: FARG.text }}>{antal}</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>sortiment</p>
        </div>
        <Steg tecken="+" av={sparar} onTryck={() => setAntal(n => n + 1)} />
      </div>

      <div style={{ textAlign: 'center', marginBottom: AVSTAND.xl }}>
        <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>
          Appen räknar {p.sortiment.g.rakning.antal}
        </p>
        {antal !== p.sortiment.g.rakning.antal && (
          <button type="button" onClick={() => setAntal(p.sortiment.g.rakning.antal)}
            style={{ ...KNAPP.lank, minHeight: TRAFFYTA.min }}>
            Använd appens värde
          </button>
        )}
      </div>

      {/* Pilen står bara när något FAKTISKT ändras — "2,00 → 2,00" ser ut som
          en ändring och är brus. Orört antal visar bara talet som gäller. */}
      <Sektion rubrik={v.andrat ? 'Priset ändras' : 'Priset'}>
        <Rad titel="Sortimentstillägg" pil={false} hogerUnder="kr/m³fub"
          hoger={<span style={TAL_FONT}>
            {v.andrat ? `${kr2(v.nuKr)} → ${kr2(v.nyKr)}` : kr2(v.nuKr)}
          </span>} />
        <Rad sista titel="Att fakturera" pil={false} hogerUnder="kr"
          hoger={<span style={TAL_FONT}>
            {v.andrat ? `${heltal(v.nuSumma)} → ${heltal(v.nySumma)}` : heltal(v.nuSumma)}
          </span>} />
      </Sektion>

      {v.mening && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.text }}>{v.mening}</p>
      )}

      <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        Talet sparas på trakten och gäller tills du sätter tillbaka appens värde.
        Det syns också i Redigering › Pris och ersättning.
      </p>

      {fel && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.orange }}>{fel}</p>
      )}
    </Ark>
  );
}

/* ════════════════ Terräng, avstånd och kontraktsnummer ════════════════ */
//
// Tre uppgifter appen inte kan räkna fram, fyllda i PÅ FAKTURAN (Martin
// 2026-11-16: "ska jag redigera måste jag komma till den sidan direkt och
// kunna komma tillbaka till fakturan igen"). Raderna ledde förut till
// /redigering?objekt=…, som öppnade hela redigeringsvyn utan att peka ut
// fältet och utan väg tillbaka — och kontraktsnumret har inget fält där alls.
//
// Samma skrivare som sortimentsrättningen: sparaFalt för de två ackordfälten,
// /api/faktura/kontraktsnr för numret (den lägger upp traktraden när den
// saknas — 27 av 44 trakter har bara maskindata).

/** Nu → efter. Pilen står BARA när något faktiskt ändras. */
function Prisandring(
  { etikett, v, enhet }: { etikett: string; v: ReturnType<typeof byggTillaggVy>; enhet: string },
) {
  return (
    <Sektion rubrik={v.andrat ? 'Priset ändras' : 'Priset'}>
      <Rad titel={etikett} pil={false} hogerUnder={enhet}
        hoger={<span style={TAL_FONT}>
          {v.andrat ? `${kr2(v.nuKr)} → ${kr2(v.nyKr)}` : kr2(v.nuKr)}
        </span>} />
      <Rad titel="På trakten" pil={false} hogerUnder="kr"
        hoger={<span style={TAL_FONT}>
          {v.andrat ? `${heltal(v.nuKronor)} → ${heltal(v.nyKronor)}` : heltal(v.nuKronor)}
        </span>} />
      <Rad sista titel="Att fakturera" pil={false} hogerUnder="kr"
        hoger={<span style={TAL_FONT}>
          {v.andrat ? `${heltal(v.nuSumma)} → ${heltal(v.nySumma)}` : heltal(v.nuSumma)}
        </span>} />
    </Sektion>
  );
}

/** Stegaren med talet i mitten — samma form som sortimentsrättningen. */
function Stegare(
  { tal, enhet, minus, plus, av, kanMinus }:
  { tal: string; enhet: string; minus: () => void; plus: () => void; av: boolean; kanMinus: boolean },
) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.l, marginBottom: AVSTAND.m }}>
      <Steg tecken="−" av={!kanMinus || av} onTryck={minus} />
      <div style={{ textAlign: 'center', minWidth: 128 }}>
        <p style={{ margin: 0, ...TYP.tal, ...TAL_FONT, color: FARG.text }}>{tal}</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{enhet}</p>
      </div>
      <Steg tecken="+" av={av} onTryck={plus} />
    </div>
  );
}

/* ───────────────────────────── Terrängen ───────────────────────────── */

/** Kronor per kubik, hela kronor — Martin har fakturerat 2–8 kr/m³fub. */
const TERRANG_STEG = 1;

function Terrang(p: GranskningProps) {
  const [kr, setKr] = useState(p.terrangKr);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const v = byggTillaggVy({
    nuKr: p.terrangKr, nyKr: kr, volym: p.pris.volym,
    nuSumma: p.summa, skotarAntal: p.skotarAntal, skotarPris: p.skotarPris,
  });

  async function spara() {
    setSparar(true);
    setFel(null);
    // 0 kr är frånvaron av ett tillägg, inte ett tillägg som råkar vara noll —
    // samma regel som "använd appens värde" i sortimentsrättningen.
    const r = await sparaFalt(
      { dimObjektIds: p.dimObjektIds, voNummer: p.voNummer },
      { terrang_kr_manuell: kr === 0 ? null : kr },
      { tabeller: ['dim'] },
    );
    setSparar(false);
    if (!r.ok) { setFel(r.message || 'Ändringen landade inte.'); return; }
    p.onSparat();
    p.onVy(null);
  }

  return (
    <Ark rubrik="Terrängtillägg" onStang={() => p.onVy(null)}
      fot={
        <button type="button" onClick={() => void spara()} disabled={!v.andrat || sparar}
          style={{ ...KNAPP.primar, ...(!v.andrat || sparar ? INAKTIV : {}) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      }>
      <Stegare tal={kr2(kr)} enhet="kronor per kubik" av={sparar} kanMinus={kr > 0}
        minus={() => setKr(n => Math.max(0, n - TERRANG_STEG))}
        plus={() => setKr(n => n + TERRANG_STEG)} />

      <p style={{ margin: `0 0 ${AVSTAND.xl}px`, ...TYP.text, color: FARG.text2, textAlign: 'center' }}>
        Svår eller blöt mark ger ett tillägg som går till skotaren. Normal mark
        ger inget — då är 0 kr rätt svar, och det finns inget att spara.
      </p>

      <Prisandring etikett="Terrängtillägg" enhet="kr/m³fub" v={v} />

      {v.mening && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.text }}>{v.mening}</p>
      )}

      <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        Talet sparas på trakten och syns också i Redigering › Pris och ersättning.
      </p>

      {fel && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.orange }}>{fel}</p>
      )}
    </Ark>
  );
}

/* ──────────────────────────── Avståndet ──────────────────────────── */

/** Priset räknas i hela påbörjade 100 m, så 100 m är stegets storlek. */
const AVSTAND_STEG = 100;

/** Stegaren börjar på jämna hundra — mellanliggande meter kostar ingenting. */
function startAvstand(a: Granskningsunderlag['avstand'], snittM: number | null): number {
  if (a.manuellt != null) return Math.round(a.manuellt);
  if (snittM != null) return Math.round(snittM / AVSTAND_STEG) * AVSTAND_STEG;
  return a.grundavstandM != null ? Math.round(a.grundavstandM) : 0;
}

function Avstand(p: GranskningProps) {
  const vy = byggAvstandVy({ a: p.avstand, volym: p.pris.volym, prisdatum: p.pris.prisdatum });
  const [m, setM] = useState(() => startAvstand(p.avstand, vy.avstandM));
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const cfg = p.avstand.grundavstandM != null && p.avstand.krPer100m != null
    ? { grundavstand_m: p.avstand.grundavstandM, kr_per_100m: p.avstand.krPer100m }
    : null;
  // Tillägget som GÄLLER är kronorna delat på hela traktens volym — det är det
  // talet maskinkortet bär, inte stegen för ett enskilt lass.
  const nuKr = p.pris.volym > 0 ? p.avstand.kronor / p.pris.volym : 0;
  const v = byggTillaggVy({
    nuKr,
    // Utan sats i prislistan går tillägget inte att räkna fram, och då visas
    // ingen ändring — ett påhittat tal vore värre än inget.
    nyKr: cfg ? skotAvstandKrPerM3(m, cfg) : nuKr,
    volym: p.pris.volym,
    nuSumma: p.summa, skotarAntal: p.skotarAntal, skotarPris: p.skotarPris,
  });

  // 0 m är frånvaron av ett avstånd, inte ett avstånd som råkar vara noll —
  // samma regel som terrängens nolla och "använd appens värde".
  const sparasSom = m === 0 ? null : m;
  const star = p.avstand.manuellt == null ? null : Math.round(p.avstand.manuellt);
  // Grå knapp när det som skulle sparas är det som redan står — en skrivning
  // som inte ändrar något ska inte gå att trycka fram.
  const andratM = sparasSom !== star;

  async function spara() {
    setSparar(true);
    setFel(null);
    const r = await sparaFalt(
      { dimObjektIds: p.dimObjektIds, voNummer: p.voNummer },
      { skotavstand_manuell: sparasSom },
      { tabeller: ['dim'] },
    );
    setSparar(false);
    if (!r.ok) { setFel(r.message || 'Ändringen landade inte.'); return; }
    p.onSparat();
    p.onVy(null);
  }

  return (
    <Ark rubrik="Skotningsavstånd" onStang={() => p.onVy(null)}
      fot={
        <button type="button" onClick={() => void spara()} disabled={!andratM || sparar}
          style={{ ...KNAPP.primar, ...(!andratM || sparar ? INAKTIV : {}) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      }>
      <Stegare tal={heltal(m)} enhet="meter enkel väg" av={sparar} kanMinus={m > 0}
        minus={() => setM(n => Math.max(0, n - AVSTAND_STEG))}
        plus={() => setM(n => n + AVSTAND_STEG)} />

      <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.text2, textAlign: 'center' }}>
        {vy.mening}
      </p>

      {vy.manuelltRad && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>
          {vy.manuelltRad}
        </p>
      )}

      <Prisandring etikett="Avståndstillägg" enhet="kr/m³fub" v={v} />

      {v.mening && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.text }}>{v.mening}</p>
      )}

      {vy.lassRader.length > 0 && (
        <Sektion rubrik="Så räknade appen"
          not={[vy.kallaRad, vy.merRad].filter(Boolean).join(' ') || undefined}>
          {vy.lassRader.map((r, i) => (
            <Rad key={i} pil={false} titel={r.avstand} under={r.under}
              sista={i === vy.lassRader.length - 1} />
          ))}
        </Sektion>
      )}

      <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        {vy.raknasRad}
      </p>

      {vy.prislistaRad && (
        <Sektion rubrik="Ur prislistan">
          <Rad sista titel={vy.prislistaRad} pil={false} />
        </Sektion>
      )}

      <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        {vy.pengar}. Sparar du ett avstånd gäller det hela trakten i stället för
        lassen, och syns också i Redigering › Pris och ersättning.
      </p>

      {fel && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.orange }}>{fel}</p>
      )}
    </Ark>
  );
}

/* ───────────────────────── Kontraktsnummer ───────────────────────── */

function Kontraktsnr(p: GranskningProps) {
  const [nummer, setNummer] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const nr = nummer.trim();

  async function spara() {
    if (!nr) return;
    setSparar(true);
    setFel(null);
    try {
      const res = await fetch('/api/faktura/kontraktsnr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: p.voNummer, kontraktsnummer: nr }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        setFel(j?.meddelande || `Servern svarade ${res.status}. Numret är inte sparat.`);
        return;
      }
      p.onSparat();
      p.onVy(null);
    } catch (e) {
      setFel(e instanceof Error ? e.message : 'Anropet gick inte fram. Numret är inte sparat.');
    } finally {
      setSparar(false);
    }
  }

  return (
    <Ark rubrik="Kontraktsnummer" onStang={() => p.onVy(null)}
      fot={
        <button type="button" onClick={() => void spara()} disabled={!nr || sparar}
          style={{ ...KNAPP.primar, ...(!nr || sparar ? INAKTIV : {}) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      }>
      <Falt etikett="Numret står på Vidas kontrakt" value={nummer} onChange={setNummer}
        inputMode="numeric" autoFocus />

      <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.text2 }}>
        Numret går ut som artikel 8 på fakturan. Utan det går fakturan inte att
        följa upp mot Vidas avräkning.
      </p>

      {fel && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.text, color: FARG.orange }}>{fel}</p>
      )}
    </Ark>
  );
}
