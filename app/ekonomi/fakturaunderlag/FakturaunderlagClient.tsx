'use client';

/**
 * FAKTURAUNDERLAG — två lägen: listan och en trakt.
 *
 * LISTAN är lodrät och grupperad på TILLSTÅND, inte en vågrät remsa med
 * likvärdiga kort. Sidoskrollning kostar dubbelt: man måste både leta och
 * minnas var man var. En lodrät lista skannas med ögat, och grupperna säger
 * vad som ska göras i stället för att tvinga fram en härledning ur siffror.
 * Överst ETT tal — antal trakter klara att fakturera och deras summa.
 *
 * TRAKTEN delas upp PER MASKIN, och traktens tillägg står för sig.
 * Grundpriset kommer ur prislistan och är olika per maskin; tillägget hör
 * till TRAKTEN och delas. Blandas de ihop går det inte att se varför Gigant
 * får 58,00 och Wisent 56,50.
 *
 * FÄRGER OCH TYPSNITT UR lib/design/tokens.ts. Skissen ritades i en
 * gröntonad palett med IBM Plex innan tokens var känt; strukturen ovan är
 * det som skulle överleva, inte färgerna. Ett andra mörkt tema i appen vore
 * precis det som "samma i hela appen" ska förhindra.
 *
 * Ingenting sparas och ingenting skickas till Fortnox härifrån.
 */

import { useEffect, useState } from 'react';
import {
  FARG, TYP, AVSTAND, RADIE, TRAFFYTA, VY_ROT, KORT, FONT, TAL_FONT,
} from '@/lib/design/tokens';
import { delaHalften, type Tillaggspost } from '@/lib/ekonomi/prisPerM3';

type Rad = {
  radnr: number; artikelnr: string | null; benamning: string;
  antal: number | null; enhet: string | null;
  prisagare: string; a_pris: number | null; a_pris_beraknat: number | null;
  harledning: { etikett: string; belopp: number; ungefarlig?: boolean }[] | null;
  kalla: string; status: string; fel_kod: string | null; kostnadsstalle: string | null;
  delar_grundpris: number | null; delar_andel: number | null; delar_avstand: number | null;
  prislista: { medelstam: number; klass: number; total: number; skordare: number; skotare: number } | null;
  tillaggsposter: Tillaggspost[] | null;
};
type Detalj = {
  vo_nummer: string; objektnamn: string; kund: number | null; bolag: string | null;
  avtalsform: string; avrakningsdatum: string | null; objekt_ids: string[];
  rader: Rad[]; noter: { niva: string; text: string }[]; hinder: string[];
  gar_att_skicka: boolean; summa_kant: number; rader_utan_pris: number; fel?: string;
};
type OversiktsRad = {
  vo_nummer: string; namn: string; bolag: string | null; fortnox_kundnr: number | null;
  avtalsform: 'ackord' | 'timpeng'; tillstand: string; avrakningsdatum: string | null;
  objekt_antal: number; volym_m3fub: number; g15h: number; hinder: string | null;
  hinder_typ: 'kund' | 'traillertimmar' | 'kontraktsnr' | null;
  saknar_objektrad: boolean;
};
type Oversikt = {
  ms: number; antal: number;
  grupper: {
    klara: OversiktsRad[];
    gar_inte_att_prissatta: OversiktsRad[];
    saknar_kontraktsnr: OversiktsRad[];
    ingen_gemensam_kund: OversiktsRad[];
    pagar: OversiktsRad[]; ej_paborjad: OversiktsRad[];
  };
};

const nr = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const kr2 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FakturaunderlagClient() {
  const [oversikt, setOversikt] = useState<Oversikt | null>(null);
  const [listFel, setListFel] = useState<string | null>(null);
  const [oppen, setOppen] = useState<string | null>(null);
  const [detalj, setDetalj] = useState<Detalj | null>(null);
  const [detaljFel, setDetaljFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/faktura/oversikt');
        const j = await r.json();
        if (!r.ok || !j.ok) { setListFel(j?.meddelande || `Servern svarade ${r.status}.`); return; }
        setOversikt(j);
      } catch (e: any) { setListFel(e?.message || 'Anropet gick inte fram.'); }
    })();
  }, []);

  async function oppna(vo: string) {
    setOppen(vo); setDetalj(null); setDetaljFel(null);
    try {
      const r = await fetch('/api/faktura/underlag', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: vo, dry_run: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setDetaljFel(j?.meddelande || `Servern svarade ${r.status}.`); return; }
      setDetalj(j.resultat?.[0] || null);
    } catch (e: any) { setDetaljFel(e?.message || 'Anropet gick inte fram.'); }
  }

  // 120 = frigång för den fasta bottennavigationen, samma som
  // app/ekonomi/delade/mall.tsx. Fysiskt mått, inte en designtoken.
  const rot: React.CSSProperties = { ...VY_ROT, paddingBottom: 120, maxWidth: 1280, margin: '0 auto' };

  if (oppen) {
    return (
      <div style={rot}>
        <TraktVy vo={oppen} detalj={detalj} fel={detaljFel}
          tillbaka={() => { setOppen(null); setDetalj(null); setDetaljFel(null); }} />
      </div>
    );
  }

  return (
    <div style={rot}>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.xl}px 0 0` }}>Fakturaunderlag</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        Ingenting sparas och ingenting skickas till Fortnox förrän du granskat.
      </p>

      {listFel && <Ruta titel="Kunde inte läsa underlagen" text={listFel} varning />}
      {!listFel && !oversikt && (
        <p style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xl }}>
          Läser trakterna…
        </p>
      )}

      {oversikt && (
        <>
          <Huvudtal antal={oversikt.grupper.klara.length}
            volym={oversikt.grupper.klara.reduce((s, r) => s + r.volym_m3fub, 0)} />

          <Grupp titel="Klara att fakturera" rader={oversikt.grupper.klara} oppna={oppna}
            tomText="Ingen trakt är klar att fakturera just nu." />

          <Grupp titel="Går inte att prissätta" rader={oversikt.grupper.gar_inte_att_prissatta}
            oppna={oppna} visaHinder
            tomText="Alla rader går att prissätta." />

          {/* Kontraktsnumren fylls i HÄR, inte en trakt i taget. Fyrtiofyra
              fält som kräver fyrtiofyra öppningar blir aldrig gjorda. */}
          <Kontraktsgrupp rader={oversikt.grupper.saknar_kontraktsnr} oppna={oppna}
            sparad={(vo, nr) => setOversikt(o => o && {
              ...o,
              grupper: {
                ...o.grupper,
                saknar_kontraktsnr: o.grupper.saknar_kontraktsnr.filter(r => r.vo_nummer !== vo),
                // Raden flyttas till "klara" först vid nästa laddning —
                // listan vet inte om trakten har andra hinder, och att gissa
                // hade gjort den oense med sig själv. Den försvinner ur
                // högen, det räcker.
              },
            })} />

          <Grupp titel="Faktureras inte på vo-nummer" rader={oversikt.grupper.ingen_gemensam_kund}
            oppna={oppna} visaHinder dampad
            tomText="Alla bolag med avslutade trakter har kundnummer i Fortnox." />

          <Grupp titel="Pågår" rader={oversikt.grupper.pagar} oppna={oppna} dampad
            tomText="Ingen trakt är påbörjad men oavslutad." />

          <Grupp titel="Inte påbörjade" rader={oversikt.grupper.ej_paborjad} oppna={oppna} dampad
            tomText="Alla upplagda trakter är påbörjade." />

          {/* Listan kontrollerar kund, kontraktsnummer och flyttimmar. En
              saknad prissats syns först när trakten öppnas — det ska stå,
              inte antydas. */}
          <p style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.xl }}>
            {oversikt.antal} trakter, lästa på {oversikt.ms} ms. Listan kontrollerar kund,
            kontraktsnummer och traillertimmar — priserna räknas när du öppnar en trakt.
          </p>
        </>
      )}
    </div>
  );
}

/* ── Delar ─────────────────────────────────────────────────────────────── */

function Huvudtal({ antal, volym }: { antal: number; volym: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m,
                  margin: `${AVSTAND.xxl}px 0 0`, flexWrap: 'wrap' }}>
      <span style={{ ...TYP.tal, ...TAL_FONT }}>{antal}</span>
      <div>
        <p style={{ ...TYP.rubrik, margin: 0 }}>
          {antal === 1 ? 'trakt klar att fakturera' : 'trakter klara att fakturera'}
        </p>
        {/* Volym i stället för kronor. Beloppet hade krävt hela prisformeln
            en gång till i SQL — två priser är samma felklass som
            acord_flyttkostnad. Det kommer tillbaka när status finns och
            "klara" är en handfull. */}
        <p style={{ ...TYP.meta, ...TAL_FONT, margin: `${AVSTAND.xs}px 0 0`, color: FARG.text2 }}>
          {nr(volym)} m³fub
        </p>
      </div>
    </div>
  );
}

function Grupp({ titel, rader, oppna, visaHinder, dampad, tomText }: {
  titel: string; rader: OversiktsRad[]; oppna: (vo: string) => void;
  visaHinder?: boolean; dampad?: boolean; tomText: string;
}) {
  return (
    <div style={{ marginTop: AVSTAND.xl }}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
        {titel}{rader.length > 0 ? ` · ${rader.length}` : ''}
      </p>
      <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
        {rader.length === 0 ? (
          <p style={{ ...TYP.meta, color: FARG.text3, margin: 0, padding: `${AVSTAND.l}px` }}>{tomText}</p>
        ) : rader.map((r, i) => (
          <div key={r.vo_nummer}>
            {i > 0 && <div style={{ height: 1, background: FARG.linje, marginLeft: AVSTAND.l }} />}
            <button type="button" onClick={() => oppna(r.vo_nummer)}
              style={{
                display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%',
                padding: `${AVSTAND.m}px ${AVSTAND.l}px`, minHeight: TRAFFYTA.min,
                boxSizing: 'border-box', background: 'none', border: 'none',
                color: 'inherit', textAlign: 'left', fontFamily: FONT,
                cursor: 'pointer', flexWrap: 'wrap',
              }}>
              <span style={{ ...TYP.text, flexGrow: 1, minWidth: 180,
                             color: dampad ? FARG.text2 : FARG.text }}>{r.namn}</span>
              <span style={{ ...TYP.meta, color: FARG.text2, minWidth: 90 }}>{r.bolag || '—'}</span>
              {/* Både volym och timmar visas när båda finns. Ett timpengsobjekt
                  faktureras på timmar men har ändå en volym, och tvärtom —
                  att välja åt Martin döljer hälften. */}
              <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                             minWidth: 110, textAlign: 'right' }}>
                {r.volym_m3fub > 0 ? `${nr(r.volym_m3fub)} m³fub` : ''}
              </span>
              <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                             minWidth: 80, textAlign: 'right' }}>
                {r.g15h > 0 ? `${nr(r.g15h, 1)} tim` : ''}
              </span>
              {visaHinder && r.hinder && (
                <span style={{ ...TYP.meta, flexBasis: '100%',
                               color: dampad ? FARG.text3 : FARG.orange }}>{r.hinder}</span>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Kontraktsnumren fylls i direkt i listan — fyrtiofyra fält, en sittning.
 * Att öppna varje trakt för sig hade gjort samma arbete fyrtiofyra gånger,
 * och då blir det inte gjort.
 *
 * VARJE RAD SPARAR FÖR SIG, mot /api/faktura/kontraktsnr som läser tillbaka
 * värdet. Ingen samlad spara-knapp: ett halvt sparat formulär där några
 * rader gick igenom och andra inte är värre än fyrtiofyra små besked.
 */
function Kontraktsgrupp({ rader, oppna, sparad }: {
  rader: OversiktsRad[]; oppna: (vo: string) => void;
  sparad: (vo: string, nr: string) => void;
}) {
  const [utkast, setUtkast] = useState<Record<string, string>>({});
  const [sparar, setSparar] = useState<string | null>(null);
  const [fel, setFel] = useState<Record<string, string>>({});

  async function spara(r: OversiktsRad) {
    const nr = (utkast[r.vo_nummer] || '').trim();
    if (!nr) return;
    setSparar(r.vo_nummer);
    setFel(f => { const n = { ...f }; delete n[r.vo_nummer]; return n; });
    try {
      const res = await fetch('/api/faktura/kontraktsnr', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: r.vo_nummer, kontraktsnummer: nr }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setFel(f => ({ ...f, [r.vo_nummer]: j?.meddelande || `Servern svarade ${res.status}.` })); return; }
      sparad(r.vo_nummer, nr);
    } catch (e: any) {
      setFel(f => ({ ...f, [r.vo_nummer]: e?.message || 'Anropet gick inte fram.' }));
    } finally {
      setSparar(null);
    }
  }

  const utanRad = rader.filter(r => r.saknar_objektrad).length;

  return (
    <div style={{ marginTop: AVSTAND.xl }}>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
        Saknar kontraktsnummer{rader.length > 0 ? ` · ${rader.length}` : ''}
      </p>
      <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
        {rader.length === 0 ? (
          <p style={{ ...TYP.meta, color: FARG.text3, margin: 0, padding: `${AVSTAND.l}px` }}>
            Alla Vida-trakter har ett kontraktsnummer. Privata markägare och Karl Hedin
            har inga — begreppet finns inte där.
          </p>
        ) : rader.map((r, i) => (
          <div key={r.vo_nummer}>
            {i > 0 && <div style={{ height: 1, background: FARG.linje, marginLeft: AVSTAND.l }} />}
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m,
                          padding: `${AVSTAND.m}px ${AVSTAND.l}px`, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => oppna(r.vo_nummer)}
                style={{ ...TYP.text, flexGrow: 1, minWidth: 160, background: 'none',
                         border: 'none', color: FARG.text, textAlign: 'left',
                         fontFamily: FONT, cursor: 'pointer', padding: 0,
                         minHeight: TRAFFYTA.min }}>
                {r.namn}
              </button>
              <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2, minWidth: 100 }}>
                VO {r.vo_nummer}
              </span>
              <input
                inputMode="numeric"
                placeholder="kontraktsnr"
                value={utkast[r.vo_nummer] ?? ''}
                onChange={e => setUtkast(u => ({ ...u, [r.vo_nummer]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') spara(r); }}
                style={{ ...TYP.text, ...TAL_FONT, width: 130, minHeight: TRAFFYTA.min,
                         padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.rad,
                         border: `1px solid ${FARG.linje}`, background: FARG.upphojt,
                         color: FARG.text, boxSizing: 'border-box' }} />
              <button type="button" onClick={() => spara(r)}
                disabled={!((utkast[r.vo_nummer] || '').trim()) || sparar === r.vo_nummer}
                style={{ ...TYP.text, fontFamily: FONT, padding: `0 ${AVSTAND.l}px`,
                         minHeight: TRAFFYTA.min, border: 'none', borderRadius: RADIE.knapp,
                         background: FARG.gron, color: FARG.bg,
                         opacity: (utkast[r.vo_nummer] || '').trim() && sparar !== r.vo_nummer ? 1 : 0.4,
                         cursor: (utkast[r.vo_nummer] || '').trim() ? 'pointer' : 'default' }}>
                {sparar === r.vo_nummer ? 'Sparar…' : 'Spara'}
              </button>
              {/* Att trakten LÄGGS UPP ska stå innan någon trycker, inte
                  upptäckas efteråt i planeringsvyn. */}
              {r.saknar_objektrad && (
                <span style={{ ...TYP.meta, color: FARG.text3, flexBasis: '100%' }}>
                  Trakten finns inte upplagd — den skapas när numret sparas
                </span>
              )}
              {fel[r.vo_nummer] && (
                <span style={{ ...TYP.meta, color: FARG.orange, flexBasis: '100%' }}>
                  {fel[r.vo_nummer]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
      {utanRad > 0 && (
        <p style={{ ...TYP.meta, color: FARG.text3, margin: `${AVSTAND.s}px 0 0 ${AVSTAND.xs}px` }}>
          {utanRad} av {rader.length} har ingen traktrad än. Att spara ett nummer lägger upp
          trakten, märkt som oplanerad.
        </p>
      )}
    </div>
  );
}

function Ruta({ titel, text, varning }: { titel: string; text: string; varning?: boolean }) {
  return (
    <div style={{ ...KORT, marginTop: AVSTAND.xl }}>
      <p style={{ ...TYP.listtitel, margin: 0, color: varning ? FARG.orange : FARG.text }}>{titel}</p>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{text}</p>
    </div>
  );
}

/* ── Trakten ───────────────────────────────────────────────────────────── */

function TraktVy({ vo, detalj, fel, tillbaka }: {
  vo: string; detalj: Detalj | null; fel: string | null; tillbaka: () => void;
}) {
  return (
    <>
      <button type="button" onClick={tillbaka}
        style={{ ...TYP.text, background: 'none', border: 'none', color: FARG.bla,
                 fontFamily: FONT, padding: `${AVSTAND.xl}px 0 0`,
                 cursor: 'pointer', minHeight: TRAFFYTA.min }}>
        ← Alla underlag
      </button>

      {fel && <Ruta titel="Underlaget kunde inte byggas" text={fel} varning />}
      {!fel && !detalj && (
        <p style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xl }}>Bygger raderna för {vo}…</p>
      )}
      {detalj && <TraktInnehall d={detalj} />}
    </>
  );
}

function TraktInnehall({ d }: { d: Detalj }) {
  const maskinRader = d.rader.filter(r => ['1', '2', '11', '12'].includes(r.artikelnr || ''));
  const ovriga = d.rader.filter(r => !maskinRader.includes(r) && r.antal !== 0);

  // Traktens tillägg står i ackordraden. Grundraden och avståndet hör till
  // maskinen, resten till trakten.
  const harl = maskinRader.find(r => r.artikelnr === '1')?.harledning || [];
  const fordelningsnot = harl.find(h => h.etikett.startsWith('Fördelning ändrad'));
  const skordarrad = maskinRader.find(r => r.artikelnr === '1');
  const poster = skordarrad?.tillaggsposter || [];
  // Bara det som faktiskt DELAS står kvar som traktens post. Krönt, terräng
  // och sortiment hör till var sin maskin och visas på maskinens kort.
  const delade = poster.filter(pp => pp.mottagare === 'delas' && pp.belopp !== 0);
  const attFordela = delade.reduce((s, pp) => s + pp.belopp, 0);
  const prislista = skordarrad?.prislista || null;
  const kontrakt = d.rader.find(r => r.artikelnr === '8')?.benamning || '';

  return (
    <>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.l}px 0 0` }}>{d.objektnamn}</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        {d.bolag || '—'} · {d.avtalsform} · VO {d.vo_nummer}
        {kontrakt.startsWith('Kontraktsnr ') ? ` · ${kontrakt.toLowerCase()}` : ''}
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m,
                    margin: `${AVSTAND.xl}px 0 0`, flexWrap: 'wrap' }}>
        <span style={{ ...TYP.tal, ...TAL_FONT }}>{nr(d.summa_kant)}</span>
        <div>
          <p style={{ ...TYP.rubrik, margin: 0 }}>kr att fakturera</p>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
            {d.avrakningsdatum ? `Avslutad ${d.avrakningsdatum}` : 'Inte avräknad'}
            {d.rader_utan_pris > 0 && ` · ${d.rader_utan_pris} rader utan hämtat pris`}
          </p>
        </div>
      </div>

      {/* VAD PRISLISTAN GER, innan tilläggen. Utan den ser 57,00 och 44,00
          ut som tal appen hittat på i stället för en rad i avtalet — och
          klampningen "0,57 → klass 0,55" är en TOLKNING som ska synas. */}
      {prislista && (
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xl}px 0 0` }}>
          <span style={TAL_FONT}>
            Prislistan, medelstam {kr2(prislista.medelstam)} → klass {kr2(prislista.klass)}:{' '}
            {kr2(prislista.total)} kr/m³fub — skördare {kr2(prislista.skordare)} · skotare{' '}
            {kr2(prislista.skotare)}
          </span>
        </p>
      )}

      <div style={{ display: 'flex', gap: AVSTAND.l, marginTop: AVSTAND.l, flexWrap: 'wrap' }}>
        {maskinRader.map(r => <Maskinkort key={r.radnr} r={r} />)}
      </div>

      {(delade.length > 0 || fordelningsnot) && (
        <div style={{ marginTop: AVSTAND.xl }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
            Delas mellan maskinerna
          </p>
          <div style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {delade.map((pp, i) => (
              <Prisrad key={i} etikett={pp.etikett} belopp={pp.belopp} dampad tecken />
            ))}
            {delade.length > 1 && (
              <>
                <div style={{ height: 1, background: FARG.linje }} />
                <Prisrad etikett="Att fördela" belopp={attFordela} stor />
              </>
            )}
            {fordelningsnot && (
              <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>{fordelningsnot.etikett}</p>
            )}
          </div>
        </div>
      )}

      {ovriga.length > 0 && (
        <div style={{ marginTop: AVSTAND.xl }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.s}px ${AVSTAND.xs}px` }}>
            Övriga rader
          </p>
          <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
            {ovriga.map((r, i) => {
              const pris = r.a_pris ?? r.a_pris_beraknat;
              return (
                <div key={r.radnr}>
                  {i > 0 && <div style={{ height: 1, background: FARG.linje, marginLeft: AVSTAND.l }} />}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m,
                                padding: `${AVSTAND.m}px ${AVSTAND.l}px`, flexWrap: 'wrap' }}>
                    <span style={{ ...TYP.text, flexGrow: 1, minWidth: 160 }}>{r.benamning}</span>
                    <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                                   minWidth: 90, textAlign: 'right' }}>
                      {r.antal == null ? '—' : kr2(r.antal)} {r.enhet === 'h' ? 'tim' : r.enhet || ''}
                    </span>
                    <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2,
                                   minWidth: 70, textAlign: 'right' }}>
                      {pris == null ? 'hämtas' : kr2(pris)}
                    </span>
                    <span style={{ ...TYP.text, ...TAL_FONT, minWidth: 100, textAlign: 'right' }}>
                      {pris != null && r.antal != null ? `${nr(pris * r.antal)} kr` : '—'}
                    </span>
                  </div>
                  {r.status !== 'klar' && (
                    <p style={{ ...TYP.meta, color: FARG.orange,
                                margin: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
                      {r.status === 'fel' ? `Går inte att prissätta: ${r.fel_kod}` : 'Väntar på leverantörsfaktura'}
                    </p>
                  )}
                  {!!r.harledning?.length && (
                    <p style={{ ...TYP.meta, color: FARG.text2,
                                margin: `0 ${AVSTAND.l}px ${AVSTAND.m}px` }}>
                      {r.harledning.filter(h => h.belopp === 0).map(h => h.etikett).join(' · ')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(d.hinder.length > 0 || d.noter.length > 0) && (
        <div style={{ marginTop: AVSTAND.xl, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 0 ${AVSTAND.xs}px` }}>Att titta på</p>
          {d.hinder.map((h, i) => (
            <p key={`h${i}`} style={{ ...TYP.text, color: FARG.orange, margin: 0 }}>{h}</p>
          ))}
          {d.noter.map((n, i) => (
            <p key={`n${i}`} style={{ ...TYP.text, margin: 0,
                                      color: n.niva === 'varning' ? FARG.text : FARG.text2 }}>{n.text}</p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m,
                    marginTop: AVSTAND.xxl, flexWrap: 'wrap' }}>
        <button type="button" disabled
          style={{ ...TYP.text, fontFamily: FONT, padding: `0 ${AVSTAND.xl}px`,
                   height: TRAFFYTA.primar, border: 'none', borderRadius: RADIE.knapp,
                   background: FARG.gron, color: FARG.bg, opacity: 0.4, cursor: 'default' }}>
          Markera som granskad
        </button>
        <span style={{ ...TYP.meta, color: FARG.text2 }}>
          Granskning och sändning är inte byggt än — den här vyn räknar bara fram raderna.
        </span>
      </div>
    </>
  );
}

function Maskinkort({ r }: { r: Rad }) {
  const pris = r.a_pris_beraknat;
  const grund = r.harledning?.find(h => h.etikett.startsWith('Grund'));
  const arTimpeng = r.artikelnr === '11' || r.artikelnr === '12';
  const roll: 'skordare' | 'skotare' =
    r.artikelnr === '1' || r.artikelnr === '11' ? 'skordare' : 'skotare';
  const verb = roll === 'skordare' ? 'Skördning' : 'Skotning';
  // Benämningen är "Skördning ackord Gigant" — maskinnamnet är resten.
  const namn = r.benamning.split(' ').slice(2).join(' ') || r.benamning;

  // VARJE POST HÖR TILL EN MASKIN. Krönt står på skördarens kort, terräng
  // och sortiment på skotarens, och traktstorleken delas. Ingen rad som
  // heter "andel av en pott" — den dolde vem som fick vad.
  const egnaPoster = (r.tillaggsposter || [])
    .map(pp => ({
      etikett: pp.etikett,
      belopp: pp.mottagare === 'delas' ? delaHalften(pp.belopp)[roll]
            : pp.mottagare === roll ? pp.belopp : 0,
      delad: pp.mottagare === 'delas',
    }))
    .filter(pp => pp.belopp !== 0);

  // Är fördelningen överskriven stämmer inte uppdelningen längre. Då visas
  // EN rad med det faktiska beloppet i stället för en uppställning som ser
  // exakt ut men inte summerar till à-priset.
  const summaEgna = Math.round(egnaPoster.reduce((s, pp) => s + pp.belopp, 0) * 100);
  const overskriven = r.delar_andel != null && summaEgna !== Math.round(r.delar_andel * 100);

  return (
    <div style={{ ...KORT, flexGrow: 1, flexBasis: 300, minWidth: 260,
                  display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <div>
        <p style={{ ...TYP.rubrik, margin: 0 }}>{namn}</p>
        <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>
          {verb} · {r.kostnadsstalle ? `kostnadsställe ${r.kostnadsstalle}` : 'kostnadsställe saknas'}
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
        {r.delar_grundpris != null && (
          <Prisrad dampad belopp={r.delar_grundpris}
            etikett={arTimpeng ? 'Timpris'
              : (grund?.etikett.replace('Grund ', '').replace(/[()]/g, '') || 'Grundpris')} />
        )}
        {!arTimpeng && !overskriven && egnaPoster.map((pp, i) => (
          <Prisrad key={i} dampad tecken belopp={pp.belopp}
            etikett={pp.delad ? `${pp.etikett}, halva` : pp.etikett} />
        ))}
        {!arTimpeng && overskriven && r.delar_andel !== 0 && (
          <Prisrad dampad tecken etikett="Andel av traktens tillägg" belopp={r.delar_andel} />
        )}
        {!arTimpeng && !!r.delar_avstand && (
          <Prisrad dampad tecken etikett="Skotningsavstånd" belopp={r.delar_avstand} />
        )}
      </div>

      <div style={{ height: 1, background: FARG.linje }} />
      <Prisrad etikett={arTimpeng ? 'Pris per timme' : 'Pris per m³fub'} belopp={pris} stor />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
        <span style={{ ...TYP.meta, ...TAL_FONT, flexGrow: 1, color: FARG.text2 }}>
          × {kr2(r.antal)} {arTimpeng ? 'tim' : 'm³fub'}
        </span>
        <span style={{ ...TYP.text, ...TAL_FONT }}>
          {pris != null && r.antal != null ? `${nr(pris * r.antal)} kr` : '—'}
        </span>
      </div>
    </div>
  );
}

function Prisrad({ etikett, belopp, stor, dampad, tecken }: {
  etikett: string; belopp: number | null; stor?: boolean; dampad?: boolean; tecken?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
      <span style={{ ...TYP.text, flexGrow: 1, color: dampad ? FARG.text2 : FARG.text }}>{etikett}</span>
      <span style={{ ...(stor ? TYP.rubrik : TYP.text), ...TAL_FONT }}>
        {belopp == null ? '—' : `${tecken && belopp > 0 ? '+' : ''}${kr2(belopp)}`}
      </span>
    </div>
  );
}
