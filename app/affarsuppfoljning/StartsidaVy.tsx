'use client';

// AFFÄRSUPPFÖLJNINGENS STARTSIDA — "hur går året".
//
// Samma form som massaved, stämplingsvyn och medelstam (components/Ytform.tsx): rubrikrad med väljare överst,
// talet stort och vänsterställt, ordrad, dämpad rad, rader med › längst ner. Före: bara en månadsväljare. Nu:
//   1. rubrikrad: år ⌄ och åtgärd ⌄ och bolag ⌄ (bolagsfiltret: alla bolag eller bara Vida)
//   2. talet: avverkat hittills i år, m³fub. Ordraden säger VAD talet är: "avverkat" när det är allt,
//      "levererat till Vida" bara när filtret står på Vida. Dämpad rad: snitt per hel månad och antal objekt.
//   3. månadsstaplar för hela året; pågående månad streckad; tryck på en stapel öppnar månaden (ersätter
//      månadsväljaren)
//   4. årets sortimentsfördelning, i ljushetsskalan (mörkast = mest värt, se skogsystem-design-skillen)
//   5. rader: senast avslutade månad, Räkna på en post, Massavedens längd (dagens medellängd), Vad kostar ett
//      längre rotkap
//
// ALLT HÄR LÄSER FÖRBERÄKNADE TABELLER (utfall_manad, dim_objekt) — aldrig stockdata live. All räkning bor i
// lib/affarsuppfoljning/ar.ts; den här filen visar bara. Hemved ingår inte i något tal (går till markägaren).

import { useMemo } from 'react';
import { SIDA, DAMPAD, SEKUNDAR, TEXT, LINJE, GUL, GRON, TAL, nf0, nf1, nf2, stor,
         Tillbakarad, Stort, Damp, Mening, Rad, Rader, Teknisk } from '@/components/Ytform';
import { Sortimentstapel, TeckenforklaringMedAndel } from '@/components/Sortimentstapel';
import { heltalTill100, type Andelar } from '@/lib/medelstam/berakna';
import {
  ATGARDER, BOLAGEN, byggAr, arLista, senastAvslutadManad, massavedLangd, manadsNamn, manadsnyckel,
  type Atgard, type Bolag, type ManadRad, type ObjektInfo,
} from '@/lib/affarsuppfoljning/ar';

export const BAS = '/affarsuppfoljning';
export type Vy = 'ar' | 'rakna';

export type Props = {
  rader: ManadRad[];
  objekt: Map<string, ObjektInfo>;
  massaMal: number;                 // önskad medellängd, m (kravprofil)
  uppdaterad: string | null;        // senaste beräkning ur utfall_manad
  idag: Date;
  ar: number; atgard: Atgard; bolag: Bolag; vy: Vy;
  byt: (q: { ar?: number; atgard?: Atgard; bolag?: Bolag }) => void;
  gaTill: (href: string) => void;
};

const OVERLAY = { position: 'absolute' as const, inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 16 };

/** En väljare som ser ut som text: osynlig native-<select> ovanpå, så iOS-plockaren öppnas. */
function Valjare({ text, value, onChange, label, children, fet }: {
  text: string; value: string; onChange: (v: string) => void; label: string; children: React.ReactNode; fet?: boolean;
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', minHeight: 44 }}>
      <span style={{ fontSize: fet ? 15 : 13, fontWeight: fet ? 600 : 400, color: fet ? TEXT : DAMPAD, whiteSpace: 'nowrap' }}>{text}</span>
      <span style={{ color: DAMPAD, marginLeft: 6, fontSize: 13, lineHeight: 1 }}>⌄</span>
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </span>
  );
}

const BOLAG_TEXT: Record<Bolag, string> = { Alla: 'alla bolag', Vida: 'bara Vida' };
const STAPELHOJD = 120;

/** Tolv månader. Tryck öppnar månaden. Pågående månad streckad, framtiden tom. */
function Manadsstaplar({ manader, ar, onVal }: { manader: ReturnType<typeof byggAr>['manader']; ar: number; onVal: (manad: string) => void }) {
  const max = Math.max(1, ...manader.map(m => m.volym));
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
      {manader.map(m => {
        const h = m.volym > 0 ? Math.max(3, Math.round((m.volym / max) * STAPELHOJD)) : 0;
        const kanTryckas = m.volym > 0;
        return (
          <button key={m.manad} disabled={!kanTryckas} onClick={() => onVal(m.manad)}
            aria-label={`${stor(manadsNamn(m.manad))} ${ar}: ${nf0(m.volym)} m³fub${m.pagaende ? ', pågående månad' : ''}`}
            style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'none', fontFamily: 'inherit', color: 'inherit',
                     display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                     cursor: kanTryckas ? 'pointer' : 'default', minHeight: STAPELHOJD + 44 }}>
            <span style={{ fontSize: 11, color: m.pagaende ? TEXT : DAMPAD, marginBottom: 4, whiteSpace: 'nowrap', visibility: m.volym > 0 ? 'visible' : 'hidden' }}>
              {Math.round(m.volym)}
            </span>
            <span style={{ width: '100%', height: h, boxSizing: 'border-box', borderRadius: '4px 4px 0 0',
                           background: m.pagaende ? 'transparent' : DAMPAD,
                           border: m.pagaende ? `1px dashed ${TEXT}` : 'none', borderBottom: 'none' }} />
            <span style={{ fontSize: 11, marginTop: 6, color: m.pagaende ? TEXT : SEKUNDAR, fontWeight: m.pagaende ? 600 : 400,
                           borderTop: LINJE, width: '100%', paddingTop: 4, textAlign: 'center' }}>
              {stor(manadsNamn(m.manad)).charAt(0)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Ingången till de två räknarna: man väljer efter vad man har — en stämplingslängd eller bara medelstammen. */
export function RaknaPaEnPost() {
  return (
    <div style={SIDA}>
      <Tillbakarad href={BAS} text="Affärsuppföljning" />
      <div style={{ padding: '10px 16px 0' }}>
        <div style={{ ...TAL, fontSize: 30, lineHeight: 1.15, fontWeight: 500 }}>Räkna på en post</div>
        <Mening>Välj efter vad du har. Båda räknar ur våra egna avverkade objekt — hur mycket som blev timmer, kubb och massaved.</Mening>
      </div>
      <Rader>
        <Rad text="Jag har en stämplingslängd" sub="Diameterklasser och antal träd per trädslag, ur stämplingsrapporten. Röta och spann ingår."
          href="/affarsuppfoljning/stampling" />
        <Rad text="Jag har bara medelstammen" sub="Skriv in medelstammen (till exempel 0,47) — så ser du vad våra objekt med samma stamstorlek gav."
          href="/affarsuppfoljning/medelstam" />
      </Rader>
    </div>
  );
}

export default function StartsidaVy({ rader, objekt, massaMal, uppdaterad, idag, ar, atgard, bolag, vy, byt, gaTill }: Props) {
  const svar = useMemo(() => byggAr(rader, objekt, { ar, atgard, bolag, idag }), [rader, objekt, ar, atgard, bolag, idag]);
  const aren = useMemo(() => arLista(rader, idag), [rader, idag]);
  const senast = useMemo(() => senastAvslutadManad(rader, objekt, atgard, bolag, idag), [rader, objekt, atgard, bolag, idag]);
  const langd = useMemo(() => massavedLangd(rader, objekt, idag), [rader, objekt, idag]);
  const nuAr = idag.getFullYear();
  const nu = manadsnyckel(idag);

  const manadUrl = (manad: string) => `${BAS}/manad?manad=${manad}&atgard=${atgard}&bolag=${bolag}`;

  if (vy === 'rakna') return <RaknaPaEnPost />;

  // ── Året ──────────────────────────────────────────────────────────────
  const ordrad = `${bolag === 'Vida' ? 'levererat till Vida' : 'avverkat'}${ar === nuAr ? ' hittills i år' : ` under ${ar}`}`;
  const harVolym = svar.total > 0;
  const f = svar.fordelning;
  const fAndel: Andelar | null = harVolym
    ? { timmer: (100 * f.timmer) / svar.total, kubb: (100 * f.kubb) / svar.total, massa: (100 * f.massa) / svar.total, ovrigt: (100 * f.ovrigt) / svar.total }
    : null;
  const fHela = fAndel ? heltalTill100(fAndel) : null;
  const massaFarg = langd == null ? undefined : langd.medellangd < massaMal ? GUL : GRON;

  return (
    <div style={SIDA}>
      {/* 1. Rubrikrad: år, åtgärd och bolag. Allt är väljare; ingen av dem är en knapp. */}
      <div style={{ margin: '10px 16px 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 16 }}>
        <Valjare fet text={String(ar)} value={String(ar)} label="År" onChange={v => byt({ ar: Number(v) })}>
          {aren.map(a => <option key={a} value={a}>{a}</option>)}
        </Valjare>
        <Valjare text={atgard.toLowerCase()} value={atgard} label="Åtgärd" onChange={v => byt({ atgard: v as Atgard })}>
          {ATGARDER.map(a => <option key={a} value={a}>{a}</option>)}
        </Valjare>
        <Valjare text={BOLAG_TEXT[bolag]} value={bolag} label="Bolag" onChange={v => byt({ bolag: v as Bolag })}>
          {BOLAGEN.map(b => <option key={b} value={b}>{BOLAG_TEXT[b]}</option>)}
        </Valjare>
      </div>

      {/* 2. Talet och ordraden */}
      <Stort tal={nf0(svar.total)} enhet="m³fub" ordrad={ordrad}>
        {harVolym ? (
          <Damp>
            {svar.snittPerHelManad != null
              ? `snitt ${nf0(svar.snittPerHelManad)} m³ per hel månad · `
              : ''}
            {nf0(svar.antalObjekt)} {svar.antalObjekt === 1 ? 'objekt' : 'objekt'}
          </Damp>
        ) : (
          <Damp>Inget {bolag === 'Vida' ? 'levererat till Vida' : 'avverkat'} {ar === nuAr ? 'än i år' : `under ${ar}`} med de här valen.</Damp>
        )}
      </Stort>

      {/* 3. Månadsstaplar */}
      <div style={{ margin: '0 16px' }}>
        <Manadsstaplar manader={svar.manader} ar={ar} onVal={m => gaTill(manadUrl(m))} />
        {svar.manader.some(m => m.pagaende) && (
          <div style={{ marginTop: 8, fontSize: 11, color: SEKUNDAR, lineHeight: 1.5 }}>
            Streckad stapel = pågående månad. Tryck på en stapel för att öppna månaden.
          </div>
        )}
      </div>

      {/* 4. Årets sortimentsfördelning */}
      {fAndel && fHela && (
        <div style={{ margin: '0 16px' }}>
          <div style={{ marginTop: 20, fontSize: 13, fontWeight: 600 }}>Sortiment {ar === nuAr ? 'hittills i år' : `under ${ar}`}</div>
          <Sortimentstapel andel={fAndel} hela={fHela} />
          <TeckenforklaringMedAndel hela={fHela} />
        </div>
      )}

      {/* 5. Rader */}
      <Rader>
        {senast && (
          <Rad text="Senast avslutade månad" tal={manadsNamn(senast.manad)} hoger={`${nf0(senast.volym)} m³`}
            onClick={() => gaTill(manadUrl(senast.manad))} />
        )}
        <Rad text="Räkna på en post" sub="stämplingslängd eller bara medelstammen" onClick={() => gaTill(`${BAS}?vy=rakna`)} />
        <Rad text="Massavedens längd" tal={langd ? `${nf2(langd.medellangd)} m` : '–'} farg={massaFarg}
          hoger={langd && !langd.aktuell ? manadsNamn(langd.manad) : undefined}
          sub={langd ? `barrmassaved, Vida · ${langd.medellangd < massaMal ? 'under' : 'når'} målet ${nf1(massaMal)} m${langd.aktuell ? '' : ' · inget registrerat denna månad än'}` : 'ingen barrmassaved registrerad än'}
          href="/massaved" />
        <Rad text="Vad kostar ett längre rotkap" href="/rotkap" />
      </Rader>

      <Teknisk>
        Förberäknat efter import (utfall_manad){uppdaterad ? `, uppdaterat ${new Date(uppdaterad).toLocaleDateString('sv-SE')}` : ''} — ingen stockdata läses vid anrop.
        Volymerna är m³fub, skördarmätt under bark. Hemved ingår inte i något tal: det är virke som går till markägaren.
        Kubb räknar klentimmer. Övrigt är energived, avkap och oklassat.
        {' '}Snittet per hel månad räknas från årets första månad med volym till senast avslutade; pågående månad ({manadsNamn(nu)}) är inte med.
        Objekt räknas på samma sätt som på månadssidan: skördarens och skotarens rad för samma trakt är ett objekt.
      </Teknisk>
    </div>
  );
}
