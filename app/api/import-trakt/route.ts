import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import JSZip from 'jszip';
import proj4 from 'proj4';

// Klient med ANVÄNDARENS session (cookies) — inte en naken anon-klient.
// Uppladdningarna till kartbilder-bucketen går då genom storage-policyerna
// (privat bucket, bara admin skriver) istället för anonymt.
async function skapaInloggadKlient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* svar från API-route sätter inga cookies */ },
      },
    }
  );
}

// Läs JPEG-dimensioner från binärdata
function getJpegDimensions(data: Uint8Array): { width: number; height: number } | null {
  let i = 0;
  if (data[i] !== 0xFF || data[i + 1] !== 0xD8) return null; // Inte JPEG
  i += 2;
  while (i < data.length) {
    if (data[i] !== 0xFF) return null;
    const marker = data[i + 1];
    if (marker === 0xC0 || marker === 0xC2) { // SOF0 eller SOF2
      const height = (data[i + 5] << 8) | data[i + 6];
      const width = (data[i + 7] << 8) | data[i + 8];
      return { width, height };
    }
    const length = (data[i + 2] << 8) | data[i + 3];
    i += 2 + length;
  }
  return null;
}

// SWEREF99 TM (EPSG:3006) definition för proj4
const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

// Konvertera SWEREF99 TM till WGS84 med proj4
function sweref99ToWgs84(n: number, e: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [e, n]);
  return { lat, lng };
}

export async function POST(request: NextRequest) {
  try {
    // Auth-gate: trakt-importen skriver markägardata (objekt + kartbilder-
    // bucketen) — bara inloggad admin får köra den. Tidigare var routen
    // helt öppen och skrev via anon-klient.
    const supabase = await skapaInloggadKlient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 });
    }
    const { data: medarbetare } = await supabase
      .from('medarbetare')
      .select('roll')
      .eq('epost', user.email)
      .single();
    if (medarbetare?.roll !== 'admin') {
      return NextResponse.json({ error: 'Kräver admin' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ar = parseInt(formData.get('ar') as string);
    const manad = parseInt(formData.get('manad') as string);

    if (!file) {
      return NextResponse.json({ error: 'Ingen fil' }, { status: 400 });
    }

    // Packa upp ZIP
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Hitta PDF-filer. _TD.pdf = traktdirektiv (text extraheras härifrån + sparas som
    // dokument). Övrig pdf (om den finns) = stämplingslängd. Tolka INTE innehållet.
    // Läs varje PDF-entry till en STABIL byte-snapshot EN gång — samma bytes återanvänds
    // sedan av både textutläsningen och uppladdningen (se .slice() vid unpdf nedan).
    let pdfBytes: Uint8Array | null = null;          // traktdirektivet
    let pdfFilename = '';
    let stampPdfBytes: Uint8Array | null = null;     // stämplingslängd (övrig pdf)
    let stampPdfFilename = '';
    for (const [filename, entry] of Object.entries(zip.files)) {
      if (entry.dir || !filename.toLowerCase().endsWith('.pdf')) continue;
      const bytes = new Uint8Array(await entry.async('arraybuffer'));
      if (/_TD\.pdf$/i.test(filename)) { pdfBytes = bytes; pdfFilename = filename; }
      else { stampPdfBytes = bytes; stampPdfFilename = filename; }
    }
    // Fallback: ingen _TD-fil men det finns en pdf → behandla den som traktdirektiv
    if (!pdfBytes && stampPdfBytes) {
      pdfBytes = stampPdfBytes; pdfFilename = stampPdfFilename;
      stampPdfBytes = null; stampPdfFilename = '';
    }

    if (!pdfBytes) {
      return NextResponse.json({ error: 'Ingen PDF i ZIP' }, { status: 400 });
    }

    // Hämta traktnr från filnamnet (t.ex. "886788_TD.pdf" -> "886788")
    const filenameMatch = pdfFilename.match(/(\d{6})_TD\.pdf/i);
    const traktnrFromFilename = filenameMatch ? filenameMatch[1] : '';

    // Extrahera text med unpdf
    let text = '';
    try {
      const { extractText } = await import('unpdf');
      // unpdf/PDF.js DETACHAR bufferten den får → ge en engångskopia så att pdfBytes
      // överlever till PDF-uppladdningen nedan (annars "detached ArrayBuffer" vid upload).
      const result = await extractText(pdfBytes.slice(), { mergePages: true });
      text = result.text || '';
    } catch (e) {
      console.error('PDF extraction failed:', e);
      return NextResponse.json({ error: 'Kunde inte läsa PDF' }, { status: 500 });
    }

    console.log('=== PDF TEXT (first 2000 chars) ===');
    console.log(text.substring(0, 2000));

    // === PARSNING ===

    // Namn - efter "Traktdirektiv -"
    let namn = '';
    const namnMatch = text.match(/Traktdirektiv\s*[-–]\s*([A-Za-zÅÄÖåäö0-9\s]+?)(?=\s*Traktnr|\n)/i);
    if (namnMatch) {
      namn = namnMatch[1].trim();
    }
    if (!namn || namn.length > 50) {
      // Försök hitta namn på annat sätt
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('Traktdirektiv') && line.includes('-')) {
          const parts = line.split(/[-–]/);
          if (parts.length > 1) {
            namn = parts[1].trim().substring(0, 50);
            break;
          }
        }
      }
    }
    console.log('namn:', namn);

    // Traktnr
    let traktnr = traktnrFromFilename;
    if (!traktnr) {
      const traktMatch = text.match(/(\d{6})/);
      traktnr = traktMatch ? traktMatch[1] : '';
    }
    console.log('traktnr:', traktnr);

    // VO-nummer - 8 siffror (börjar med 11) efter "Virkesorder"
    let vo_nummer = '';
    const voMatch = text.match(/Virkesorder[\s\S]{0,100}?(11\d{6})/i);
    if (voMatch) {
      vo_nummer = voMatch[1];
    }
    console.log('vo_nummer:', vo_nummer);

    // === KONTAKTPERSONER ===
    // PDF-struktur: "Inköpare VIDA MARCUS GIDSTAM aramolund@gmail.com Jan-Erik Gustafsson 070-640 55 84 070-2327410"

    // Markägare - namn i VERSALER efter "VIDA"
    let markagare = '';
    const markagareMatch = text.match(/VIDA\s+([A-ZÅÄÖ][A-ZÅÄÖ]+(?:\s+[A-ZÅÄÖ]+)+)/);
    if (markagareMatch) {
      markagare = markagareMatch[1].trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }
    console.log('=== KONTAKT DEBUG ===');
    console.log('markagare:', markagare);

    // E-post - första e-postadressen (markägarens)
    const epostMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z]{2,})/);
    const markagare_epost = epostMatch ? epostMatch[1] : '';
    console.log('markagare_epost:', markagare_epost);

    // Inköpare - namn efter e-post (förnamn efternamn med normal stil)
    let inkopare = '';
    const inkopareMatch = text.match(/@[a-zA-Z0-9._-]+\.[a-z]+\s+([A-ZÅÄÖ][a-zåäö]+(?:-[A-ZÅÄÖ][a-zåäö]+)?\s+[A-ZÅÄÖ][a-zåäö]+)/);
    if (inkopareMatch) {
      inkopare = inkopareMatch[1].trim();
    }
    console.log('inkopare:', inkopare);

    // Telefonnummer - alla 07X-nummer
    const allaTelefoner = text.match(/07\d[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2}/g) || [];
    const renaTelefoner = allaTelefoner.map(t => t.replace(/[\s-]/g, ''));
    console.log('alla telefoner:', allaTelefoner);

    // Markägarens telefon = första numret som INTE är 0702327410
    const markagare_tel = renaTelefoner.find(t => t !== '0702327410') || '';
    // Inköparens telefon = alltid 0702327410 för VIDA
    const inkopare_tel = renaTelefoner.find(t => t === '0702327410') || '';
    console.log('markagare_tel:', markagare_tel);
    console.log('inkopare_tel:', inkopare_tel);

    // Cert - leta efter orden i texten
    let cert = 'Ej certifierad';
    if (text.includes('FSC PEFC') || (text.includes('FSC') && text.includes('PEFC'))) {
      cert = 'FSC PEFC';
    } else if (text.includes('FSC')) {
      cert = 'FSC';
    } else if (text.includes('PEFC')) {
      cert = 'PEFC';
    }
    console.log('cert:', cert);

    // Typ
    const typ = /[Ff]öryngringsavverkning/.test(text) ? 'slutavverkning'
      : /[Gg]allring/.test(text) ? 'gallring' : 'slutavverkning';
    console.log('typ:', typ);

    // Volym
    let volym = 0;
    const volymMatch = text.match(/(\d{3,5})\s*m3fub/i) || text.match(/Total[\s\S]{0,100}?(\d{3,5})\s*\n/);
    if (volymMatch) {
      volym = parseInt(volymMatch[1]);
    }
    console.log('volym:', volym);

    // Areal
    let areal: number | null = null;
    const arealMatch = text.match(/Total\s+(\d+[,.]?\d*)\s/);
    if (arealMatch) {
      areal = parseFloat(arealMatch[1].replace(',', '.'));
    }
    console.log('areal:', areal);

    // Koordinater
    let lat: number | null = null;
    let lng: number | null = null;
    const nordMatch = text.match(/(\d{7})\s+(\d{6})/);
    if (nordMatch) {
      const coords = sweref99ToWgs84(parseInt(nordMatch[1]), parseInt(nordMatch[2]));
      lat = coords.lat;
      lng = coords.lng;
    }
    console.log('koordinater:', lat, lng);

    // GROT - leta efter exakt "GROT-anpassa avverkningen" följt av Ja eller Nej
    let grot = false;
    const grotMatch = text.match(/GROT-anpassa avverkningen\s+(Ja|Nej)/i);
    if (grotMatch) {
      grot = grotMatch[1].toLowerCase() === 'ja';
    }
    console.log('GROT match:', grotMatch?.[0]);
    console.log('grot:', grot);

    // Anteckningar - all text efter "Anteckningar:" fram till "Sida"
    let anteckningar = '';
    const antMatch = text.match(/Anteckningar:\s*([\s\S]+?)(?=\s*Sida\s+\d|$)/i);
    if (antMatch) {
      anteckningar = antMatch[1].trim().substring(0, 500); // Max 500 tecken
    }
    console.log('=== ANTECKNINGAR DEBUG ===');
    console.log('anteckningar:', anteckningar);

    // Sortiment - format måste matcha appen: "Grupp · Typ"
    const sortiment: string[] = [];
    if (/Tallsågtimmer/i.test(text)) sortiment.push('Tall timmer · Urshult');
    if (/Gransågtimmer/i.test(text)) sortiment.push('Gran timmer · Urshult');
    if (/Tallkubb/i.test(text)) sortiment.push('Kubb · Tall');
    if (/Grankubb/i.test(text)) sortiment.push('Kubb · Gran');
    if (/Barrmassa/i.test(text)) sortiment.push('Massa · Barr');
    if (/Björkmassa/i.test(text)) sortiment.push('Massa · Björk');
    if (/Bränsle/i.test(text)) sortiment.push('Energi · Bränsleved');
    console.log('sortiment:', sortiment);

    // === KARTBILD ===
    console.log('=== KARTBILD DEBUG ===');
    let kartbild_url: string | null = null;
    let kartbild_bounds: number[][] | null = null;

    // Lista alla filer i ZIP
    const allFiles = Object.keys(zip.files);
    console.log('Filer i ZIP:', allFiles);

    // Hitta .jpg och .jgw filer
    let jpgEntry: JSZip.JSZipObject | null = null;
    let jpgFilename = '';
    let jgwEntry: JSZip.JSZipObject | null = null;
    let jgwFilename = '';

    for (const [filename, entry] of Object.entries(zip.files)) {
      if (filename.toLowerCase().endsWith('.jpg') && !entry.dir) {
        jpgEntry = entry;
        jpgFilename = filename;
        console.log('Hittade JPG:', filename);
      }
      if (filename.toLowerCase().endsWith('.jgw') && !entry.dir) {
        jgwEntry = entry;
        jgwFilename = filename;
        console.log('Hittade JGW:', filename);
      }
    }

    if (!jpgEntry) console.log('VARNING: Ingen .jpg hittades');
    if (!jgwEntry) console.log('VARNING: Ingen .jgw hittades');

    if (jpgEntry) {
      try {
        console.log('Läser JPG:', jpgFilename);

        // Läs JPG-data
        const jpgData = new Uint8Array(await jpgEntry.async('arraybuffer'));
        console.log('JPG storlek:', jpgData.length, 'bytes');

        // Ladda upp till Supabase Storage (alltid, oavsett om bounds kan beräknas)
        const storagePath = `${traktnr || Date.now()}.jpg`;
        console.log('Försöker ladda upp till:', storagePath);

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('kartbilder')
          .upload(storagePath, jpgData, {
            contentType: 'image/jpeg',
            upsert: true
          });

        console.log('Upload result:', { uploadData, uploadError });

        if (uploadError) {
          console.error('Upload error details:', JSON.stringify(uploadError, null, 2));
        } else {
          // Bucketen är PRIVAT — lagra PATH, aldrig URL. Läsning signerar
          // via lib/kartfiler.ts (createSignedUrl).
          kartbild_url = storagePath;
          console.log('Kartbild path:', kartbild_url);
        }

        // Beräkna bounds om JGW finns och JPEG-dimensioner kan läsas
        if (jgwEntry) {
          const dimensions = getJpegDimensions(jpgData);
          console.log('Dimensioner:', dimensions);

          const jgwText = await jgwEntry.async('string');
          const jgwLines = jgwText.trim().split(/\r?\n/);
          console.log('JGW:', jgwLines);

          const parseJgwValue = (s: string) => parseFloat(s.replace(',', '.'));

          if (dimensions && jgwLines.length >= 6) {
            const pixelSizeX = parseJgwValue(jgwLines[0]);
            const pixelSizeY = parseJgwValue(jgwLines[3]);
            const pixelCenterX = parseJgwValue(jgwLines[4]);
            const pixelCenterY = parseJgwValue(jgwLines[5]);

            console.log('=== JGW RÅVÄRDEN ===');
            console.log('pixelSizeX:', pixelSizeX, '(meter/pixel X)');
            console.log('pixelSizeY:', pixelSizeY, '(meter/pixel Y, ska vara negativ)');
            console.log('pixelCenterX:', pixelCenterX, '(easting)');
            console.log('pixelCenterY:', pixelCenterY, '(northing)');
            console.log('Bildstorlek:', dimensions.width, 'x', dimensions.height, 'px');

            // JGW anger pixel-center, justera till pixel-kant (övre vänstra hörnet)
            const upperLeftX = pixelCenterX - pixelSizeX / 2;
            const upperLeftY = pixelCenterY - pixelSizeY / 2;

            // Beräkna bounds i SWEREF99 TM
            const lowerRightX = upperLeftX + (dimensions.width * pixelSizeX);
            const lowerRightY = upperLeftY + (dimensions.height * pixelSizeY);

            console.log('=== SWEREF99 BOUNDS (efter pixel-kant justering) ===');
            console.log('upperLeft  (NW):', upperLeftX, upperLeftY);
            console.log('lowerRight (SE):', lowerRightX, lowerRightY);

            const upperLeft = sweref99ToWgs84(upperLeftY, upperLeftX);
            const lowerRight = sweref99ToWgs84(lowerRightY, lowerRightX);

            console.log('=== WGS84 BOUNDS ===');
            console.log('upperLeft  (NW): lat', upperLeft.lat, 'lng', upperLeft.lng);
            console.log('lowerRight (SE): lat', lowerRight.lat, 'lng', lowerRight.lng);

            kartbild_bounds = [
              [lowerRight.lat, upperLeft.lng], // Southwest corner
              [upperLeft.lat, lowerRight.lng]  // Northeast corner
            ];
            console.log('kartbild_bounds (SW, NE):', JSON.stringify(kartbild_bounds));
          } else {
            console.log('VARNING: Kunde inte beräkna bounds (dimensions:', dimensions, ', jgwLines:', jgwLines.length, ')');
          }
        }
      } catch (e) {
        console.error('Kartbild error:', e);
      }
    }

    // === DOKUMENT (PDF:er) — spara filerna i 'kartbilder'-bucketen (samma mönster som
    // kartbild_url). Tolka INTE innehållet; format varierar mellan leverantörer.
    // Bucketen är PRIVAT (PDF:erna bär markägares namn/telefon/e-post) —
    // vi lagrar PATHS och läsning signerar via lib/kartfiler.ts.
    let traktdirektiv_url: string | null = null;
    let stamplingslangd_url: string | null = null;
    const laddaUppPdf = async (bytes: Uint8Array | null, suffix: string): Promise<string | null> => {
      if (!bytes) return null;
      const path = `${traktnr || Date.now()}_${suffix}.pdf`;
      const { error: pdfErr } = await supabase.storage.from('kartbilder')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (pdfErr) { console.error(`PDF-uppladdning (${suffix}) misslyckades:`, pdfErr); return null; }
      return path;
    };
    traktdirektiv_url = await laddaUppPdf(pdfBytes, 'traktdirektiv');           // _TD.pdf
    stamplingslangd_url = await laddaUppPdf(stampPdfBytes, 'stamplingslangd');  // övrig pdf

    const bolag = 'Vida';

    // Skapa data-objekt
    const data = {
      vo_nummer: vo_nummer || null,
      traktnr: traktnr || null,
      namn: namn || 'Okänt objekt',
      bolag,
      inkopare: inkopare || null,
      inkopare_tel: inkopare_tel || null,
      markagare: markagare || null,
      markagare_tel: markagare_tel || null,
      markagare_epost: markagare_epost || null,
      cert: cert || null,
      typ,
      atgard: typ === 'slutavverkning' ? 'Au' : 'Gallring',
      volym,
      areal,
      grot,
      lat,
      lng,
      sortiment: sortiment.length > 0 ? sortiment : null,
      anteckningar: anteckningar || null,
      kartbild_url,
      kartbild_bounds,
      traktdirektiv_url,
      stamplingslangd_url,
      ar,
      manad,
      ordning: 1,
      // status utelämnas → DB-default 'planerad' (objekt_status_check tillåter inte 'oplanerad')
      kalla: 'traktdirektiv'
    };

    console.log('=== DATA TO SAVE ===');
    console.log(JSON.stringify(data, null, 2));

    // Spara till Supabase
    const { data: saved, error } = await supabase
      .from('objekt')
      .insert(data)
      .select()
      .single();

    if (error) {
      console.error('Supabase error:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Objektet finns redan' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, objekt: saved });

  } catch (err: any) {
    console.error('Import error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
