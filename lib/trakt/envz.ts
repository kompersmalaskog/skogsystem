import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

// Uppackning av en .envz — StanForD 2010 Envelope: en zip med EN .env-fil, som i sin tur är
// XML med base64-kodade bilagor (traktdirektiv-PDF, traktkarta, shapefiler, object-info m.m.)
// plus ett XML-escapat OGI-dokument. Här görs BARA uppackningen; fält- och geometriuttag
// ligger i senare steg.

export interface EnvzResultat {
  version: string | null;          // envelope version-attribut (byggd för 3.4)
  bilagor: Map<string, Buffer>;    // AttachmentName -> avkodad Buffer
  ogiXml: string | null;           // MessageDocument/EmbeddedDocument, avkodat till ren XML
  varningar: string[];             // t.ex. oväntad version — stoppar inte importen
}

const VÄNTAD_VERSION = '3.4';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,   // StanForD-XML är namespaced (xmlns=...) — jobba utan prefix
  parseTagValue: false,   // allt som sträng: bevara ledande nollor och stora heltal exakt
  trimValues: true,
});

function textOf(v: any): string | undefined {
  if (v == null) return undefined;
  if (typeof v === 'object') return v['#text'];
  return v as string;
}

// Samla alla värden för en nyckel oavsett djup. StanForD-strukturen varierar mellan objekt,
// så vi letar på namn i stället för att lita på en fast sökväg.
function samlaDjupt(obj: any, nyckel: string, ut: any[] = []): any[] {
  if (obj == null || typeof obj !== 'object') return ut;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === nyckel.toLowerCase()) ut.push(obj[k]);
    samlaDjupt(obj[k], nyckel, ut);
  }
  return ut;
}

/**
 * Packa upp en .envz. Returnerar null om behållaren INTE är en envz (ingen .env inuti) —
 * då faller anroparen tillbaka på den vanliga zip-vägen (Steg 7).
 */
export async function packaUppEnvz(
  bytes: ArrayBuffer | Uint8Array,
): Promise<EnvzResultat | null> {
  const zip = await JSZip.loadAsync(bytes);
  const envPoster = Object.entries(zip.files).filter(
    ([namn, e]) => !e.dir && namn.toLowerCase().endsWith('.env'),
  );
  if (envPoster.length === 0) return null; // inte en envz

  const varningar: string[] = [];
  // Flera .env i arkivet ska aldrig tyst tappa någon — behåll den första, logga resten.
  // Samma klass av fel som en enskild stampPdfBytes-variabel.
  if (envPoster.length > 1) {
    varningar.push(
      `Arkivet innehåller ${envPoster.length} .env-filer (${envPoster
        .map(([n]) => n)
        .join(', ')}) — använder den första.`,
    );
  }
  const envXml = await envPoster[0][1].async('string');
  const doc = parser.parse(envXml);

  // Version-attribut på envelopen. Byggd för 3.4; annan version loggas men stoppar inte —
  // VIDA:s envz-kontrakt är inte vårt, en versionshöjning ska inte fälla en trakt.
  const rotNyckel = Object.keys(doc).find((k) => /envelope/i.test(k));
  const rot = rotNyckel ? doc[rotNyckel] : undefined;
  const version: string | null = (rot && rot['@_version']) || null;
  if (version !== VÄNTAD_VERSION) {
    varningar.push(
      `Oväntad envelope-version "${version ?? 'saknas'}" (byggd för ${VÄNTAD_VERSION}) — importerar ändå.`,
    );
  }

  // Bilagor: MessageAttachment[] med AttachmentName + EmbeddedAttachment (base64).
  // Samla i en Map<filnamn, Buffer>. Ingen bilaga får tyst skriva över en annan — logga i
  // stället om två delar samma namn (bör inte hända).
  const bilagor = new Map<string, Buffer>();
  const attNoder = samlaDjupt(doc, 'MessageAttachment').flat(Infinity);
  for (const a of attNoder) {
    const namn = textOf(samlaDjupt(a, 'AttachmentName').flat(Infinity)[0]);
    const b64 = textOf(samlaDjupt(a, 'EmbeddedAttachment').flat(Infinity)[0]);
    if (!namn || typeof b64 !== 'string') continue;
    if (bilagor.has(namn)) {
      varningar.push(`Bilaga "${namn}" förekommer flera gånger — behåller den första.`);
      continue;
    }
    bilagor.set(namn, Buffer.from(b64, 'base64'));
  }

  // OGI-dokumentet: MessageDocument/EmbeddedDocument innehåller XML-escapad OGI-XML (cert,
  // avverkningsform m.m. läses ur den i Steg 4). Här bara avkodning till ren XML-sträng.
  const ogiRaw = samlaDjupt(doc, 'EmbeddedDocument').flat(Infinity)[0];
  const ogiXml = textOf(ogiRaw) ?? null;

  return { version, bilagor, ogiXml, varningar };
}
