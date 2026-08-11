'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { OversiktObjekt, C, TF, statusVisning, type StatusHink } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym } from './oversikt-utils';
import { supabase } from '@/lib/supabase';
import { subLabel, markeringSub, FARA_SUBTYPER, HANSYN_SUBTYPER } from './markeringar';
import type { SkordAgg } from './page';

interface Props {
  objekt: OversiktObjekt[];
  skordMap: Record<string, SkordAgg>;   // nyckel = vo_nummer
}

/** Planerad volym = laserskattningen i trakt_data.volym (fallback obj.volym). Samma källa
    överallt så Planerad-rutan och skördat-nämnaren alltid stämmer. */
function planeradVolym(o: OversiktObjekt): number {
  return o.trakt_data?.volym ?? o.volym ?? 0;
}

function Tag({ children, warn, color, bg }: { children: React.ReactNode; warn?: boolean; color?: string; bg?: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap',
      color: color ?? (warn ? C.yellow : C.t2),
      background: bg ?? (warn ? C.yd : 'rgba(255,255,255,0.04)'),
      border: `1px solid ${C.border}`,
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
   Okänt värde → kapitaliseras. Svår mark (dålig bärighet / brant terräng) → lätt orange. */
const BARIGHET_LABEL: Record<string, string> = { bra: 'Bra bärighet', medel: 'Medel bärighet', dalig: 'Dålig bärighet' };
const TERRANG_LABEL: Record<string, string> = { flackt: 'Flack terräng', kuperat: 'Kuperad terräng', brant: 'Brant terräng' };
function kapitalisera(s: string): string { const t = s.trim(); return t.charAt(0).toUpperCase() + t.slice(1); }
function barighetLabel(v: string): string { return BARIGHET_LABEL[v.trim().toLowerCase()] || kapitalisera(v); }
function terrangLabel(v: string): string { return TERRANG_LABEL[v.trim().toLowerCase()] || kapitalisera(v); }
function barighetSvar(v: string): boolean { return v.trim().toLowerCase() === 'dalig'; }
function terrangSvar(v: string): boolean { return v.trim().toLowerCase() === 'brant'; }

/** Rubrik-sektion i detaljvyn. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.t3, marginBottom: 10 }}>{title}</div>
      {children}
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
  const tf = TF[obj.typ] || C.yellow;
  const sv = statusVisning(obj.status);
  const planeradVol = planeradVolym(obj);       // Y — laserskattning, samma i båda rutorna
  const skordVol = skord?.volym || 0;           // X — riktig skördad volym (vy_uppf_prod_per_objekt)
  const harSkord = skordVol > 0;                // ingen matchande rad / 0 → göm rutan (aldrig 0/0%)
  // Ärlig procent — kapas ALDRIG vid 100 (skördat kan överstiga laserskattningen).
  const skordP = planeradVol > 0 ? Math.round((skordVol / planeradVol) * 100) : null;
  const ber = obj.trakt_data?.beraknad;

  // Markeringar för DETTA objekt — hämtas lat (bara när ett objekt öppnats).
  const [marks, setMarks] = useState<MarkItem[]>([]);
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
  const faror = aggregeraMark(hansynMarks.filter((m) => hansynNiva(m.sub) === 'fara'));
  const hansyn = aggregeraMark(hansynMarks.filter((m) => hansynNiva(m.sub) === 'hansyn'));
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
    }}>
      {/* Nav-bar: tillbaka-pil där huset annars ligger (överst vänster) + namn */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        height: 'calc(56px + env(safe-area-inset-top))', paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 12, paddingRight: 12,
        borderBottom: `1px solid ${C.border}`, background: C.bg,
      }}>
        <button onClick={onClose} aria-label="Tillbaka" style={{
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
              {obj.bolag || '–'} · {obj.atgard || (obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring')} · {obj.areal || '–'} ha
              {obj.vo_nummer ? ` · ${obj.vo_nummer}` : ''}
            </div>
          </div>

          {/* Volym + Produktion — Skördat-rutan bara när det finns riktig skördad volym (aldrig 0/0%) */}
          <div style={{ display: 'grid', gridTemplateColumns: harSkord ? '1fr 1fr' : '1fr', gap: 10, marginBottom: harSkord ? 12 : 28 }}>
            <div style={{ background: C.cardGrad, borderRadius: 12, padding: '14px 12px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{formatVolym(Math.round(planeradVol))}<span style={{ fontSize: 13, fontWeight: 400, color: C.t3 }}> m³</span></div>
              <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>Planerad volym</div>
            </div>
            {harSkord && (
              <div style={{ background: C.cardGrad, borderRadius: 12, padding: '14px 12px', border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{formatVolym(Math.round(skordVol))}<span style={{ fontSize: 13, fontWeight: 400, color: C.t3 }}> m³</span></div>
                <div style={{ fontSize: 13, color: C.t3, marginTop: 4 }}>
                  {skordP !== null ? `av ${formatVolym(Math.round(planeradVol))} m³ skördat · ${skordP}%` : 'Skördat'}
                </div>
              </div>
            )}
          </div>

          {/* Framsteg — tunn stapel, fylld av verklig skördad andel (procenten ovan visar >100 ärligt) */}
          {harSkord && skordP !== null && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(skordP, 100)}%`, height: '100%', background: tf, borderRadius: 3, transition: 'width 0.5s' }} />
              </div>
            </div>
          )}

          {/* Restriktioner — only if present */}
          {ber?.restriktioner && ber.restriktioner.length > 0 && (
            <div style={{ background: C.rd, border: `1px solid rgba(255,69,58,0.15)`, borderRadius: 12, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.red, marginBottom: 8 }}>Restriktioner</div>
              {ber.restriktioner.map((r, i) => (
                <div key={i} style={{ fontSize: 12, color: C.t1, marginBottom: 4 }}>
                  {r.name}{r.warning ? <span style={{ color: C.red }}> — {r.warning}</span> : ''}
                </div>
              ))}
            </div>
          )}

          {/* Förutsättningar — maskinernas villkor på trakten (bärighet/terräng/trailer + körnät) */}
          {harForut && (
            <Section title="Förutsättningar">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {obj.barighet && <Tag color={barighetSvar(obj.barighet) ? C.orange : undefined} bg={barighetSvar(obj.barighet) ? C.od : undefined}>{barighetLabel(obj.barighet)}</Tag>}
                {obj.terrang && <Tag color={terrangSvar(obj.terrang) ? C.orange : undefined} bg={terrangSvar(obj.terrang) ? C.od : undefined}>{terrangLabel(obj.terrang)}</Tag>}
                {obj.transport_trailer_in === true && <Tag>Trailer in</Tag>}
                {obj.transport_trailer_in === false && <Tag warn>Ej trailer</Tag>}
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

          {/* Kontakt — only if present */}
          {(obj.kontakt_namn || obj.markagare || obj.kontakt_telefon) && (
            <Section title="Kontakt">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{obj.kontakt_namn || obj.markagare || '–'}</div>
                </div>
                {obj.kontakt_telefon && (
                  <a href={`tel:${obj.kontakt_telefon}`} onClick={e => e.stopPropagation()}
                    style={{
                      fontSize: 13, color: '#5b8fff', textDecoration: 'none', fontWeight: 500,
                      padding: '8px 16px', background: 'rgba(91,143,255,0.1)', borderRadius: 14,
                      minHeight: 44, display: 'flex', alignItems: 'center',
                    }}>
                    {obj.kontakt_telefon}
                  </a>
                )}
              </div>
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
                  {obj.skordare_manuell_fallning && <Tag warn>Manuell fällning</Tag>}
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

          {/* Tillträde — only if present */}
          {obj.ovrigt_info && (
            <Section title="Tillträde">
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{obj.ovrigt_info}</div>
            </Section>
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

export default function OversiktObjektLista({ objekt, skordMap }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const [statusF, setStatusF] = useState<StatusFilter>('alla');
  const [panelOpen, setPanelOpen] = useState(false);
  // Avancerat — bakom reglage-ikonen
  const [bolagF, setBolagF] = useState('alla');
  const [typF, setTypF] = useState<TypFilter>('alla');
  const [sortK, setSortK] = useState<SortKey>('status');
  const [groupMaskin, setGroupMaskin] = useState(false);

  const bolagLista = Array.from(new Set(objekt.map(o => o.bolag).filter(Boolean))) as string[];
  const selectedObj = sel ? objekt.find(o => o.id === sel) : null;

  // Aktiva = att planera + pågår (rubriksumma, oberoende av valt filter).
  const aktiva = objekt.filter(o => statusBucket(o.status) !== 'klar');
  const aktivaVol = aktiva.reduce((s, o) => s + (o.volym || 0), 0);

  // Dynamiska filtersegment: 'Alla' + bara de hinkar som FINNS bland objekten
  // (inga oplanerade idag → inget tomt 'Att planera'-segment). Fast ordning.
  const hinkarFinns = new Set(objekt.map(o => statusBucket(o.status)));
  const HINK_ORDNING: { k: StatusBucket; l: string }[] = [
    { k: 'planera', l: 'Att planera' },
    { k: 'kora', l: 'Att köra' },
    { k: 'pagar', l: 'Pågår' },
    { k: 'klar', l: 'Klar' },
  ];
  const segment: { k: StatusFilter; l: string }[] = [{ k: 'alla', l: 'Alla' }, ...HINK_ORDNING.filter(s => hinkarFinns.has(s.k))];
  // Valt segment tömt (hinken försvann) → fall tillbaka på 'Alla'.
  const statusFEff: StatusFilter = segment.some(s => s.k === statusF) ? statusF : 'alla';

  // Status-filter: "Alla" = aktiva (ej klar); annars = vald hink.
  let li = objekt.filter(o => {
    const b = statusBucket(o.status);
    return statusFEff === 'alla' ? b !== 'klar' : b === statusFEff;
  });
  li = li.filter(o => bolagF === 'alla' || o.bolag === bolagF);
  li = li.filter(o => typF === 'alla' || klassaObjektTyp(o) === typF);

  if (sortK === 'vol') li = [...li].sort((a, b) => (b.volym || 0) - (a.volym || 0));
  else if (sortK === 'status') {
    const order: Record<StatusBucket, number> = { pagar: 0, kora: 1, planera: 2, klar: 3 };
    li = [...li].sort((a, b) => (order[statusBucket(a.status)] - order[statusBucket(b.status)]) || (a.namn || '').localeCompare(b.namn || '', 'sv'));
  } else {
    li = [...li].sort((a, b) => (a.namn || '').localeCompare(b.namn || '', 'sv'));
  }

  // Gruppera per maskin (bakom reglage): objektet listas under BÅDE sin skördare och
  // sin skotare (objektets egna fält). Bara i detta läge — grundvyn = en rad per objekt.
  const grupper: { maskin: string; objekt: OversiktObjekt[]; volym: number }[] = [];
  if (groupMaskin) {
    const map = new Map<string, OversiktObjekt[]>();
    const utan: OversiktObjekt[] = [];
    for (const o of li) {
      const unika = Array.from(new Set([o.skordare_maskin, o.skotare_maskin].filter(Boolean) as string[]));
      if (unika.length === 0) { utan.push(o); continue; }
      for (const m of unika) {
        if (!map.has(m)) map.set(m, []);
        map.get(m)!.push(o);
      }
    }
    for (const m of Array.from(map.keys()).sort((a, b) => a.localeCompare(b, 'sv'))) {
      const objs = map.get(m)!;
      grupper.push({ maskin: m, objekt: objs, volym: objs.reduce((s, o) => s + (o.volym || 0), 0) });
    }
    if (utan.length > 0) grupper.push({ maskin: 'Ej tilldelad maskin', objekt: utan, volym: utan.reduce((s, o) => s + (o.volym || 0), 0) });
  }

  const avanceratAktivt = bolagF !== 'alla' || typF !== 'alla' || sortK !== 'status' || groupMaskin;

  const renderKort = (o: OversiktObjekt) => {
    const sv = statusVisning(o.status);
    const maskiner = Array.from(new Set(
      ([o.skordare_maskin, o.skotare_maskin].filter(Boolean) as string[]).map(kortMaskin)
    ));
    // Framsteg: verklig skördad andel (X/Y) — bara där skördat finns, aldrig tomt/0.
    const tf = TF[o.typ] || C.yellow;
    const kortSkordVol = (o.vo_nummer ? skordMap[o.vo_nummer]?.volym : 0) || 0;
    const kortPlanVol = planeradVolym(o);
    const visaFramsteg = kortSkordVol > 0 && kortPlanVol > 0;
    const framstegP = visaFramsteg ? Math.round((kortSkordVol / kortPlanVol) * 100) : 0;
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
            <span style={{ fontSize: 12, fontWeight: 500, color: sv.farg, flexShrink: 0 }}>{sv.ord}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 12.5, color: C.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
              {o.atgard || (o.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring')}{o.areal ? ` · ${o.areal} ha` : ''}{o.terrang ? ` · ${o.terrang}` : ''}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              {maskiner.map(m => (
                <span key={m} style={{ fontSize: 10.5, fontWeight: 500, color: C.t2, background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>{m}</span>
              ))}
              {o.grot === true && (
                <span style={{ fontSize: 10.5, fontWeight: 600, color: C.green, background: C.gd, padding: '2px 7px', borderRadius: 6, whiteSpace: 'nowrap' }}>GROT</span>
              )}
            </div>
          </div>
          {/* Diskret framsteg — fylld av verklig skördad andel, bara där skördat finns */}
          {visaFramsteg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(framstegP, 100)}%`, height: '100%', background: tf, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.t3, flexShrink: 0 }}>{framstegP}%</span>
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
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.t3 }}>
            {aktiva.length} aktiva · {aktivaVol.toLocaleString('sv-SE')} m³
          </div>
          <button onClick={() => setPanelOpen(true)} aria-label="Filter och vy" style={{
            position: 'relative', width: 40, height: 40, borderRadius: 12,
            background: avanceratAktivt ? 'rgba(255,255,255,0.1)' : 'transparent',
            border: `1px solid ${avanceratAktivt ? C.borderStrong : C.border}`,
            color: avanceratAktivt ? C.t1 : C.t3, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>tune</span>
            {avanceratAktivt && <span style={{ position: 'absolute', top: 6, right: 6, width: 7, height: 7, borderRadius: 4, background: C.blue }} />}
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

      {/* Lista — en rad per objekt; per maskin bara som läge bakom reglaget */}
      {li.length === 0 ? (
        <div style={{ fontSize: 13, color: C.t3, padding: '28px 4px', textAlign: 'center' }}>Inga objekt.</div>
      ) : groupMaskin ? (
        grupper.map(g => (
          <div key={g.maskin} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '8px 4px' }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.t1 }}>{g.maskin}</span>
              <span style={{ fontSize: 12, color: C.t3 }}>{g.objekt.length} objekt · {g.volym.toLocaleString('sv-SE')} m³</span>
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
