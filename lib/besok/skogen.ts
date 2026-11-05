// "Din skog" på markägarens länk: varför träd står kvar efter avverkningen. Rena funktioner — servern räknar talen, sidan ritar bara.
//
// Martin 2026-11-05 (texterna granskas av Jan-Erik senare — ändra HÄR, ingen text i komponenten):
// - Bara certifierade trakter (objekt.cert nämner FSC eller PEFC) får sektionen. Ersättningen gäller alla certifierade, ingen extra godkänning.
// - Bara rader som gäller trakten: grova toppar och ris alltid på certifierade (annars tror markägaren att vi slarvat), kantzon bara när Vida har en
//   kant mot vatten, "Träd utspridda" bara FSC och över 4 ha. Kantzonens bredd skrivs aldrig som ett tal ("enligt Vidas plan").
// - Räkneregeln för kantzon/hänsyn (vad som får räknas in) står INTE på sidan.
// - Talen är HITTILLS — de växer medan vi avverkar.

import { EVIGHETSTRAD_PER_HA, HOGSTUBBAR_PER_HA } from '@/lib/miljokrav';

export type SkogRadId = 'evighetstrad' | 'hogstubbe' | 'toppar' | 'ris' | 'kantzon' | 'spridda';

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

export const HITTILLS_TEXT = 'Hittills – siffrorna växer medan vi avverkar';
export const KARTA_UNGEFAR = 'Prickarna visar ungefärlig plats';

/** Över så här många hektar gäller FSC:s regel om träd utspridda över hygget. */
export const SPRIDDA_FRAN_HA = 4;
export const SPRIDDA_MAX_M = 70;

const avAntal = (antal: number, krav: number | null): string => (krav != null ? `${antal} av ${krav}` : String(antal));

export type SkogIndata = {
  cert: Cert;
  arealHa: number | null;
  grot: boolean;
  evighetstrad: number;
  hogstubbar: number;
  harEvighetstradPos: boolean;
  harHogstubbePos: boolean;
  harKantzon: boolean;
};

/** Raderna i "Därför står träden kvar", i den ordning de visas. Tom lista = sektionen visas inte (ej certifierat). */
export function skogRader(d: SkogIndata): SkogRad[] {
  if (!arCert(d.cert)) return [];
  const kravEv = d.arealHa != null ? Math.ceil(Math.round(d.arealHa * EVIGHETSTRAD_PER_HA * 1e6) / 1e6) : null;
  const kravHs = d.arealHa != null ? Math.ceil(Math.round(d.arealHa * HOGSTUBBAR_PER_HA * 1e6) / 1e6) : null;
  const r: SkogRad[] = [
    {
      id: 'evighetstrad', namn: 'Evighetsträd', varfor: 'Får aldrig avverkas', varde: avAntal(d.evighetstrad, kravEv), malbild: 'evighetstrad',
      forklaring: 'Grova och gamla träd som står kvar för alltid. De blir hem åt fåglar, insekter och lavar i hundratals år.',
      krav: `Kravet: minst ${EVIGHETSTRAD_PER_HA} per hektar`, karta: d.harEvighetstradPos,
    },
    {
      id: 'hogstubbe', namn: 'Högstubbar', varfor: 'Hem åt insekter och hackspett', varde: avAntal(d.hogstubbar, kravHs), malbild: 'hogstubbe',
      forklaring: 'Träd som kapas högt och får stå kvar och dö. Död ved är det som flest arter i skogen lever av.',
      krav: `Kravet: minst ${HOGSTUBBAR_PER_HA} per hektar`, karta: d.harHogstubbePos,
    },
    {
      id: 'toppar', namn: 'Grova toppar', varfor: 'Ligger kvar med flit – inte slarv', varde: null, malbild: null,
      forklaring: 'En del grova toppar lämnas på hygget. Död ved på marken behövs för svampar och insekter.',
      krav: 'Ingår i certifieringens krav på död ved', karta: false,
    },
    {
      id: 'ris', namn: 'Ris på marken', varfor: 'Ger näring tillbaka', varde: null, malbild: null,
      forklaring: 'Grenar och barr som ligger kvar ger tillbaka näring till marken och skyddar den när maskinerna kör.',
      krav: d.grot ? 'Riset tas ut, men minst en femtedel ligger kvar' : 'Riset ligger kvar', karta: false,
    },
  ];
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
