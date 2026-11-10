// "Varför ser det ut så här?" på markägarens länk, när vi är klara. Rena funktioner — servern räknar talen, sidan ritar bara.
//
// Martin 2026-11-10: BARA det som gäller trakten, högst några rader.
// - Gallring: inga certifieringsrader alls (de gäller avverkning). I stället två rader om det markägare undrar på en gallring: stickvägarna och att de bästa träden står kvar.
// - Slutavverkning, certifierad: evighetsträd och högstubbar (antal, aldrig "N av krav" på raden — kravet står i arket; 0 visas inte som ett tal).
// - Grova toppar och ris: BARA FSC och när GROT tas. Riset räknas aldrig i procent — riset i basvägarna mäter ingen, ett påhittat tal är värre än inget.
//
// Martin 2026-11-05 (texterna granskas av Jan-Erik senare — ändra HÄR, ingen text i komponenten):
// - Bara certifierade trakter (objekt.cert nämner FSC eller PEFC) får sektionen. Ersättningen gäller alla certifierade, ingen extra godkänning.
// - Bara rader som gäller trakten: grova toppar och ris alltid på certifierade (annars tror markägaren att vi slarvat), kantzon bara när Vida har en
//   kant mot vatten, "Träd utspridda" bara FSC och över 4 ha. Kantzonens bredd skrivs aldrig som ett tal ("enligt Vidas plan").
// - Räkneregeln för kantzon/hänsyn (vad som får räknas in) står INTE på sidan.
// - Talen är HITTILLS — de växer medan vi avverkar.

import { EVIGHETSTRAD_PER_HA, HOGSTUBBAR_PER_HA } from '@/lib/miljokrav';

export type SkogRadId = 'evighetstrad' | 'hogstubbe' | 'toppar' | 'ris' | 'kantzon' | 'spridda' | 'stickvagar' | 'basta';

export type SkogRad = {
  id: SkogRadId;
  namn: string;
  /** Kort varför, under namnet. */
  varfor: string;
  /** "41 av 73" / "12" — bara för det vi räknar. */
  varde: string | null;
  /** Nyckel i lib/malbilder ("Så ska det se ut"), null = ingen bild. */
  malbild: string | null;
  /** 2–3 rader i arket. */
  forklaring: string;
  /** Kravet, dämpat i arket. */
  krav: string;
  /** Finns något att visa på kartan för just den här raden? */
  karta: boolean;
};

export type Cert = { fsc: boolean; pefc: boolean };

export function tolkaCert(cert: string | null | undefined): Cert {
  const t = String(cert ?? '').toUpperCase();
  return { fsc: /(^|[^A-Z])FSC([^A-Z]|$)/.test(t), pefc: /(^|[^A-Z])PEFC([^A-Z]|$)/.test(t) };
}
export const arCert = (c: Cert): boolean => c.fsc || c.pefc;

export function certIntro(c: Cert): string | null {
  const vad = c.fsc && c.pefc ? 'FSC- och PEFC-certifierad' : c.fsc ? 'FSC-certifierad' : c.pefc ? 'PEFC-certifierad' : null;
  return vad ? `Din skog är ${vad}. Då sparar vi träd åt naturen, och du får ersättning för det.` : null;
}

export const CERT_FORKLARING = {
  rubrik: 'Vad är FSC och PEFC?',
  text: [
    'Två certifieringar för skog som sköts med hänsyn till naturen och människorna som bor där.',
    'Vida köper certifierat virke, och du får ersättning för att du följer kraven.',
    'Kraven är nästan desamma. Det mesta som står här gäller båda.',
  ],
} as const;

export const KARTA_UNGEFAR = 'Prickarna visar ungefärlig plats';

/** Över så här många hektar gäller FSC:s regel om träd utspridda över hygget. */
export const SPRIDDA_FRAN_HA = 4;
export const SPRIDDA_MAX_M = 70;

/** Antalet på raden: bara när något är satt (0 ser ut som ett misslyckande och säger inget). */
const antalText = (antal: number): string | null => (antal > 0 ? String(antal) : null);

export type SkogIndata = {
  /** objekt.typ: 'gallring' ger gallringsraderna, 'slutavverkning' certifieringsraderna, annat inga rader. */
  typ: string | null;
  cert: Cert;
  arealHa: number | null;
  grot: boolean;
  evighetstrad: number;
  hogstubbar: number;
  harEvighetstradPos: boolean;
  harHogstubbePos: boolean;
  harKantzon: boolean;
};

/** Gallringens två rader — gäller alla gallringar, certifierade eller inte. */
export const GALLRING_RADER: SkogRad[] = [
  {
    id: 'stickvagar', namn: 'Vägarna genom skogen', varfor: 'Ungefär var 20:e meter, så maskinen når träden', varde: null, malbild: null,
    forklaring: 'Maskinerna kör på smala vägar genom skogen, ungefär var 20:e meter. Därifrån når de träden runt omkring. Vägarna växer igen med tiden.',
    krav: '', karta: false,
  },
  {
    id: 'basta', namn: 'De bästa träden står kvar', varfor: 'De får mer ljus och växer snabbare', varde: null, malbild: null,
    forklaring: 'Vi tar ut klena, krokiga och skadade träd. De som står kvar får mer ljus, vatten och näring och växer sig grova.',
    krav: '', karta: false,
  },
];

/** Raderna under "Varför ser det ut så här?", i den ordning de visas. Tom lista = inga rader. */
export function skogRader(d: SkogIndata): SkogRad[] {
  const typ = String(d.typ ?? '').toLowerCase();
  if (typ === 'gallring') return GALLRING_RADER;
  if (typ !== 'slutavverkning' || !arCert(d.cert)) return [];
  const kravEv = d.arealHa != null ? Math.ceil(Math.round(d.arealHa * EVIGHETSTRAD_PER_HA * 1e6) / 1e6) : null;
  const kravHs = d.arealHa != null ? Math.ceil(Math.round(d.arealHa * HOGSTUBBAR_PER_HA * 1e6) / 1e6) : null;
  const r: SkogRad[] = [
    {
      id: 'evighetstrad', namn: 'Evighetsträd', varfor: 'Får aldrig avverkas', varde: antalText(d.evighetstrad), malbild: 'evighetstrad',
      forklaring: 'Grova och gamla träd som står kvar för alltid. De blir hem åt fåglar, insekter och lavar i hundratals år.',
      krav: kravEv != null ? `Kravet: minst ${EVIGHETSTRAD_PER_HA} per hektar, ${kravEv} på din trakt` : `Kravet: minst ${EVIGHETSTRAD_PER_HA} per hektar`, karta: d.harEvighetstradPos,
    },
    {
      id: 'hogstubbe', namn: 'Högstubbar', varfor: 'Hem åt insekter och hackspett', varde: antalText(d.hogstubbar), malbild: 'hogstubbe',
      forklaring: 'Träd som kapas högt och får stå kvar och dö. Död ved är det som flest arter i skogen lever av.',
      krav: kravHs != null ? `Kravet: minst ${HOGSTUBBAR_PER_HA} per hektar, ${kravHs} på din trakt` : `Kravet: minst ${HOGSTUBBAR_PER_HA} per hektar`, karta: d.harHogstubbePos,
    },
  ];
  if (d.cert.fsc && d.grot) r.push(
    {
      id: 'toppar', namn: 'Grova toppar', varfor: 'Ligger kvar med flit – inte slarv', varde: null, malbild: null,
      forklaring: 'En del grova toppar lämnas på hygget. Död ved på marken behövs för svampar och insekter.',
      krav: 'FSC: när riset tas ut ska grova toppar ligga kvar', karta: false,
    },
    {
      id: 'ris', namn: 'Ris på marken', varfor: 'Ger näring tillbaka', varde: null, malbild: null,
      forklaring: 'En del av riset ligger kvar med flit. Det ger näring tillbaka till marken. Riset i vägarna skyddar marken när maskinerna kör, och räknas in i det som lämnas.',
      krav: 'FSC: en del av riset ska ligga kvar när riset tas ut', karta: false,
    },
  );
  if (d.harKantzon) r.push({
    id: 'kantzon', namn: 'Kantzon', varfor: 'Skyddar vattnet', varde: null, malbild: 'kantzon',
    forklaring: 'En remsa träd och buskar står kvar mot vattnet. De skuggar, binder jorden och håller slam borta från vattnet.',
    krav: 'Bredden enligt Vidas plan', karta: true,
  });
  if (d.cert.fsc && d.arealHa != null && d.arealHa > SPRIDDA_FRAN_HA) r.push({
    id: 'spridda', namn: 'Träd utspridda över hygget', varfor: `Över ${SPRIDDA_FRAN_HA} ha: högst ${SPRIDDA_MAX_M} m till närmaste träd (FSC)`, varde: null, malbild: null,
    forklaring: `På stora hyggen sparas träd utspridda, så att ingen plats ligger mer än ${SPRIDDA_MAX_M} meter från ett träd. Hygget blir mindre kalt för djur och växter.`,
    krav: `FSC: gäller hyggen över ${SPRIDDA_FRAN_HA} hektar`, karta: false,
  });
  return r;
}

/** Är Vidas yta en kant mot vatten (kantzon)? TYP 24 i tilläggsytorna, eller beskrivningen säger det. */
export function arKantzon(props: Record<string, unknown> | null | undefined): boolean {
  if (!props || String(props._lager ?? '') !== 'L_TILLAGGSYTOR') return false;
  return String(props.TYP ?? '').trim() === '24' || /kant mot vatten/i.test(String(props.FLBESKR ?? ''));
}

/** Har markägaren beställt ved? Bara när planeraren fyllt i något (ved_detaljer är ett objekt med innehåll). */
export function harVed(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as Record<string, unknown>;
  return !!(r.langd || (Array.isArray(r.sortiment) && r.sortiment.length) || r.plats === 'karta' || (typeof r.ovrigt === 'string' && r.ovrigt.trim()));
}
