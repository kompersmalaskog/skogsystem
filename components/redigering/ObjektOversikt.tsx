'use client';
// Objektets ark i Redigering — översikten (Martin 2026-10-23: som skissen "Redigering – objektet", markägarrapportens form).
//
// TRE DELAR (Martin 2026-10-24: "så lätt att ett barn förstår det direkt"):
// 1. Svaret — var står objektet, en mening med talen, när maskinerna senast skickade.
// 2. Gör det här — BARA det som väntar på en människa (förslag att spara, avslut att godkänna, skotat = skördat, fel).
//    Inget att göra = en rad "Inget att göra". Det appen redan gjort (t.ex. klar satt av sig själv) är ingen uppgift.
// 3. Om objektet — EN lista: uppgifterna, klart-datumen, vem som kör, betalning, special. Ett tryck ändrar; varifrån ett
//    värde kom står i arket som öppnas (bara när trakten säger emot står det orange på raden).
// Sist Mer. All text kommer ur lib/redigering/objektVy.ts (+ harledning för förslagen). Allt sparas direkt (`direktSpara`) och läses
// tillbaka av den vägen. Det ENDA arket för ett objekt (Martin 2026-10-24: "två olika menyer … gör den enklare"): det gamla
// "Mer om objektet" är borta. Det som bara fanns där ligger under Mer (filer, skotare, extern skotare, pris, egenskaper,
// dokument, VO-nummer). Planeringens fält (tidplan, band, trakt) bor i Planering › Klar med trakten.

import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, RADIE, RORELSE, TNUM, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import { AVTALSFORMER } from '@/lib/trakt/avtalsform';
import { harled, type HarledRad, type HarlettFalt } from '@/lib/redigering/harledning';
import { AVTALSFORM_ORD, HUVUDTYP_VAL, FRAGA, SPECIAL_SVAR, patchForSvar, varforText } from '@/lib/redigering/behoverDig';
import { arRisjobb } from '@/lib/objekt/typ';
import { faltGaller } from '@/lib/redigering/faltGaller';
import { traktTyp } from '@/lib/redigering/fyllSakra';
import { avslutLage, avslutPatch, avslutUnder, type AvslutLage } from '@/lib/redigering/avslut';
import {
  objektLage, skotatLage, metaRad, specialTecken, uppgiftRader, saknadeUtanForslag, senastFran, avslutVarfor, kortDatum,
  type AvslutForslag, type MaskinFilRad, type UppgiftNyckel,
} from '@/lib/redigering/objektVy';

export type UnderSida = 'filer' | 'skotare' | 'skotning' | 'pris';

/** Text-fälten som rättas i ett eget ark. */
type TextFalt = 'object_name' | 'skogsagare' | 'vo_nummer';

const EGENSKAPER: { key: string; label: string; maskin?: 'harvester' | 'forwarder' }[] = [
  { key: 'extern_skordning', label: 'Extern skördare (annan avverkar)' },
  { key: 'egen_skotning', label: 'Egen skotning (markägaren skotar)', maskin: 'forwarder' },
  { key: 'grot_anpassad', label: 'GROT-anpassad' },
  { key: 'stubbbehandling', label: 'Stubbbehandling', maskin: 'harvester' },
  { key: 'extra_vagn', label: 'Extra vagn', maskin: 'forwarder' },
  { key: 'klippning', label: 'Klippning', maskin: 'forwarder' },
];

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
  /** Maskinspecifika fält (egen skotning, stubbbehandling …) — bara det maskinslagets rader. */
  direktSparaMaskin: (patch: Record<string, any>, typ: 'harvester' | 'forwarder') => Promise<boolean>;
  /** Öppna en undersida: filer, skotare (fördelning, filfri skotare), extern skotare, pris & ersättning. */
  oppnaUnder: (sida: UnderSida) => void;
  /** Åtgärderna att välja bland för objektets typ. */
  atgardVal: string[];
  /** Kort text under raden Filer ("6 filer", "Skotardata saknas"); varning = orange. */
  filerSummering: { text: string; warn: boolean };
  /** Traktens dokument (knappar som öppnar PDF:en), eller null när inga finns. */
  dokument: ReactNode | null;
  /** Markägarens önskemål om GROT (datum + skäl), visas i Egenskaper medan GROT väntar. */
  grotSenast: ReactNode | null;
  /** Sätt skotad volym (färdigskotat) — samma skrivning som det gamla arkets knapp. */
  sattSkotat: (volym: number) => Promise<boolean>;
  /** Ta bort objektet ur listor och statistik (exkludera). Stänger arket när det lyckats. */
  taBort: () => Promise<boolean>;
  /** Objektets alla rader (samma objekt under flera nummer). Klar-läget läses över alla. Utelämnat = bara obj. */
  gruppRader?: any[];
}

const VAL_FALT: HarlettFalt[] = ['huvudtyp', 'avtalsform', 'bolag'];
const ETIKETT: Record<HarlettFalt, string> = { huvudtyp: 'Typ', avtalsform: 'Avtalsform', bolag: 'Bolag' };
type ValFalt = HarlettFalt | 'atgard' | 'betalning';
const BETALNING: Record<string, string> = { ackord: 'Ackord', timpeng: 'Timpeng' };

/** "från trakten" → "Från trakten." — källan som en mening överst i arket. */
const kallaMening = (k: string | null | undefined) => (k ? `${k.charAt(0).toUpperCase()}${k.slice(1)}.` : null);

export default function ObjektOversikt(p: ObjektOversiktProps) {
  const { obj, objektRad } = p;
  const [valFalt, setValFalt] = useState<ValFalt | null>(null);
  const [textFalt, setTextFalt] = useState<TextFalt | null>(null);
  const [avslutTyp, setAvslutTyp] = useState<'harvester' | 'forwarder' | null>(null);
  const [egenskaperOppen, setEgenskaperOppen] = useState(false);
  const [dokumentOppet, setDokumentOppet] = useState(false);
  const [sparar, setSparar] = useState<string | null>(null);
  const [fragaTaBort, setFragaTaBort] = useState(false);

  const grupp = p.gruppRader && p.gruppRader.length ? p.gruppRader : [obj];
  const skordLage = avslutLage(grupp, 'harvester');
  const skotLage = avslutLage(grupp, 'forwarder');
  const skordDatum = 'datum' in skordLage ? skordLage.datum : null;
  const skotDatum = 'datum' in skotLage ? skotLage.datum : null;

  const lage = objektLage({
    skordat: p.skordat, skotat: p.skotat,
    skordningAvslutad: skordDatum, skotningAvslutad: skotDatum,
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

  const valVarden = (f: ValFalt): string[] => f === 'huvudtyp' ? [...HUVUDTYP_VAL] : f === 'avtalsform' ? [...AVTALSFORMER, SPECIAL_SVAR] : f === 'atgard' ? p.atgardVal : f === 'betalning' ? Object.keys(BETALNING) : p.bolagVal;
  const valEtikett = (f: ValFalt, v: string) => (f === 'avtalsform' ? AVTALSFORM_ORD[v] ?? v : f === 'betalning' ? BETALNING[v] ?? v : v);
  const valRubrik = (f: ValFalt) => (f === 'atgard' ? 'Vilken åtgärd?' : f === 'betalning' ? 'Hur får vi betalt?' : FRAGA[f]);
  const valNu = (f: ValFalt): string | null => {
    if (f === 'betalning') return obj.timpeng === true ? 'timpeng' : 'ackord';
    return String(obj[f] ?? '').trim() || (f !== 'atgard' ? harled(f, obj, p.alla, trakt)?.varde : null) || null;
  };
  // Typbyte när en åtgärd redan står: åtgärden hör till typen och töms — arket säger det innan man sparar.
  const atgardTomsVid = (v: string) => valFalt === 'huvudtyp' && String(obj.atgard ?? '').trim() !== '' && v !== obj.huvudtyp;
  const valPatch = (f: ValFalt, v: string): Record<string, any> => {
    if (f === 'atgard') return { atgard: v };
    if (f === 'betalning') return { timpeng: v === 'timpeng' };
    const patch: Record<string, any> = patchForSvar(f, v);
    if (atgardTomsVid(v)) patch.atgard = '';
    return patch;
  };

  const tryckFalt = (n: UppgiftNyckel | 'object_name') => {
    if (n === 'huvudtyp' || n === 'avtalsform' || n === 'bolag' || n === 'atgard') return setValFalt(n);
    if (n === 'object_name' || n === 'skogsagare' || n === 'vo_nummer') return setTextFalt(n);
  };
  const textVarde = (f: TextFalt) => String(obj[f] ?? '');
  // Markägaren heter skogsagare i dim_objekt men markagare i routern (speglas till planeringens objekt).
  const textPatch = (f: TextFalt, v: string): Record<string, any> => (f === 'skogsagare' ? { markagare: v } : { [f]: v });
  const aktivaEgenskaper = EGENSKAPER.filter(e => obj[e.key] === true).map(e => e.label.replace(/ \(.*\)$/, ''));

  const senast = p.filStatus === 'ok' ? senastFran(p.filRader ?? []) : null;
  // Källan till ett värde står i arket som öppnas, inte på raden (bara "trakten säger …" står på raden).
  const kallaFor = (n: UppgiftNyckel | 'object_name') => uppgifter.find(u => u.nyckel === n) ?? null;
  const visaSkordning = obj.extern_skordning !== true;
  const visaSkotning = !(obj.egen_skotning === true || obj._extern_skotning === true);

  const skotatNu = skotatLage({
    skordat: p.skordat, skotat: p.skotat, manuell: Number(obj.skotad_volym_manuell) || 0,
    skordningAvslutad: skordDatum, skotningAvslutad: skotDatum,
    annanSkotar: !visaSkotning, risjobb: arRisjobb(obj),
  });
  const sattSkotat = async (volym: number) => {
    setSparar('skotat');
    await p.sattSkotat(volym);
    setSparar(null);
  };

  const godkannAvslut = async (f: AvslutForslag) => {
    setSparar(f.field);
    const patch = avslutPatch(f.maskinTyp, { godkann: f.datum });
    const fore = obj;
    p.set({ ...obj, ...patch });
    const ok = await p.direktSparaAvslut(f.maskinTyp, patch);
    if (!ok) p.set(fore);
    setSparar(null);
  };

  // "Gör det här": en avslutsfråga bara när maskinen föreslår ett datum och ingen (människa eller app) bestämt något.
  const skordGor = visaSkordning && !!p.skordForslag && skordLage.lage === 'oppen';
  const skotGor = visaSkotning && !!p.skotForslag && skotLage.lage === 'oppen';
  const gor = [
    ...saknasMedForslag.map(s => `s:${s.falt}`),
    ...saknasOvrigt.map(s => `o:${s.nyckel}`),
    ...(skordGor ? ['a:skord'] : []),
    ...(skotGor ? ['a:skot'] : []),
    ...(skotatNu?.typ === 'forslag' ? ['skotat'] : []),
    ...(p.filStatus === 'fel' ? ['filer'] : []),
  ];
  const gorAntal = gor.length;
  const sistaGor = (nyckel: string) => gor[gor.length - 1] === nyckel;

  return (
    <div data-objekt-oversikt="" style={{ paddingTop: AVSTAND.s }}>
      <style>{designCss}</style>

      <header style={{ marginBottom: AVSTAND.xxl }} data-svar="">
        {metaRad(obj) && <p style={{ margin: 0, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{metaRad(obj)}</p>}
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.text, color: FARG.text2 }}>Var står objektet?</p>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal, color: lage.klart ? FARG.text2 : FARG.text }} data-lage="">{lage.svar}</p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }}>{lage.mening}</p>
        {senast && <p data-senast="" style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, ...TNUM, color: FARG.text2 }}>{senast}</p>}
        {obj.special === true && (
          <p style={{ margin: `${AVSTAND.m}px 0 0` }}>
            <span data-special-marke="" style={{ display: 'inline-block', ...TYP.meta, fontWeight: 600, color: FARG.text, background: FARG.upphojt, borderRadius: RADIE.rad, padding: `${AVSTAND.xs}px ${AVSTAND.s}px` }}>
              Special{obj.special_skal ? ` · ${obj.special_skal}` : ''}
            </span>
          </p>
        )}
      </header>

      <Sektion rubrik="Gör det här" inset
        not={saknasMedForslag.some(s => s.forslag?.varde) ? 'Ett frågetecken är appens förslag. Ett tryck och det är gjort.' : undefined}>
        <div data-gor="">
          {gorAntal === 0 && <Rad titel="Inget att göra" under="Allt som behövs är ifyllt." pil={false} sista attr={{ 'data-gor-tomt': '' }} />}
          {saknasMedForslag.map(({ falt, forslag }) => (
            <Rad key={falt} titel={`${ETIKETT[falt]} saknas`} under={varforText(forslag)}
              attr={{ 'data-saknas': falt }} sista={sistaGor(`s:${falt}`)}
              hoger={sparar === falt ? 'Sparar …' : forslag?.varde ? `${valEtikett(falt, forslag.varde)}?` : 'Välj'}
              onTryck={sparar ? undefined : () => forslag?.varde ? spara(falt, patchForSvar(falt, forslag.varde)) : setValFalt(falt)} />
          ))}
          {saknasOvrigt.map(s => (
            <Rad key={s.nyckel} titel={`${s.etikett} saknas`} hoger="Fyll i" attr={{ 'data-saknas': s.nyckel }}
              sista={sistaGor(`o:${s.nyckel}`)} onTryck={() => tryckFalt(s.nyckel)} />
          ))}
          {skordGor && p.skordForslag && (
            <AvslutForslagRad etikett="Skördning" forslag={p.skordForslag} upptagen={sparar === 'skordning_avslutad'}
              sista={sistaGor('a:skord')} onGodkann={godkannAvslut} />
          )}
          {skotGor && p.skotForslag && (
            <AvslutForslagRad etikett="Skotning" forslag={p.skotForslag} upptagen={sparar === 'skotning_avslutad'}
              sista={sistaGor('a:skot')} onGodkann={godkannAvslut} />
          )}
          {skotatNu?.typ === 'forslag' && (
            <div data-skotat-forslag="" style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, borderBottom: sistaGor('skotat') ? 'none' : `1px solid ${FARG.linje}` }}>
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
          {p.filStatus === 'fel' && (
            <Rad titel={<span style={{ color: FARG.rod }}>Filerna kunde inte läsas</span>} under="Tryck för att försöka i fillistan"
              sista attr={{ 'data-filer-fel': '' }} onTryck={() => p.oppnaUnder('filer')} />
          )}
        </div>
      </Sektion>

      <Sektion rubrik="Om objektet" inset>
        <div data-om="">
          {uppgifter.filter(u => u.nyckel !== 'vo_nummer').map(u => (
            <Rad key={u.nyckel} titel={u.etikett} attr={{ 'data-uppgift': u.nyckel }}
              under={u.emot && u.kalla ? <span style={{ color: FARG.orange }}>{u.kalla}</span> : undefined}
              hoger={<span style={{ fontWeight: 400, color: FARG.text2 }}>{u.varde}</span>}
              onTryck={() => tryckFalt(u.nyckel)} />
          ))}
          {visaSkordning && (
            <AvslutRad etikett="Skördning" lage={skordLage} onTryck={() => setAvslutTyp('harvester')} />
          )}
          {visaSkotning && (
            <AvslutRad etikett="Skotning" lage={skotLage} onTryck={() => setAvslutTyp('forwarder')} />
          )}
          {skotatNu?.typ === 'satt' && (
            <Rad titel="Skotat" under="Satt för hand" attr={{ 'data-skotat-satt': '' }} onTryck={() => p.oppnaUnder('skotare')}
              hoger={<span style={{ fontWeight: 400, color: FARG.text2, ...TNUM }}>{skotatNu.varde.toLocaleString('sv-SE')} m³</span>} />
          )}
          {p.objektRadLaddar ? <Rad titel="Läser planeringen …" pil={false} />
            : !objektRad ? <Rad titel="Vem kör" under="Ingen planering än – går att sätta när trakten har importerats" pil={false} />
            : (
              <>
                <ValjRad etikett="Status" varde={objektRad.status} val={p.statusVal}
                  onValj={v => spara('status', { status: v })} />
                <ValjRad etikett="Skördare" varde={objektRad.assigned_skordare_user_id} tom="Ingen vald"
                  val={p.medarbetare.map(m => ({ varde: m.id, label: m.namn }))}
                  onValj={v => spara('skordare', { assigned_skordare_user_id: v })} />
                <ValjRad etikett="Skotare" varde={objektRad.assigned_skotare_user_id} tom="Ingen vald"
                  val={p.medarbetare.map(m => ({ varde: m.id, label: m.namn }))}
                  onValj={v => spara('skotare', { assigned_skotare_user_id: v })} />
              </>
            )}
          <Rad titel="Betalning" attr={{ 'data-betalning': '' }} onTryck={() => setValFalt('betalning')}
            hoger={<span style={{ fontWeight: 400, color: FARG.text2 }}>{obj.timpeng === true ? 'Timpeng' : 'Ackord'}</span>} />
          <Rad titel="Special-objekt" pil={false} sista={obj.special !== true}
            under={specialTecken(obj) ? <span style={{ color: FARG.orange }}>{specialTecken(obj)}</span> : 'Vindfällor, stormskadat'}
            hoger={<Brytare pa={obj.special === true} etikett="Special-objekt" upptagen={sparar === 'special'}
              onByt={v => spara('special', v ? { special: true } : { special: false, special_skal: null })} />} />
          {obj.special === true && (
            <SkalRad varde={obj.special_skal ?? ''} onSpara={v => spara('special_skal', { special_skal: v })} />
          )}
        </div>
      </Sektion>

      <Sektion rubrik="Mer" inset>
        <Rad titel="Filer" attr={{ 'data-mer-rad': 'filer' }} onTryck={() => p.oppnaUnder('filer')}
          under={p.filerSummering.warn ? <span style={{ color: FARG.orange }}>{p.filerSummering.text}</span> : p.filerSummering.text} />
        <Rad titel="Skotare" under="Färdigskotat och fördelning mellan skotare" attr={{ 'data-mer-rad': 'skotare' }}
          onTryck={() => p.oppnaUnder('skotare')} />
        <Rad titel="Extern skotare" under={obj._extern_skotning ? 'Inlejd skotare' : 'Ingen inlejd'} attr={{ 'data-mer-rad': 'skotning' }}
          onTryck={() => p.oppnaUnder('skotning')} />
        <Rad titel="Pris och ersättning" under="Ackordgrund och undantag" attr={{ 'data-mer-rad': 'pris' }}
          onTryck={() => p.oppnaUnder('pris')} />
        <Rad titel="Egenskaper" under={aktivaEgenskaper.length ? aktivaEgenskaper.join(' · ') : 'Inga'} attr={{ 'data-mer-rad': 'egenskaper' }}
          onTryck={() => setEgenskaperOppen(true)} />
        {p.dokument && (
          <Rad titel="Dokument" under="Traktdirektiv och traktkarta" attr={{ 'data-mer-rad': 'dokument' }}
            onTryck={() => setDokumentOppet(true)} />
        )}
        <Rad titel="VO-nummer" attr={{ 'data-mer-rad': 'vo_nummer' }} onTryck={() => setTextFalt('vo_nummer')}
          hoger={<span style={{ fontWeight: 400, color: FARG.text2, ...TNUM }}>{obj.vo_nummer || 'Saknas'}</span>} />
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
          <ValArk rubrik={valRubrik(valFalt)} varden={valVarden(valFalt)} etikett={v => valEtikett(valFalt, v)}
            hoger={valFalt === 'avtalsform' ? v => (v === SPECIAL_SVAR ? '' : v) : undefined}
            not={v => (atgardTomsVid(v) ? `Åtgärden "${obj.atgard}" hör till typen och töms. Välj den på nytt efteråt.` : null)}
            kalla={valFalt === 'betalning' ? 'Undantag och ackordgrund finns under Mer › Pris och ersättning.' : kallaMening(kallaFor(valFalt)?.kalla)}
            kallaEmot={valFalt !== 'betalning' && kallaFor(valFalt)?.emot === true}
            nu={valNu(valFalt)}
            onStang={() => setValFalt(null)}
            onSpara={async v => {
              // Samma värde som redan står: inget att spara.
              const lagrat = valFalt === 'betalning' ? (obj.timpeng === true ? 'timpeng' : 'ackord') : String(obj[valFalt] ?? '').trim();
              if (v === lagrat) { setValFalt(null); return true; }
              const ok = await spara(valFalt, valPatch(valFalt, v)); if (ok) setValFalt(null); return ok;
            }} />
        </div>,
        document.body,
      )}

      {textFalt && typeof document !== 'undefined' && createPortal(
        <div><style>{designCss}</style>
          <TextArk falt={textFalt} varde={textVarde(textFalt)}
            kalla={textFalt === 'skogsagare' ? kallaMening(kallaFor('skogsagare')?.kalla) : null}
            kallaEmot={textFalt === 'skogsagare' && kallaFor('skogsagare')?.emot === true}
            onStang={() => setTextFalt(null)}
            onSpara={async v => { const ok = await spara(textFalt, textPatch(textFalt, v)); if (ok) setTextFalt(null); return ok; }} />
        </div>,
        document.body,
      )}

      {avslutTyp && typeof document !== 'undefined' && createPortal(
        <div><style>{designCss}</style>
          <AvslutArk etikett={avslutTyp === 'harvester' ? 'Skördning' : 'Skotning'}
            lage={avslutTyp === 'harvester' ? skordLage : skotLage}
            onStang={() => setAvslutTyp(null)}
            onSpara={async val => {
              const patch = avslutPatch(avslutTyp, val);
              const fore = obj;
              p.set({ ...obj, ...patch });
              const ok = await p.direktSparaAvslut(avslutTyp, patch);
              if (!ok) p.set(fore); else setAvslutTyp(null);
              return ok;
            }} />
        </div>,
        document.body,
      )}

      {egenskaperOppen && typeof document !== 'undefined' && createPortal(
        <div><style>{designCss}</style>
          <Ark rubrik="Egenskaper" onStang={() => setEgenskaperOppen(false)} stang="Klar">
            <Sektion rubrik="Objektet" kort={false}
              not={obj.extern_skordning === true ? 'Annan maskin avverkar – vi skotar bara. Skördardata förväntas inte.' : undefined}>
              {EGENSKAPER.map((e, i) => (
                <Rad key={e.key} titel={e.label} pil={false} sista={i === EGENSKAPER.length - 1} attr={{ 'data-egenskap': e.key }}
                  hoger={<Brytare pa={obj[e.key] === true} etikett={e.label} upptagen={sparar === e.key}
                    onByt={async v => {
                      setSparar(e.key);
                      const fore = obj;
                      p.set({ ...obj, [e.key]: v });
                      const ok = e.maskin ? await p.direktSparaMaskin({ [e.key]: v }, e.maskin) : await p.direktSpara({ [e.key]: v });
                      if (!ok) p.set(fore);
                      setSparar(null);
                    }} />} />
              ))}
            </Sektion>
            {obj.grot_anpassad === true && (
              <Sektion rubrik="GROT" kort={false}>
                <Rad titel="GROT hämtad" pil={false} sista attr={{ 'data-grot-hamtad': '' }}
                  hoger={obj.grot_hamtad
                    ? <button type="button" onClick={() => spara('grot_hamtad', { grot_hamtad: null })}
                        style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.l}px`, ...TNUM }}>{kortDatum(obj.grot_hamtad)} · Ångra</button>
                    : <button type="button" onClick={() => spara('grot_hamtad', { grot_hamtad: new Date().toISOString().slice(0, 10) })}
                        style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.l}px` }}>Hämtad idag</button>} />
                {!obj.grot_hamtad && p.grotSenast}
              </Sektion>
            )}
          </Ark>
        </div>,
        document.body,
      )}

      {dokumentOppet && p.dokument && typeof document !== 'undefined' && createPortal(
        <div><style>{designCss}</style>
          <Ark rubrik="Dokument" onStang={() => setDokumentOppet(false)} stang="Klar">{p.dokument}</Ark>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Klart-läget i "Om objektet": datumet till höger, varför under (appen satte det / du sa inte klar). */
function AvslutRad({ etikett, lage, sista, onTryck }: { etikett: string; lage: AvslutLage; sista?: boolean; onTryck: () => void }) {
  const datum = 'datum' in lage ? lage.datum : null;
  return <Rad titel={etikett} under={avslutUnder(lage) ?? undefined}
    hoger={<span style={{ fontWeight: 400, color: FARG.text2 }}>{datum ? `Klar ${kortDatum(datum)}` : 'Inte än'}</span>}
    sista={sista} onTryck={onTryck} attr={{ 'data-avslut': etikett, 'data-avslut-lage': lage.lage }} />;
}

/** Maskinens förslag i "Gör det här": "Skördning klar 14 okt?" och Godkänn. */
function AvslutForslagRad({ etikett, forslag, upptagen, sista, onGodkann }: {
  etikett: string; forslag: AvslutForslag; upptagen: boolean; sista?: boolean; onGodkann: (f: AvslutForslag) => void;
}) {
  return (
    <div data-avslut-forslag={etikett} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px 0`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
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

/** Källan till värdet, överst i arket som rättar det. Orange när trakten säger något annat. */
function KallaRad({ text, emot }: { text: string | null | undefined; emot?: boolean }) {
  if (!text) return null;
  return <p data-ark-kalla="" style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.text, color: emot ? FARG.orange : FARG.text2 }}>{text}</p>;
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

export function Brytare({ pa, etikett, upptagen, onByt }: { pa: boolean; etikett: string; upptagen?: boolean; onByt: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={pa} aria-label={etikett} disabled={upptagen} onClick={() => onByt(!pa)}
      style={{ width: TRAFFYTA.primar + AVSTAND.s, height: TRAFFYTA.min, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', ...(upptagen ? INAKTIV : {}) }}>
      {/* Tryckytan är 44 px hög; själva brytaren som syns är 32 px. */}
      <span data-brytare-spar="" style={{ position: 'relative', display: 'block', width: '100%', height: AVSTAND.xxl, borderRadius: AVSTAND.xl, background: pa ? FARG.gron : FARG.upphojt, transition: `background ${RORELSE.tryck}ms ${RORELSE.kurva}` }}>
        <span style={{ position: 'absolute', top: AVSTAND.xs, left: pa ? AVSTAND.xl + AVSTAND.xs : AVSTAND.xs, width: AVSTAND.xl, height: AVSTAND.xl, borderRadius: RADIE.cirkel, background: FARG.text, transition: `left ${RORELSE.tryck}ms ${RORELSE.kurva}` }} />
      </span>
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

function ValArk({ rubrik, varden, etikett, hoger, not, kalla, kallaEmot, nu, onStang, onSpara }: {
  rubrik: string; varden: string[]; etikett: (v: string) => string; hoger?: (v: string) => string; not?: (v: string) => string | null; nu: string | null;
  kalla?: string | null; kallaEmot?: boolean;
  onStang: () => void; onSpara: (v: string) => Promise<boolean>;
}) {
  const [valt, setValt] = useState<string | null>(nu);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  const fot: ReactNode = (
    <>
      {valt && not?.(valt) && <p data-val-not="" style={{ margin: 0, ...TYP.meta, color: FARG.orange }}>{not(valt)}</p>}
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
      <KallaRad text={kalla} emot={kallaEmot} />
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

const TEXT_ETIKETT: Record<TextFalt, { rubrik: string; platshallare: string }> = {
  object_name: { rubrik: 'Namn', platshallare: 'Objektets namn' },
  skogsagare: { rubrik: 'Markägare', platshallare: 'Markägarens namn' },
  vo_nummer: { rubrik: 'VO-nummer', platshallare: 'VO-nummer' },
};

/**
 * Rätta ett textfält. Tomt sparas aldrig (ett tomt namn eller VO skulle nolla planeringens spegling).
 * VO-numret frågar en gång till innan det sparas (Martin 2026-10-24): maskinernas filer ligger under numret.
 */
function TextArk({ falt, varde, kalla, kallaEmot, onStang, onSpara }: {
  falt: TextFalt; varde: string; kalla?: string | null; kallaEmot?: boolean; onStang: () => void; onSpara: (v: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(varde);
  const [fraga, setFraga] = useState(false);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  const ny = text.trim();
  const andrad = ny !== '' && ny !== varde.trim();
  const { rubrik, platshallare } = TEXT_ETIKETT[falt];
  const sparaNu = async () => { setSparar(true); setFel(false); const ok = await onSpara(ny); setSparar(false); if (!ok) setFel(true); };

  if (fraga) {
    const fot: ReactNode = (
      <>
        {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte spara. Försök igen.</p>}
        <button type="button" disabled={sparar} data-vo-bekrafta="" onClick={sparaNu}
          style={{ ...KNAPP.primar, ...TNUM, ...(sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : `Ja, ändra till ${ny}`}</button>
        <button type="button" disabled={sparar} onClick={() => setFraga(false)} style={{ ...KNAPP.sekundar }}>Nej, gå tillbaka</button>
      </>
    );
    return (
      <Ark rubrik="Ändra VO-numret?" onStang={onStang} fot={fot}>
        <p data-vo-fraga="" style={{ margin: 0, ...TYP.titel }}>Vill du verkligen ändra VO-numret?</p>
        <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, ...TNUM }}>Från {varde.trim() || 'inget'} till {ny}.</p>
        <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>Maskinernas filer kopplas till objektet på VO-numret. Fel nummer gör att produktionen inte syns här.</p>
      </Ark>
    );
  }

  const fot: ReactNode = (
    <>
      {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte spara. Försök igen.</p>}
      <button type="button" disabled={!andrad || sparar} data-spara=""
        onClick={() => (falt === 'vo_nummer' ? setFraga(true) : sparaNu())}
        style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Sparar …' : falt === 'vo_nummer' ? 'Ändra' : 'Spara'}
      </button>
    </>
  );
  return (
    <Ark rubrik={rubrik} onStang={onStang} fot={fot}>
      <KallaRad text={kalla} emot={kallaEmot} />
      <input autoFocus value={text} placeholder={platshallare} data-text-falt={falt}
        inputMode={falt === 'vo_nummer' ? 'numeric' : undefined}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && andrad) (falt === 'vo_nummer' ? setFraga(true) : sparaNu()); }}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', outline: 'none' }} />
    </Ark>
  );
}

/**
 * Sätt klar, säg "Inte klar än", eller låt appen avgöra. Appen sätter klar av sig själv när maskinen kört vidare till
 * ett annat objekt — men människans val går alltid före och rörs aldrig av automatiken.
 */
function AvslutArk({ etikett, lage, onStang, onSpara }: {
  etikett: string; lage: AvslutLage;
  onStang: () => void; onSpara: (val: { klar: string } | 'inte' | 'appen') => Promise<boolean>;
}) {
  const datum = 'datum' in lage ? lage.datum : null;
  const [dag, setDag] = useState(String(datum ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState(false);
  const kor = async (val: { klar: string } | 'inte' | 'appen') => { setSparar(true); setFel(false); const ok = await onSpara(val); setSparar(false); if (!ok) setFel(true); };
  const handVal = lage.lage === 'hand' || lage.lage === 'ej_klar';
  const fot: ReactNode = (
    <>
      {fel && <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>Kunde inte spara. Försök igen.</p>}
      <button type="button" disabled={!dag || sparar} data-avslut-spara="" onClick={() => kor({ klar: dag })}
        style={{ ...KNAPP.primar, ...TNUM, ...(!dag || sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : `Klar ${kortDatum(dag)}`}</button>
      {lage.lage !== 'ej_klar' && (
        <button type="button" disabled={sparar} data-avslut-inte="" onClick={() => kor('inte')} style={{ ...KNAPP.sekundar }}>Inte klar än</button>
      )}
      {handVal && (
        <button type="button" disabled={sparar} data-avslut-appen="" onClick={() => kor('appen')} style={{ ...KNAPP.sekundar }}>Låt appen avgöra</button>
      )}
    </>
  );
  const text = lage.lage === 'auto'
    ? `Appen satte klar: ${lage.skal}.`
    : lage.lage === 'ej_klar'
      ? 'Du har sagt att den inte är klar. Appen sätter inget förrän du väljer.'
      : lage.lage === 'hand'
        ? 'Du har satt datumet. Appen ändrar det aldrig.'
        : 'Appen sätter klar av sig själv när maskinen kört vidare till ett annat objekt.';
  return (
    <Ark rubrik={`När blev ${etikett.toLowerCase()} klar?`} onStang={onStang} fot={fot}>
      <p data-avslut-text="" style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>{text}</p>
      <input type="date" value={dag} onChange={e => setDag(e.target.value)} data-avslut-datum=""
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', colorScheme: 'dark' }} />
    </Ark>
  );
}
