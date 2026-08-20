'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { OversiktObjekt, C, statusVisning, STATUS_AVSLUTADE, type StatusHink } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, skotarTillstand } from './oversikt-utils';
import { paBackenKvar } from '@/lib/skotat';
import { supabase } from '@/lib/supabase';
import { subLabel, markeringSub, FARA_SUBTYPER, HANSYN_SUBTYPER } from './markeringar';
import type { SkordAgg } from './page';
import SkordarKarta from './SkordarKarta';
import SkotarRad from './SkotarRad';

interface Props {
  objekt: OversiktObjekt[];
  skordMap: Record<string, SkordAgg>;   // nyckel = vo_nummer
}

/** Neutral grå tagg. Färgdisciplin: bara fara (röd) och hänsyn (orange) får färg — allt annat grått. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
      color: C.t2, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
    }}>{children}</span>
  );
}

/** Notering intill sitt sammanhang — fetstilt etikett + text (aldrig en samlad hög). */
function NoteLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>
      <span style={{ color: C.t3, fontWeight: 600 }}>{label}: </span>{children}
    </div>
  );
}

/* Humanisering av bärighet/terräng → alltid "[egenskap] [vad]", aldrig rå gemener-kod.
   Okänt värde → kapitaliseras. Alltid grått (färg sparas för fara/hänsyn). */
const BARIGHET_LABEL: Record<string, string> = { bra: 'Bra bärighet', medel: 'Medel bärighet', dalig: 'Dålig bärighet' };
const TERRANG_LABEL: Record<string, string> = { flackt: 'Flack terräng', kuperat: 'Kuperad terräng', brant: 'Brant terräng' };
function kapitalisera(s: string): string { const t = s.trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
function barighetLabel(v: string): string { return BARIGHET_LABEL[v.trim().toLowerCase()] || kapitalisera(v); }
function terrangLabel(v: string): string { return TERRANG_LABEL[v.trim().toLowerCase()] || kapitalisera(v); }
/* Restriktion-namn ur traktanalysen → människospråk: strö bort registri-koden i slutet,
   t.ex. "Vägmärke (L1955:7217)" → "Vägmärke", "Kemisk industri (L1955:7079)" → "Kemisk industri". */
function humaniseraRestr(name: string): string {
  return (name || '').replace(/\s*\([^)]*\d[^)]*\)\s*$/, '').trim() || (name || '').trim();
}

/** Rubrik-sektion i detaljvyn. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 34 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.t3, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

/** Subtil platshållare medan markeringsberoende sektioner laddas — reserverar plats så sidan inte hoppar. */
function DetaljSkeleton() {
  const blk = (w: string, h: number, mt = 0) => (
    <div style={{ width: w, height: h, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginTop: mt }} />
  );
  return (
    <div aria-hidden="true">
      {blk('38%', 14)}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{blk('88px', 28)}{blk('72px', 28)}{blk('80px', 28)}</div>
      <div style={{ height: 34 }} />
      {blk('30%', 14)}
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>{blk('100px', 28)}{blk('70px', 28)}</div>
    </div>
  );
}

/** Färgad markerings-chip (aggregerad, med ×N vid flera). */
function MarkChip({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
      color, background: bg, border: `1px solid ${C.border}`,
    }}>{label}{count > 1 ? ` ×${count}` : ''}</span>
  );
}

/* Markeringar som beskriver maskinernas FÖRUTSÄTTNINGAR (körnät/logistik på trakten) —
   inte hänsyn. Allt annat grupperas som hänsyn (samma humanisering som Karta-fliken). */
const FORUT_SUBTYPER = new Set([
  'mainRoad', 'backRoadRed', 'backRoadYellow', 'backRoadBlue',
  'sideRoadRed', 'sideRoadYellow', 'sideRoadBlue', 'stickvag',
  'drivedirection', 'landing', 'turningpoint', 'bridge', 'corduroy',
]);
type MarkItem = { sub: string | null; label: string; comment: string };
/* Hänsyn-nivå för detaljvyn — samma fara/hänsyn/övrigt som Karta-fliken, men blött (wet)
   räknas som hänsyn här (Martins indelning: blött hör till hänsynen). */
function hansynNiva(sub: string | null): 'fara' | 'hansyn' | 'ovrigt' {
  if (sub && FARA_SUBTYPER.has(sub)) return 'fara';
  if (sub && (HANSYN_SUBTYPER.has(sub) || sub === 'wet')) return 'hansyn';
  return 'ovrigt';
}
/* Slå ihop identiska etiketter → { label, count, comments }. */
function aggregeraMark(list: MarkItem[]): { label: string; count: number; comments: string[] }[] {
  const map = new Map<string, { label: string; count: number; comments: string[] }>();
  for (const m of list) {
    if (!map.has(m.label)) map.set(m.label, { label: m.label, count: 0, comments: [] });
    const e = map.get(m.label)!;
    e.count++;
    if (m.comment) e.comments.push(m.comment);
  }
  return Array.from(map.values());
}

/** Detalj — helsida (portalas till <body> så den täcker TopBar; hemknappen ersätts av tillbaka-pil). */
function ObjektDetalj({ obj, skord, onClose }: { obj: OversiktObjekt; skord?: SkordAgg; onClose: () => void }) {
  const sv = statusVisning(obj.status);
  const skordat = skord?.skordat || 0;          // m³fub
  const egen = skord?.egenSkotning === true;    // säljaren/markägaren skotar själv → inte vårt skotararbete
  // Skotarens tillstånd (klar/igång/väntar) härlett symmetriskt med skördarens status. Egen skotning → inget.
  const skotarInfo = egen ? null : skotarTillstand(skordat, skord?.skotat ?? null, skord?.harManuell ?? false, skord?.lassSista ?? null);
  const harSkord = skordat > 0;                 // ingen skörd-rad → göm hela produktionsblocket (aldrig 0)
  // Skotat: null = ingen skotdata registrerad (≠ 0). Aktivt objekt utan rad = skotaren har inte
  // börjat (ärligt 0); AVSLUTAT utan rad = okänt → visa "ej registrerad", ingen procent, ingen backen.
  const skotatVal = skord?.skotat ?? null;      // number | null
  const skotatKand = skotatVal != null || !STATUS_AVSLUTADE.includes(obj.status);
  const skotatEff = skotatVal ?? 0;             // aktiv-null → 0
  // Procent utkört = skotat/skördat*100 (enda ärliga procentmåttet, båda m³fub). Kapas EJ (>100 = klart).
  const skotP = skotatKand && skordat > 0 ? Math.round((skotatEff / skordat) * 100) : null;
  const utkort = skotP != null && skotP >= 98;  // mätskillnad kan ge >100 → visa "Utkört", inte "102%"
  const paBacken = paBackenKvar(skordat, skotatEff, egen);
  const ber = obj.trakt_data?.beraknad;

  // Markeringar för DETTA objekt — hämtas lat (bara när ett objekt öppnats). marksLaddat
  // gör att markeringsberoende sektioner (Förutsättningar/Hänsyn/…) visas SAMLAT när datan finns,
  // i stället för att poppa in en och en → ingen layout-shift.
  const [marks, setMarks] = useState<MarkItem[]>([]);
  const [marksLaddat, setMarksLaddat] = useState(false);
  // Helsidan glider in från höger + tonar (samma taktkänsla som flik-fadet). Stängning spelar
  // ut-animationen först, sedan avmonterar föräldern (setSel(null)) → ingen hård pop åt något håll.
  const [closing, setClosing] = useState(false);
  const stang = () => { if (closing) return; setClosing(true); window.setTimeout(onClose, 180); };
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('planering_markeringar').select('data').eq('objekt_id', obj.id);
      if (cancelled) return;
      const list: MarkItem[] = (data || []).map((r: any) => {
        const sub = markeringSub(r.data);
        const comment = (r.data && typeof r.data === 'object' && typeof r.data.comment === 'string')
          ? r.data.comment.trim() : '';
        return { sub, label: sub ? subLabel(sub) : 'Markering', comment };
      }).filter((m) => m.sub || m.comment);
      setMarks(list);
      setMarksLaddat(true);
    })();
    return () => { cancelled = true; };
  }, [obj.id]);

  // Hemknappen (TopBar) döljs medan helsidan är öppen → tillbaka-pilen ersätter huset.
  useEffect(() => {
    document.body.setAttribute('data-hide-home', '');
    return () => { document.body.removeAttribute('data-hide-home'); };
  }, []);

  // Dela upp markeringarna: förutsättningar (körnät/logistik) vs hänsyn (allt annat).
  const forutAgg = aggregeraMark(marks.filter((m) => m.sub && FORUT_SUBTYPER.has(m.sub)));
  const hansynMarks = marks.filter((m) => !(m.sub && FORUT_SUBTYPER.has(m.sub)));
  // Restriktioner (naturreservat, vägmärke, kemisk industri …) ur traktanalysen är HÄNSYN, inte
  // fara → humaniserade orange chips i Hänsyn-sektionen (ingen egen röd sektion; rött = verklig fara).
  const restrItems: MarkItem[] = (ber?.restriktioner || []).map((r) => ({
    sub: null, label: humaniseraRestr(r.name), comment: (r.warning || '').trim(),
  }));
  const faror = aggregeraMark(hansynMarks.filter((m) => hansynNiva(m.sub) === 'fara'));
  const hansyn = aggregeraMark([...hansynMarks.filter((m) => hansynNiva(m.sub) === 'hansyn'), ...restrItems]);
  const ovrigt = aggregeraMark(hansynMarks.filter((m) => hansynNiva(m.sub) === 'ovrigt'));

  const harTrailer = obj.transport_trailer_in === true || obj.transport_trailer_in === false;
  const forutMarkComments: string[] = [];       // kommentarer på körnäts-markeringar (bro etc.)
  for (const f of forutAgg) forutMarkComments.push(...f.comments);
  const harForut = !!(obj.barighet || obj.terrang || harTrailer || forutAgg.length > 0 || obj.transport_kommentar);
  const harHansyn = faror.length > 0 || hansyn.length > 0 || ovrigt.length > 0;

  // Kontextuella noteringar visas INTILL sitt sammanhang (Förutsättningar/Maskiner) — samla
  // dem så den allmänna Noteringar-sektionen aldrig upprepar samma text (ingen text två ggr).
  const placeradText = new Set<string>();
  for (const t of [obj.transport_kommentar, obj.skordare_manuell_fallning_text, obj.markagare_ved_text, obj.grot_anteckning]) {
    if (t && t.trim()) placeradText.add(t.trim());
  }
  const maskinerHarInnehall = !!(
    obj.skordare_maskin || obj.skotare_maskin || obj.skotare_lastreder_breddat || obj.skotare_ris_direkt ||
    obj.skordare_manuell_fallning || obj.markagare_ska_ha_ved ||
    obj.skordare_manuell_fallning_text || obj.markagare_ved_text || obj.grot_anteckning
  );

  // Allmän Noteringar = bara anteckningar/info_anteckningar med text som inte redan visas i
  // sitt sammanhang (och inte dubblerar varandra).
  const noteringar: string[] = [];
  for (const t of [obj.anteckningar, obj.info_anteckningar]) {
    const v = (t || '').trim();
    if (v && !placeradText.has(v) && !noteringar.includes(v)) noteringar.push(v);
  }

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1100, background: C.bg,
      display: 'flex', flexDirection: 'column', fontFamily: ff, color: C.t1,
      animation: closing ? 'detaljOut 180ms ease-in forwards' : 'detaljIn 200ms ease-out',
    }}>
      {/* Nav-bar: tillbaka-pil där huset annars ligger (överst vänster) + namn */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        height: 'calc(56px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 12, paddingRight: 12,
        borderBottom: `1px solid ${C.border}`, background: C.bg,
      }}>
        <button onClick={stang} aria-label="Tillbaka" style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', cursor: 'pointer', fontFamily: ff,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>arrow_back</span>
        </button>
        <span style={{ fontSize: 17, fontWeight: 600, color: C.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{obj.namn}</span>
      </div>

      {/* Innehåll — scrollar, med luft */}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 20px 48px' }}>
          {/* Status + metadata */}
          <div style={{ marginBottom: 28 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: sv.farg, padding: '4px 12px', background: sv.bg, borderRadius: 20 }}>{sv.ord}</span>
            <div style={{ fontSize: 14, color: C.t3, marginTop: 12 }}>
              {[
                obj.bolag,
                obj.atgard || (obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'),
                obj.areal ? `${obj.areal} ha` : null,
                obj.vo_nummer,
              ].filter(Boolean).join(' · ')}
            </div>
            {/* Skotarens tillstånd — en rad under status (grön bara vid aktiv igång) */}
            {skotarInfo && <SkotarRad info={skotarInfo} style={{ marginTop: 10 }} />}
            {/* Egen skotning — säljaren/markägaren skotar själv (inte vårt jobb, ingen på-backen). Grå chip. */}
            {egen && (
              <div style={{ marginTop: 10, display: 'inline-block', fontSize: 12.5, fontWeight: 600, color: C.t2, background: 'rgba(255,255,255,0.06)', padding: '4px 12px', borderRadius: 20 }}>Egen skotning</div>
            )}
          </div>

          {/* Kontakt (markägare) — mest handlingsbara raden → direkt under status/metadata högst upp,
              namn + klickbart nummer (tel-länken pekar på markagare_tel). Beror ej på markeringar → utanför skelettet. */}
          {(obj.markagare || obj.markagare_tel) && (
            <Section title="Kontakt">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{obj.markagare || 'Markägare'}</div>
                </div>
                {obj.markagare_tel && (
                  <a href={`tel:${obj.markagare_tel}`} onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: 13, color: '#5b8fff', textDecoration: 'none', fontWeight: 500,
                      padding: '8px 16px', background: 'rgba(91,143,255,0.1)', borderRadius: 14,
                      minHeight: 44, display: 'flex', alignItems: 'center',
                    }}>
                    {obj.markagare_tel}
                  </a>
                )}
              </div>
            </Section>
          )}

          {/* Produktions-flöde (m³fub) — ETT kort: skördat = huvudtal, grå stapel = andel utkört,
              "på backen" faller ut. Neutralt grått (ett tal, ingen status). Göms om ingen skörd (aldrig 0). */}
          {harSkord && (
            <div style={{ background: C.cardGrad, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, marginBottom: 34 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: C.t1, letterSpacing: '-0.02em' }}>
                {formatVolym(Math.round(skordat))}<span style={{ fontSize: 14, fontWeight: 400, color: C.t3 }}> m³fub</span>
              </div>
              <div style={{ fontSize: 13, color: C.t3, marginTop: 3 }}>Skördat{skord?.sista ? ` · ${skord.sista}` : ''}</div>

              {egen ? null : skotP != null ? (
                <>
                  {/* Skotarens framdrift — det enda ärliga procentmåttet (skotat/skördat, båda m³fub) */}
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.t1, marginTop: 16, marginBottom: 7 }}>
                    {utkort ? 'Utkört' : `${skotP}% utkört`}
                  </div>
                  {/* Grå stapel fylld till andel utkört */}
                  <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(skotP, 100)}%`, height: '100%', background: 'rgba(255,255,255,0.32)', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
                    <span style={{ fontSize: 12.5, color: C.t3 }}>Skotat {formatVolym(Math.round(skotatEff))} m³fub</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.t2 }}>{formatVolym(Math.round(paBacken))} m³fub på backen</span>
                  </div>
                </>
              ) : (
                /* Avslutat utan skotdata → okänt. Visa inte 0%/på backen (vi vet inte), bara statusen. */
                <div style={{ fontSize: 13, color: C.t3, marginTop: 14 }}>Skotning ej registrerad</div>
              )}
            </div>
          )}

          {/* Var skördaren kört — HPR-stammar på karta (egen sektion; renderar inget om data saknas) */}
          <SkordarKarta vo={obj.vo_nummer} objektId={obj.id} />

          {/* Markeringsberoende + kontakt/maskiner/noteringar visas SAMLAT när markeringarna laddats
              (skelett medan de laddas) → ingen sektions-pop / layout-shift. */}
          {marksLaddat ? (
          <>
          {/* Förutsättningar — maskinernas villkor på trakten (bärighet/terräng/trailer + körnät) */}
          {harForut && (
            <Section title="Förutsättningar">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {obj.barighet && <Tag>{barighetLabel(obj.barighet)}</Tag>}
                {obj.terrang && <Tag>{terrangLabel(obj.terrang)}</Tag>}
                {obj.transport_trailer_in === true && <Tag>Trailer in</Tag>}
                {obj.transport_trailer_in === false && <Tag>Ej trailer</Tag>}
                {forutAgg.map((f) => <MarkChip key={f.label} label={f.label} count={f.count} color={C.t2} bg="rgba(255,255,255,0.04)" />)}
              </div>
              {obj.transport_kommentar && <NoteLine label="Transport">{obj.transport_kommentar}</NoteLine>}
              {forutMarkComments.map((c, i) => (
                <div key={i} style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>{c}</div>
              ))}
            </Section>
          )}

          {/* Hänsyn — samma gruppering/humanisering som Karta-fliken (faror högst) */}
          {harHansyn && (
            <Section title="Hänsyn">
              {faror.length > 0 && (
                <div style={{ marginBottom: (hansyn.length || ovrigt.length) ? 12 : 0 }}>
                  {faror.map((f, i) => (
                    <div key={i} style={{ background: C.rd, border: '1px solid rgba(255,69,58,0.15)', borderRadius: 10, padding: '10px 12px', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: C.red, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.red }}>{f.label}{f.count > 1 ? ` ×${f.count}` : ''}</span>
                      </div>
                      {f.comments.map((c, ci) => (
                        <div key={ci} style={{ fontSize: 12.5, color: C.t1, lineHeight: 1.45, marginTop: 3, paddingLeft: 14 }}>{c}</div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {hansyn.length > 0 && (
                <div style={{ marginBottom: ovrigt.length ? 12 : 0 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {hansyn.map((h) => <MarkChip key={h.label} label={h.label} count={h.count} color={C.orange} bg={C.od} />)}
                  </div>
                  {hansyn.flatMap((h) => h.comments).map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>{c}</div>
                  ))}
                </div>
              )}
              {ovrigt.length > 0 && (
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ovrigt.map((o) => <MarkChip key={o.label} label={o.label} count={o.count} color={C.t2} bg="rgba(255,255,255,0.04)" />)}
                  </div>
                  {ovrigt.flatMap((o) => o.comments).map((c, i) => (
                    <div key={i} style={{ fontSize: 13, color: C.t2, marginTop: 8, lineHeight: 1.5 }}>{c}</div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* Maskiner & metod — kontextuella noteringar intill sin egen flagga */}
          {maskinerHarInnehall && (
            <Section title="Maskiner">
              {(obj.skordare_maskin || obj.skotare_maskin) && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {obj.skordare_maskin && <Tag>{obj.skordare_maskin}{obj.skordare_band ? ` · Band ${obj.skordare_band_par || ''}p` : ''}</Tag>}
                  {obj.skotare_maskin && <Tag>{obj.skotare_maskin}{obj.skotare_band ? ` · Band ${obj.skotare_band_par || ''}p` : ''}</Tag>}
                </div>
              )}
              {(obj.skotare_lastreder_breddat || obj.skotare_ris_direkt || obj.skordare_manuell_fallning || obj.markagare_ska_ha_ved) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {obj.skotare_lastreder_breddat && <Tag>Brett lastrede</Tag>}
                  {obj.skotare_ris_direkt && <Tag>GROT direkt</Tag>}
                  {obj.skordare_manuell_fallning && <Tag>Manuell fällning</Tag>}
                  {obj.markagare_ska_ha_ved && <Tag>Ved åt markägare</Tag>}
                </div>
              )}
              {obj.skordare_manuell_fallning_text && <NoteLine label="Manuell fällning">{obj.skordare_manuell_fallning_text}</NoteLine>}
              {obj.markagare_ved_text && <NoteLine label="Ved åt markägare">{obj.markagare_ved_text}</NoteLine>}
              {obj.grot_anteckning && <NoteLine label="GROT">{obj.grot_anteckning}</NoteLine>}
            </Section>
          )}

          {/* Noteringar — only if present */}
          {noteringar.length > 0 && (
            <Section title="Noteringar">
              {noteringar.map((n, i) => (
                <div key={i} style={{ fontSize: 13, color: C.t2, marginBottom: 6, lineHeight: 1.5 }}>{n}</div>
              ))}
            </Section>
          )}
          </>
          ) : (
            <DetaljSkeleton />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

type SortKey = 'namn' | 'vol' | 'status';
type StatusBucket = StatusHink;   // 'planera' | 'kora' | 'pagar' | 'klar'
type StatusFilter = 'alla' | StatusBucket;
type TypFilter = 'alla' | 'slutavverkning' | 'gallring';

// Åtgärd → traktyp. Martins mappning: Au/Rp/Lrk = Slutavverkning, Gallring = Gallring.
// Saknad/okänd åtgärd faller tillbaka på objektets typ-fält.
const SLUTAVV_ATGARDER = new Set(['au', 'rp', 'lrk']);
function klassaObjektTyp(o: OversiktObjekt): 'slutavverkning' | 'gallring' {
  const a = (o.atgard || '').trim().toLowerCase();
  if (SLUTAVV_ATGARDER.has(a)) return 'slutavverkning';
  if (a === 'gallring') return 'gallring';
  return o.typ === 'slutavverkning' ? 'slutavverkning' : 'gallring';
}

// Filterhink via den DELADE mappningen (oversikt-types.statusVisning) — EN källa
// för både lista och detaljvy. planerad=kora, oplanerad=planera, pagaende=pagar,
// avslutat=klar. (Färg/ord hämtas också från statusVisning — ingen dubbel-sanning.)
function statusBucket(status: string): StatusBucket {
  return statusVisning(status).key;
}

// Kort maskin-namn för radtaggen (t.ex. "PONSSE Scorpion Giant 8W" → "Scorpion").
function kortMaskin(namn: string): string {
  const s = namn.toLowerCase();
  if (s.includes('scorpion')) return 'Scorpion';
  if (s.includes('wisent')) return 'Wisent';
  if (s.includes('elephant')) return 'Elephant';
  if (s.includes('bison')) return 'Bison';
  if (s.includes('buffalo')) return 'Buffalo';
  if (s.includes('rottne') || s.includes('h8e')) return 'Rottne';
  const first = namn.trim().split(/\s+/)[0] || namn;
  return first.length > 12 ? first.slice(0, 12) : first;
}

// Segmenterad kontroll (används i reglage-panelen).
function SegRow({ val, set, opts }: { val: string; set: (v: string) => void; opts: { k: string; l: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 3, background: '#111', borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
      {opts.map(o => (
        <button key={o.k} onClick={() => set(o.k)} style={{
          flex: 1, padding: '9px 8px', minHeight: 40,
          background: val === o.k ? 'rgba(255,255,255,0.1)' : 'transparent',
          color: val === o.k ? C.t1 : C.t3, border: 'none', borderRadius: 8,
          fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap',
        }}>{o.l}</button>
      ))}
    </div>
  );
}

// Reglage-panel (bottensheet) — bolag, traktyp, sortering, gruppera per maskin.
function FilterPanel({ bolag, bolagF, setBolagF, typF, setTypF, sortK, setSortK, groupMaskin, setGroupMaskin, onClose }: {
  bolag: string[];
  bolagF: string; setBolagF: (v: string) => void;
  typF: TypFilter; setTypF: (v: TypFilter) => void;
  sortK: SortKey; setSortK: (v: SortKey) => void;
  groupMaskin: boolean; setGroupMaskin: (v: boolean) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', width: '100%', maxWidth: 500, maxHeight: '85vh',
        background: C.cardGrad, borderRadius: '16px 16px 0 0',
        border: `1px solid ${C.border}`, borderBottom: 'none',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 20px 28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>Filter &amp; vy</span>
          <button onClick={onClose} aria-label="Stäng" style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', display: 'flex', padding: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>close</span>
          </button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8 }}>Sortering</div>
          <SegRow val={sortK} set={v => setSortK(v as SortKey)} opts={[{ k: 'status', l: 'Status' }, { k: 'namn', l: 'A–Ö' }, { k: 'vol', l: 'Volym' }]} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8 }}>Traktyp</div>
          <SegRow val={typF} set={v => setTypF(v as TypFilter)} opts={[{ k: 'alla', l: 'Alla' }, { k: 'slutavverkning', l: 'Slutavv.' }, { k: 'gallring', l: 'Gallring' }]} />
        </div>

        {bolag.length > 1 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8 }}>Bolag</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {['alla', ...bolag].map(b => (
                <button key={b} onClick={() => setBolagF(b)} style={{
                  padding: '9px 14px', minHeight: 40, borderRadius: 10,
                  background: bolagF === b ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: bolagF === b ? C.t1 : C.t3, border: `1px solid ${bolagF === b ? C.borderStrong : C.border}`,
                  fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
                }}>{b === 'alla' ? 'Alla bolag' : b}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8 }}>Vy</div>
          <button onClick={() => setGroupMaskin(!groupMaskin)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '13px 16px', minHeight: 48, borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
            color: C.t1, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: ff,
          }}>
            <span>Gruppera per maskin</span>
            <span style={{ width: 44, height: 26, borderRadius: 13, background: groupMaskin ? C.green : 'rgba(255,255,255,0.15)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
              <span style={{ position: 'absolute', top: 2, left: groupMaskin ? 20 : 2, width: 22, height: 22, borderRadius: 11, background: '#fff', transition: 'left 0.2s' }} />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* Fara-markör i listan: ett objekt "har fara" om det bär >=1 markering med en fara-subtyp
   (samma FARA_SUBTYPER som ObjektDetalj/Karta — EN källa). Byggs som PostgREST-or över de fyra
   semantik-fälten markeringSub läser (type/zoneType/lineType/arrowType). Frågan scopas ALLTID per
   objekt_id (billig, som ObjektDetalj) → aldrig bulk-detoast av alla stora path-JSONB (statement-timeout). */
const FARA_OR_FILTER = ['type', 'zoneType', 'lineType', 'arrowType']
  .map((f) => `data->>${f}.in.(${Array.from(FARA_SUBTYPER).join(',')})`)
  .join(',');

export default function OversiktObjektLista({ objekt, skordMap }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [statusF, setStatusF] = useState<StatusFilter>('alla');
  const [panelOpen, setPanelOpen] = useState(false);
  // Avancerat — bakom reglage-ikonen
  const [bolagF, setBolagF] = useState('alla');
  const [typF, setTypF] = useState<TypFilter>('alla');
  const [sortK, setSortK] = useState<SortKey>('status');
  const [groupMaskin, setGroupMaskin] = useState(false);
  // Fara-status per objekt (röd markör) — lazy, cachead. Hämtas scoped per objekt_id (aldrig bulk →
  // aldrig timeout på stora markerings-JSONB). Saknad nyckel = ej hämtad än (tom reserverad slot).
  const [faraCache, setFaraCache] = useState<Record<string, boolean>>({});

  const bolagLista = Array.from(new Set(objekt.map(o => o.bolag).filter(Boolean))) as string[];
  const selectedObj = sel ? objekt.find(o => o.id === sel) : null;

  // Effektiv status-hink — ett jobb är inte klart förrän virket är ute. Ett annars avslutat objekt
  // räknas som PÅGÅR så länge skotaren har jobb kvar: skotare IGÅNG (kör) ELLER VÄNTAR (skördat finns,
  // virke på backen, ingen/ej klar skotning). KLAR = helt klart (skotat ≈ skördat eller manuell reg).
  // Härlett ur samma skordMap som redan finns (ingen ny hämtning, inga nya fält).
  const effektivHink = (o: OversiktObjekt): StatusBucket => {
    const b = statusBucket(o.status);
    if (b !== 'klar') return b;
    const s = o.vo_nummer ? skordMap[o.vo_nummer] : undefined;
    if (s?.egenSkotning) return 'klar';   // egen skotning (säljaren skotar själv) → inte VÅRT väntande arbete
    const info = s ? skotarTillstand(s.skordat, s.skotat, s.harManuell, s.lassSista) : null;
    return info && (info.state === 'igang' || info.state === 'vantar') ? 'pagar' : 'klar';
  };

  // Aktiva = att planera + att köra + pågår (rubrikräkning, oberoende av valt filter).
  const aktiva = objekt.filter(o => effektivHink(o) !== 'klar');
  // Total volym "på backen" (skördat − skotat) över aktiva objekt — samma m³fub-data som redan finns
  // i skordMap, bara summerad (ingen ny hämtning). Aktiva inkluderar nu väntar-objekt (avslutad status
  // men virke på backen); skotat null räknas som 0 (ärligt: skotaren har inte börjat). Visas när > 0.
  const totalBacken = aktiva.reduce((sum, o) => {
    const s = o.vo_nummer ? skordMap[o.vo_nummer] : undefined;
    if (!s || !s.skordat) return sum;
    return sum + paBackenKvar(s.skordat, s.skotat, s.egenSkotning || false);
  }, 0);
  const backenRund = Math.round(totalBacken);

  // Dynamiska filtersegment: 'Alla' + bara de hinkar som FINNS bland objekten
  // (inga oplanerade idag → inget tomt 'Att planera'-segment). Fast ordning.
  const hinkarFinns = new Set(objekt.map(o => effektivHink(o)));
  const HINK_ORDNING: { k: StatusBucket; l: string }[] = [
    { k: 'planera', l: 'Att planera' },
    { k: 'kora', l: 'Att köra' },
    { k: 'pagar', l: 'Pågår' },
    { k: 'klar', l: 'Klar' },
  ];
  const segment: { k: StatusFilter; l: string }[] = [{ k: 'alla', l: 'Alla' }, ...HINK_ORDNING.filter(s => hinkarFinns.has(s.k))];
  // Valt segment tömt (hinken försvann) → fall tillbaka på 'Alla'.
  const statusFEff: StatusFilter = segment.some(s => s.k === statusF) ? statusF : 'alla';

  // Status-filter: "Alla" = ALLA objekt (aktiva först, klara sist via status-sorteringen), oberoende av
  // kartans Avslutade-toggle; annars = vald hink. Effektiv hink → skotare igång/väntar fångas i Pågår.
  let li = objekt.filter(o => {
    const b = effektivHink(o);
    return statusFEff === 'alla' ? true : b === statusFEff;
  });
  li = li.filter(o => bolagF === 'alla' || o.bolag === bolagF);
  li = li.filter(o => typF === 'alla' || klassaObjektTyp(o) === typF);

  if (sortK === 'vol') li = [...li].sort((a, b) => (b.volym || 0) - (a.volym || 0));
  else if (sortK === 'status') {
    const order: Record<StatusBucket, number> = { pagar: 0, kora: 1, planera: 2, klar: 3 };
    li = [...li].sort((a, b) => (order[effektivHink(a)] - order[effektivHink(b)]) || (a.namn || '').localeCompare(b.namn || '', 'sv'));
  } else {
    li = [...li].sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
  }

  // Gruppera per maskin — SAMMA källa och gruppering som uppföljningens "På backen · per maskin":
  // objektet läggs under sin SKOTARE (tilldeladSkotare: lassdata → dim_objekt.tilldelad_skotare →
  // Ej tilldelad), härledd i page.tsx (skordMap) precis som useUppfoljningList — de två vyerna får
  // ALDRIG gruppera olika. Pågår = arbetslistan ("vad ska varje skotare hämta") → grupperat som
  // default; reglaget slår på samma gruppering i övriga segment. På-backen-summa = Σ(skördat − skotat).
  const backenForObj = (o: OversiktObjekt): number => {
    const s = o.vo_nummer ? skordMap[o.vo_nummer] : undefined;
    return paBackenKvar(s?.skordat || 0, s?.skotat ?? null, s?.egenSkotning || false);
  };
  const grupperaPerMaskin = statusFEff === 'pagar' || groupMaskin;
  const grupper: { maskin: string | null; objekt: OversiktObjekt[]; backen: number }[] = [];
  if (grupperaPerMaskin) {
    const map = new Map<string, OversiktObjekt[]>();
    for (const o of li) {
      const key = (o.vo_nummer ? skordMap[o.vo_nummer]?.tilldeladSkotare : null) || '\uFFFFej';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    for (const [key, objs] of map.entries()) {
      grupper.push({
        maskin: key === '\uFFFFej' ? null : key,
        objekt: objs.slice().sort((a, b) => {
          const ba = backenForObj(a) > 0, bb = backenForObj(b) > 0;
          if (ba !== bb) return ba ? -1 : 1;                       // objekt med virke på backen först
          const sa = a.vo_nummer ? skordMap[a.vo_nummer]?.sista : null;
          const sb = b.vo_nummer ? skordMap[b.vo_nummer]?.sista : null;
          if (sa && sb && sa !== sb) return sa.localeCompare(sb);  // äldst skörd först (längst liggetid)
          return backenForObj(b) - backenForObj(a);
        }),
        backen: objs.reduce((s, o) => s + backenForObj(o), 0),
      });
    }
    // Mest på backen överst; Ej tilldelad alltid sist (samma ordning som uppföljningen).
    grupper.sort((a, b) => (a.maskin === null ? 1 : b.maskin === null ? -1 : b.backen - a.backen));
  }

  const avanceratAktivt = bolagF !== 'alla' || typF !== 'alla' || sortK !== 'status' || groupMaskin;
  // Namnge det aktiva läget intill reglage-ikonen → man ser VAD som är aktivt (inte bara ATT något
  // är det) utan att öppna panelen. Gruppering byter hela vyn → det ordet räcker; annars filter/sortering.
  const aktivtLage = groupMaskin ? 'Per maskin' : [
    typF !== 'alla' ? (typF === 'slutavverkning' ? 'Slutavv.' : 'Gallring') : null,
    bolagF !== 'alla' ? bolagF : null,
    sortK !== 'status' ? (sortK === 'vol' ? 'Volym' : 'A–Ö') : null,
  ].filter(Boolean).join(' · ');

  // Lazy fara-hämtning för de SYNLIGA korten (scoped per objekt_id, cachead). Kör om synliga ids
  // ändras (filter/sortering byter set); redan kända objekt hoppas över. Fel → cachas ej (retry senare).
  const synligaIds = li.map((o) => o.id);
  const synligaNyckel = [...synligaIds].sort().join(',');
  useEffect(() => {
    const behovs = synligaIds.filter((id) => !(id in faraCache));
    if (behovs.length === 0) return;
    let avbruten = false;
    (async () => {
      const par = await Promise.all(behovs.map(async (id) => {
        const { data, error } = await supabase
          .from('planering_markeringar').select('objekt_id').eq('objekt_id', id).or(FARA_OR_FILTER).limit(1);
        if (error) return null;                         // okänt → cachea inte, försök igen senare
        return [id, !!(data && data.length)] as [string, boolean];
      }));
      if (avbruten) return;
      const giltiga = par.filter(Boolean) as [string, boolean][];
      if (giltiga.length) setFaraCache((prev) => {
        const n = { ...prev };
        for (const [id, f] of giltiga) n[id] = f;
        return n;
      });
    })();
    return () => { avbruten = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [synligaNyckel]);

  const renderKort = (o: OversiktObjekt) => {
    const sv = statusVisning(o.status);
    const harFara = faraCache[o.id] === true;   // röd fara-markör (lazy, cachead)
    const maskiner = Array.from(new Set(
      ([o.skordare_maskin, o.skotare_maskin].filter(Boolean) as string[]).map(kortMaskin)
    ));
    // Diskret "på backen"-markering: virke som väntar på utkörning (skördat − skotat).
    // Avslutat utan skotdata = okänt → visa inte (skilj null från 0). Bara där oskotat kvar.
    const kortSkord = o.vo_nummer ? skordMap[o.vo_nummer] : undefined;
    const kortSkordat = kortSkord?.skordat || 0;
    const kortSkotatVal = kortSkord?.skotat ?? null;
    const kortEgen = kortSkord?.egenSkotning === true;   // säljaren skotar själv → inte VÅRT väntande arbete
    const kortKand = kortSkotatVal != null || !STATUS_AVSLUTADE.includes(o.status);
    const kortBacken = paBackenKvar(kortSkordat, kortSkotatVal, kortEgen);
    // Skotarens tillstånd (samma härledning som kartan/detaljen). Grön "Skotare igång"-rad på kortet när
    // skotaren kör här nu → förklarar varför ett klart-skördat objekt (t.ex. Jätsbygd) ligger i Pågår.
    // Egen skotning → inget skotar-tillstånd (vi skotar inte); 'Egen skotning'-chip visas istället.
    const kortSkotar = kortEgen ? null : skotarTillstand(kortSkordat, kortSkotatVal, kortSkord?.harManuell ?? false, kortSkord?.lassSista ?? null);
    const kortIgang = kortSkotar?.state === 'igang';
    const kortVantar = kortSkotar?.state === 'vantar';
    const kortPaBacken = kortIgang || kortVantar;   // skotar-raden bär fasen (igång / väntar · X på backen)
    const visaBacken = kortSkordat > 0 && kortKand && kortBacken > 0 && !kortPaBacken;   // skotar-raden visar redan "kvar"
    return (
      <div key={o.id} onClick={() => setSel(o.id)} style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 14px', minHeight: 44,
        background: C.cardGrad, border: `1px solid ${C.border}`,
        borderRadius: 14, marginBottom: 8, cursor: 'pointer',
      }}>
        {/* Status-prick — färg ur delad statusVisning */}
        <div style={{ width: 10, height: 10, borderRadius: 5, background: sv.farg, flexShrink: 0 }} />
        {/* Innehåll */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{o.namn}</span>
            {/* Fara-markör — röd (färgdisciplin: rött = fara). Fast 16px-slot ALLTID reserverad så den
                lazy-laddade statusen aldrig ger layout-shift; ikonen visas bara vid >=1 fara-markering. */}
            <span style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {harFara && (
                <span className="material-symbols-outlined" aria-label="Fara"
                  style={{ fontSize: 16, color: C.red, fontVariationSettings: "'FILL' 1" }}>warning</span>
              )}
            </span>
            <span style={{ fontSize: 12, fontWeight: 500, color: sv.farg, flexShrink: 0 }}>{sv.ord}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12.5, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {o.atgard || (o.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring')}{o.areal ? ` · ${o.areal} ha` : ''}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {maskiner.map(m => (
                <span key={m} style={{ fontSize: 10.5, fontWeight: 500, color: C.t2, background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>{m}</span>
              ))}
              {o.grot === true && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: C.t2, background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>GROT</span>
              )}
            </div>
          </div>
          {/* Diskret "på backen"-markering — grått (ett tal, ingen status); bara där oskotat finns */}
          {visaBacken && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.t2, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                {formatVolym(Math.round(kortBacken))} m³fub på backen
              </span>
            </div>
          )}
          {/* Skotarens fas — grön "igång" (kör nu) eller grå "väntar · X på backen"; visar varför ett
              klart-skördat objekt ligger i Pågår (virket är inte ute än). */}
          {kortPaBacken && kortSkotar && <SkotarRad info={kortSkotar} style={{ marginTop: 6 }} />}
          {/* Egen skotning — säljaren/markägaren skotar själv. Grå chip (inte vårt jobb, ingen på-backen). */}
          {kortEgen && (
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.t2, background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>Egen skotning</span>
            </div>
          )}
        </div>
        {/* Chevron */}
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: C.t4, flexShrink: 0 }}>chevron_right</span>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '0 16px 80px', fontFamily: ff }}>
      {/* Rubriksumma + reglage + status-filter (sticky) */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: C.bg, padding: '14px 0 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {aktiva.length} aktiva{backenRund > 0 ? ` · ${formatVolym(backenRund)} m³fub på backen` : ''}
          </div>
          {avanceratAktivt && aktivtLage && (
            <span style={{
              fontSize: 11.5, fontWeight: 500, color: C.t2, flexShrink: 0,
              maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{aktivtLage}</span>
          )}
          <button onClick={() => setPanelOpen(true)} aria-label="Filter och vy" style={{
            width: 40, height: 40, borderRadius: 12,
            background: avanceratAktivt ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: `1px solid ${avanceratAktivt ? C.borderStrong : C.border}`,
            color: avanceratAktivt ? C.t1 : C.t3, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>tune</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 3, background: C.cardGrad, borderRadius: 12, padding: 3, border: `1px solid ${C.border}` }}>
          {segment.map(s => (
            <button key={s.k} onClick={() => setStatusF(s.k)} style={{
              flex: 1, padding: '9px 8px', minHeight: 38,
              background: statusFEff === s.k ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: statusFEff === s.k ? C.t1 : C.t3, border: 'none', borderRadius: 10,
              fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: ff, whiteSpace: 'nowrap',
            }}>{s.l}</button>
          ))}
        </div>
      </div>

      {/* Lista — Pågår grupperas per skotare (arbetslistan); annars en rad per objekt (reglaget kan
          slå på samma gruppering i övriga segment). Grupprubrik = maskin + på-backen-summa. */}
      {li.length === 0 ? (
        <div style={{ fontSize: 13, color: C.t3, padding: '28px 4px', textAlign: 'center' }}>Inga objekt.</div>
      ) : grupperaPerMaskin ? (
        grupper.map(g => (
          <div key={g.maskin || 'ej'} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '8px 4px 6px' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: g.maskin ? C.t1 : C.orange }}>{g.maskin || 'Ej tilldelad'}</span>
              {g.backen > 0 && (
                <span style={{ fontSize: 12, color: C.t3, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{formatVolym(Math.round(g.backen))} m³fub på backen</span>
              )}
            </div>
            {g.objekt.map(renderKort)}
          </div>
        ))
      ) : (
        li.map(renderKort)
      )}

      {/* Detalj-ark (befintligt) */}
      {selectedObj && (
        <ObjektDetalj
          obj={selectedObj}
          skord={selectedObj.vo_nummer ? skordMap[selectedObj.vo_nummer] : undefined}
          onClose={() => setSel(null)}
        />
      )}

      {/* Reglage-panel */}
      {panelOpen && (
        <FilterPanel
          bolag={bolagLista} bolagF={bolagF} setBolagF={setBolagF}
          typF={typF} setTypF={setTypF}
          sortK={sortK} setSortK={setSortK}
          groupMaskin={groupMaskin} setGroupMaskin={setGroupMaskin}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
