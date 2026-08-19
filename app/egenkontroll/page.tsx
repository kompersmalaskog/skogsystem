'use client';

// Egenkontroll - listan over objekt som vantar pa faltbesiktning.
//
// ETT TAL OVERST ar huvudsaken: hur manga vantar. Allt annat ar stod.
//
// Vantande = avslutat objekt MED kant avslutsdatum, utan en klar runda.
// Objekt utan avslutsdatum listas inte - de ar historik fran innan rutinen
// fanns, och en siffra som raknar med dem blir brus i stallet for en
// utlosare. Att de utelamnas star i klartext langst ner sa listan aldrig
// tiger om det den valjer bort.

import { useCallback, useEffect, useState } from 'react';
import BottomNav from '@/components/BottomNav';
import ListGroup from '@/components/ListGroup';
import ListRow from '@/components/ListRow';
import SectionHeader from '@/components/SectionHeader';
import PageContainer from '@/components/PageContainer';
import { T } from '@/lib/utbildning';
import { hamtaVantande, type VantandeOversikt, type VantandeRad } from '@/lib/egenkontroll';
import { kortDatum, dagarSedan, avvikelseText } from './format';

/**
 * Andra raden per objekt. Sager tillstandet i TEXT - fargpricken bredvid
 * upprepar bara det som redan star har.
 */
function underrad(rad: VantandeRad): string {
  if (rad.rundstatus === 'pagaende') {
    return `Pågår — ${rad.antalBesvarade} av ${rad.antalPunkter}`;
  }
  if (rad.rundstatus === 'klar') {
    const nar = rad.klarDatum ? kortDatum(rad.klarDatum) : 'datum saknas';
    return `Klar ${nar} — ${avvikelseText(rad.antalAvvikelser)}`;
  }
  return `Avslutat ${kortDatum(rad.avslutat)} — ${dagarSedan(rad.avslutat)}`;
}

/** Prick + text sager samma sak. Fargen ar aldrig ensam informationsbarare. */
function Prick({ rundstatus }: { rundstatus: VantandeRad['rundstatus'] }) {
  const farg =
    rundstatus === 'pagaende' ? T.orange : rundstatus === 'klar' ? T.green : T.gray;
  const hollow = rundstatus === 'ej_startad';
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: '50%',
        flexShrink: 0,
        background: hollow ? 'transparent' : farg,
        border: hollow ? `1.5px solid ${farg}` : 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

export default function EgenkontrollListPage() {
  const [data, setData] = useState<VantandeOversikt | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    try {
      setData(await hamtaVantande());
    } catch (e) {
      // Laddar / fel / tomt skiljs alltid at. Ett fel far aldrig se ut som
      // en tom lista - da tror planeraren att allt ar kontrollerat.
      setData(null);
      setFel(e instanceof Error ? e.message : 'Kunde inte hämta egenkontrollerna.');
    } finally {
      setLaddar(false);
    }
  }, []);

  useEffect(() => {
    ladda();
  }, [ladda]);

  const vantande = data?.rader.filter((r) => r.rundstatus !== 'klar') ?? [];
  const klara = data?.rader.filter((r) => r.rundstatus === 'klar') ?? [];

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff }}>
      <PageContainer width="smal" style={{ paddingBottom: 120, paddingTop: 8 }}>
        <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6, margin: '8px 0 2px' }}>
          {laddar ? 'Laddar…' : fel ? 'Kunde inte läsa' : `${data?.antalVantande ?? 0} väntar`}
        </h1>
        <p style={{ fontSize: 15, color: T.t2, margin: '0 0 20px' }}>
          Avslutade objekt som inte är kontrollerade
        </p>

        {laddar && (
          <div style={{ padding: '32px 16px', color: T.t2, fontSize: 15 }}>
            Hämtar avslutade objekt…
          </div>
        )}

        {!laddar && fel && (
          <div
            style={{
              background: T.group,
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 15, color: T.t1 }}>{fel}</div>
            <button
              onClick={ladda}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: T.blue,
                color: '#fff',
                fontSize: 16,
                fontWeight: 600,
                fontFamily: T.ff,
              }}
            >
              Försök igen
            </button>
          </div>
        )}

        {!laddar && !fel && vantande.length === 0 && klara.length === 0 && (
          <div style={{ background: T.group, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 15, color: T.t1, marginBottom: 6 }}>
              Inget objekt väntar på egenkontroll.
            </div>
            <div style={{ fontSize: 14, color: T.t2, lineHeight: 1.45 }}>
              Listan fylls när ett objekt avslutas. Då hamnar det här tills
              egenkontrollen är gjord.
            </div>
          </div>
        )}

        {!laddar && !fel && vantande.length > 0 && (
          <ListGroup>
            {vantande.map((rad) => (
              <ListRow
                key={rad.objekt_id}
                href={`/egenkontroll/${rad.objekt_id}`}
                leading={<Prick rundstatus={rad.rundstatus} />}
                title={rad.namn}
                subtitle={underrad(rad)}
              />
            ))}
          </ListGroup>
        )}

        {!laddar && !fel && klara.length > 0 && (
          <>
            <SectionHeader>Klara</SectionHeader>
            <div style={{ opacity: 0.55 }}>
              <ListGroup>
                {klara.map((rad) => (
                  <ListRow
                    key={rad.objekt_id}
                    href={`/egenkontroll/${rad.objekt_id}`}
                    leading={<Prick rundstatus={rad.rundstatus} />}
                    title={rad.namn}
                    subtitle={underrad(rad)}
                  />
                ))}
              </ListGroup>
            </div>
          </>
        )}

        {/* Sager varfor de datumlosa saknas. Siffran raknas, aldrig hardkodad -
            ar den noll visas raden inte alls. */}
        {!laddar && !fel && (data?.antalUtanDatum ?? 0) > 0 && (
          <p
            style={{
              fontSize: 13,
              color: T.t2,
              lineHeight: 1.5,
              margin: '20px 4px 0',
            }}
          >
            {data!.antalUtanDatum} äldre objekt saknar avslutsdatum och listas inte
            här. De kan startas från objektet.
          </p>
        )}
      </PageContainer>

      <BottomNav />
    </div>
  );
}
