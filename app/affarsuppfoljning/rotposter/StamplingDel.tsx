'use client';

// STÄMPLINGEN på en rotposts sida: vad stämplingslängden sa, mot vad skördaren fick ut.
//   läst rapport för trakten  → tabellen (timmer, kubb, massaved, totalt, träd) och EN mening som sammanfattar
//   olästa men finns från Vida → knappen "Läs stämplingslängden" (samma läsverktyg som Räkna, kostar en läsning)
//   ingen stämplingslängd      → en dämpad rad
// Prognosen räknas med stämplingssidans berakna() (lib/rotpost/stampling.ts). Ett fel är ett fel, aldrig "ingen".

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { medAbortRetry } from '@/lib/supabaseRetry';
import { AVSTAND, FARG, KNAPP, KORT, TYP } from '@/lib/design/tokens';
import { nf0, Rad, Rader, Mening } from '@/components/Ytform';
import type { Cell, Meta } from '@/lib/stampling/berakna';
import { lasFranObjekt, rapportForObjekt, type Rapport } from '@/lib/stampling/pdf/klient';
import { jamforStampling, procentMot } from '@/lib/rotpost/stampling';
import type { Rotpost } from '@/lib/rotpost/uppfoljning';
import { stamplingsKalla } from '@/lib/rotpost/kalla';

const pct = (p: number | null) => (p == null ? '' : p === 0 ? '±0 %' : p > 0 ? `+${p} %` : `−${-p} %`);

type Lage =
  | { typ: 'laddar' }
  | { typ: 'fel'; text: string }
  | { typ: 'laser' }
  | { typ: 'saknas' }                                   // ingen stämplingslängd på trakten
  | { typ: 'olast'; gissad: boolean }                   // finns från Vida, inte läst
  | { typ: 'avviker'; rapport: Rapport }                // läst men kontrollen stämmer inte
  | { typ: 'klar'; rapport: Rapport; celler: Cell[]; meta: Meta };

async function lasModell(): Promise<{ celler: Cell[]; meta: Meta } | null> {
  const [k, m] = await Promise.all([
    medAbortRetry(() => supabase.from('stamplings_klass').select('*')),
    medAbortRetry(() => supabase.from('stamplings_meta').select('nyckel,varde')),
  ]);
  if (k.error || m.error) return null;
  const celler = ((k.data ?? []) as Record<string, unknown>[]).map(r => ({
    slag: String(r.slag), klass: Number(r.klass), rot: r.rot as Cell['rot'], stammar: Number(r.stammar), objekt: Number(r.objekt),
    m3_per_stam: Number(r.m3_per_stam), timmer_pct: Number(r.timmer_pct), kubb_pct: Number(r.kubb_pct),
    massa_pct: Number(r.massa_pct), ovrigt_pct: Number(r.ovrigt_pct),
  }));
  const meta: Meta = {};
  for (const r of (m.data ?? []) as { nyckel: string; varde: string | number | null }[]) meta[r.nyckel] = r.varde == null ? null : Number(r.varde);
  return { celler, meta };
}

export default function StamplingDel({ r }: { r: Rotpost }) {
  const [lage, setLage] = useState<Lage>({ typ: 'laddar' });

  const visaRapport = useCallback(async (rapport: Rapport) => {
    if (rapport.status !== 'stammer' || !rapport.lasning) { setLage({ typ: 'avviker', rapport }); return; }
    const modell = await lasModell();
    if (!modell) { setLage({ typ: 'fel', text: 'Prognosmodellen kunde inte läsas.' }); return; }
    setLage({ typ: 'klar', rapport, ...modell });
  }, []);

  const hamta = useCallback(async () => {
    setLage({ typ: 'laddar' });
    const [rap, obj] = await Promise.all([
      rapportForObjekt(r.id),
      medAbortRetry(() => supabase.from('objekt').select('stamplingslangd_url,ovriga_dokument').eq('vo_nummer', r.id).limit(1).maybeSingle()),
    ]);
    if (!rap.ok) { setLage({ typ: 'fel', text: rap.fel }); return; }
    if (rap.rapport) { await visaRapport(rap.rapport); return; }
    if (obj.error) { setLage({ typ: 'fel', text: obj.error.message }); return; }
    const kalla = obj.data ? stamplingsKalla(obj.data as Parameters<typeof stamplingsKalla>[0]) : null;
    setLage(kalla ? { typ: 'olast', gissad: kalla.gissad } : { typ: 'saknas' });
  }, [r.id, visaRapport]);
  useEffect(() => { hamta(); }, [hamta]);

  async function las() {
    setLage({ typ: 'laser' });
    const res = await lasFranObjekt(r.id);
    if (!res.ok) { setLage({ typ: 'fel', text: res.fel }); return; }
    await visaRapport(res.rapport);
  }

  if (lage.typ === 'laddar') return <Rader rubrik="Stämplingen"><Rad text="Hämtar stämplingen…" dampad /></Rader>;
  if (lage.typ === 'saknas') return <Rader rubrik="Stämplingen"><Rad text="Ingen stämplingslängd på trakten" dampad /></Rader>;
  if (lage.typ === 'fel') return (
    <div style={{ ...KORT, margin: `${AVSTAND.l}px ${AVSTAND.l}px 0` }}>
      <div style={{ ...TYP.listtitel }}>Stämplingen kunde inte hämtas</div>
      <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>{lage.text}</div>
      <button onClick={hamta} style={KNAPP.sekundar}>Försök igen</button>
    </div>
  );
  if (lage.typ === 'olast' || lage.typ === 'laser') return (
    <div style={{ ...KORT, margin: `${AVSTAND.l}px ${AVSTAND.l}px 0` }}>
      <div style={{ ...TYP.listtitel }}>Stämplingslängden är inte läst</div>
      <div style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 ${AVSTAND.m}px` }}>
        {lage.typ === 'laser' ? 'Läser… det kan ta en minut. Stäng inte sidan.'
          : lage.gissad ? 'Den är inskannad. Läs den så ser du hur väl stämplingen stämde – är det fel fil säger läsningen det.'
          : 'Läs den så ser du hur väl stämplingen stämde.'}
      </div>
      <button onClick={las} disabled={lage.typ === 'laser'} style={{ ...KNAPP.primar, opacity: lage.typ === 'laser' ? 0.5 : 1 }}>
        {lage.typ === 'laser' ? 'Läser…' : 'Läs stämplingslängden'}
      </button>
    </div>
  );
  if (lage.typ === 'avviker') return (
    <Rader rubrik="Stämplingen">
      <Rad text="Läsningen behöver kontrolleras" sub="Siffrorna i stämplingslängden går inte ihop. Rätta dem först."
        href={`/affarsuppfoljning/stampling?vy=pdf&id=${lage.rapport.id}&kor=1`} />
    </Rader>
  );

  // ── Läst: stämplingen mot skördaren ─────────────────────────────────────
  const j = jamforStampling(lage.rapport.lasning!, lage.celler, lage.meta);
  const p = j.prognos;
  const rader: [string, number, number][] = [
    ['Timmer', r.m3.timmer, p.timmer], ['Kubb', r.m3.kubb, p.kubb], ['Massaved', r.m3.massa, p.massa],
  ];
  const tot = procentMot(r.volym, p.vol);
  const timmerPrognosPct = p.vol > 0 ? Math.round((100 * p.timmer) / p.vol) : null;
  const mening = tot == null ? null
    : `Stämplingen var ${Math.abs(tot) <= 3 ? 'rätt på volymen' : tot > 0 ? `${tot} % för låg på volymen` : `${-tot} % för hög på volymen`}`
      + (timmerPrognosPct != null ? `, ${Math.abs(timmerPrognosPct - r.andel.timmer) <= 3 ? 'och rätt på timmerandelen' : `och sa ${timmerPrognosPct} % timmer mot ${r.andel.timmer} %`}.` : '.');

  return (
    <>
      <Rader rubrik="Stämplingen mot skördaren">
        {rader.map(([namn, fakt, prog]) => (
          <Rad key={namn} text={namn} tal={`${nf0(fakt)} m³`} hoger={`stämplat ${nf0(prog)} · ${pct(procentMot(fakt, prog))}`} />
        ))}
        <Rad text="Totalt" tal={`${nf0(r.volym)} m³`} hoger={`stämplat ${nf0(p.vol)} · ${pct(tot)}`} />
        <Rad text="Träd" tal={nf0(r.stammar)} hoger={`stämplat ${nf0(j.trad + j.utanforModellen)}`} />
        <Rad text="Stämplingslängden" sub="Trädslag, klasser och rötan" href={`/affarsuppfoljning/stampling?vy=pdf&id=${lage.rapport.id}&kor=1`} />
      </Rader>
      {mening && <div style={{ margin: `0 ${AVSTAND.l}px` }}><Mening>{mening}</Mening></div>}
      <div style={{ ...TYP.meta, color: FARG.text2, padding: `${AVSTAND.s}px ${AVSTAND.l}px 0` }}>
        {[j.forrattare, j.datum].filter(Boolean).join(' · ')}{j.forrattare || j.datum ? ' · ' : ''}
        Stämplat = vad stämplingslängden borde ge enligt vår avverkade skog, m³fub.
        {j.utanforModellen > 0 ? ` ${nf0(j.utanforModellen)} träd (löv, torra) räknas inte i prognosen.` : ''}
      </div>
    </>
  );
}
