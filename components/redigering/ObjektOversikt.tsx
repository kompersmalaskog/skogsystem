'use client';
// Objektets ark i Redigering — översikten (Martin 2026-10-23: som skissen "Redigering – objektet", markägarrapportens form).
//
// Svaret först: var står objektet, i ett par ord, och en mening med talen. Sedan frågor, en sektion var:
// Vad saknas? · Special · Stämmer uppgifterna? · Vad har maskinerna skickat? · Är det klart? · Vem kör? · Mer om objektet.
// All text kommer ur lib/redigering/objektVy.ts (+ harledning för förslagen). Allt sparas direkt (`direktSpara`, samma väg
// som det gamla arket) och läses tillbaka av den vägen. Det gamla arkets innehåll ligger orört bakom "Mer om objektet".

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, RADIE, RORELSE, TNUM, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import Flikkontroll from '@/components/design/Flikkontroll';
import { AVTALSFORMER } from '@/lib/trakt/avtalsform';
import { harled, type HarledRad, type HarlettFalt } from '@/lib/redigering/harledning';
import { AVTALSFORM_ORD, HUVUDTYP_VAL, FRAGA, SPECIAL_SVAR, patchForSvar, varforText } from '@/lib/redigering/behoverDig';
import { arRisjobb } from '@/lib/objekt/typ';
import { faltGaller } from '@/lib/redigering/faltGaller';
import { traktTyp } from '@/lib/redigering/fyllSakra';
import {
  objektLage, skotatLage, metaRad, specialTecken, uppgiftRader, saknadeUtanForslag, maskinRader, avslutVarfor, kortDatum,
  type AvslutForslag, type MaskinFilRad, type UppgiftNyckel,
} from '@/lib/redigering/objektVy';

export type MerMal = 'huvudtyp' | 'bolag' | 'skogsagare' | 'atgard' | 'avtalsform' | 'inkopare' | 'vo_nummer' | 'object_name' | 'avslut' | null;

export interface ObjektOversiktProps {
  obj: any;
  set: (o: any) => void;
  /** Alla objektrader (för förslagen: samma namn på ett annat VO). */
  alla: HarledRad[];
  /** Planeringens objekt-rad (status, förare, Vidas uppgifter). null = finns inte; undefined medan den läses. */
  objektRad: any;
  objektRadLaddar: boolean;
  medarbetare: { id: string; namn: string }[];
  statusVal: { varde: string; label: string }[];
  bolagVal: string[];
  skordat: number;
  skotat: number;
  filRader?: MaskinFilRad[];
  filStatus: 'laddar' | 'fel' | 'ok';
  skordForslag: AvslutForslag | null;
  skotForslag: AvslutForslag | null;
  direktSpara: (patch: Record<string, any>) => Promise<boolean>;
  direktSparaAvslut: (typ: 'harvester' | 'forwarder', patch: Record<string, any>) => Promise<boolean>;
  /** Öppna en av det gamla arkets undersidor ('filer', 'skotare' …) eller hela "Mer om objektet" (med ett fält att visa). */
  oppnaFiler: () => void;
  oppnaMer: (mal?: MerMal) => void;
  /** Öppna skotarsidan (fördelning, filfri skotare, ta bort en satt volym). */
  oppnaSkotare: () => void;
  /** Sätt skotad volym (färdigskotat) — samma skrivning som det gamla arkets knapp. */
  sattSkotat: (volym: number) => Promise<boolean>;
  /** Ta bort objektet ur listor och statistik (exkludera). Stänger arket när det lyckats. */
  taBort: () => Promise<boolean>;
}

const VAL_FALT: HarlettFalt[] = ['huvudtyp', 'avtalsform', 'bolag'];
const ETIKETT: Record<HarlettFalt, string> = { huvudtyp: 'Typ', avtalsform: 'Avtalsform', bolag: 'Bolag' };

export default function ObjektOversikt(p: ObjektOversiktProps) {
  const { obj, objektRad } = p;
  const [valFalt, setValFalt] = useState<HarlettFalt | null>(null);
  const [sparar, setSparar] = useState<string | null>(null);
  const [fragaTaBort, setFragaTaBort] = useState(false);

  const lage = objektLage({
    skordat: p.skordat, skotat: p.skotat,
    skordningAvslutad: obj.skordning_avslutad, skotningAvslutad: obj.skotning_avslutad,
    status: objektRad?.status ?? null,
    externSkordning: obj.extern_skordning === true,
    annanSkotar: obj.egen_skotning === true || obj._extern_skotning === true,
  });

  const trakt = objektRad ? { huvudtyp: traktTyp(objektRad.typ), avtalsform: objektRad.avtalsform ?? null, bolag: objektRad.bolag ?? null } : undefined;
  const saknasMedForslag = VAL_FALT
    .filter(f => !(String(obj[f] ?? '').trim()))
    .filter(f => f !== 'avtalsform' || faltGaller('avtalsform', obj))
    .map(f => ({ falt: f, forslag: harled(f, obj, p.alla, trakt) }));
  const saknasOvrigt = saknadeUtanForslag(obj);
  const uppgifter = uppgiftRader(obj, objektRad);

  async function spara(nyckel: string, patch: Record<string, any>): Promise<boolean> {
    setSparar(nyckel);
    const fore = obj;
    p.set({ ...obj, ...patch });
    const ok = await p.direktSpara(patch);
    if (!ok) p.set(fore);
    setSparar(null);
    return ok;
  }

  const valVarden = (f: HarlettFalt): string[] => f === 'huvudtyp' ? [...HUVUDTYP_VAL] : f === 'avtalsform' ? [...AVTALSFORMER, SPECIAL_SVAR] : p.bolagVal;
  const valEtikett = (f: HarlettFalt, v: string) => (f === 'avtalsform' ? AVTALSFORM_ORD[v] ?? v : v);

  // Typbyte när en åtgärd redan står kräver det gamla arkets bekräftelse (åtgärden töms) — dit i stället.
  const tryckUppgift = (n: UppgiftNyckel) => {
    if (n === 'huvudtyp' && String(obj.atgard ?? '').trim()) return p.oppnaMer('huvudtyp');
    if (n === 'huvudtyp' || n === 'avtalsform' || n === 'bolag') return setValFalt(n);
    p.oppnaMer(n);
  };

  const rader = p.filRader ?? [];
  const maskiner = maskinRader(rader, p.skordat, p.skotat);
  const visaSkordning = obj.extern_skordning !== true;
  const visaSkotning = !(obj.egen_skotning === true || obj._extern_skotning === true);

  const skotatNu = skotatLage({
    skordat: p.skordat, skotat: p.skotat, manuell: Number(obj.skotad_volym_manuell) || 0,
    skordningAvslutad: obj.skordning_avslutad, skotningAvslutad: obj.skotning_avslutad,
    annanSkotar: !visaSkotning, risjobb: arRisjobb(obj),
  });
  const sattSkotat = async (volym: number) => {
    setSparar('skotat');
    await p.sattSkotat(volym);
    setSparar(null);
  };

  const godkannAvslut = async (f: AvslutForslag) => {
    setSparar(f.field);
    const patch = { [f.field]: f.datum, [f.autoField]: true };
    const fore = obj;
    p.set({ ...obj, ...patch });
    const ok = await p.direktSparaAvslut(f.maskinTyp, patch);
    if (!ok) p.set(fore);
    setSparar(null);
  };

  return (
    <div data-objekt-oversikt="" style={{ paddingTop: AVSTAND.s }}>
      <style>{designCss}</style>

      <header style={{ marginBottom: AVSTAND.xxl }} data-svar="">
        {metaRad(obj) && <p style={{ margin: 0, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{metaRad(obj)}</p>}
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.text, color: FARG.text2 }}>Var står objektet?</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal, color: lage.klart ? FARG.text2 : FARG.text }} data-lage="">{lage.svar}</p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }}>{lage.mening}</p>
        {obj.special === true && (
          <p style={{ margin: `${AVSTAND.m}px 0 0` }}>
            <span data-special-marke="" style={{ display: 'inline-block', ...TYP.meta, fontWeight: 600, color: FARG.text, background: FARG.upphojt, borderRadius: RADIE.rad, padding: `${AVSTAND.xs}px ${AVSTAND.s}px` }}>
              Special{obj.special_skal ? ` · ${obj.special_skal}` : ''}
            </span>
          </p>
        )}
      </header>

      {(saknasMedForslag.length > 0 || saknasOvrigt.length > 0) && (
        <Sektion rubrik="Vad saknas?" inset
          not={saknasMedForslag.some(s => s.forslag?.varde) ? 'Ett frågetecken är appens förslag. Ett tryck och det är gjort.' : undefined}>
          {saknasMedForslag.map(({ falt, forslag }, i) => (
            <Rad key={falt} titel={ETIKETT[falt]} under={varforText(forslag)}
              attr={{ 'data-saknas': falt }}
              sista={i === saknasMedForslag.length - 1 && saknasOvrigt.length === 0}
              hoger={sparar === falt ? 'Sparar …' : forslag?.varde ? `${valEtikett(falt, forslag.varde)}?` : 'Välj'}
              onTryck={sparar ? undefined : () => forslag?.varde ? spara(falt, patchForSvar(falt, forslag.varde)) : setValFalt(falt)} />
          ))}
          {saknasOvrigt.map((s, i) => (
            <Rad key={s.nyckel} titel={s.etikett} under="Saknas" hoger="Fyll i" attr={{ 'data-saknas': s.nyckel }}
              sista={i === saknasOvrigt.length - 1} onTryck={() => p.oppnaMer(s.nyckel)} />
          ))}
        </Sektion>
      )}

      <Sektion rubrik="Special" inset
        not={specialTecken(obj) ? `${specialTecken(obj)} Är det ett special-objekt?` : 'Vindfällor, stormskadat. Objektet stannar i statistiken men märks Special i maskinvyn.'}>
        <Rad titel="Special-objekt" pil={false} sista={obj.special !== true}
          hoger={<Brytare pa={obj.special === true} etikett="Special-objekt" upptagen={sparar === 'special'}
            onByt={v => spara('special', v ? { special: true } : { special: false, special_skal: null })} />} />
        {obj.special === true && (
          <SkalRad varde={obj.special_skal ?? ''} onSpara={v => spara('special_skal', { special_skal: v })} />
        )}
      </Sektion>

      {uppgifter.length > 0 && (
        <Sektion rubrik="Stämmer uppgifterna?" inset
          not="Appen fyller i det den är säker på. Du rör bara det som är fel – det du ändrar skrivs aldrig över.">
          {uppgifter.map((u, i) => (
            <Rad key={u.nyckel} titel={u.etikett} attr={{ 'data-uppgift': u.nyckel }}
              under={u.kalla ? (u.emot ? <span style={{ color: FARG.orange }}>{u.kalla}</span> : u.kalla) : undefined}
              hoger={<span style={{ fontWeight: 400, color: FARG.text2 }}>{u.varde}</span>}
              sista={i === uppgifter.length - 1} onTryck={() => tryckUppgift(u.nyckel)} />
          ))}
        </Sektion>
      )}

      <Sektion rubrik="Vad har maskinerna skickat?" inset
        not={maskiner.length > 0 ? 'Tryck för att se filerna, flytta en fil till ett annat objekt eller ignorera den.' : undefined}>
        {p.filStatus === 'laddar' ? <Rad titel="Läser filerna …" pil={false} sista />
          : p.filStatus === 'fel' ? <Rad titel={<span style={{ color: FARG.rod }}>Filerna kunde inte läsas</span>} under="Tryck för att försöka i fillistan" sista onTryck={p.oppnaFiler} />
          : maskiner.length === 0 ? <Rad titel="Inget har kommit än" under="Ingen maskin har skickat en fil på objektet" pil={false} sista />
          : maskiner.map((m, i) => (
            <Rad key={m.id} titel={m.titel} under={m.under} hoger={m.hoger ?? undefined} attr={{ 'data-maskin': m.id }}
              sista={i === maskiner.length - 1} onTryck={p.oppnaFiler} />
          ))}
      </Sektion>

      {(visaSkordning || visaSkotning) && (
        <Sektion rubrik="Är det klart?" inset>
          {visaSkordning && (
            <AvslutRad etikett="Skördning" datum={obj.skordning_avslutad} forslag={p.skordForslag} upptagen={sparar === 'skordning_avslutad'}
              sista={!visaSkotning} onGodkann={godkannAvslut} onTryck={() => p.oppnaMer('avslut')} />
          )}
          {visaSkotning && (
            <AvslutRad etikett="Skotning" datum={obj.skotning_avslutad} forslag={p.skotForslag} upptagen={sparar === 'skotning_avslutad'}
              sista={!skotatNu} onGodkann={godkannAvslut} onTryck={() => p.oppnaMer('avslut')} />
          )}
          {skotatNu?.typ === 'forslag' && (
            <div data-skotat-forslag="" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...TYP.listtitel, ...TNUM }}>Skotat {skotatNu.skotat.toLocaleString('sv-SE')} av {skotatNu.skordat.toLocaleString('sv-SE')} m³</div>
                <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Skotaren kör nästan alltid det skördaren avverkat.</div>
              </div>
              <button type="button" disabled={sparar === 'skotat'} onClick={() => sattSkotat(skotatNu.skordat)}
                style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.l}px`, flexShrink: 0, ...TNUM, ...(sparar === 'skotat' ? INAKTIV : {}) }}>
                {sparar === 'skotat' ? 'Sparar …' : `Sätt till ${skotatNu.skordat.toLocaleString('sv-SE')} m³`}
              </button>
            </div>
          )}
          {skotatNu?.typ === 'satt' && (
            <Rad titel="Skotat" under="Satt för hand" sista attr={{ 'data-skotat-satt': '' }} onTryck={p.oppnaSkotare}
              hoger={<span style={{ fontWeight: 400, color: FARG.text2, ...TNUM }}>{skotatNu.varde.toLocaleString('sv-SE')} m³</span>} />
          )}
        </Sektion>
      )}

      <Sektion rubrik="Vem kör?" inset>
        {p.objektRadLaddar ? <Rad titel="Läser planeringen …" pil={false} sista />
          : !objektRad ? <Rad titel="Ingen planering än" under="Status och förare går att sätta när trakten har importerats" pil={false} sista />
          : (
            <>
              <ValjRad etikett="Status" varde={objektRad.status} val={p.statusVal}
                onValj={v => spara('status', { status: v })} />
              <ValjRad etikett="Skördare" varde={objektRad.assigned_skordare_user_id} tom="Ingen vald"
                val={p.medarbetare.map(m => ({ varde: m.id, label: m.namn }))}
                onValj={v => spara('skordare', { assigned_skordare_user_id: v })} />
              <ValjRad etikett="Skotare" varde={objektRad.assigned_skotare_user_id} tom="Ingen vald" sista
                val={p.medarbetare.map(m => ({ varde: m.id, label: m.namn }))}
                onValj={v => spara('skotare', { assigned_skotare_user_id: v })} />
            </>
          )}
      </Sektion>

      <Sektion rubrik="Hur får vi betalt?" inset not="Undantag och ackordgrund finns under Mer om objektet.">
        <div style={{ padding: `${AVSTAND.m}px 0` }} data-betalning="">
          <Flikkontroll flikar={[['ackord', 'Ackord'], ['timpeng', 'Timpeng']] as const}
            aktiv={obj.timpeng === true ? 'timpeng' : 'ackord'}
            onVal={v => { const t = v === 'timpeng'; if (t !== (obj.timpeng === true)) spara('timpeng', { timpeng: t }); }} />
        </div>
      </Sektion>

      <Sektion rubrik="Mer" inset>
        <Rad titel="Mer om objektet" under="Trakt, tidplan, band, dokument, undantag, egenskaper, statistik"
          attr={{ 'data-mer': '' }} onTryck={() => p.oppnaMer(null)} />
        <Rad titel={<span style={{ color: FARG.rod }}>Ta bort objektet</span>} pil={false} sista
          attr={{ 'data-ta-bort': '' }} onTryck={() => setFragaTaBort(true)} />
      </Sektion>

      {fragaTaBort && typeof document !== 'undefined' && createPortal(
        <div><style>{designCss}</style>
          <TaBortArk namn={obj.object_name || (obj.vo_nummer ? `VO ${obj.vo_nummer}` : 'objektet')}
            onStang={() => setFragaTaBort(false)} onTaBort={p.taBort} />
        </div>,
        document.body,
      )}

      {valFalt && typeof document !== 'undefined' && createPortal(
        <div><style>{designCss}</style>
          <ValArk rubrik={FRAGA[valFalt]} varden={valVarden(valFalt)} etikett={v => valEtikett(valFalt, v)}
            hoger={valFalt === 'avtalsform' ? v => (v === SPECIAL_SVAR ? '' : v) : undefined}
            nu={String(obj[valFalt] ?? '').trim() || harled(valFalt, obj, p.alla, trakt)?.varde || null}
            onStang={() => setValFalt(null)}
            onSpara={async v => { const ok = await spara(valFalt, patchForSvar(valFalt, v)); if (ok) setValFalt(null); return ok; }} />
        </div>,
        document.body,
      )}
    </div>
  );
}

function AvslutRad({ etikett, datum, forslag, upptagen, sista, onGodkann, onTryck }: {
  etikett: string; datum?: string | null; forslag: AvslutForslag | null; upptagen: boolean; sista?: boolean;
  onGodkann: (f: AvslutForslag) => void; onTryck: () => void;
}) {
  if (datum || !forslag) {
    return <Rad titel={etikett} hoger={<span style={{ fontWeight: 400, color: FARG.text2 }}>{datum ? `Klar ${kortDatum(datum)}` : 'Inte än'}</span>}
      sista={sista} onTryck={onTryck} attr={{ 'data-avslut': etikett }} />;
  }
  return (
    <div data-avslut={etikett} data-avslut-forslag="" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYP.listtitel }}>{etikett} klar {kortDatum(forslag.datum)}?</div>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{avslutVarfor(forslag)}</div>
      </div>
      <button type="button" disabled={upptagen} onClick={() => onGodkann(forslag)}
        style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.l}px`, flexShrink: 0, ...(upptagen ? INAKTIV : {}) }}>
        {upptagen ? 'Sparar …' : 'Godkänn'}
      </button>
    </div>
  );
}

/** En rad med värdet till höger; en osynlig vanlig väljare ligger över hela raden (telefonens egen lista). */
function ValjRad({ etikett, varde, val, tom = 'Välj', sista, onValj }: {
  etikett: string; varde: string | null | undefined; val: { varde: string; label: string }[]; tom?: string; sista?: boolean;
  onValj: (v: string | null) => void;
}) {
  const vald = val.find(v => v.varde === varde);
  return (
    <div style={{ position: 'relative' }} data-valj={etikett}>
      <Rad titel={etikett} pil sista={sista}
        hoger={<span style={{ fontWeight: 400, color: vald ? FARG.text2 : FARG.text3 }}>{vald?.label ?? tom}</span>} />
      <select aria-label={etikett} value={varde ?? ''} onChange={e => onValj(e.target.value || null)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 17 }}>
        <option value="">{tom}</option>
        {val.map(v => <option key={v.varde} value={v.varde}>{v.label}</option>)}
      </select>
    </div>
  );
}

function Brytare({ pa, etikett, upptagen, onByt }: { pa: boolean; etikett: string; upptagen?: boolean; onByt: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={pa} aria-label={etikett} disabled={upptagen} onClick={() => onByt(!pa)}
      style={{ width: TRAFFYTA.primar + AVSTAND.s, height: AVSTAND.xxl, borderRadius: AVSTAND.xl, border: 'none', cursor: 'pointer', flexShrink: 0, position: 'relative', background: pa ? FARG.gron : FARG.upphojt, transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}`, ...(upptagen ? INAKTIV : {}) }}>
      <span style={{ position: 'absolute', top: AVSTAND.xs, left: pa ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xs, width: AVSTAND.xl, height: AVSTAND.xl, borderRadius: RADIE.cirkel, background: FARG.text, transition: `left ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
    </button>
  );
}

function SkalRad({ varde, onSpara }: { varde: string; onSpara: (v: string | null) => void }) {
  const [text, setText] = useState(varde);
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.s}px 0` }}>
      <span style={{ ...TYP.listtitel, flexShrink: 0 }}>Skäl</span>
      <input value={text} placeholder="t.ex. Vindfällor efter stormen" data-special-skal=""
        onChange={e => setText(e.target.value)}
        onBlur={() => { const v = text.trim() || null; if (v !== (varde.trim() || null)) onSpara(v); }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: FARG.text, ...TYP.text, textAlign: 'right', fontFamily: 'inherit' }} />
    </label>
  );
}

function ValArk({ rubrik, varden, etikett, hoger, nu, onStang, onSpara }: {
  rubrik: string; varden: string[]; etikett: (v: string) => string; hoger?: (v: string) => string; nu: string | null;
  onStang: () => void; onSpara: (v: string) => Promise<boolean>;
}) {
  const [valt, setValt] = useState<string | null>(nu);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  const fot: ReactNode = (
    <>
      {fel && <p style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte spara. Försök igen.</p>}
      <button type="button" disabled={!valt || sparar} data-spara=""
        onClick={async () => { if (!valt) return; setSparar(true); setFel(false); const ok = await onSpara(valt); setSparar(false); if (!ok) setFel(true); }}
        style={{ ...KNAPP.primar, ...(!valt || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Sparar …' : valt ? `Spara ${etikett(valt)}` : 'Välj ett'}
      </button>
    </>
  );
  return (
    <Ark rubrik={rubrik} onStang={onStang} fot={fot}>
      <Sektion rubrik="Välj" kort={false}>
        {varden.map((v, i) => (
          <Rad key={v} titel={etikett(v)} pil={false} sista={i === varden.length - 1} onTryck={() => setValt(v)}
            attr={{ role: 'radio', 'aria-checked': String(valt === v) }}
            hoger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
              {hoger?.(v)}
              <Ikon namn={valt === v ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={valt === v ? FARG.text : FARG.text3} fylld={valt === v} />
            </span>} />
        ))}
      </Sektion>
    </Ark>
  );
}

/** Fråga innan objektet tas bort. Det tas bort ur listor och statistik — maskinernas filer rörs aldrig. */
function TaBortArk({ namn, onStang, onTaBort }: { namn: string; onStang: () => void; onTaBort: () => Promise<boolean> }) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  const fot: ReactNode = (
    <>
      {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Det gick inte att ta bort. Försök igen.</p>}
      <button type="button" disabled={sparar} data-ta-bort-bekrafta=""
        onClick={async () => { setSparar(true); setFel(false); const ok = await onTaBort(); setSparar(false); if (!ok) setFel(true); }}
        style={{ ...KNAPP.primar, background: FARG.rod, color: FARG.text, ...(sparar ? INAKTIV : {}) }}>
        {sparar ? 'Tar bort …' : 'Ta bort'}
      </button>
    </>
  );
  return (
    <Ark rubrik="Ta bort objektet" onStang={onStang} fot={fot}>
      <p style={{ margin: 0, ...TYP.titel }}>{namn}</p>
      <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text }}>Objektet försvinner ur listorna och räknas inte i statistiken.</p>
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>Maskinernas filer finns kvar. Du kan ta tillbaka det under Exkluderade längst ner i listan.</p>
    </Ark>
  );
}
