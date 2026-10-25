'use client';
// Undersidorna under Mer i objektets ark (Martin 2026-10-24: "så lätt att ett barn förstår direkt").
//
// Samma form som resten av arket: svaret först, en fråga per sektion, en rad per sak, ett tryck öppnar ett litet ark.
// ALLT SPARAS DIREKT (som arket) — ingen Spara-knapp längst ner och ingen fråga om osparade ändringar.
//   Filer               — "Har maskinerna skickat filer?"
//   Pris och ersättning — timpeng-del, appens värden du vill ersätta, terräng. (Ackord/Timpeng bor i arkets Betalning.)
//   Extern skotare      — en inlejd skotare och vad den kostar (JSON i ovrigt_info, lib/redigering/externSkotning.ts).
//   Skotare             — hur mycket är skotat, färdigskotat, filfri skotare, vem skotar, var riset kommer ifrån, fördelning.
// Skrivningarna ägs av redigeringsvyn (props); här finns bara orden och vad som visas var.

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, IKON, designCss } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import { supabase } from '@/lib/supabase';
import { hamtaAckordgrundAuto, type AckordgrundAuto } from '@/lib/ekonomi/ackordgrund';
import { hamtaRisKandidater, hamtaKopplingar, sparaKopplingar } from '@/lib/grot-koppling';
import { arRisjobb } from '@/lib/objekt/typ';
import { kortDatum } from '@/lib/redigering/objektVy';
import { externKostnad, lasExtern, skrivExtern, type ExternSkotning } from '@/lib/redigering/externSkotning';
import { Brytare } from './ObjektOversikt';

type Spara = (patch: Record<string, any>) => Promise<boolean>;
type SparaMaskin = (patch: Record<string, any>, typ: 'harvester' | 'forwarder') => Promise<boolean>;
type Svar = { ok: boolean; message: string };

const tal = (v: number, dec = 0) => v.toLocaleString('sv-SE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const m3 = (v: number) => `${tal(Math.round(v))} m³`;

/** Lägger ett ark över allt (arket under Mer ligger i redigeringsvyns egen sheet). */
function Overst({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(<div><style>{designCss}</style>{children}</div>, document.body);
}

function Svarsrad({ text, ton }: { text: string; ton: 'bra' | 'gor' | 'info' }) {
  const farg = ton === 'gor' ? FARG.orange : ton === 'bra' ? FARG.gron : FARG.text3;
  return (
    <div data-svar="" data-svar-ton={ton} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginBottom: AVSTAND.xl }}>
      <span aria-hidden style={{ width: AVSTAND.m, height: AVSTAND.m, borderRadius: RADIE.cirkel, background: farg, flexShrink: 0 }} />
      <span style={{ ...TYP.rubrik }}>{text}</span>
    </div>
  );
}

function Fel({ text }: { text: string }) {
  if (!text) return null;
  return <p role="alert" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.rod }}>{text}</p>;
}

function Dampad({ children }: { children: ReactNode }) {
  return <span style={{ fontWeight: 400, color: FARG.text2, ...TNUM }}>{children}</span>;
}

/** Tolkar ett tal med komma eller punkt. Tomt = null. NaN = inte ett tal. */
export function lasTal(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Ett tal i ett eget ark. `appens` = vad appen räknar själv (visas, och "Använd appens värde" tömmer fältet).
 * Tomt fält sparas som null (= appens värde / inget).
 */
function TalArk({ rubrik, varde, enhet, appens, forklaring, min, max, onStang, onSpara }: {
  rubrik: string; varde: number | null; enhet: string; appens?: string | null; forklaring?: string;
  min?: number; max?: number;
  onStang: () => void; onSpara: (v: number | null) => Promise<boolean>;
}) {
  const [text, setText] = useState(varde == null ? '' : String(varde).replace('.', ','));
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const ny = lasTal(text);
  const ogiltig = Number.isNaN(ny) || (ny != null && ((min != null && ny < min) || (max != null && ny > max)));
  const andrad = !ogiltig && ny !== varde;
  const kor = async (v: number | null) => {
    setSparar(true); setFel('');
    const ok = await onSpara(v);
    setSparar(false);
    if (!ok) setFel('Kunde inte spara. Försök igen.');
  };
  const fot = (
    <>
      <Fel text={fel} />
      <button type="button" data-tal-spara="" disabled={!andrad || sparar} onClick={() => kor(ny as number | null)}
        style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Sparar …' : ny == null ? (varde == null ? 'Spara' : 'Töm fältet') : `Spara ${tal(ny as number, Number.isInteger(ny) ? 0 : 2)} ${enhet}`}
      </button>
      {appens !== undefined && varde != null && (
        <button type="button" data-tal-appens="" disabled={sparar} onClick={() => kor(null)} style={{ ...KNAPP.sekundar }}>
          Använd appens värde
        </button>
      )}
    </>
  );
  return (
    <Ark rubrik={rubrik} onStang={onStang} fot={fot}>
      {forklaring && <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.text, color: FARG.text2 }}>{forklaring}</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.upphojt, borderRadius: RADIE.rad, padding: `0 ${AVSTAND.l}px` }}>
        <input autoFocus inputMode="decimal" value={text} data-tal-falt="" placeholder={appens ?? '0'}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && andrad) kor(ny as number | null); }}
          style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, background: 'none', border: 'none', outline: 'none', color: FARG.text, ...TYP.text, ...TNUM, fontFamily: 'inherit' }} />
        <span style={{ ...TYP.meta, color: FARG.text2 }}>{enhet}</span>
      </div>
      {appens != null && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.text2, ...TNUM }}>Appen räknar {appens} {enhet}.</p>}
      {ogiltig && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>
        {Number.isNaN(ny) ? 'Skriv ett tal.' : `Mellan ${min} och ${max}.`}
      </p>}
    </Ark>
  );
}

/* ───────────────────────────── Filer ───────────────────────────── */

type FilRad = { maskinId: string; modell?: string | null; typ: 'skordare' | 'skotare' | null; senasteData?: string | null; senasteImport?: string | null; antalFiler: number; filtyper: string[] };
type FilLage = { skordare: 'data' | 'saknas' | 'forvantas_ej'; skotare: 'data' | 'saknas' | 'forvantas_ej'; skotareEjOrsak: string | null; skordareEjOrsak: string | null; ovantadSkordardata: boolean; ovantadSkotardata: boolean };

/** Svaret överst i Filer — i ord, en sak. */
export function filSvar(s: FilLage, skordningKlar?: string | null): { text: string; ton: 'bra' | 'gor' } {
  if (s.ovantadSkotardata) return { text: `Skotaren har skickat filer fast det står ${s.skotareEjOrsak}`, ton: 'gor' };
  if (s.ovantadSkordardata) return { text: 'Skördaren har skickat filer fast det står extern skördare', ton: 'gor' };
  if (s.skordare === 'saknas' && s.skotare === 'saknas') return { text: 'Inga filer än', ton: 'gor' };
  if (s.skotare === 'saknas') return { text: skordningKlar ? `Skotaren har inte skickat något – skördningen klar ${kortDatum(skordningKlar)}` : 'Skotaren har inte skickat något än', ton: 'gor' };
  if (s.skordare === 'saknas') return { text: 'Skördaren har inte skickat något än', ton: 'gor' };
  if (s.skordare === 'data' && s.skotare === 'data') return { text: 'Båda maskinerna har skickat filer', ton: 'bra' };
  return { text: s.skordare === 'data' ? 'Skördaren har skickat filer' : 'Skotaren har skickat filer', ton: 'bra' };
}

export function FilerSida({ rader, lage, status, skordningKlar }: {
  rader: FilRad[] | undefined; lage: FilLage | null; status: 'ok' | 'laddar' | 'fel'; skordningKlar?: string | null;
}) {
  if (status === 'fel') return <Svarsrad text="Filerna kunde inte läsas" ton="gor" />;
  if (status === 'laddar' || !lage) return <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Läser filerna …</p>;
  const alla = rader || [];
  const svar = filSvar(lage, skordningKlar);
  const grupp = (rubrik: string, typ: 'skordare' | 'skotare', st: FilLage['skordare'], orsak: string | null) => {
    const maskiner = alla.filter(r => r.typ === typ);
    return (
      <Sektion rubrik={rubrik} inset>
        {maskiner.length > 0 ? maskiner.map((r, i) => (
          <Rad key={r.maskinId} titel={r.modell || r.maskinId} sista={i === maskiner.length - 1} attr={{ 'data-fil-maskin': r.maskinId }}
            under={`${r.antalFiler} ${r.antalFiler === 1 ? 'fil' : 'filer'}${r.filtyper.length ? ` · ${r.filtyper.join(', ')}` : ''}`}
            hoger={<Dampad>{r.senasteData ? `till ${kortDatum(r.senasteData)}` : 'inget datum'}</Dampad>} />
        )) : st === 'forvantas_ej'
          ? <Rad titel="Väntas inte" under={orsak ? `Det står ${orsak}.` : undefined} dampad sista />
          : <Rad titel={<span style={{ color: FARG.orange }}>Inget än</span>} sista />}
      </Sektion>
    );
  };
  const okanda = alla.filter(r => r.typ === null);
  return (
    <div data-undersida="filer">
      <Svarsrad text={svar.text} ton={svar.ton} />
      {grupp('Skördaren', 'skordare', lage.skordare, lage.skordareEjOrsak)}
      {grupp('Skotaren', 'skotare', lage.skotare, lage.skotareEjOrsak)}
      {okanda.length > 0 && (
        <Sektion rubrik="Okänd maskin" inset>
          {okanda.map((r, i) => <Rad key={r.maskinId} titel={r.modell || r.maskinId} sista={i === okanda.length - 1}
            under={`${r.antalFiler} ${r.antalFiler === 1 ? 'fil' : 'filer'}`}
            hoger={<Dampad>{r.senasteData ? `till ${kortDatum(r.senasteData)}` : 'inget datum'}</Dampad>} />)}
        </Sektion>
      )}
    </div>
  );
}

/* ───────────────────────── Pris och ersättning ───────────────────────── */

type TalNyckel = 'timpeng_undantag_timmar_skordare' | 'timpeng_undantag_timmar_skotare' | 'timpeng_undantag_volym'
  | 'medelstam_manuell' | 'sortiment_grupper_manuell' | 'skotavstand_manuell' | 'skordning_g15_manuell' | 'skotning_g15_manuell';

const TAL_FALT: Record<TalNyckel, { titel: string; enhet: string; dec: number; forklaring: string }> = {
  timpeng_undantag_timmar_skordare: { titel: 'Skördaren', enhet: 'h', dec: 1, forklaring: 'Timmar som skördaren körde på timpeng. Tomt = allt på ackord.' },
  timpeng_undantag_timmar_skotare: { titel: 'Skotaren', enhet: 'h', dec: 1, forklaring: 'Timmar som skotaren körde på timpeng. Tomt = allt på ackord.' },
  timpeng_undantag_volym: { titel: 'Volym', enhet: 'm³', dec: 0, forklaring: 'Volymen som kördes på timpeng. Den dras från ackordet så den inte betalas två gånger.' },
  medelstam_manuell: { titel: 'Medelstam', enhet: 'm³', dec: 3, forklaring: 'Styr ackordpriset. Tomt = appens värde.' },
  sortiment_grupper_manuell: { titel: 'Sortimentgrupper', enhet: 'st', dec: 0, forklaring: 'Styr ackordpriset. Tomt = appens värde.' },
  skotavstand_manuell: { titel: 'Skotningsavstånd', enhet: 'm', dec: 0, forklaring: 'Ger tillägget på skotarens ackord. Tomt = appens värde.' },
  skordning_g15_manuell: { titel: 'Skördarens G15-timmar', enhet: 'h', dec: 1, forklaring: 'Jämförs med timpeng i Mot ackord. Tomt = appens värde.' },
  skotning_g15_manuell: { titel: 'Skotarens G15-timmar', enhet: 'h', dec: 1, forklaring: 'Jämförs med timpeng i Mot ackord. Tomt = appens värde.' },
};

/** Appens eget värde för en ackordgrund, som text. null = appen vet inte (läser eller inget underlag). */
export function appensVarde(n: TalNyckel, a: AckordgrundAuto | null): string | null {
  if (!a) return null;
  const v = n === 'medelstam_manuell' ? a.medelstam : n === 'sortiment_grupper_manuell' ? a.sortimentgrupper
    : n === 'skotavstand_manuell' ? a.skotavstand : n === 'skordning_g15_manuell' ? a.g15Skordare
    : n === 'skotning_g15_manuell' ? a.g15Skotare : null;
  return v == null ? null : tal(v, TAL_FALT[n].dec);
}

export function PrisSida({ obj, gruppIds, direktSpara, direktSparaMaskin, sparaSkotarG15 }: {
  obj: any; gruppIds: string[]; direktSpara: Spara; direktSparaMaskin: SparaMaskin;
  /** Skotarens G15 speglas till skotarraden som förut (redigeringsvyn äger den skrivningen). */
  sparaSkotarG15: (v: number | null) => Promise<boolean>;
}) {
  const [auto, setAuto] = useState<AckordgrundAuto | null>(null);
  const [oppen, setOppen] = useState<TalNyckel | 'terrang' | null>(null);
  const [sparar, setSparar] = useState<string | null>(null);
  const nyckel = gruppIds.join('|');
  useEffect(() => {
    let aktiv = true;
    setAuto(null);
    hamtaAckordgrundAuto(nyckel.split('|').filter(Boolean)).then(v => { if (aktiv) setAuto(v); }).catch(() => { if (aktiv) setAuto(null); });
    return () => { aktiv = false; };
  }, [nyckel]);

  const spara = (n: TalNyckel, v: number | null): Promise<boolean> =>
    n === 'skotning_g15_manuell' ? sparaSkotarG15(v)
      : n === 'skordning_g15_manuell' ? direktSparaMaskin({ [n]: v }, 'harvester')
        : direktSpara({ [n]: v });

  const timpeng = obj.timpeng === true;
  const volym = Number(obj.timpeng_undantag_volym) || 0;
  const terrang = Number(obj.terrang_kr_manuell) || 0;
  const varde = (n: TalNyckel) => (obj[n] == null || obj[n] === '' ? null : Number(obj[n]));

  const talRad = (n: TalNyckel, sista: boolean, medAppens: boolean) => {
    const v = varde(n);
    const a = medAppens ? appensVarde(n, auto) : null;
    return (
      <Rad key={n} titel={TAL_FALT[n].titel} sista={sista} onTryck={() => setOppen(n)} attr={{ 'data-tal-rad': n }}
        under={medAppens ? (v != null ? 'Du har ersatt appens värde' : undefined) : undefined}
        hoger={<Dampad>{v != null ? `${tal(v, Number.isInteger(v) ? 0 : TAL_FALT[n].dec)} ${TAL_FALT[n].enhet}`
          : medAppens ? (a != null ? `${a} ${TAL_FALT[n].enhet}` : 'appens') : '–'}</Dampad>} />
    );
  };

  const draBrytare = async (falt: 'timpeng_undantag_dra_skordare' | 'timpeng_undantag_dra_skotare', v: boolean) => {
    setSparar(falt); await direktSpara({ [falt]: v }); setSparar(null);
  };

  return (
    <div data-undersida="pris">
      <Svarsrad text={timpeng ? 'Betalas på timpeng' : 'Betalas på ackord'} ton="info" />
      {!timpeng && (
        <Sektion rubrik="Kördes en del på timpeng?" inset not="Tomt = allt kördes på ackord. Ackord eller timpeng väljer du under Betalning.">
          {talRad('timpeng_undantag_timmar_skordare', false, false)}
          {talRad('timpeng_undantag_timmar_skotare', false, false)}
          {talRad('timpeng_undantag_volym', volym <= 0, false)}
          {volym > 0 && (
            <>
              <Rad titel="Dra volymen från skördarens ackord" pil={false} attr={{ 'data-dra': 'skordare' }}
                hoger={<Brytare pa={obj.timpeng_undantag_dra_skordare !== false} etikett="Dra volymen från skördarens ackord"
                  upptagen={sparar === 'timpeng_undantag_dra_skordare'} onByt={v => draBrytare('timpeng_undantag_dra_skordare', v)} />} />
              <Rad titel="Dra volymen från skotarens ackord" pil={false} sista attr={{ 'data-dra': 'skotare' }}
                hoger={<Brytare pa={obj.timpeng_undantag_dra_skotare !== false} etikett="Dra volymen från skotarens ackord"
                  upptagen={sparar === 'timpeng_undantag_dra_skotare'} onByt={v => draBrytare('timpeng_undantag_dra_skotare', v)} />} />
            </>
          )}
        </Sektion>
      )}
      <Sektion rubrik="Stämmer appens värden?" inset not="Ett värde du skriver in gäller tills du tömmer det. Importen ändrar det aldrig.">
        {talRad('medelstam_manuell', false, true)}
        {talRad('sortiment_grupper_manuell', false, true)}
        {talRad('skotavstand_manuell', false, true)}
        {talRad('skordning_g15_manuell', false, true)}
        {talRad('skotning_g15_manuell', true, true)}
      </Sektion>
      <Sektion rubrik="Hur var terrängen?" inset>
        <Rad titel="Terräng" sista onTryck={() => setOppen('terrang')} attr={{ 'data-terrang': terrang > 0 ? 'svar' : 'normal' }}
          hoger={<Dampad>{terrang > 0 ? `Svår · ${tal(terrang)} kr/m³` : 'Normal'}</Dampad>} />
      </Sektion>

      {oppen && oppen !== 'terrang' && (
        <Overst>
          <TalArk rubrik={TAL_FALT[oppen].titel} varde={varde(oppen)} enhet={TAL_FALT[oppen].enhet} forklaring={TAL_FALT[oppen].forklaring}
            appens={['medelstam_manuell', 'sortiment_grupper_manuell', 'skotavstand_manuell', 'skordning_g15_manuell', 'skotning_g15_manuell'].includes(oppen) ? appensVarde(oppen, auto) : undefined}
            min={0} onStang={() => setOppen(null)}
            onSpara={async v => { const ok = await spara(oppen, v); if (ok) setOppen(null); return ok; }} />
        </Overst>
      )}
      {oppen === 'terrang' && (
        <Overst>
          <TerrangArk kr={terrang} onStang={() => setOppen(null)}
            onSpara={async v => { const ok = await direktSpara({ terrang_kr_manuell: v }); if (ok) setOppen(null); return ok; }} />
        </Overst>
      )}
    </div>
  );
}

/** Terrängen: Normal (0 kr) eller Svår 1–8 kr/m³. Svår förvalt på 4 kr, steg om 1 kr. */
function TerrangArk({ kr, onStang, onSpara }: { kr: number; onStang: () => void; onSpara: (v: number | null) => Promise<boolean> }) {
  const [svar, setSvar] = useState(kr > 0);
  const [belopp, setBelopp] = useState(kr > 0 ? kr : 4);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const nytt = svar ? belopp : null;
  const andrad = (nytt ?? 0) !== kr;
  const val = (titel: string, under: string, pa: boolean, onTryck: () => void, sista?: boolean) => (
    <Rad titel={titel} under={under} pil={false} sista={sista} onTryck={onTryck} attr={{ role: 'radio', 'aria-checked': String(pa) }}
      hoger={<Ikon namn={pa ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={pa ? FARG.text : FARG.text3} fylld={pa} />} />
  );
  const steg = (d: number) => setBelopp(b => Math.min(8, Math.max(1, b + d)));
  const fot = (
    <>
      <Fel text={fel} />
      <button type="button" data-terrang-spara="" disabled={!andrad || sparar}
        onClick={async () => { setSparar(true); setFel(''); const ok = await onSpara(nytt); setSparar(false); if (!ok) setFel('Kunde inte spara. Försök igen.'); }}
        style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : {}) }}>
        {sparar ? 'Sparar …' : svar ? `Spara svår · ${belopp} kr/m³` : 'Spara normal'}
      </button>
    </>
  );
  return (
    <Ark rubrik="Hur var terrängen?" onStang={onStang} fot={fot}>
      <Sektion rubrik="Välj" kort={false}>
        {val('Normal', 'Inget tillägg', !svar, () => setSvar(false))}
        {val('Svår', 'Tillägg 1–8 kr/m³', svar, () => setSvar(true), true)}
      </Sektion>
      {svar && (
        <div data-terrang-belopp="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: AVSTAND.xl }}>
          <button type="button" aria-label="Mindre" onClick={() => steg(-1)} disabled={belopp <= 1}
            style={{ ...KNAPP.sekundar, width: TRAFFYTA.primar, ...(belopp <= 1 ? INAKTIV : {}) }}>−</button>
          <span style={{ ...TYP.tal, minWidth: AVSTAND.xxl * 4, textAlign: 'center' }}>{belopp} kr</span>
          <button type="button" aria-label="Mer" onClick={() => steg(1)} disabled={belopp >= 8}
            style={{ ...KNAPP.sekundar, width: TRAFFYTA.primar, ...(belopp >= 8 ? INAKTIV : {}) }}>+</button>
        </div>
      )}
    </Ark>
  );
}

/* ───────────────────────── Extern skotare ───────────────────────── */

export function ExternSida({ obj, direktSparaMaskin }: { obj: any; direktSparaMaskin: SparaMaskin }) {
  const extern = lasExtern(obj.ovrigt_info);
  const [oppen, setOppen] = useState<'foretag' | 'pris' | 'antal' | null>(null);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');

  const skriv = async (ny: ExternSkotning | null): Promise<boolean> => {
    let text: string | null;
    try { text = skrivExtern(obj.ovrigt_info, ny); } catch (e) { setFel((e as Error).message); return false; }
    setFel('');
    const ok = await direktSparaMaskin({ ovrigt_info: text }, 'forwarder');
    if (!ok) setFel('Kunde inte spara. Försök igen.');
    return ok;
  };
  const kostnad = externKostnad(extern);
  const per = extern?.prisTyp === 'timme' ? 'timme' : 'm³';

  return (
    <div data-undersida="extern">
      <Svarsrad text={extern ? `${extern.foretag || 'Någon annan'} skotar åt oss` : 'Vi skotar själva'} ton="info" />
      <Sektion rubrik="Har ni lejt in en skotare?" inset
        not={extern ? 'Objektet räknas inte som oskotat – någon annan tar volymen.' : undefined}>
        <Rad titel="Inlejd skotare" pil={false} sista={!extern} attr={{ 'data-extern': extern ? 'pa' : 'av' }}
          hoger={<Brytare pa={!!extern} etikett="Inlejd skotare" upptagen={sparar}
            onByt={async v => { setSparar(true); await skriv(v ? { foretag: '', prisTyp: 'm3', pris: 0, antal: 0 } : null); setSparar(false); }} />} />
        {extern && (
          <>
            <Rad titel="Vem?" onTryck={() => setOppen('foretag')} attr={{ 'data-extern-rad': 'foretag' }}
              hoger={<Dampad>{extern.foretag || <span style={{ color: FARG.orange }}>Skriv namnet</span>}</Dampad>} />
            <Rad titel="Pris" onTryck={() => setOppen('pris')} attr={{ 'data-extern-rad': 'pris' }}
              hoger={<Dampad>{extern.pris > 0 ? `${tal(extern.pris, Number.isInteger(extern.pris) ? 0 : 2)} kr per ${per}` : '–'}</Dampad>} />
            <Rad titel={extern.prisTyp === 'timme' ? 'Antal timmar' : 'Antal m³'} onTryck={() => setOppen('antal')} attr={{ 'data-extern-rad': 'antal' }}
              hoger={<Dampad>{extern.antal > 0 ? `${tal(extern.antal, Number.isInteger(extern.antal) ? 0 : 1)} ${extern.prisTyp === 'timme' ? 'h' : 'm³'}` : '–'}</Dampad>} />
            <Rad titel="Kostar" pil={false} sista attr={{ 'data-extern-kostnad': '' }}
              hoger={<span style={{ ...TNUM }}>{kostnad != null ? `${tal(kostnad)} kr` : '–'}</span>} />
          </>
        )}
      </Sektion>
      <Fel text={fel} />

      {extern && oppen === 'foretag' && (
        <Overst>
          <NamnArk varde={extern.foretag} onStang={() => setOppen(null)}
            onSpara={async v => { const ok = await skriv({ ...extern, foretag: v }); if (ok) setOppen(null); return ok; }} />
        </Overst>
      )}
      {extern && oppen === 'pris' && (
        <Overst>
          <PrisArk extern={extern} onStang={() => setOppen(null)}
            onSpara={async (prisTyp, pris) => { const ok = await skriv({ ...extern, prisTyp, pris }); if (ok) setOppen(null); return ok; }} />
        </Overst>
      )}
      {extern && oppen === 'antal' && (
        <Overst>
          <TalArk rubrik={extern.prisTyp === 'timme' ? 'Antal timmar' : 'Antal m³'} varde={extern.antal > 0 ? extern.antal : null}
            enhet={extern.prisTyp === 'timme' ? 'h' : 'm³'} min={0} onStang={() => setOppen(null)}
            onSpara={async v => { const ok = await skriv({ ...extern, antal: v ?? 0 }); if (ok) setOppen(null); return ok; }} />
        </Overst>
      )}
    </div>
  );
}

function NamnArk({ varde, onStang, onSpara }: { varde: string; onStang: () => void; onSpara: (v: string) => Promise<boolean> }) {
  const [text, setText] = useState(varde);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const andrad = text.trim() !== varde.trim();
  const kor = async () => { setSparar(true); setFel(''); const ok = await onSpara(text.trim()); setSparar(false); if (!ok) setFel('Kunde inte spara. Försök igen.'); };
  const fot = (
    <>
      <Fel text={fel} />
      <button type="button" data-namn-spara="" disabled={!andrad || sparar} onClick={kor}
        style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Spara'}</button>
    </>
  );
  return (
    <Ark rubrik="Vem skotar?" onStang={onStang} fot={fot}>
      <input autoFocus value={text} placeholder="Företag eller person" data-namn-falt=""
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && andrad) kor(); }}
        style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.primar, padding: `0 ${AVSTAND.l}px`, background: FARG.upphojt, border: 'none', borderRadius: RADIE.rad, color: FARG.text, ...TYP.text, fontFamily: 'inherit', outline: 'none' }} />
    </Ark>
  );
}

function PrisArk({ extern, onStang, onSpara }: { extern: ExternSkotning; onStang: () => void; onSpara: (t: 'm3' | 'timme', pris: number) => Promise<boolean> }) {
  const [typ, setTyp] = useState<'m3' | 'timme'>(extern.prisTyp);
  const [text, setText] = useState(extern.pris > 0 ? String(extern.pris).replace('.', ',') : '');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');
  const ny = lasTal(text);
  const ogiltig = Number.isNaN(ny) || (ny != null && ny < 0);
  const andrad = !ogiltig && (typ !== extern.prisTyp || (ny ?? 0) !== extern.pris);
  const val = (t: 'm3' | 'timme', titel: string, sista?: boolean) => (
    <Rad key={t} titel={titel} pil={false} sista={sista} onTryck={() => setTyp(t)} attr={{ role: 'radio', 'aria-checked': String(typ === t) }}
      hoger={<Ikon namn={typ === t ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={typ === t ? FARG.text : FARG.text3} fylld={typ === t} />} />
  );
  const fot = (
    <>
      <Fel text={fel} />
      <button type="button" data-pris-spara="" disabled={!andrad || sparar}
        onClick={async () => { setSparar(true); setFel(''); const ok = await onSpara(typ, (ny as number | null) ?? 0); setSparar(false); if (!ok) setFel('Kunde inte spara. Försök igen.'); }}
        style={{ ...KNAPP.primar, ...(!andrad || sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Spara'}</button>
    </>
  );
  return (
    <Ark rubrik="Vad kostar det?" onStang={onStang} fot={fot}>
      <Sektion rubrik="Priset räknas" kort={false}>
        {val('m3', 'Per m³')}
        {val('timme', 'Per timme', true)}
      </Sektion>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.upphojt, borderRadius: RADIE.rad, padding: `0 ${AVSTAND.l}px` }}>
        <input inputMode="decimal" value={text} placeholder="0" data-pris-falt=""
          onChange={e => setText(e.target.value)}
          style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.primar, background: 'none', border: 'none', outline: 'none', color: FARG.text, ...TYP.text, ...TNUM, fontFamily: 'inherit' }} />
        <span style={{ ...TYP.meta, color: FARG.text2 }}>kr per {typ === 'timme' ? 'timme' : 'm³'}</span>
      </div>
      {ogiltig && <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>Skriv ett tal.</p>}
    </Ark>
  );
}

/* ───────────────────────────── Skotare ───────────────────────────── */

export function SkotareSida({
  obj, syskon, skotatLass, skordatTotal, skotatTotal, gruppSkotningAvslutad, skotareSanderEj, externSkotare,
  sattFardigskotat, sparaFilfri, sattTilldelad, fordelning,
}: {
  obj: any; syskon: any[]; skotatLass: number; skordatTotal: number; skotatTotal: number;
  gruppSkotningAvslutad: boolean; skotareSanderEj: boolean; externSkotare: boolean;
  sattFardigskotat: (varde: number | null) => Promise<Svar>;
  sparaFilfri: (falt: 'egen' | 'g15', v: number | null) => Promise<Svar>;
  sattTilldelad: (maskinId: string | null) => Promise<Svar>;
  /** Fördelningen per skotare (egen komponent, eget spara) — öppnas i ett ark. */
  fordelning: ReactNode;
}) {
  const risjobb = arRisjobb(obj);
  const manuell = (Number(obj.skotad_volym_manuell) || 0) > 0;
  const grupp = syskon.length ? syskon : [obj];
  const manuellMax = Math.max(0, ...grupp.map((o: any) => Number(o.skotad_volym_manuell) || 0));
  const totSkotat = Math.round((Number(skotatTotal) || 0) + manuellMax);
  const totSkordat = Math.round(Number(skordatTotal) || 0);
  const klarDatum = grupp.map((o: any) => o.skotning_avslutad).filter(Boolean).sort().slice(-1)[0] || null;
  const fattas = (gruppSkotningAvslutad || skotareSanderEj) && totSkordat > 0 && totSkotat < totSkordat
    && obj.egen_skotning !== true && !externSkotare;
  const volymAttSatta = Math.round(Number(risjobb ? skotatTotal : skordatTotal) || 0);

  const [lage, setLage] = useState<{ sparar: string | null; fel: string }>({ sparar: null, fel: '' });
  const [oppen, setOppen] = useState<'g15' | 'egen' | 'fordelning' | null>(null);
  const [skotare, setSkotare] = useState<any[]>([]);
  useEffect(() => {
    let av = false;
    supabase.from('dim_maskin').select('maskin_id, visningsnamn, tillverkare, modell, maskin_typ, aktiv_till').then(({ data }) => {
      if (av) return;
      setSkotare((data || []).filter((m: any) => /forwarder|skotare/i.test(m.maskin_typ || '')));
    });
    return () => { av = true; };
  }, []);
  const namn = (m: any) => (m.visningsnamn && String(m.visningsnamn).trim()) || [m.tillverkare, m.modell].filter(Boolean).join(' ') || m.maskin_id;
  const tilldeladNamn = (() => { const m = skotare.find(x => x.maskin_id === obj.tilldelad_skotare); return m ? namn(m) : (obj.tilldelad_skotare || 'skotaren'); })();

  const kor = async (vad: string, f: () => Promise<Svar>) => {
    setLage({ sparar: vad, fel: '' });
    const r = await f();
    setLage({ sparar: null, fel: r.ok ? '' : r.message });
    return r.ok;
  };

  const tim = Number(obj.skotning_g15_manuell) || 0;
  const vol = Number(obj.skotad_volym_manuell) || 0;
  const valbara = skotare.filter(m => m.aktiv_till == null || m.maskin_id === obj.tilldelad_skotare);

  return (
    <div data-undersida="skotare">
      <div style={{ marginBottom: AVSTAND.xl }}>
        <div style={{ ...TYP.micro, color: FARG.text2 }}>{risjobb ? 'Ris skotat' : 'Skotat'}</div>
        <div data-skotat-tal="" style={{ ...TYP.tal, marginTop: AVSTAND.xs }}>{m3(manuell ? vol : skotatLass)}</div>
        <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs, ...TNUM }}>
          {manuell ? `Du skrev in det · lassen säger ${m3(skotatLass)}` : 'Räknat ur lassen'}
          {!risjobb && totSkordat > 0 ? ` · ${m3(totSkordat)} skördat` : ''}
        </div>
      </div>

      <Sektion rubrik={risjobb ? 'Är riset hämtat?' : 'Är allt skotat?'} inset
        not={fattas ? (gruppSkotningAvslutad
          ? `Skotningen är klar${klarDatum ? ` ${kortDatum(klarDatum)}` : ''}, men ${m3(totSkordat - totSkotat)} fattas mot skördat.`
          : 'Skotaren skickar inga filer. Sätt skotat när den är klar.') : undefined}>
        {!manuell ? (
          <Rad titel={risjobb ? 'Riset hämtat' : 'Färdigskotat'} pil={false} sista attr={{ 'data-fardigskotat': '' }}
            under={volymAttSatta > 0
              ? (risjobb ? `${m3(volymAttSatta)} ris ur lassen` : `Skotat blir ${m3(volymAttSatta)}, samma som skördat`)
              : (risjobb ? 'Inga lass än' : 'Inget skördat att utgå från')}
            hoger={<button type="button" data-fardigskotat-knapp="" disabled={volymAttSatta <= 0 || !!lage.sparar}
              onClick={() => kor('fardig', () => sattFardigskotat(volymAttSatta))}
              style={{ ...(fattas ? KNAPP.primar : KNAPP.sekundar), width: 'auto', padding: `0 ${AVSTAND.l}px`, ...(volymAttSatta <= 0 || lage.sparar ? INAKTIV : {}) }}>
              {lage.sparar === 'fardig' ? 'Sparar …' : 'Klart'}
            </button>} />
        ) : (
          <Rad titel={risjobb ? 'Riset är hämtat' : `Du satte skotat till ${m3(vol)}`} pil={false} sista attr={{ 'data-fardigskotat-satt': '' }}
            hoger={<button type="button" data-fardigskotat-angra="" disabled={!!lage.sparar}
              onClick={() => kor('fardig', () => sattFardigskotat(null))}
              style={{ ...KNAPP.sekundar, width: 'auto', padding: `0 ${AVSTAND.l}px`, ...(lage.sparar ? INAKTIV : {}) }}>
              {lage.sparar === 'fardig' ? 'Sparar …' : 'Ångra'}
            </button>} />
        )}
      </Sektion>

      {skotareSanderEj && (
        <Sektion rubrik={`${tilldeladNamn} skickar inga filer`} inset not="Skriv in timmarna och volymen. De räknas till maskinen i uppföljningen.">
          <Rad titel="G15-timmar" onTryck={() => setOppen('g15')} attr={{ 'data-filfri': 'g15' }} hoger={<Dampad>{tim > 0 ? `${tal(tim, 1)} h` : '–'}</Dampad>} />
          <Rad titel="Skotad volym" onTryck={() => setOppen('egen')} sista={!(tim > 0 && vol > 0)} attr={{ 'data-filfri': 'egen' }} hoger={<Dampad>{vol > 0 ? m3(vol) : '–'}</Dampad>} />
          {tim > 0 && vol > 0 && (
            <Rad titel="Per G15-timme" pil={false} sista hoger={<Dampad>{tal(vol / tim, 1)} m³</Dampad>} />
          )}
        </Sektion>
      )}

      {!risjobb && (
        <Sektion rubrik="Vem skotar?" inset
          not={obj.skotare_konfiguration ? `Objektet kräver ${obj.skotare_konfiguration}. Gäller tills första lasset kommer.` : 'Gäller tills första lasset kommer – sedan avgör lassen.'}>
          {valbara.length === 0 ? <Rad titel="Läser skotarna …" dampad sista /> : valbara.map((m, i) => {
            const vald = obj.tilldelad_skotare === m.maskin_id;
            return (
              <Rad key={m.maskin_id} titel={namn(m) + (m.aktiv_till != null ? ' (såld)' : '')} pil={false} sista={i === valbara.length - 1}
                onTryck={lage.sparar ? undefined : () => kor('tilldelad', () => sattTilldelad(vald ? null : m.maskin_id))}
                attr={{ role: 'radio', 'aria-checked': String(vald), 'data-skotare-val': m.maskin_id }}
                hoger={<Ikon namn={vald ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={vald ? FARG.text : FARG.text3} fylld={vald} />} />
            );
          })}
        </Sektion>
      )}

      {risjobb && <RisFran objektId={obj.objekt_id} />}

      <Sektion rubrik="Flera skotare?" inset>
        <Rad titel="Fördela mellan skotarna" sista onTryck={() => setOppen('fordelning')} attr={{ 'data-fordelning-rad': '' }} />
      </Sektion>

      <Fel text={lage.fel} />

      {(oppen === 'g15' || oppen === 'egen') && (
        <Overst>
          <TalArk rubrik={oppen === 'g15' ? 'G15-timmar' : 'Skotad volym'} varde={oppen === 'g15' ? (tim > 0 ? tim : null) : (vol > 0 ? vol : null)}
            enhet={oppen === 'g15' ? 'h' : 'm³'} min={0} onStang={() => setOppen(null)}
            onSpara={async v => { const f = oppen; const ok = await kor('filfri', () => sparaFilfri(f, v)); if (ok) setOppen(null); return ok; }} />
        </Overst>
      )}
      {oppen === 'fordelning' && (
        <Overst>
          <Ark rubrik="Fördela mellan skotarna" onStang={() => setOppen(null)} stang="Klar">{fordelning}</Ark>
        </Overst>
      )}
    </div>
  );
}

/** Risjobbet: vilka hyggen riset kommer från. Vanligtvis ett. Sparas med en knapp (flera kan väljas). */
function RisFran({ objektId }: { objektId: string }) {
  const [kand, setKand] = useState<any[] | null>(null);
  const [valda, setValda] = useState<string[]>([]);
  const [sparade, setSparade] = useState<string[]>([]);
  const [lage, setLage] = useState({ sparar: false, fel: '' });
  useEffect(() => {
    let av = false;
    Promise.all([hamtaRisKandidater(), hamtaKopplingar(objektId)]).then(([k, kp]) => {
      if (av) return;
      if (!k.ok || !kp.ok) { setKand([]); setLage({ sparar: false, fel: k.message || kp.message }); return; }
      const ids = kp.rader.map((r: any) => r.avverknings_objekt_id);
      setKand(k.rader); setValda(ids); setSparade(ids);
    });
    return () => { av = true; };
  }, [objektId]);
  const andrad = [...valda].sort().join('|') !== [...sparade].sort().join('|');
  return (
    <Sektion rubrik="Var kommer riset från?" inset
      not={kand && kand.length > 0 ? 'När riset är hämtat bockas groten av på hyggena du valt.' : undefined}>
      {kand == null ? <Rad titel="Läser hyggena …" dampad sista />
        : kand.length === 0 ? <Rad titel={lage.fel || 'Inga hyggen med ris kvar just nu'} dampad sista />
          : <>
            {kand.map((k: any) => {
              const vald = valda.includes(k.objekt_id);
              const dagar = k.sista_datum ? Math.max(0, Math.round((Date.now() - new Date(k.sista_datum).getTime()) / 864e5)) : null;
              return (
                <Rad key={k.objekt_id} titel={k.namn} pil={false} attr={{ role: 'checkbox', 'aria-checked': String(vald), 'data-ris': k.objekt_id }}
                  under={`${m3(Number(k.volym_m3sub) || 0)} avverkat${dagar != null ? ` · legat ${dagar} dagar` : ''}`}
                  onTryck={() => setValda(v => (v.includes(k.objekt_id) ? v.filter(x => x !== k.objekt_id) : [...v, k.objekt_id]))}
                  hoger={<Ikon namn={vald ? 'check_circle' : 'radio_button_unchecked'} storlek={IKON.rad} farg={vald ? FARG.text : FARG.text3} fylld={vald} />} />
              );
            })}
            <div style={{ padding: `${AVSTAND.m}px 0` }}>
              <button type="button" data-ris-spara="" disabled={!andrad || lage.sparar}
                onClick={async () => {
                  setLage({ sparar: true, fel: '' });
                  const r = await sparaKopplingar(objektId, valda);
                  if (r.ok) setSparade(valda);
                  setLage({ sparar: false, fel: r.ok ? '' : r.message });
                }}
                style={{ ...KNAPP.primar, ...(!andrad || lage.sparar ? INAKTIV : {}) }}>
                {lage.sparar ? 'Sparar …' : andrad ? `Spara ${valda.length} ${valda.length === 1 ? 'hygge' : 'hyggen'}` : 'Sparat'}
              </button>
              <Fel text={lage.fel} />
            </div>
          </>}
    </Sektion>
  );
}
