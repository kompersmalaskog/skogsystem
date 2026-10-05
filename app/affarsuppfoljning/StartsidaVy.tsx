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
//   5. rader: senast avslutade månad, Räkna på post, Massavedens längd (dagens medellängd), Längre rotkap, Så räknas
//      Texten på ytan är tal och korta etiketter. Hur det räknas bor en nivå in (?vy=sa-raknas).
//
// ALLT HÄR LÄSER FÖRBERÄKNADE TABELLER (utfall_manad, dim_objekt) — aldrig stockdata live. All räkning bor i
// lib/affarsuppfoljning/ar.ts; den här filen visar bara. Hemved ingår inte i något tal (går till markägaren).

import { useMemo } from 'react';
import Link from 'next/link';
import { Calendar, Calculator, Ruler, Axe, Info } from 'lucide-react';
import { SIDA, DAMPAD, SEKUNDAR, TEXT, LINJE, GUL, GRON, nf0, nf1, nf2, stor,
         Tillbakarad, Stort, Rad, Rader, Stycken, Pil } from '@/components/Ytform';
import { Sortimentstapel, TeckenforklaringMedAndel } from '@/components/Sortimentstapel';
import { heltalTill100, type Andelar } from '@/lib/medelstam/berakna';
import {
  ATGARDER, BOLAGEN, byggAr, arLista, senastAvslutadManad, massavedLangd, manadsNamn, manadsnyckel,
  type Atgard, type Bolag, type ManadRad, type ObjektInfo,
} from '@/lib/affarsuppfoljning/ar';

export const BAS = '/affarsuppfoljning';
export type Vy = 'ar' | 'rakna' | 'sa-raknas';

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
      <Pil storlek={fet ? 14 : 13} vanster={fet ? 7 : 6} />
      <select value={value} onChange={e => onChange(e.target.value)} aria-label={label} style={OVERLAY}>{children}</select>
    </span>
  );
}

const BOLAG_TEXT: Record<Bolag, string> = { Alla: 'alla bolag', Vida: 'bara Vida' };
const ATGARD_TEXT: Record<Atgard, string> = { Allt: 'alla åtgärder', Slutavverkning: 'slutavverkning', Gallring: 'gallring', Grot: 'GROT' };
const STAPELHOJD = 110;
const DAMP = { marginTop: 2, fontSize: 13, color: DAMPAD, lineHeight: 1.5 } as const;

/** En rad med ikon, som i förlagan: ikon · rubrik med underrad · värde · ›. Ikonen är dekor (aria-hidden) — ordet bär. */
function Post({ ikon, text, sub, hoger, farg, href, onClick }: {
  ikon: React.ReactNode; text: string; sub?: string; hoger?: string; farg?: string; href?: string; onClick?: () => void;
}) {
  const inre = (
    <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span aria-hidden style={{ color: SEKUNDAR, display: 'flex', flexShrink: 0 }}>{ikon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: TEXT }}>{text}</span>
        {sub && <span style={{ display: 'block', fontSize: 12, color: DAMPAD, marginTop: 2, lineHeight: 1.4 }}>{sub}</span>}
      </span>
      {hoger != null && <span style={{ flexShrink: 0, fontSize: 13, fontWeight: farg ? 600 : 400, color: farg ?? DAMPAD }}>{hoger}</span>}
      <span aria-hidden style={{ color: DAMPAD, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>›</span>
    </span>
  );
  const stil = { display: 'block', width: '100%', boxSizing: 'border-box' as const, borderTop: LINJE, padding: '14px 0', minHeight: 44,
                 textDecoration: 'none', color: TEXT, textAlign: 'left' as const, fontFamily: 'inherit', background: 'none', cursor: 'pointer' };
  if (href) return <Link href={href} style={stil}>{inre}</Link>;
  // Inte `border: 'none'`: i en inline-stil nollar förkortningen borderTop som redan är satt, och raden tappar sin skiljelinje.
  return <button onClick={onClick} style={{ ...stil, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>{inre}</button>;
}

/** Tolv månader. Tryck öppnar månaden. Pågående månad streckad, framtiden tom. `markerad` = senast avslutade månad (fet bokstav). */
function Manadsstaplar({ manader, ar, markerad, onVal }: { manader: ReturnType<typeof byggAr>['manader']; ar: number; markerad: string | null; onVal: (manad: string) => void }) {
  const max = Math.max(1, ...manader.map(m => m.volym));
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
      {manader.map(m => {
        const h = m.volym > 0 ? Math.max(3, Math.round((m.volym / max) * STAPELHOJD)) : 0;
        const kanTryckas = m.volym > 0;
        return (
          <button key={m.manad} disabled={!kanTryckas} onClick={() => onVal(m.manad)}
            aria-label={`${stor(manadsNamn(m.manad))} ${ar}: ${nf0(m.volym)} m³fub${m.pagaende ? ', pågående månad' : ''}`}
            style={{ flex: 1, minWidth: 0, padding: 0, border: 'none', background: 'none', fontFamily: 'inherit', color: 'inherit',
                     display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end',
                     cursor: kanTryckas ? 'pointer' : 'default', minHeight: STAPELHOJD + 40 }}>
            <span style={{ fontSize: 11, color: m.pagaende ? TEXT : DAMPAD, marginBottom: 4, whiteSpace: 'nowrap', visibility: m.volym > 0 ? 'visible' : 'hidden' }}>
              {Math.round(m.volym)}
            </span>
            <span style={{ width: '100%', height: h, boxSizing: 'border-box', borderRadius: '4px 4px 0 0',
                           background: m.pagaende ? 'transparent' : DAMPAD,
                           border: m.pagaende ? `1px dashed ${TEXT}` : 'none', borderBottom: 'none' }} />
            <span style={{ fontSize: 11, marginTop: 6, color: m.manad === markerad ? TEXT : SEKUNDAR, fontWeight: m.manad === markerad ? 700 : 400,
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
      <div style={{ margin: '0 16px', fontSize: 15, fontWeight: 600 }}>Räkna på post</div>
      <Rader>
        <Rad text="Stämplingslängd" href="/affarsuppfoljning/stampling" />
        <Rad text="Medelstam" href="/affarsuppfoljning/medelstam" />
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

  // ── Så räknas: allt som förklarar talet bor här, en nivå in ──────────────
  if (vy === 'sa-raknas') {
    return (
      <div style={SIDA}>
        <Tillbakarad href={`${BAS}?ar=${ar}&atgard=${atgard}&bolag=${bolag}`} text={String(ar)} />
        <Stycken>
          <p style={{ margin: '0 0 8px' }}>
            Förberäknat efter import (utfall_manad){uppdaterad ? `, uppdaterat ${new Date(uppdaterad).toLocaleDateString('sv-SE')}` : ''} — ingen stockdata läses vid anrop.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            Volymerna är m³fub, skördarmätt under bark. Hemved ingår inte i något tal: det är virke som går till markägaren.
          </p>
          <p style={{ margin: '0 0 8px' }}>
            Kubb räknar klentimmer. Övrigt är energived, avkap och oklassat. Alla åtgärder = slutavverkning och gallring (och objekt utan angiven åtgärd); GROT är ett eget val.
          </p>
          <p style={{ margin: 0 }}>
            Snittet per hel månad räknas från årets första månad med volym till senast avslutade; pågående månad ({manadsNamn(nu)}) är inte med.
            Objekt räknas på samma sätt som på månadssidan: skördarens och skotarens rad för samma trakt är ett objekt.
          </p>
        </Stycken>
      </div>
    );
  }

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
      {/* 1. Rubrikrad: året till vänster, bolag och åtgärd till höger. Allt är väljare; ingen av dem är en knapp. */}
      <div style={{ margin: '10px 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: 16 }}>
        <Valjare fet text={String(ar)} value={String(ar)} label="År" onChange={v => byt({ ar: Number(v) })}>
          {aren.map(a => <option key={a} value={a}>{a}</option>)}
        </Valjare>
        <span style={{ display: 'flex', alignItems: 'center', columnGap: 16 }}>
          <Valjare text={BOLAG_TEXT[bolag]} value={bolag} label="Bolag" onChange={v => byt({ bolag: v as Bolag })}>
            {BOLAGEN.map(b => <option key={b} value={b}>{stor(BOLAG_TEXT[b])}</option>)}
          </Valjare>
          <Valjare text={ATGARD_TEXT[atgard]} value={atgard} label="Åtgärd" onChange={v => byt({ atgard: v as Atgard })}>
            {ATGARDER.map(a => <option key={a} value={a}>{stor(ATGARD_TEXT[a])}</option>)}
          </Valjare>
        </span>
      </div>

      {/* 2. Talet och ordraden */}
      <Stort tal={nf0(svar.total)} enhet="m³fub" ordrad={<span style={{ display: 'block', marginTop: 6, fontSize: 14, fontWeight: 600 }}>{ordrad}</span>}>
        {harVolym ? (
          <div style={DAMP}>
            {svar.snittPerHelManad != null
              ? `${nf0(svar.snittPerHelManad)} per månad · `
              : ''}
            {nf0(svar.antalObjekt)} objekt
          </div>
        ) : (
          <div style={DAMP}>Inget {bolag === 'Vida' ? 'levererat till Vida' : 'avverkat'} {ar === nuAr ? 'än i år' : `under ${ar}`} med de här valen.</div>
        )}
      </Stort>

      {/* 3. Månadsstaplar */}
      <div style={{ margin: '0 16px' }}>
        <Manadsstaplar manader={svar.manader} ar={ar} markerad={senast?.manad ?? null} onVal={m => gaTill(manadUrl(m))} />
      </div>

      {/* 4. Vad det blev: årets sortimentsfördelning */}
      {fAndel && fHela && (
        <div style={{ margin: '0 16px' }}>
          <Sortimentstapel andel={fAndel} hela={fHela} luft={22} />
          <TeckenforklaringMedAndel hela={fHela} />
        </div>
      )}

      {/* 5. Rader */}
      <Rader>
        {senast && (
          <Post ikon={<Calendar size={16} strokeWidth={1.75} />}
            text={`${stor(manadsNamn(senast.manad))}${senast.manad.slice(0, 4) === String(nuAr) ? '' : ` ${senast.manad.slice(0, 4)}`}`}
            hoger={`${nf0(senast.volym)} m³`} onClick={() => gaTill(manadUrl(senast.manad))} />
        )}
        <Post ikon={<Calculator size={16} strokeWidth={1.75} />} text="Räkna på post" onClick={() => gaTill(`${BAS}?vy=rakna`)} />
        <Post ikon={<Ruler size={16} strokeWidth={1.75} />} text="Massavedens längd" farg={massaFarg}
          hoger={langd ? nf2(langd.medellangd) : '–'}
          sub={langd
            ? `mål ${nf1(massaMal)} m${langd.aktuell ? '' : ` · ${manadsNamn(langd.manad)}`}`
            : 'ingen barrmassaved registrerad än'}
          href="/massaved" />
        <Post ikon={<Axe size={16} strokeWidth={1.75} />} text="Längre rotkap" href="/rotkap" />
        <Post ikon={<Info size={16} strokeWidth={1.75} />} text="Så räknas"
          onClick={() => gaTill(`${BAS}?ar=${ar}&atgard=${atgard}&bolag=${bolag}&vy=sa-raknas`)} />
      </Rader>

    </div>
  );
}
