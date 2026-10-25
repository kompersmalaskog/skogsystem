'use client';
// KONTROLLER — "Vad mättes?" Kalendern och en lista, nyast först. Varje rad säger allt utan att man trycker: dag och klockslag (svensk tid), trädslag, antal
// stammar och stockar och vem som klavade; sedan slumpstam eller förvald, och vädret. Ett tryck på en rad öppnar kontrollen (blad nerifrån på telefon, panel till höger på iPad/dator).
import Manadsvaljare from '@/components/design/Manadsvaljare';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import type { KalibreringArk } from '@/lib/hooks/useKalibreringArk';
import type { KalibreringData } from '@/lib/hooks/useKalibreringData';
import { manadNamn, stegManad } from '@/lib/kalibrering/datum';
import { kontrollRader } from '@/lib/kalibrering/kontrollLista';
import { Fyll, Info, Lugn, Meta, Prick } from './delar';
import KalenderRutnat, { KalenderSkelett } from './KalenderRutnat';
import Rubrik from './Rubrik';

export default function KontrollerFlik({ d, ark }: { d: KalibreringData; ark: KalibreringArk }) {
  const rader = kontrollRader(d.filteredKalib, d.tider, d.calManad);
  // Vald rad = den kontroll som visas i panelen bredvid (rotposten i stapeln).
  const rot = ark.rot?.post;
  const valdFil = rot?.typ === 'kontroll' ? rot.data.kontroll.filnamn : null;
  const valdDag = rot?.typ === 'dag' ? rot.dag.datum : null;

  return (
    <>
      <Rubrik d={d} fraga="Vad mättes?" />
      <div style={{ marginBottom: AVSTAND.l }}>
        <Manadsvaljare etikett={manadNamn(d.calManad)} onBakat={() => d.setCalManad(stegManad(d.calManad, -1))} onFramat={() => d.setCalManad(stegManad(d.calManad, 1))} />
      </div>

      {d.calError && !d.calLoading && (
        <div style={{ marginBottom: AVSTAND.l }}><Info ikon="error" titel="Kunde inte ladda kalendern">{d.calError}</Info></div>
      )}

      <Tillstand nyckel={d.calLoading ? 'laddar' : 'klar'}>
        {d.calLoading ? <KalenderSkelett /> : <KalenderRutnat d={d} valdDag={valdDag} onDag={dag => ark.oppnaDag(dag, true)} />}
      </Tillstand>

      <div style={{ marginTop: AVSTAND.xl }}>
        <Sektion rubrik={`Kontroller i ${manadNamn(d.calManad).toLowerCase()}`}
          not={d.tiderFel ? (<span>{d.tiderFel} Visar filens datum i stället.{' '}
            <button type="button" onClick={d.forsokIgen} style={{ ...KNAPP.lank, ...TYP.meta, minHeight: 0, display: 'inline' }}>Försök igen</button></span>) : undefined}>
          {rader.length === 0 ? (
            <Fyll><Lugn marginTop={0}>Inga kontroller i {manadNamn(d.calManad).toLowerCase()}.</Lugn></Fyll>
          ) : rader.map((r, i) => (
            <Rad key={r.filnamn} sista={i === rader.length - 1}
              attr={{ 'data-kontroll-rad': r.filnamn, 'aria-current': r.filnamn === valdFil ? 'true' : 'false' }}
              titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>{r.filnamn === valdFil && <Prick farg={FARG.text} />}<span>{r.rubrik}</span></span>}
              under={<><div>{r.rad1}</div><div>{r.urval && <>{r.urval} · </>}<span style={{ color: r.vaderSaknas ? FARG.text3 : FARG.text2 }}>{r.vader}</span></div></>}
              onTryck={() => ark.oppnaKontroll(r.filnamn, true)} />
          ))}
        </Sektion>
        {ark.laddarKontroll && <Meta>Läser kontrollen…</Meta>}
      </div>
    </>
  );
}
