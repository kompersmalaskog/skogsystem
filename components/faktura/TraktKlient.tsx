'use client';
// EN trakt. Svaret först, sedan vad varje maskin fick betalt och varför.
//
// Formen (Martin 2026-10-24, efter att den första omgången hade fyrtio tal på
// en skärm):
//   * ETT stort tal — kronor att fakturera;
//   * EN orange rad direkt under när något behöver tittas på;
//   * ett kort per maskin där VARJE rad säger vad den är och kolumnen går att
//     räkna ihop med miniräknare (lib/faktura/traktVy.ts);
//   * potten EN gång, i ord, under korten — kortet "Delas mellan maskinerna"
//     visade samma tillägg en andra gång på samma skärm;
//   * det manuella arbetet ur arbetsrapporten som en egen sektion, märkt med
//     att priset inte går att hämta än.
//
// Ingenting sparas och ingenting skickas till Fortnox härifrån.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { byggMaskinkort, pottMening, type MaskinRad } from '@/lib/faktura/traktVy';
import type { ManuelltArbete } from '@/lib/faktura/lasManuellt';
import type { Granskningsunderlag } from '@/lib/faktura/hamtaUnderlag';
import GranskningArk, { type Vy } from '@/components/faktura/GranskningArk';
import { fordelaTillagg, type Tillaggspost } from '@/lib/ekonomi/prisPerM3';
import {
  AVSTAND, FARG, INAKTIV, KNAPP, KOLUMN, KORT, RADIE, TAL_FONT, TYP, TRAFFYTA,
} from '@/lib/design/tokens';

type Rader = MaskinRad & {
  radnr: number
  enhet: string | null
  prisagare: string
  a_pris: number | null
  status: string
  fel_kod: string | null
  prislista: { medelstam: number; klass: number; total: number; skordare: number; skotare: number } | null
}

type Detalj = {
  vo_nummer: string; objektnamn: string; bolag: string | null
  avtalsform: string; avrakningsdatum: string | null
  objekt_ids: string[]
  rader: Rader[]; noter: { niva: string; text: string }[]; hinder: string[]
  summa_kant: number; rader_utan_pris: number
  granskning: Granskningsunderlag | null
}

const nr = (n: number, dec = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const kr2 = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tecknat = (n: number) => `${n > 0 ? '+' : ''}${kr2(n)}`;

function Prick() {
  return <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: RADIE.cirkel, background: FARG.orange, flexShrink: 0, marginTop: AVSTAND.s }} />;
}

/** En orange rad: texten säger hela saken, färgen förstärker bara. */
function Varning({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', gap: AVSTAND.s, marginTop: AVSTAND.m }}>
      <Prick />
      <span style={{ ...TYP.text, color: FARG.text, flex: 1 }}>{text}</span>
    </div>
  );
}

export default function TraktKlient({ vo, manuellt }: { vo: string; manuellt: ManuelltArbete | null }) {
  const [detalj, setDetalj] = useState<Detalj | null>(null);
  const [fel, setFel] = useState<string | null>(null);

  const hamta = useCallback(async () => {
    setFel(null);
    setDetalj(null);
    try {
      const res = await fetch('/api/faktura/underlag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: vo, dry_run: true }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) { setFel(j?.meddelande || `Servern svarade ${res.status}.`); return; }
      setDetalj(j.resultat?.[0] ?? null);
    } catch (e) {
      setFel(e instanceof Error ? e.message : 'Anropet gick inte fram.');
    }
  }, [vo]);

  useEffect(() => { void hamta(); }, [hamta]);

  return (
    <div className="fa-trakt">
      <Link href="/ekonomi/fakturaunderlag" className="fa-bara-smal"
        style={{ ...TYP.text, color: FARG.bla, display: 'flex', alignItems: 'center', minHeight: TRAFFYTA.min, textDecoration: 'none' }}>
        ‹ Alla underlag
      </Link>

      {fel && (
        <div style={{ ...KORT }}>
          <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>Underlaget kunde inte byggas</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{fel}</p>
          <button type="button" onClick={() => void hamta()} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
            Försök igen
          </button>
        </div>
      )}

      {!fel && !detalj && (
        <p style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xl }}>Bygger raderna för {vo}…</p>
      )}

      {detalj && <Innehall d={detalj} manuellt={manuellt} omlasning={hamta} />}
    </div>
  );
}

function Innehall({ d, manuellt, omlasning }: { d: Detalj; manuellt: ManuelltArbete | null; omlasning: () => void }) {
  const [granskning, setGranskning] = useState<Vy | null>(null);
  const maskinRader = d.rader.filter(r => ['1', '2', '11', '12'].includes(r.artikelnr ?? ''));
  const ovriga = d.rader.filter(r => !maskinRader.includes(r) && r.antal !== 0);
  const skordarrad = maskinRader.find(r => r.artikelnr === '1');
  // Sortimentstillägget går helt till skotaren, så det är skotarens rad som
  // bär avståndstillägget och som ändras när antalet sortiment ändras.
  const skotarrad = maskinRader.find(r => r.artikelnr === '2');
  const poster: Tillaggspost[] = skordarrad?.tillaggsposter ?? [];
  const forslag = poster.length > 0 ? fordelaTillagg(poster) : null;
  const pott = pottMening(poster, forslag, skordarrad?.delar_andel ?? null);
  const prislista = skordarrad?.prislista ?? null;
  const kontrakt = d.rader.find(r => r.artikelnr === '8')?.benamning ?? '';

  return (
    <>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.s}px 0 0`, color: FARG.text }}>{d.objektnamn}</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.s}px 0 0` }}>
        {[
          d.bolag ?? 'bolag saknas',
          d.avtalsform,
          `VO ${d.vo_nummer}`,
          kontrakt.startsWith('Kontraktsnr ') ? kontrakt.toLowerCase() : null,
          d.avrakningsdatum ? `avslutad ${d.avrakningsdatum}` : 'inte avräknad',
        ].filter(Boolean).join(' · ')}
      </p>

      <h2 style={{ ...TYP.rubrik, color: FARG.text, margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px` }}>
        Vad ska faktureras?
      </h2>
      <p style={{ margin: 0, ...TYP.tal, ...TAL_FONT, color: FARG.text }}>{nr(d.summa_kant)}</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text }}>kronor</p>
      {d.rader_utan_pris > 0 && (
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>
          {d.rader_utan_pris} {d.rader_utan_pris === 1 ? 'rad' : 'rader'} utan hämtat pris räknas inte in
        </p>
      )}

      {d.hinder.map((h, i) => <Varning key={`h${i}`} text={h} />)}
      {d.noter.filter(n => n.niva === 'varning').map((n, i) => <Varning key={`n${i}`} text={n.text} />)}

      <div className="fa-maskiner" style={{ marginTop: AVSTAND.xl }}>
        {maskinRader.map(r => {
          const k = byggMaskinkort(r);
          return (
            <div key={r.radnr}>
              <h3 style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.xs}px` }}>{k.etikett}</h3>
              <div style={{ ...KORT, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
                <p style={{ margin: 0, ...TYP.listtitel, color: FARG.text }}>{k.namn}</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                  {k.rader.map((rad, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
                      <span style={{ ...TYP.text, color: FARG.text2, flex: 1 }}>{rad.etikett}</span>
                      <span style={{ ...TYP.text, ...TAL_FONT, color: FARG.text }}>
                        {rad.tecken ? tecknat(rad.belopp) : kr2(rad.belopp)}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ height: 1, background: FARG.linje }} />
                <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
                  <span style={{ ...TYP.text, color: FARG.text, flex: 1 }}>{k.prisEtikett}</span>
                  <span style={{ ...TYP.rubrik, ...TAL_FONT, color: FARG.text }}>{kr2(k.pris)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.m }}>
                  <span style={{ ...TYP.meta, ...TAL_FONT, color: FARG.text2, flex: 1 }}>
                    × {kr2(k.antal)} {k.antalEnhet}
                  </span>
                  <span style={{ ...TYP.rubrik, ...TAL_FONT, color: FARG.text }}>
                    {k.summa != null ? `${nr(k.summa)} kr` : '—'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pott && (
        <p style={{ margin: `0 0 ${AVSTAND.xl}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>{pott}</p>
      )}

      {d.granskning && (
        <Sektion rubrik="Priset">
          {prislista && (
            <Rad
              titel="Hur räknades priset?"
              under={`Medelstam ${kr2(prislista.medelstam)} → prisklass ${kr2(prislista.klass)}`}
              hoger={<span style={TAL_FONT}>{kr2(prislista.total)}</span>}
              hogerUnder="kr/m³fub"
              onTryck={() => setGranskning('pris')}
            />
          )}
          <Rad
            sista
            titel="Vilka sortiment räknas?"
            under={sortimentUnder(d.granskning)}
            hoger={<span style={TAL_FONT}>{d.granskning.sortiment.anvant}</span>}
            hogerUnder="st"
            onTryck={() => setGranskning('sortiment')}
          />
        </Sektion>
      )}

      {manuellt && (
        <Sektion
          rubrik="Manuellt arbete · ur arbetsrapporten"
          not="Artikeln för manuell fällning finns inte i Fortnox än, så priset går inte att hämta. Avtalet säger 475 kr/tim."
        >
          {manuellt.poster.map((p, i) => (
            <Rad
              key={`${p.datum}-${i}`}
              titel={p.aktivitet}
              under={`${p.forare} · ${p.datum}${p.kommentar ? ` · ${p.kommentar}` : ''}`}
              hoger={<span style={TAL_FONT}>{nr(p.minuter / 60, 2)}</span>}
              hogerUnder="tim"
              sista={i === manuellt.poster.length - 1}
            />
          ))}
        </Sektion>
      )}

      {ovriga.length > 0 && (
        <Sektion rubrik="Mer på fakturan">
          {ovriga.map((r, i) => {
            const pris = r.a_pris ?? r.a_pris_beraknat;
            const summa = pris != null && r.antal != null ? `${nr(pris * r.antal)} kr` : null;
            const enhet = r.enhet === 'h' ? 'tim' : (r.enhet ?? '');
            return (
              <Rad
                key={r.radnr}
                titel={r.benamning}
                under={[
                  r.antal != null ? `${kr2(r.antal)} ${enhet}`.trim() : null,
                  pris != null ? `à ${kr2(pris)}` : 'pris hämtas från Fortnox',
                  r.status === 'fel' ? `går inte att prissätta: ${r.fel_kod}` : null,
                  r.status === 'vantar_leverantorsfaktura' ? 'väntar på leverantörsfaktura' : null,
                ].filter(Boolean).join(' · ')}
                hoger={summa ? <span style={TAL_FONT}>{summa}</span> : '—'}
                sista={i === ovriga.length - 1}
              />
            );
          })}
        </Sektion>
      )}

      {d.noter.filter(n => n.niva !== 'varning').map((n, i) => (
        <p key={`i${i}`} style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>{n.text}</p>
      ))}

      <div style={{ maxWidth: KOLUMN.smal / 2 }}>
        <button type="button" disabled style={{ ...KNAPP.primar, ...INAKTIV }}>Markera som granskad</button>
      </div>
      <p style={{ margin: `${AVSTAND.s}px 0 0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text3 }}>
        Granskning och sändning är inte byggt än — vyn räknar bara fram raderna.
      </p>

      {granskning && d.granskning && (
        <GranskningArk
          vy={granskning}
          onVy={setGranskning}
          sortiment={{
            g: d.granskning.sortiment,
            volym: d.granskning.volym,
            sortKr: poster.find(x => x.etikett === 'Sortiment')?.belopp ?? null,
          }}
          pris={{
            prislista,
            tillaggsposter: skordarrad?.tillaggsposter ?? null,
            avstandKr: skotarrad?.delar_avstand ?? null,
            volym: d.granskning.volym,
            prisdatum: d.granskning.prisdatum,
            sortiment: d.granskning.sortiment,
          }}
          summa={d.summa_kant}
          skotarAntal={skotarrad?.antal ?? null}
          skotarPris={skotarrad?.a_pris_beraknat ?? null}
          dimObjektIds={d.objekt_ids}
          voNummer={d.vo_nummer}
          onSparat={omlasning}
        />
      )}
    </>
  );
}

/** Raden i trakten: hur många, och om någon satt talet själv. */
function sortimentUnder(g: Granskningsunderlag): string {
  const s = g.sortiment;
  if (s.manuellt) return `Satt för hand · appen räknar ${s.rakning.antal}`;
  if (s.grundantal == null) return 'Ingen sats i prislistan';
  const extra = s.anvant - s.grundantal;
  return extra > 0
    ? `${extra} över de ${s.grundantal} som ingår`
    : `${s.grundantal} ingår i priset`;
}
