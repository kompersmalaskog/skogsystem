'use client';

import { useEffect, useMemo, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { bolagNyckel, forifyllBolag, type Bolag } from '@/lib/objekt/bolag';
import { hamtaPoster, sparaPoster, type NyPost, type Post } from '@/lib/objekt/data';
import { byggForslag, kommandeManader, manadEtikett, manadNyckel, MANADER, type Manad, type Volymer } from '@/lib/objekt/manad';
import { fmtM3, inlagtSumma, TYPER, type ObjektTyp } from '@/lib/objekt/tackning';
import BolagValjare from './BolagValjare';

// Ändra beställning: båda typerna för månaden, med vad som redan är inlagt under varje. Plus "Föreslå samma för kommande månader" som öppnar
// förslaget i SAMMA ark (egen vy, Avbryt tar tillbaka hit) — systemet föreslår, användaren godkänner, annars blir ett år tjugofyra
// inmatningar. Spara är inaktiv tills något ändrats.
//
// BOLAGET: varje beställning har ett synligt bolag. En ny beställning förifylls med bolaget från månadens befintliga poster (om de är samma
// bolag) men raden "Bolag" visar det och går att byta — med sök och möjlighet att SKAPA ett nytt bolag (så en ny kund kommer in utan kodändring).
// Det finns inget standardbolag: utan valt bolag går en beställning inte att spara. Bolaget på en BEFINTLIG beställning ändras inte här (det
// vore en annan beställning); "Lägg till bolag" lägger en ny beställning för ett annat bolag.

interface Falten {
  nyckel: string;
  typ: ObjektTyp;
  id: string | null;
  bolag: string | null;
  bolag_id: number | null;
  /** En befintlig beställning: bolaget är fast. */
  fast: boolean;
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
    if (av.length === 0) {
      // Förifyllning, aldrig en reserv: samma bolag som månadens övriga poster om de alla är ett och samma — annars inget valt.
      const f = forifyllBolag(poster, typ);
      return [{ nyckel: `${typ}:ny`, typ, id: null, bolag: f?.namn ?? null, bolag_id: f?.id ?? null, fast: false, start: '', nu: '' }];
    }
    return av.map(p => ({ nyckel: `${typ}:${p.id}`, typ, id: p.id, bolag: p.bolag, bolag_id: p.bolag_id, fast: true, start: visa(p.volym), nu: visa(p.volym) }));
  });
}

type Vy = 'form' | 'forslag' | 'bolag';
type Hamtat = { lage: 'laddar' } | { lage: 'fel'; text: string } | { lage: 'klar'; poster: Post[] };

export default function BestallningArk({
  manad, poster, objekt, onStang, onSparad,
}: {
  manad: Manad;
  poster: readonly Post[];
  /** Månadens objekt: vad som redan är inlagt visas per typ OCH bolag. */
  objekt: readonly { typ: string | null; bolag: string | null; volym: number | null }[];
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
  const [valjerFor, setValjerFor] = useState<string | null>(null);

  const tolkade = falt.map(f => ({ f, v: tolkaVolym(f.nu) }));
  const andrad = falt.some(f => f.nu.trim() !== f.start.trim());
  // Tomt fält är giltigt bara där det inte fanns något från början; en befintlig beställning tas inte bort här (skriv 0).
  const ogiltig = tolkade.some(({ f, v }) => (f.nu.trim() === '' ? f.start.trim() !== '' : v == null));
  // En ny beställning med en volym måste ha ett valt bolag — det finns ingen reserv som fyller i ett åt dig.
  const saknarBolag = (f: Falten) => !f.fast && f.nu.trim() !== '' && f.bolag_id == null;
  const utanBolag = falt.filter(saknarBolag);
  // Samma bolag två gånger på samma typ vore två beställningar på samma nyckel (ar, manad, typ, bolag).
  const dubblett = (f: Falten) => f.bolag_id != null && falt.some(g => g !== f && g.typ === f.typ && g.bolag_id === f.bolag_id);
  const harDubblett = falt.some(dubblett);
  const kanSpara = andrad && !ogiltig && utanBolag.length === 0 && !harDubblett && !sparar;

  /** Vad som redan är inlagt för typen och bolaget (m³fub och antal objekt). */
  const inlagtFor = (typ: ObjektTyp, bolag: string) => {
    const rader = objekt.filter(o => o.typ === typ && bolagNyckel(o.bolag) === bolagNyckel(bolag));
    return { summa: inlagtSumma(rader), antal: rader.length };
  };

  /** Posterna som föreslås för kommande månader: det som står i fälten just nu, per typ OCH bolag. Fält utan valt bolag räknas inte. */
  const kallPoster: { typ: ObjektTyp; bolag: string; bolag_id: number; volym: number }[] = [];
  for (const { f, v } of tolkade) {
    if (v == null || v <= 0 || f.bolag == null || f.bolag_id == null) continue;
    const finns = kallPoster.find(k => k.typ === f.typ && k.bolag_id === f.bolag_id);
    if (finns) finns.volym += v; else kallPoster.push({ typ: f.typ, bolag: f.bolag, bolag_id: f.bolag_id, volym: v });
  }

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

  function dennaManadsPoster(): NyPost[] {
    const ut: NyPost[] = [];
    for (const { f, v } of tolkade) {
      if (f.nu.trim() === f.start.trim() || v == null) continue;
      if (f.bolag == null) throw new Error('Välj bolag innan du sparar.');
      ut.push({ ar: manad.ar, manad: manad.manad, typ: f.typ, bolag: f.bolag, bolag_id: f.bolag_id, volym: v, ...(f.id ? { id: f.id } : null) });
    }
    return ut;
  }

  function valtBolag(b: Bolag) {
    setFalt(rader => rader.map(r => (r.nyckel === valjerFor ? { ...r, bolag: b.namn, bolag_id: b.id } : r)));
    setValjerFor(null);
    setVy('form');
  }

  function laggTillBolag(typ: ObjektTyp) {
    setFalt(rader => {
      const n = rader.filter(r => r.typ === typ && !r.fast).length;
      const ny: Falten = { nyckel: `${typ}:tillagd${n}${rader.length}`, typ, id: null, bolag: null, bolag_id: null, fast: false, start: '', nu: '' };
      const sista = rader.map((r, i) => (r.typ === typ ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
      return [...rader.slice(0, sista + 1), ny, ...rader.slice(sista + 1)];
    });
  }

  async function spara() {
    setSparar(true); setFel(null);
    try {
      await sparaPoster(dennaManadsPoster());
      onSparad(`Beställningen för ${MANADER[manad.manad - 1].toLowerCase()} är sparad.`);
    } catch (e) {
      setFel(e instanceof Error ? e.message : String(e));
      setSparar(false);
    }
  }

  async function laggIn() {
    setSparar(true); setFel(null);
    try {
      const rader: NyPost[] = dennaManadsPoster();
      for (const r of valda) {
        for (const k of kallPoster) {
          if (r.redan?.[k.typ] != null) continue; // skriver aldrig över en månad som redan har en beställning på typen
          rader.push({ ar: r.manad.ar, manad: r.manad.manad, typ: k.typ, bolag: k.bolag, bolag_id: k.bolag_id, volym: k.volym });
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
    const flera = new Set(kallPoster.map(k => k.bolag_id)).size > 1;
    const sammanfattning = kallPoster.map(k => `${flera ? `${k.bolag} ` : ''}${TYPER.find(t => t.id === k.typ)!.namn.toLowerCase()} ${fmtM3(k.volym)} m³fub`).join(' · ');
    const ingenKalla = kallPoster.length === 0;
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

  // ---- Bolagsväljaren: ett eget ark i samma flöde, Avbryt tar tillbaka formuläret med allt som är ifyllt ----
  if (vy === 'bolag') {
    const aktiv = falt.find(f => f.nyckel === valjerFor);
    return (
      <BolagValjare valt={aktiv?.bolag_id != null && aktiv.bolag ? { id: aktiv.bolag_id, namn: aktiv.bolag } : null}
        onVal={valtBolag} onTillbaka={() => { setValjerFor(null); setVy('form'); }} />
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
          {utanBolag.length > 0 && <p role="status" data-saknar-bolag="" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Välj bolag för varje beställning du skrivit in.</p>}
          {harDubblett && <p role="status" data-dubbelt-bolag="" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Samma bolag finns två gånger på samma typ. Ta bort ett av dem.</p>}
          <button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Spara'}
          </button>
        </>
      )}>
      <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>{manadEtikett(manad)}</p>
      {TYPER.map(t => (
        <Sektion key={t.id} rubrik={t.namn} kort={false}>
          {falt.filter(f => f.typ === t.id).map(f => {
            const saknar = saknarBolag(f);
            const i = f.bolag != null ? inlagtFor(t.id, f.bolag) : null;
            return (
              <div key={f.nyckel} data-bestallning={f.nyckel} data-bolag={f.bolag ?? ''} style={{ marginBottom: AVSTAND.s }}>
                <Rad titel="Bolag" sista pil={!f.fast}
                  under={f.fast ? 'Beställningens bolag' : f.bolag ? 'Förifyllt eller valt · tryck för att byta' : undefined}
                  hoger={f.bolag ?? <span style={{ color: FARG.orange }}>Välj bolag</span>}
                  onTryck={f.fast ? undefined : () => { setValjerFor(f.nyckel); setVy('bolag'); }}
                  attr={{ 'data-bolag-rad': f.nyckel, ...(saknar || (f.bolag == null && !f.fast) ? { 'data-bolag-saknas': '' } : null) }} />
                <div style={{ height: AVSTAND.m }} />
                <Falt etikett="Beställt" value={f.nu} inputMode="numeric" enhet="m³fub"
                  onChange={v => setFalt(rader => rader.map(r => (r.nyckel === f.nyckel ? { ...r, nu: v } : r)))}
                  stod={i ? `Redan inlagt för ${f.bolag}: ${fmtM3(i.summa)} m³fub i ${i.antal} objekt` : 'Välj bolag för att se vad som är inlagt'} />
              </div>
            );
          })}
          <Rad titel="Lägg till bolag" under={`En beställning på ${t.namn.toLowerCase()} för ett annat bolag`} sista pil={false}
            hoger={<Ikon namn="add" storlek={IKON.rad} farg={FARG.text} />}
            onTryck={() => laggTillBolag(t.id)} attr={{ 'data-lagg-till-bolag': t.id }} />
        </Sektion>
      ))}
      <Sektion rubrik="Fler månader" kort={false}>
        <Rad titel="Föreslå samma för kommande månader" under={`${manadEtikett(forsta)} till ${manadEtikett(sista)}`} sista
          onTryck={() => { setAvvalda(new Set()); setVy('forslag'); }} attr={{ 'data-foresla': '1' }} />
      </Sektion>
    </Ark>
  );
}
