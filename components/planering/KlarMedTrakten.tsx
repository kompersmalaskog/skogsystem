'use client';

// "KLAR MED TRAKTEN?" — planerarens färdigplanering. Två lägen, samma rader beter sig likadant:
//
//   GÖRA (något är kvar):   "N saker kvar" + stor knapp "Gå igenom". Knappen tar planeraren genom det som är kvar, ETT STEG I TAGET (`StegRam` i KlarSteg: "‹ traktnamn",
//                           framstegsstreck, rubrik, innehåll, stora knappar, Föregående / Hoppa över). Listan "Behöver dig" ligger kvar under för den som vill hoppa direkt —
//                           varje rad öppnar SAMMA steg, bara det steget. Inga rader fälls ut på plats, inga skrivfält i listan.
//   SE (allt klart, och efter Klar för maskin): en sida som ett ifyllt A4 (KlarSe). Ett tryck på en sektion öppnar samma steg för att ändra; efteråt är man tillbaka.
//
// Stegen (= områdena som kan vara kvar, `status.antalKvar` räknar dem): Avlägg · Basväg · Förutsättningar · Maskiner · Medelstam · Har du … · Prognos · sist Sammanfattning
// + Klar för maskin. Ett steg som redan är klart hoppas över. KLAR FÖR MASKIN SPÄRRAR ALDRIG.
// Ren presentation: sidan räknar (lib/klarTrakt) och sparar; kortet ritar och säger vad som trycktes.

import React, { useEffect, useState } from 'react';
import { AVSTAND, FARG, KNAPP, RADIE, TRAFFYTA, TYP, medSafeBotten } from '@/lib/design/tokens';
import { HAR_DU_FRAGOR, type HarDuId, type HarDuSvar, type HarDuSvarVarde, type KlarStatus, type UtforareVal, type Varning, type VedDetaljer } from '@/lib/klarTrakt';
import { STEG_NAMN, genomgangSteg, kvarSteg, type StegId } from '@/lib/klarSteg';
import type { PrestationVarning } from '@/lib/g15Forslag';
import { Gruppkort, Huvud, Pil, Rubrik } from './infoDelar';
import KlarSe from './KlarSe';
import KlarVed from './KlarVed';
import { AvlaggBody, BasvagBody, ForutsBody, HarDuSteg, MaskinerBody, MedelstamBody, OvrigtBody, PrognosBody, StegRam, StorKnapp } from './KlarSteg';

export { fmtPrestation } from '@/lib/klarFormat';

/** varning = skälet till att maskinen inte borde stå här (såld, klarar inte trakttypen) — den visas, göms aldrig */
export interface MaskinAlternativ { id: string; namn: string; varning?: string }

export interface KlarPatch {
  barighet?: string | null; terrang?: string | null; skotningsavstand?: string | null;
  skordare?: UtforareVal; skotare?: UtforareVal;
  skordareTimmar?: string; skotareTimmar?: string; volym?: string; areal?: string; medelstam?: string;
  basvagKravs?: boolean; basvagTimmar?: string;
  bandSkordare?: boolean; bandParSkordare?: string | null; bandSkotare?: boolean; bandParSkotare?: string | null;
  breddat?: boolean; konfiguration?: string; risDirekt?: boolean; extraVagn?: boolean;
  trailerIn?: boolean; trailerKommentar?: string; manuellFallning?: boolean; manuellFallningText?: string; ved?: boolean;
}

/** En maskins del av prognosen: G15-timmar (fältets värde — det skrivna, annars förslaget) och det som hör till det. */
export interface MaskinPrognos {
  /** fältets värde i G15-tim. Tomt = varken skrivet eller något förslag. */
  tim: string;
  /** förslaget ur uppmätt utfall: talet och metaraden om källan + det uppmätta felet. null = inget förslag. */
  forslag: { g15: number; kalla: string; /** "slutavverkningar" / "gallringar" när förslaget är snitt över alla trakter av typen för att medelstam saknas */ snittOver?: string } | null;
  /** varför förslag saknas — null när det finns ett förslag */
  saknas: string | null;
  /** fältet avviker från förslaget */
  andrad: boolean;
  /** m³fub per G15-timme = volym / fältets tim. Uträknad, aldrig ett eget fält. null = något saknas. */
  prestation: number | null;
  /** siffran ligger utanför förslagets intervall (lib/g15Forslag `prestationVarning`) — null = inom intervallet eller inget förslag/intervall att jämföra med */
  varning: PrestationVarning | null;
}

export interface KlarMedTraktenProps {
  namn: string;
  status: KlarStatus;
  /** objektets status: 'oplanerad' | 'planerad' … — styr knappen längst ner och vilket läge som visas */
  objektStatus: string;
  /** klar_skickad_timestamp (ISO) — när trakten gjordes klar för maskin */
  klarSkickadAt: string | null;
  /** "Slutavverkning · Rp · 3,6 ha · 1 800 m³fub" — raden under rubriken i SE-läget (åtgärd · areal · volym); saknas den visas den inte */
  faktaRad?: string;
  /** sammanfattning = "5 st · 599 m" (en rad, inte en rad per väg); null = inga ritade eller längd saknas på någon (då står bara texterna) */
  basvag: { texter: string[]; kravs: boolean | null; timmar: string; sammanfattning?: string | null };
  barighet: string | null; terrang: string | null; skotningsavstand: string | null;
  skordare: UtforareVal; skotare: UtforareVal;
  maskiner: { skordare: MaskinAlternativ[]; skotare: MaskinAlternativ[] };
  prognos: {
    volym: string; areal: string; medelstam: string;
    skordare: MaskinPrognos; skotare: MaskinPrognos;
    godkandAv: string | null; godkandAt: string | null;
  };
  harDu: HarDuSvar;
  varningar: Varning[];
  /** medarbetar-id → förnamn (för "Svarat av …"); null = okänd */
  avNamn: (id: string | null) => string | null;
  ovrigt: {
    ved: boolean; vedText: string;
    bandSkordare: boolean | null; bandParSkordare: string | null; bandSkotare: boolean | null; bandParSkotare: string | null;
    breddat: boolean; konfiguration: string;
    /** konfiguration (bred/smal) gäller bara Elephant King (A110148) — som i den gamla Fakta-fliken */
    visaKonfiguration: boolean;
    risDirekt: boolean; extraVagn: boolean;
    trailerIn: boolean; trailerKommentar: string; manuellFallning: boolean; manuellFallningText: string;
  };
  ved: VedDetaljer;
  /** objekt.info_anteckningar — fältet är borttaget; finns gammal text visas den som en grå rad, aldrig raderad */
  gamlaAnteckningar: string;
  /** databasen saknar de nya kolumnerna (migrationen ej körd) / fälten gick inte att läsa: kortet visar det, svar sparas inte */
  datalage: 'ok' | 'migrering-saknas' | 'lasfel';
  sparFel: string | null;
  klarSparar: boolean;
  /** när ved-vyn är öppen vid öppning (efter att ved-symbolen satts på kartan) */
  startMedVed?: boolean;
  /** i avläggssteget: något som visar kartan (sidan har kartan bakom arket; riggen en yta) */
  kartaYta?: React.ReactNode;
  /** öppnar informationskortet (ⓘ) — planeraren ska kunna nå det från GÖRA-läget */
  onInfo?: () => void;
  /** återöppning (efter att arket krympt till en list medan man placerat ett avlägg): kortet fortsätter i samma vy och samma steg */
  startVy?: KlarVy;
  /** kortets vy ändras — sidan minns den till en återöppning */
  onVyAndrad?: (vy: KlarVy) => void;
  /** Vidas avlägg (nummer) ur traktgeometrin — tom/saknas = Vida har inga */
  vidaAvlagg?: string[];
  /** planeraren har tryckt Stämmer på exakt de här avläggen */
  vidaAvlaggBekraftat?: boolean;
  /** antal egna avlägg på kartan */
  avlaggEgna?: number;
  onBekraftaVidaAvlagg?: () => void;
  /**
   * Avläggssteget med Vidas avlägg visas på KARTAN, inte i arket: sidan stänger arket, zoomar in på avläggen och visar en list nertill ("Vida har lagt 2 avlägg. Ligger de rätt?").
   * `efter` = vyn kortet ska öppnas i när listen är besvarad (nästa steg, eller dit man kom ifrån). Saknas funktionen (riggen, tester) visas samma fråga i steget.
   */
  onGranskaAvlagg?: (efter: KlarVy) => void;
  onAndra: (patch: KlarPatch) => void;
  onHarDu: (id: HarDuId, varde: HarDuSvarVarde) => void;
  onPlaceraAvlagg: () => void;
  onRitaBasvag: () => void;
  onStammer: () => void;
  onVed: (v: VedDetaljer) => void;
  onSattVedPaKartan: () => void;
  onKlarForMaskin: () => void;
  onFortsatter: () => void;
  onStang: () => void;
}

/** Vilken vy som visas. `kort` = GÖRA eller SE efter vad som är kvar; `se` = sammanställningen även om något är kvar. */
type Flode =
  | { typ: 'alla'; start: StegId[]; steg: StegId }
  | { typ: 'ett'; steg: StegId; fraga?: HarDuId; till: 'kort' | 'se' };
type Vy = { v: 'kort' } | { v: 'se' } | { v: 'steg'; flode: Flode } | { v: 'ved'; efter: Vy };
/** vyn kortet visar — sidan får den via `onVyAndrad` och ger tillbaka den som `startVy` */
export type KlarVy = Vy;

const OVRIGT_ETT: Vy = { v: 'steg', flode: { typ: 'ett', steg: 'ovrigt', till: 'kort' } };

const UNDER: Partial<Record<StegId, string>> = {
  forutsattningar: 'Hur ser trakten ut för maskinerna?',
  maskiner: 'Vem kör?',
  prognos: 'Timmar per maskin — tryck på en siffra för att ändra den.',
  sammanfattning: 'Kontrollera och skicka till föraren.',
};

/** Säger åt sidan att visa avläggen på kartan (en gång när steget öppnas); ritar ingenting — arket stängs av sidan. */
function AvlaggGranska({ efter, onGranska }: { efter: Vy; onGranska: (efter: Vy) => void }) {
  useEffect(() => { onGranska(efter); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div data-testid="klar-avlagg-granska" />;
}

export default function KlarMedTrakten(p: KlarMedTraktenProps) {
  const [vy, setVy] = useState<Vy>(p.startMedVed ? { v: 'ved', efter: OVRIGT_ETT } : (p.startVy ?? { v: 'kort' }));
  useEffect(() => { p.onVyAndrad?.(vy); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vy]);
  const { status } = p;
  const planerad = p.objektStatus === 'planerad';
  const kvar = kvarSteg(status);
  const prognosKvar = kvar.includes('prognos');
  const harAllt = status.prognos.lage === 'ogodkand' && status.prognos.saknas.length === 0;
  const godkand = status.prognos.lage === 'godkand';
  const extern = status.prognos.lage === 'extern';

  const tillKort = () => setVy({ v: 'kort' });

  if (vy.v === 'ved') {
    const efter = vy.efter;
    return <KlarVed namn={p.namn} ved={p.ved} onAndra={p.onVed} onSattPaKartan={p.onSattVedPaKartan} onTillbaka={() => setVy(efter)} onIngenVed={() => { p.onAndra({ ved: false }); setVy(efter); }} onStang={p.onStang} />;
  }

  // ── STEG ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (vy.v === 'steg') {
    const flode = vy.flode;
    const steg = flode.steg;
    const alla = flode.typ === 'alla';
    const ordning = flode.typ === 'alla' ? genomgangSteg(flode.start, prognosKvar) : [steg];
    const idx = Math.max(0, ordning.indexOf(steg));
    // Strecket räknar bara stegen som är kvar ("4 saker kvar" = 1 av 4); Sammanfattningen är slutskärmen och har inget streck.
    const numrerade = ordning.filter((s) => s !== 'sammanfattning');
    const delar = alla && steg !== 'sammanfattning' && numrerade.length > 1 ? { antal: numrerade.length, nu: idx } : null;
    /** klart med steget: nästa steg i genomgången, annars tillbaka dit man kom ifrån */
    const nastaVy = (): Vy => (flode.typ === 'alla' && idx < ordning.length - 1
      ? { v: 'steg', flode: { ...flode, steg: ordning[idx + 1] } }
      : flode.typ === 'ett' && flode.till === 'se' ? { v: 'se' } : { v: 'kort' });
    const nasta = () => setVy(nastaVy());
    const foregaende = () => { if (flode.typ === 'alla' && idx > 0) setVy({ v: 'steg', flode: { ...flode, steg: ordning[idx - 1] } }); };
    const tillbaka = () => setVy(flode.typ === 'ett' && flode.till === 'se' ? { v: 'se' } : { v: 'kort' });
    const nastaText = alla ? 'Nästa' : 'Klar';

    if (steg === 'harDu') {
      return (
        <HarDuSteg namn={p.namn} harDu={p.harDu} varningar={p.varningar} avNamn={p.avNamn} onHarDu={p.onHarDu} fraga={flode.typ === 'ett' ? flode.fraga : undefined}
          ytterDelar={delar} onTillbaka={tillbaka} onForegaende={alla && idx > 0 ? foregaende : null} onNasta={nasta} />
      );
    }

    // Vidas avlägg visas på kartan: arket ger plats (sidan sköter listen), kortet öppnas igen i `efter`.
    if (steg === 'avlagg' && (p.vidaAvlagg ?? []).length > 0 && p.onGranskaAvlagg) return <AvlaggGranska efter={nastaVy()} onGranska={p.onGranskaAvlagg} />;

    const ram = (rubrik: string, body: React.ReactNode, primar: React.ReactNode) => (
      <StegRam namn={p.namn} onTillbaka={tillbaka} delar={delar} rubrik={rubrik} under={UNDER[steg]} knappar={primar}
        foregaende={alla ? { onTryck: foregaende, disabled: idx === 0 } : null} hoppa={alla && steg !== 'sammanfattning' ? { onTryck: nasta } : null}>
        {body}
      </StegRam>
    );
    // Den knapp som gör stegets sak är primär tills den är gjord: i Avlägg och Basväg ligger den i stegets innehåll, och Nästa är då sekundär.
    const aktionKvar = (steg === 'avlagg' || steg === 'basvag') && (status.poster.find((x) => x.id === steg)?.kvar ?? false);
    const nastaKnapp = <StorKnapp testid="klar-steg-nasta" variant={aktionKvar ? 'sekundar' : 'primar'} onTryck={nasta}>{nastaText}</StorKnapp>;

    switch (steg) {
      case 'avlagg': return ram(STEG_NAMN.avlagg, <AvlaggBody p={p} kartaYta={p.kartaYta} />, nastaKnapp);
      case 'basvag': return ram(STEG_NAMN.basvag, <BasvagBody p={p} />, nastaKnapp);
      case 'forutsattningar': return ram(STEG_NAMN.forutsattningar, <ForutsBody p={p} />, nastaKnapp);
      case 'maskiner': return ram(STEG_NAMN.maskiner, <MaskinerBody p={p} />, nastaKnapp);
      case 'medelstam': return ram(STEG_NAMN.medelstam, <MedelstamBody p={p} />, nastaKnapp);
      case 'ovrigt': return ram(STEG_NAMN.ovrigt, <OvrigtBody p={p} onVed={() => { if (!p.ovrigt.ved) p.onAndra({ ved: true }); setVy({ v: 'ved', efter: vy }); }} />, nastaKnapp);
      case 'prognos':
        return ram(STEG_NAMN.prognos, <PrognosBody p={p} onByt={flode.typ === 'ett' ? () => setVy({ v: 'steg', flode: { typ: 'ett', steg: 'maskiner', till: flode.till } }) : undefined} />, godkand || extern
          ? nastaKnapp
          : <StorKnapp testid="klar-stammer" disabled={!harAllt} onTryck={() => { p.onStammer(); nasta(); }}>Stämmer</StorKnapp>);
      case 'sammanfattning':
        return ram(STEG_NAMN.sammanfattning, <KlarSe p={p} utanPadding onOppna={(s, f) => setVy({ v: 'steg', flode: { typ: 'ett', steg: s, fraga: f, till: 'kort' } })} />,
          planerad
            ? <StorKnapp testid="klar-steg-nasta" onTryck={tillKort}>Klar</StorKnapp>
            : <StorKnapp testid="klar-for-maskin" variant="gron" disabled={p.klarSparar} onTryck={() => { p.onKlarForMaskin(); tillKort(); }}>{p.klarSparar ? 'Skickar …' : 'Klar för maskin'}</StorKnapp>);
      default: return null;
    }
  }

  // ── KORTET: GÖRA eller SE ─────────────────────────────────────────────────────────────────────────────────────────────
  const visaSe = vy.v === 'se' || planerad || status.klar;
  const oppnaSteg = (s: StegId, fraga?: HarDuId) => setVy({ v: 'steg', flode: { typ: 'ett', steg: s, fraga, till: vy.v === 'se' ? 'se' : 'kort' } });
  const goraIgenom = () => setVy({ v: 'steg', flode: { typ: 'alla', start: kvar, steg: kvar[0] ?? 'sammanfattning' } });

  const lageText = planerad ? 'Klar för maskin ✓' : status.klar ? 'Redo att skicka' : `${status.antalKvar} ${status.antalKvar === 1 ? 'sak' : 'saker'} kvar`;
  const lageFarg = planerad ? FARG.gron : status.klar ? FARG.text : FARG.orange;
  const undertitel = (
    <>
      <span data-testid="klar-status" style={{ color: lageFarg, ...TYP.listtitel }}>{lageText}</span>
      {planerad && status.antalKvar > 0 && <span style={{ color: FARG.orange }}> · {status.antalKvar} kvar</span>}
      {visaSe && p.faktaRad && <div data-testid="klar-fakta" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, fontWeight: 400 }}>{p.faktaRad}</div>}
    </>
  );

  // värdet i Behöver dig-raderna: orange uppmaning (färg + ord)
  const uppmaning = (s: StegId): string => {
    switch (s) {
      case 'avlagg': return (p.vidaAvlagg ?? []).length > 0 ? 'Bekräfta' : 'Placera på kartan';
      case 'basvag': return 'Rita';
      case 'forutsattningar': return status.forutsattningarKvar === 3 ? '3 att välja' : `${status.forutsattningarKvar} kvar`;
      case 'maskiner': return 'Välj';
      case 'medelstam': return 'Skriv';
      case 'harDu': return `${HAR_DU_FRAGOR.length - status.frågorKvar.length} av ${HAR_DU_FRAGOR.length}`;
      case 'prognos': return status.prognos.lage === 'ogodkand' && status.prognos.saknas.length > 0 ? `Saknar ${status.prognos.saknas[0]}` : 'Granska';
      default: return '';
    }
  };

  return (
    <>
      <Huvud titel={p.namn} undertitel={undertitel} onStang={p.onStang} />
      <div data-testid="klar-innehall" style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: AVSTAND.xxl }}>
        {p.datalage !== 'ok' && (
          <div data-testid="klar-datalage" role="note" style={{ display: 'flex', gap: AVSTAND.m, margin: `${AVSTAND.m}px ${AVSTAND.l}px 0`, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22, color: FARG.orange, flexShrink: 0 }}>warning</span>
            <span style={{ ...TYP.text, color: FARG.orange }}>
              {p.datalage === 'migrering-saknas'
                ? 'Databasen saknar de nya fälten (migrationen är inte körd). Svaren du ger här sparas inte.'
                : 'Svaren för trakten gick inte att läsa. Stäng och öppna kortet igen — inget sparas förrän de är lästa.'}
            </span>
          </div>
        )}
        {p.sparFel && (
          <div data-testid="klar-sparfel" role="alert" style={{ margin: `${AVSTAND.m}px ${AVSTAND.l}px 0`, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, borderRadius: RADIE.kort, background: FARG.upphojt, ...TYP.text, color: FARG.orange }}>{p.sparFel}</div>
        )}

        {visaSe ? (
          <>
            {/* Efter Klar för maskin kan något ha tillkommit, och från GÖRA kan man ha öppnat sammanställningen: knappen leder in i genomgången */}
            {status.antalKvar > 0 && (
              <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px 0` }}>
                <StorKnapp testid="klar-ga-igenom" onTryck={goraIgenom}>Gå igenom</StorKnapp>
              </div>
            )}
            <KlarSe p={p} onOppna={oppnaSteg} />
            {vy.v === 'se' && (
              <div style={{ padding: `0 ${AVSTAND.l}px ${AVSTAND.l}px` }}>
                <button type="button" data-testid="klar-se-tillbaka" onClick={tillKort} className="press-dim" style={{ ...KNAPP.lank, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>‹ Till det som är kvar</button>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: `${AVSTAND.m}px ${AVSTAND.l}px ${AVSTAND.l}px` }}>
            <StorKnapp testid="klar-ga-igenom" onTryck={goraIgenom}>Gå igenom</StorKnapp>

            <section data-testid="klar-behover" style={{ marginTop: AVSTAND.sektion }}>
              <Rubrik>Behöver dig</Rubrik>
              <Gruppkort testid="klar-del1">
                {kvar.map((s, k) => (
                  <div key={s} data-testid={`klar-post-${s}`} data-kvar="1" style={{ borderTop: k === 0 ? 'none' : `1px solid ${FARG.linje}` }}>
                    <button type="button" data-testid={`klar-rad-${s}`} onClick={() => oppnaSteg(s)} className="press-row"
                      style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                      <span style={{ flex: 1, minWidth: 0 }}>{STEG_NAMN[s]}</span>
                      <span data-testid={`klar-rad-${s}-varde`} style={{ ...TYP.listtitel, color: FARG.orange, textAlign: 'right' }}>{uppmaning(s)}</span>
                      <Pil />
                    </button>
                  </div>
                ))}
              </Gruppkort>
            </section>

            <div style={{ marginTop: AVSTAND.sektion }}>
              <Gruppkort testid="klar-del2">
                <button type="button" data-testid="klar-se-oppna" onClick={() => setVy({ v: 'se' })} className="press-row"
                  style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                  <span style={{ flex: 1, minWidth: 0 }}>Visa hela trakten</span>
                  <Pil />
                </button>
                {p.onInfo && (
                  <button type="button" data-testid="klar-info" onClick={p.onInfo} className="press-row"
                    style={{ width: '100%', minHeight: TRAFFYTA.primar + AVSTAND.s, padding: `${AVSTAND.s}px ${AVSTAND.l}px`, display: 'flex', alignItems: 'center', gap: AVSTAND.m, background: 'transparent', border: 'none', borderTop: `1px solid ${FARG.linje}`, color: FARG.text, ...TYP.text, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>Om trakten</span>
                    <Pil />
                  </button>
                )}
              </Gruppkort>
            </div>
          </div>
        )}
      </div>

      {/* ── KLAR FÖR MASKIN — spärrar aldrig ─────────────────────────────────────────────────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.l)}`, borderTop: `1px solid ${FARG.linje}` }}>
        {planerad ? null : (
          <button type="button" data-testid="klar-for-maskin" data-klar={status.klar ? '1' : '0'} onClick={p.onKlarForMaskin} disabled={p.klarSparar} className="press-scale"
            style={{ ...KNAPP.primar, background: status.klar ? FARG.gron : FARG.fyllning, color: status.klar ? FARG.bg : FARG.text, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', ...(p.klarSparar ? { opacity: 0.4 } : null) }}>
            {p.klarSparar ? 'Skickar …' : 'Klar för maskin'}
          </button>
        )}
        <button type="button" data-testid="klar-fortsatter" onClick={p.onFortsatter} className="press-dim"
          style={{ ...KNAPP.tertiar, width: '100%', justifyContent: 'center', marginTop: AVSTAND.xs, cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation' }}>Fortsätter en annan dag</button>
      </div>
    </>
  );
}
