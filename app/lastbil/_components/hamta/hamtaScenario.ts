// Testscenario för Hämta-flödet (tester och skärmbilder): fem maskiner, några trakter, en bil vid LBC. Siffrorna är påhittade men rimliga —
// avstånden från LBC (56.459, 14.702) är Giant ≈ 11 km, Elefant ≈ 11 km, Wisent ≈ 25 km, H8E ≈ 4 km och 810E ≈ 12 km.

export const KLOCKA = '2026-10-19T10:30:00Z';   // 12:30 svensk tid
export const LBC = { lat: 56.459, lng: 14.702 };

const t = (iso: string) => iso;

export const OBJEKT = {
  bagskytte: { id: 'obj-bagskytte', namn: 'Bågskyttebanan RP', vo_nummer: '11166440', lat: 56.545, lng: 14.745 },
  vallust: { id: 'obj-vallust', namn: 'Vällust RP', vo_nummer: '11166500', lat: 56.470, lng: 14.870 },
  sandasen: { id: 'obj-sandasen', namn: 'Sandåsen gallring', vo_nummer: '11166510', lat: 56.430, lng: 14.680 },
  almehult: { id: 'obj-almehult', namn: 'Älmehult gallring', vo_nummer: '11166477', lat: 56.560, lng: 14.620 },
  skalviken: { id: 'obj-skalviken', namn: 'Skälviken RP J-Hus', vo_nummer: '11166600', lat: 56.610, lng: 14.900 },
  kroksjomala: { id: 'obj-kroksjomala', namn: 'Kroksjömåla 1:23 A-A', vo_nummer: '11166700', lat: 56.520, lng: 14.560 },
  ostrahoka: { id: 'obj-ostrahoka', namn: 'Östra-Hoka 1:7 A-C', vo_nummer: '11166800', lat: 56.500, lng: 14.790 },
};

const obj = (o: { id: string; namn: string; vo_nummer: string; lat: number; lng: number }, over: Record<string, any> = {}) => ({
  dim_objekt_id: null, status: 'planerad', larmkoordinat_lat: null, larmkoordinat_lng: null, larmkoordinat_bekraftad: false,
  skordare_maskin_id: null, skotare_maskin_id: null, ...o, ...over,
});

export function scenario(): Record<string, any[]> {
  return {
    dim_maskin: [
      { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', modell: 'Scorpion Giant 8W', tillverkare: 'Ponsse', maskin_typ: 'Harvester', aktiv_till: null },
      { maskin_id: 'A110148', visningsnamn: 'Elefant 26', modell: 'Elephant King AF', tillverkare: 'Ponsse', maskin_typ: 'Forwarder', aktiv_till: null },
      { maskin_id: 'A030353', visningsnamn: 'Wisent', modell: 'Wisent 2015', tillverkare: 'Ponsse', maskin_typ: 'Forwarder', aktiv_till: null },
      { maskin_id: 'R64428', visningsnamn: 'H8E -26', modell: 'H8E', tillverkare: 'Rottne', maskin_typ: 'Harvester', aktiv_till: null },
      { maskin_id: 'JD810E', visningsnamn: '810E', modell: '810E', tillverkare: 'John Deere', maskin_typ: 'Forwarder', aktiv_till: null },
    ],
    objekt: [
      obj(OBJEKT.bagskytte, { status: 'pagaende', skordare_maskin_id: 'PONS20SDJAA270231', skotare_maskin_id: 'A110148' }),
      obj(OBJEKT.vallust, { status: 'pagaende', skotare_maskin_id: 'A030353' }),
      obj(OBJEKT.sandasen, { status: 'pagaende', skordare_maskin_id: 'R64428' }),
      obj(OBJEKT.almehult, { status: 'pagaende', skotare_maskin_id: 'JD810E' }),
      obj(OBJEKT.skalviken),
      obj(OBJEKT.kroksjomala, { status: 'pagaende', skordare_maskin_id: 'PONS20SDJAA270231' }),
      obj(OBJEKT.ostrahoka, { status: 'avslutat' }),
    ],
    flyttplats: [
      { id: 'pl-verkstan', namn: 'Verkstan Karlskrona', typ: 'verkstad', lat: 56.160, lng: 15.590, aktiv: true },
      { id: 'pl-gard', namn: 'Kompersmåla gård', typ: 'gard', lat: 56.459, lng: 14.702, aktiv: true },
    ],
    // Giants eget GPS (idag 11:23 svensk tid = 09:23Z), H8E igår på kvällen. Skotarna: hyttspår. 810E rapporteras för hand.
    detalj_gps_spar: [
      { maskin_id: 'PONS20SDJAA270231', latitude: 56.545, longitude: 14.745, tidpunkt: t('2026-10-19T09:23:00Z'), tid_ar_utc: true },
      { maskin_id: 'R64428', latitude: 56.430, longitude: 14.681, tidpunkt: t('2026-10-18T07:03:00Z'), tid_ar_utc: true },
    ],
    hyttspar: [
      { id: 'hs-elefant', objekt_id: 'obj-bagskytte', roll: 'skotare', datum: '2026-10-19', maskin_id: 'A110148', antal_punkter: 40, uppdaterad_at: '2026-10-19T09:24:00Z',
        points: [{ lat: 56.544, lng: 14.744, tid: '2026-10-19T09:10:00Z' }, { lat: 56.546, lng: 14.746, tid: '2026-10-19T09:24:00Z' }] },
      { id: 'hs-wisent', objekt_id: 'obj-vallust', roll: 'skotare', datum: '2026-10-19', maskin_id: 'A030353', antal_punkter: 40, uppdaterad_at: '2026-10-19T09:24:00Z',
        points: [{ lat: 56.470, lng: 14.870, tid: '2026-10-19T09:24:00Z' }] },
    ],
    maskin_position: [
      { maskin_id: 'JD810E', lat: 56.560, lng: 14.620, tidpunkt: '2026-10-07T08:00:00Z' },
    ],
    maskin_flytt: [],
    flyttdag: [],
    fakt_tid: [],
    dim_objekt: [],
    medarbetare: [{ id: 'm-1', user_id: 'u-1', namn: 'Martin Test', hem_lat: 56.459, hem_lng: 14.702 }],
    lastbil: [{ vin: 'VIN1', aktiv: true, hemmabas_lat: LBC.lat, hemmabas_lng: LBC.lng, hemmabas_radie_m: 300 }],
    lastbil_logg: [{ vin: 'VIN1', lat: 56.460, lng: 14.703, tidpunkt: '2026-10-19T10:25:00Z', odometer_m: 1_000_000, bransle_ml: 5_000_000 }],
  };
}
