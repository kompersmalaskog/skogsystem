'use client';

import { useEffect, useMemo, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { hamtaPoster, sparaPoster, standardBolag, type NyPost, type Post } from '@/lib/objekt/data';
import { byggForslag, kommandeManader, manadEtikett, manadNyckel, MANADER, type Manad, type Volymer } from '@/lib/objekt/manad';
import { fmtM3, TYPER, type ObjektTyp } from '@/lib/objekt/tackning';

// Ändra beställning: båda typerna för månaden, med vad som redan är inlagt under varje. Plus "Föreslå samma för kommande månader" som öppnar
// förslaget i SAMMA ark (egen vy, Avbryt tar tillbaka hit) — systemet föreslår, användaren godkänner, annars blir ett år tjugofyra
// inmatningar. Spara är inaktiv tills något ändrats.

interface Falten {
  nyckel: string;
  typ: ObjektTyp;
  id: string | null;
  bolag: string | null;
  bolag_id: number | null;
  start: string;
  nu: string;
}

/** "1 000", "1000", "1 000,0" → 1000. null = inte ett tal ≥ 0. */
function tolkaVolym(s: string): number | null {
  const t = s.replace(/[\s ]/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

const visa = (n: number): string => String(Math.round(n));

function byggFalt(poster: readonly Post[]): Falten[] {
  return TYPER.flatMap(({ id: typ }): Falten[] => {
    const av = poster.filter(p => p.typ === typ).sort((a, b) => a.bolag.localeCompare(b.bolag, 'sv'));
    if (av.length === 0) return [{ nyckel: `${typ}:ny`, typ, id: null, bolag: null, bolag_id: null, start: '', nu: '' }];
    return av.map(p => ({ nyckel: `${typ}:${p.id}`, typ, id: p.id, bolag: p.bolag, bolag_id: p.bolag_id, start: visa(p.volym), nu: visa(p.volym) }));
  });
}

type Vy = 'form' | 'forslag';
type Hamtat = { lage: 'laddar' } | { lage: 'fel'; text: string } | { lage: 'klar'; poster: Post[] };

export default function BestallningArk({
  manad, poster, inlagt, antalObjekt, onStang, onSparad,
}: {
  manad: Manad;
  poster: readonly Post[];
  /** Vad som redan är inlagt per typ (m³fub) och hur många objekt det är. */
  inlagt: Record<ObjektTyp, number>;
  antalObjekt: Record<ObjektTyp, number>;
  onStang: () => void;
  onSparad: (text: string) => void;
}) {
  const [vy, setVy] = useState<Vy>('form');
  const [falt, setFalt] = useState<Falten[]>(() => byggFalt(poster));
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [hamtat, setHamtat] = useState<Hamtat>({ lage: 'laddar' });
  const [avvalda, setAvvalda] = useState<Set<string>>(new Set());
  const [forsok, setForsok] = useState(0);

  const antalPerTyp = (typ: ObjektTyp) => falt.filter(f => f.typ === typ).length;
  const tolkade = falt.map(f => ({ f, v: tolkaVolym(f.nu) }));
  const andrad = falt.some(f => f.nu.trim() !== f.start.trim());
  // Tomt fält är giltigt bara där det inte fanns något från början; en befintlig beställning tas inte bort här (skriv 0).
  const ogiltig = tolkade.some(({ f, v }) => (f.nu.trim() === '' ? f.start.trim() !== '' : v == null));
  const kanSpara = andrad && !ogiltig && !sparar;

  /** Volymerna som föreslås för kommande månader: det som står i fälten just nu (summa per typ). */
  const kallVolymer: Volymer = {};
  for (const { f, v } of tolkade) if (v != null && v > 0) kallVolymer[f.typ] = (kallVolymer[f.typ] ?? 0) + v;

  // Förslaget läser kommande månaders beställningar först när det öppnas.
  useEffect(() => {
    if (vy !== 'forslag') return;
    let avbruten = false;
    setHamtat({ lage: 'laddar' });
    const forsta = kommandeManader(manad)[0];
    const sista = kommandeManader(manad).slice(-1)[0];
    hamtaPoster(forsta, sista)
      .then(p => { if (!avbruten) setHamtat({ lage: 'klar', poster: p }); })
      .catch(e => { if (!avbruten) setHamtat({ lage: 'fel', text: e instanceof Error ? e.message : String(e) }); });
    return () => { avbruten = true; };
  }, [vy, manad, forsok]);

  const befintliga = useMemo(() => {
    const m = new Map<string, Volymer>();
    if (hamtat.lage !== 'klar') return m;
    for (const p of hamtat.poster) {
      const nyckel = manadNyckel({ ar: p.ar, manad: p.manad });
      m.set(nyckel, { ...(m.get(nyckel) ?? {}), [p.typ]: (m.get(nyckel)?.[p.typ] ?? 0) + Math.round(p.volym) });
    }
    return m;
  }, [hamtat]);

  const forslag = useMemo(() => byggForslag(manad, befintliga), [manad, befintliga]);
  const valda = forslag.filter(r => r.vald && !avvalda.has(manadNyckel(r.manad)));

  /** Bolaget en ny post får: samma som typens befintliga post denna månad, annars det senast inlagda. */
  async function bolagFor(typ: ObjektTyp): Promise<{ bolag: string; bolag_id: number | null }> {
    const har = falt.find(f => f.typ === typ && f.bolag);
    if (har?.bolag) return { bolag: har.bolag, bolag_id: har.bolag_id };
    const annan = falt.find(f => f.bolag);
    if (annan?.bolag) return { bolag: annan.bolag, bolag_id: annan.bolag_id };
    return standardBolag();
  }

  async function dennaManadsPoster(): Promise<NyPost[]> {
    const ut: NyPost[] = [];
    for (const { f, v } of tolkade) {
      if (f.nu.trim() === f.start.trim() || v == null) continue;
      const b = f.bolag ? { bolag: f.bolag, bolag_id: f.bolag_id } : await bolagFor(f.typ);
      ut.push({ ar: manad.ar, manad: manad.manad, typ: f.typ, bolag: b.bolag, bolag_id: b.bolag_id, volym: v });
    }
    return ut;
  }

  async function spara() {
    setSparar(true); setFel(null);
    try {
      await sparaPoster(await dennaManadsPoster());
      onSparad(`Beställningen för ${MANADER[manad.manad - 1].toLowerCase()} är sparad.`);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
      setSparar(false);
    }
  }

  async function laggIn() {
    setSparar(true); setFel(null);
    try {
      const rader: NyPost[] = await dennaManadsPoster();
      for (const r of valda) {
        for (const { id: typ } of TYPER) {
          const v = kallVolymer[typ];
          if (!v || r.redan?.[typ] != null) continue; // skriver aldrig över en månad som redan har en beställning
          const b = await bolagFor(typ);
          rader.push({ ar: r.manad.ar, manad: r.manad.manad, typ, bolag: b.bolag, bolag_id: b.bolag_id, volym: v });
        }
      }
      await sparaPoster(rader);
      onSparad(`Beställningen är inlagd för ${valda.length} ${valda.length === 1 ? 'månad' : 'månader'} till.`);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
      setSparar(false);
    }
  }

  // ---- Förslaget ----
  if (vy === 'forslag') {
    const sammanfattning = TYPER.filter(t => kallVolymer[t.id]).map(t => `${t.namn} ${fmtM3(kallVolymer[t.id]!)} m³fub`).join(' · ');
    const ingenKalla = Object.keys(kallVolymer).length === 0;
    const blockerad = valda.length === 0 || ingenKalla || ogiltig || sparar || hamtat.lage !== 'klar';
    const knapptext = andrad
      ? `Spara och lägg in ${valda.length} ${valda.length === 1 ? 'månad' : 'månader'}`
      : `Lägg in ${valda.length} ${valda.length === 1 ? 'månad' : 'månader'}`;
    return (
      <Ark rubrik="Kommande månader" onStang={() => { setVy('form'); setFel(null); }}
        fot={(
          <>
            {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
            <button type="button" onClick={laggIn} disabled={blockerad}
              style={{ ...KNAPP.primar, ...(blockerad ? INAKTIV : null) }}>
              {sparar ? 'Sparar …' : knapptext}
            </button>
          </>
        )}>
        {ingenKalla ? (
          <p style={{ margin: `${AVSTAND.m}px 0`, ...TYP.text, color: FARG.text2 }}>Skriv in en beställning för {MANADER[manad.manad - 1].toLowerCase()} först — det är den som föreslås för de andra månaderna.</p>
        ) : (
          <>
            <p style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>
              Samma som {MANADER[manad.manad - 1].toLowerCase()}: {sammanfattning}. Ta bort de månader som ska vara annorlunda. En månad som redan har en beställning ändras inte.
            </p>
            {hamtat.lage === 'laddar' && <p role="status" style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Läser kommande månader …</p>}
            {hamtat.lage === 'fel' && (
              <div role="alert">
                <p style={{ margin: `0 0 ${AVSTAND.s}px`, ...TYP.text, color: FARG.orange }}>Kunde inte läsa kommande månader. {hamtat.text}</p>
                <button type="button" style={KNAPP.lank} onClick={() => setForsok(n => n + 1)}>Försök igen</button>
              </div>
            )}
            {hamtat.lage === 'klar' && (
              <Sektion rubrik="Månader" kort={false}>
                {forslag.map((r, i) => {
                  const nyckel = manadNyckel(r.manad);
                  const redanText = r.redan ? TYPER.filter(t => r.redan![t.id] != null).map(t => `${t.namn} ${fmtM3(r.redan![t.id]!)} m³fub`).join(' · ') : null;
                  const vald = r.vald && !avvalda.has(nyckel);
                  return (
                    <Rad key={nyckel} sista={i === forslag.length - 1}
                      titel={manadEtikett(r.manad)}
                      under={redanText ? `Redan inlagd: ${redanText}` : undefined}
                      dampad={!!r.redan}
                      pil={false}
                      hoger={r.redan ? undefined : <Ikon namn={vald ? 'check_circle' : 'circle'} fylld={vald} storlek={IKON.rad} farg={vald ? FARG.text : FARG.text3} />}
                      onTryck={r.redan ? undefined : () => setAvvalda(s => { const n = new Set(s); if (n.has(nyckel)) n.delete(nyckel); else n.add(nyckel); return n; })}
                      attr={{ 'data-forslag-manad': nyckel, 'aria-pressed': String(vald) }} />
                  );
                })}
              </Sektion>
            )}
          </>
        )}
      </Ark>
    );
  }

  // ---- Formuläret ----
  const forsta = kommandeManader(manad)[0];
  const sista = kommandeManader(manad).slice(-1)[0];
  return (
    <Ark rubrik="Ändra beställning" onStang={onStang}
      fot={(
        <>
          {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
          <button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Spara'}
          </button>
        </>
      )}>
      <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>{manadEtikett(manad)}</p>
      {TYPER.map(t => (
        <Sektion key={t.id} rubrik={t.namn} kort={false}>
          {falt.filter(f => f.typ === t.id).map(f => (
            <Falt key={f.nyckel}
              etikett={antalPerTyp(t.id) > 1 && f.bolag ? `Beställt · ${f.bolag}` : 'Beställt'}
              value={f.nu} inputMode="numeric" enhet="m³fub"
              onChange={v => setFalt(rader => rader.map(r => (r.nyckel === f.nyckel ? { ...r, nu: v } : r)))}
              stod={`Redan inlagt: ${fmtM3(inlagt[t.id])} m³fub i ${antalObjekt[t.id]} objekt`} />
          ))}
        </Sektion>
      ))}
      <Sektion rubrik="Fler månader" kort={false}>
        <Rad titel="Föreslå samma för kommande månader" under={`${manadEtikett(forsta)} till ${manadEtikett(sista)}`} sista
          onTryck={() => { setAvvalda(new Set()); setVy('forslag'); }} attr={{ 'data-foresla': '1' }} />
      </Sektion>
    </Ark>
  );
}
