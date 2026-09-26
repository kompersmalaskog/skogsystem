'use client';

/**
 * MINSTA MÖJLIGA FAKTURAUNDERLAG: välj ett VO, se raderna.
 *
 * Ingen redigering, ingen sändning, ingen status, ingen totalsumma-logik.
 * Vyn finns av två skäl, och båda kräver att den är liten:
 *
 *  1. POST /api/faktura/underlag går inte att nå från en webbläsaradress.
 *     Routen fungerar, men utan en knapp är den lika oåtkomlig som
 *     /api/fortnox/auth var. En rutt ingen kan köra är inte byggd.
 *
 *  2. Hämtningslagret är NYTT. Skriptet som gav Brokamåla 58,00/56,50 var en
 *     annan kodväg — att de ger samma tal är en hypotes tills den visats.
 *     Byggs hela granskningsvyn först felsöks två saker samtidigt, och ett
 *     tal som ser fel ut kan lika gärna vara presentationen.
 *
 * FÖRSTA KONTROLLEN: Brokamåla (11226833) ska ge 58,00 / 56,50 och Jätsbygd
 * (11217392) sina tre maskinrader. Annars är hämtningslagret inte ekvivalent
 * med skriptet.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FARG, TYP, AVSTAND, RADIE, TRAFFYTA, VY_ROT, KORT, FONT } from '@/lib/design/tokens';

type Rad = {
  radnr: number; artikelnr: string | null; benamning: string;
  antal: number | null; enhet: string | null;
  prisagare: string; a_pris: number | null; a_pris_beraknat: number | null;
  harledning: { etikett: string; belopp: number; ungefarlig?: boolean }[] | null;
  kalla: string; status: string; fel_kod: string | null;
  kostnadsstalle: string | null;
};
type Resultat = {
  vo_nummer: string; objektnamn: string; kund: number | null; bolag: string | null;
  avtalsform: string; avrakningsdatum: string | null; objekt_ids: string[];
  rader: Rad[]; noter: { niva: string; text: string }[]; hinder: string[];
  gar_att_skicka: boolean; summa_kant: number; rader_utan_pris: number; fel?: string;
};
type Vo = { vo_nummer: string; namn: string; avr: string | null; timpeng: boolean };

const kr = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function FakturaunderlagClient() {
  const [voLista, setVoLista] = useState<Vo[] | null>(null);
  const [listFel, setListFel] = useState<string | null>(null);
  const [valt, setValt] = useState<string | null>(null);
  const [res, setRes] = useState<Resultat | null>(null);
  const [laddar, setLaddar] = useState(false);
  const [korFel, setKorFel] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('dim_objekt')
        .select('vo_nummer, object_name, timpeng, exkludera, skordning_avslutad, skotning_avslutad')
        .not('vo_nummer', 'is', null)
        .order('vo_nummer');
      if (error) { setListFel(error.message); return; }
      const per = new Map<string, Vo>();
      for (const o of data || []) {
        if (o.exkludera) continue;
        const avr = o.skotning_avslutad || o.skordning_avslutad || null;
        const fanns = per.get(o.vo_nummer);
        if (!fanns || (avr && (!fanns.avr || avr > fanns.avr))) {
          per.set(o.vo_nummer, {
            vo_nummer: o.vo_nummer, namn: o.object_name || o.vo_nummer,
            avr, timpeng: !!o.timpeng,
          });
        }
      }
      // Senast avräknade först — det är dem Martin fakturerar.
      setVoLista(Array.from(per.values()).sort((a, b) => (b.avr || '').localeCompare(a.avr || '')));
    })();
  }, []);

  async function kor(vo: string) {
    setValt(vo); setRes(null); setKorFel(null); setLaddar(true);
    try {
      const r = await fetch('/api/faktura/underlag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vo_nummer: vo, dry_run: true }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) { setKorFel(j?.meddelande || `Servern svarade ${r.status}.`); return; }
      setRes(j.resultat?.[0] || null);
    } catch (e: any) {
      setKorFel(e?.message || 'Anropet gick inte fram.');
    } finally {
      setLaddar(false);
    }
  }

  return (
    <div style={{ ...VY_ROT, paddingBottom: 120 }}>
      <h1 style={{ ...TYP.titel, margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px` }}>Fakturaunderlag</h1>
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.xl}px` }}>
        Förhandsvisning. Inget sparas och ingenting skickas till Fortnox.
      </p>

      {/* ── Välj VO ─────────────────────────────────────────────────── */}
      {listFel && (
        <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
          <div style={{ ...TYP.listtitel, color: FARG.rod }}>Kunde inte läsa objektlistan</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{listFel}</div>
        </div>
      )}
      {!listFel && voLista === null && (
        <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.l }}>Läser objekten…</div>
      )}
      {voLista?.length === 0 && (
        <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
          <div style={{ ...TYP.listtitel }}>Inga objekt</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
            Listan fylls av objekt i dim_objekt som inte är exkluderade.
          </div>
        </div>
      )}

      {!!voLista?.length && (
        <div style={{ display: 'flex', gap: AVSTAND.s, overflowX: 'auto', paddingBottom: AVSTAND.s,
                      marginBottom: AVSTAND.xl, WebkitOverflowScrolling: 'touch' }}>
          {voLista.map(v => (
            <button key={v.vo_nummer} onClick={() => kor(v.vo_nummer)}
              style={{
                flex: '0 0 auto', minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px ${AVSTAND.m}px`,
                borderRadius: RADIE.knapp, border: 'none', fontFamily: FONT, textAlign: 'left',
                background: valt === v.vo_nummer ? FARG.upphojt : FARG.kort,
                color: FARG.text, cursor: 'pointer',
              }}>
              <div style={{ ...TYP.listtitel, whiteSpace: 'nowrap' }}>{v.namn}</div>
              <div style={{ ...TYP.meta, color: FARG.text2, whiteSpace: 'nowrap' }}>
                {v.vo_nummer} · {v.timpeng ? 'timpeng' : 'ackord'}
                {v.avr ? ` · ${v.avr}` : ' · ej avräknad'}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Resultatet ──────────────────────────────────────────────── */}
      {laddar && <div style={{ ...TYP.meta, color: FARG.text2 }}>Bygger raderna för {valt}…</div>}

      {korFel && (
        <div style={{ ...KORT }}>
          <div style={{ ...TYP.listtitel, color: FARG.rod }}>Underlaget kunde inte byggas</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{korFel}</div>
        </div>
      )}

      {res && !laddar && (
        <>
          <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
            <div style={{ ...TYP.rubrik }}>{res.objektnamn}</div>
            <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
              VO {res.vo_nummer} · {res.avtalsform} · kund {res.kund ?? 'saknas'} ({res.bolag || '—'})
              {' · '}{res.avrakningsdatum ? `avräknad ${res.avrakningsdatum}` : 'ej avräknad'}
            </div>
            {res.objekt_ids.length > 1 && (
              <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                {res.objekt_ids.length} objektrader: {res.objekt_ids.join(', ')}
              </div>
            )}
          </div>

          {/* Hinder och noter står FÖRE raderna — det som stoppar fakturan
              ska läsas först, inte hittas under en lista. */}
          {!!res.hinder.length && (
            <div style={{ ...KORT, marginBottom: AVSTAND.l, borderLeft: `3px solid ${FARG.rod}` }}>
              <div style={{ ...TYP.listtitel, color: FARG.rod }}>Går inte att skicka</div>
              {res.hinder.map((h, i) => (
                <div key={i} style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{h}</div>
              ))}
            </div>
          )}
          {!!res.noter.length && (
            <div style={{ ...KORT, marginBottom: AVSTAND.l }}>
              <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Att känna till</div>
              {res.noter.map((n, i) => (
                <div key={i} style={{ ...TYP.meta, marginTop: AVSTAND.xs,
                                      color: n.niva === 'varning' ? FARG.orange : FARG.text2 }}>
                  {n.niva === 'varning' ? 'Varning: ' : ''}{n.text}
                </div>
              ))}
            </div>
          )}

          {res.rader.length === 0 ? (
            <div style={{ ...KORT }}>
              <div style={{ ...TYP.listtitel }}>Inga rader</div>
              <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                {res.fel || 'Radbyggaren byggde ingenting för det här VO:t.'}
              </div>
            </div>
          ) : (
            <div style={{ ...KORT, padding: 0, overflow: 'hidden' }}>
              {res.rader.map(r => {
                const pris = r.a_pris ?? r.a_pris_beraknat;
                return (
                  <div key={r.radnr} style={{
                    padding: `${AVSTAND.m}px ${AVSTAND.l}px`,
                    borderBottom: `1px solid ${FARG.linje}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s }}>
                      <span style={{ ...TYP.meta, color: FARG.text3, minWidth: 34 }}>
                        {r.artikelnr ? `art ${r.artikelnr}` : '—'}
                      </span>
                      <span style={{ ...TYP.listtitel, flex: 1 }}>{r.benamning}</span>
                      <span style={{ ...TYP.listtitel, fontVariantNumeric: 'tabular-nums' }}>
                        {pris == null ? 'hämtas' : kr(pris)}
                      </span>
                    </div>
                    <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                      {r.antal == null ? '—' : kr(r.antal)} {r.enhet || ''}
                      {' · '}{r.prisagare}
                      {r.kostnadsstalle ? ` · ${r.kostnadsstalle}` : ''}
                      {' · '}{r.kalla}
                    </div>
                    {/* Status står som ORD, aldrig bara som färg — rött i
                        solljus är brunt. */}
                    {r.status !== 'klar' && (
                      <div style={{ ...TYP.meta, marginTop: AVSTAND.xs,
                                    color: r.status === 'fel' ? FARG.rod : FARG.orange }}>
                        {r.status === 'fel' ? `Fel: ${r.fel_kod}` : 'Väntar på leverantörsfaktura'}
                      </div>
                    )}
                    {!!r.harledning?.length && (
                      <div style={{ marginTop: AVSTAND.s, paddingLeft: AVSTAND.m,
                                    borderLeft: `2px solid ${FARG.linje}` }}>
                        {r.harledning.map((d, i) => (
                          <div key={i} style={{ ...TYP.meta, color: FARG.text2 }}>
                            {d.etikett}
                            {d.belopp !== 0 && ` ${d.belopp > 0 ? '+' : ''}${kr(d.belopp)}`}
                            {d.ungefarlig && ' (viktat snitt)'}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px` }}>
                <div style={{ ...TYP.meta, color: FARG.text2 }}>
                  Summa på de rader som har ett pris
                </div>
                <div style={{ ...TYP.tal, marginTop: AVSTAND.xs }}>{kr(res.summa_kant)} kr</div>
                {res.rader_utan_pris > 0 && (
                  <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>
                    {res.rader_utan_pris} rad{res.rader_utan_pris === 1 ? '' : 'er'} ingår inte —
                    priset hämtas ur Fortnox eller väntar på en leverantörsfaktura.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
