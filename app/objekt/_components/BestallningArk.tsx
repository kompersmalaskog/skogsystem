'use client';

import { useEffect, useMemo, useState } from 'react';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import TalRad from '@/components/design/TalRad';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, TYP } from '@/lib/design/tokens';
import { bolagNyckel, type Bolag } from '@/lib/objekt/bolag';
import { hamtaPoster, sparaPoster, type NyPost, type Post } from '@/lib/objekt/data';
import { byggForslag, kommandeManader, manadEtikett, manadKort, manadNyckel, MANADER, type Manad, type Volymer } from '@/lib/objekt/manad';
import { fmtM3, inlagtSumma, lageKort, TYPER, type ObjektTyp } from '@/lib/objekt/tackning';
import BolagValjare from './BolagValjare';

// Ändra beställning: BOLAG ytterst, typ inuti. Martin tänker "Vidas beställning", inte "Vidas gallring" och "Vidas slutavverkning" som två saker —
// så bolaget är sektionsrubriken (en gång) och gallring och slutavverkning är två rader under det, var och en med ett tal och en rad som
// räknar om medan man skriver ("379 inlagt · 621 kvar", samma ord som listans sektionsfot: lib/objekt/tackning.ts lageDel).
// Plus "Föreslå samma för kommande månader", som öppnar ett FÖRSLAG i samma ark (egen vy, Avbryt tar tillbaka hit) — systemet föreslår,
// användaren godkänner, annars blir ett år tjugofyra inmatningar. Spara är inaktiv tills något ändrats.
//
// BOLAGET: en befintlig bolagssektion har ett fast bolag. "Lägg till bolag" lägger en NY sektion (båda typerna) som ALLTID frågar vilket bolag —
// ingen förifyllning: en förifylld mottagare på en ny beställning är samma mina som standardbolaget var. Väljaren (sök, skapa nytt) är
// BolagValjare; bolag som redan har en sektion i arket är nedtonade där och går inte att välja, så det ogiltiga läget förhindras. Utan valt
// bolag går en ny sektion inte att spara.

interface Sektionen {
  nyckel: string;
  /** null = ännu inte valt (en ny sektion). `id` kan vara null bara för en gammal rad utan bolag_id. */
  bolag: { id: number | null; namn: string } | null;
  /** En befintlig bolagssektion: bolaget är fast. */
  fast: boolean;
}

interface Falten {
  nyckel: string;
  sektion: string;
  typ: ObjektTyp;
  /** Id för en befintlig beställning (post). */
  id: string | null;
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

/** Befintliga poster → en sektion per bolag (fast bolag), med ett fält per typ (tomt där bolaget saknar beställning på typen). */
function byggSektioner(poster: readonly Post[]): { sektioner: Sektionen[]; falt: Falten[] } {
  const per = new Map<string, Post[]>();
  for (const p of poster) {
    const k = p.bolag_id != null ? `id${p.bolag_id}` : `namn${bolagNyckel(p.bolag)}`;
    per.set(k, [...(per.get(k) ?? []), p]);
  }
  const grupper = Array.from(per.entries()).sort((a, b) => a[1][0].bolag.localeCompare(b[1][0].bolag, 'sv'));
  const sektioner: Sektionen[] = [];
  const falt: Falten[] = [];
  for (const [nyckel, rader] of grupper) {
    sektioner.push({ nyckel, bolag: { id: rader[0].bolag_id, namn: rader[0].bolag }, fast: true });
    for (const { id: typ } of TYPER) {
      const post = rader.find(r => r.typ === typ);
      falt.push({ nyckel: `${nyckel}:${typ}`, sektion: nyckel, typ, id: post?.id ?? null, start: post ? visa(post.volym) : '', nu: post ? visa(post.volym) : '' });
    }
  }
  return { sektioner, falt };
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
  const [bygge] = useState(() => byggSektioner(poster));
  const [sektioner, setSektioner] = useState<Sektionen[]>(bygge.sektioner);
  const [falt, setFalt] = useState<Falten[]>(bygge.falt);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [hamtat, setHamtat] = useState<Hamtat>({ lage: 'laddar' });
  const [avvalda, setAvvalda] = useState<Set<string>>(new Set());
  const [forsok, setForsok] = useState(0);
  const [valjerFor, setValjerFor] = useState<string | null>(null);

  const tolkade = falt.map(f => ({ f, v: tolkaVolym(f.nu) }));
  const bolagFor = (f: Falten) => sektioner.find(sk => sk.nyckel === f.sektion)?.bolag ?? null;
  const andrad = falt.some(f => f.nu.trim() !== f.start.trim());
  // Tomt fält är giltigt bara där det inte fanns något från början; en befintlig beställning tas inte bort här (skriv 0).
  const ogiltig = tolkade.some(({ f, v }) => (f.nu.trim() === '' ? f.start.trim() !== '' : v == null));
  // En ny sektion med en volym måste ha ett valt bolag — det finns ingen reserv som fyller i ett åt dig.
  const utanBolag = sektioner.filter(sk => sk.bolag == null && falt.some(f => f.sektion === sk.nyckel && f.nu.trim() !== ''));
  // Väljaren förhindrar det, men samma bolag i två sektioner vore två beställningar på samma nyckel (ar, manad, typ, bolag_id).
  const ids = sektioner.map(sk => sk.bolag?.id).filter((i): i is number => i != null);
  const harDubblett = new Set(ids).size !== ids.length;
  const kanSpara = andrad && !ogiltig && utanBolag.length === 0 && !harDubblett && !sparar;

  /** Vad som redan är inlagt för typen och bolaget (m³fub). */
  const inlagtFor = (typ: ObjektTyp, bolag: string) =>
    inlagtSumma(objekt.filter(o => o.typ === typ && bolagNyckel(o.bolag) === bolagNyckel(bolag)));

  /** Posterna som föreslås för kommande månader: det som står i fälten just nu, per typ OCH bolag. Sektioner utan valt bolag räknas inte. */
  const kallPoster: { typ: ObjektTyp; bolag: string; bolag_id: number; volym: number }[] = [];
  for (const { f, v } of tolkade) {
    const b = bolagFor(f);
    if (v == null || v <= 0 || b == null || b.id == null) continue;
    const finns = kallPoster.find(k => k.typ === f.typ && k.bolag_id === b.id);
    if (finns) finns.volym += v; else kallPoster.push({ typ: f.typ, bolag: b.namn, bolag_id: b.id, volym: v });
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
      const b = bolagFor(f);
      if (b == null) throw new Error('Välj bolag innan du sparar.');
      // En gammal rad utan bolag_id går att ändra (på id) men inte att bygga en NY beställning på.
      if (f.id == null && b.id == null) throw new Error(`${b.namn} saknar id i bolagsregistret. Lägg till bolaget på nytt med Lägg till bolag.`);
      ut.push({ ar: manad.ar, manad: manad.manad, typ: f.typ, bolag: b.namn, bolag_id: b.id, volym: v, ...(f.id ? { id: f.id } : null) });
    }
    return ut;
  }

  function valtBolag(b: Bolag) {
    setSektioner(rader => rader.map(sk => (sk.nyckel === valjerFor ? { ...sk, bolag: { id: b.id, namn: b.namn } } : sk)));
    setValjerFor(null);
    setVy('form');
  }

  /** En ny bolagssektion med båda typerna. Bolaget väljs — det förifylls aldrig. */
  function laggTillBolag() {
    const nyckel = `ny${sektioner.length}-${falt.length}`;
    setSektioner(rader => [...rader, { nyckel, bolag: null, fast: false }]);
    setFalt(rader => [...rader, ...TYPER.map(({ id: typ }): Falten => ({ nyckel: `${nyckel}:${typ}`, sektion: nyckel, typ, id: null, start: '', nu: '' }))]);
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
      <Ark rubrik="Förslag" onStang={() => { setVy('form'); setFel(null); }}
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
    const aktiv = sektioner.find(sk => sk.nyckel === valjerFor);
    const upptagna = sektioner.filter(sk => sk.nyckel !== valjerFor).map(sk => sk.bolag?.id).filter((i): i is number => i != null);
    return (
      <BolagValjare valt={aktiv?.bolag?.id != null ? { id: aktiv.bolag.id, namn: aktiv.bolag.namn } : null} upptagna={upptagna}
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
          {utanBolag.length > 0 && <p role="status" data-saknar-bolag="" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Välj bolag för varje ny sektion du skrivit in.</p>}
          {harDubblett && <p role="status" data-dubbelt-bolag="" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>Samma bolag finns två gånger. Ta bort ett av dem.</p>}
          <button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Spara'}
          </button>
        </>
      )}>
      <p style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>{manadEtikett(manad)}</p>
      {sektioner.map(sk => (
        <div key={sk.nyckel} data-bolagsektion={sk.nyckel} data-bolag={sk.bolag?.namn ?? ''}>
          <Sektion rubrik={sk.fast ? sk.bolag!.namn : 'Nytt bolag'} kort={false}>
            {!sk.fast && (
              <Rad titel={sk.bolag ? sk.bolag.namn : 'Välj bolag'} pil
                onTryck={() => { setValjerFor(sk.nyckel); setVy('bolag'); }}
                attr={{ 'data-bolag-rad': sk.nyckel, ...(sk.bolag ? null : { 'data-bolag-saknas': '' }) }} />
            )}
            {TYPER.map(({ id: typ, namn }, i) => {
              const f = falt.find(x => x.sektion === sk.nyckel && x.typ === typ)!;
              const bestallt = tolkaVolym(f.nu);
              const inlagt = sk.bolag ? inlagtFor(typ, sk.bolag.namn) : 0;
              // Raden under räknar om medan man skriver. kvar = dämpad (normaltillstånd), fylld och över = grönt, orange bara när något kräver en hand.
              const kort = sk.bolag && f.nu.trim() !== '' && bestallt != null ? lageKort(inlagt, bestallt) : null;
              const under = kort ? kort.text : sk.bolag && inlagt > 0 ? `${fmtM3(inlagt)} inlagt` : undefined;
              return (
                <TalRad key={f.nyckel} etikett={namn} value={f.nu} enhet="m³fub" sista={i === TYPER.length - 1}
                  onChange={v => setFalt(rader => rader.map(r => (r.nyckel === f.nyckel ? { ...r, nu: v } : r)))}
                  under={under} underTon={kort && kort.lage !== 'kvar' ? 'gron' : 'dampad'}
                  attr={{ 'data-bestallning': f.nyckel, 'data-typ': typ }} />
              );
            })}
          </Sektion>
        </div>
      ))}
      <div style={{ marginBottom: AVSTAND.xl }}>
        <Rad titel="Lägg till bolag" pil={false} hoger={<Ikon namn="add" storlek={IKON.rad} farg={FARG.text} />}
          onTryck={laggTillBolag} attr={{ 'data-lagg-till-bolag': '' }} />
        <Rad titel={`Föreslå samma för ${manadKort(forsta)} – ${manadKort(sista)}`} sista
          onTryck={() => { setAvvalda(new Set()); setVy('forslag'); }} attr={{ 'data-foresla': '1' }} />
      </div>
    </Ark>
  );
}
