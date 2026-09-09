import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import JSZip from 'jszip';
import proj4 from 'proj4';
import { packaUppEnvz } from '@/lib/trakt/envz';
import { parseObjektInfo } from '@/lib/trakt/objektinfo';
import { parseTraktdirektivText } from '@/lib/trakt/td-parser';
import { mergeFalt, executorGodkand, forvantadExecutorOrgnr } from '@/lib/trakt/merge';
import { packaGeometri, bboxCentrum } from '@/lib/trakt/geometri';
import { klassificeraDokument } from '@/lib/trakt/dokument';

export const runtime = 'nodejs'; // JSZip + unpdf + fast-xml-parser behöver Node-runtime, inte edge
// Stora trakter (fyra traktkartor + översikt = 40+ MB) tar tid: uppackning + base64 av ~46
// bilagor + flera stora PDF-uppladdningar. Default-maxDuration timeoutade (889174). 300 s = tak.
export const maxDuration = 300;

// Klient med ANVÄNDARENS session (cookies). Uppladdningar till kartbilder-bucketen går då
// genom storage-policyerna (privat bucket, bara admin skriver) istället för anonymt.
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

// Service-role-klient för att LÄSA den privata trakt-inbox-bucketen och SKRIVA objekt_geometri
// (vars RLS bara tillåter authenticated SELECT). Går förbi RLS.
function skapaServiceKlient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
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

// SWEREF99 TM (EPSG:3006) — används av kartbilds-bounds (zip-vägen). RÖR EJ.
const SWEREF99TM = '+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';
function sweref99ToWgs84(n: number, e: number): { lat: number; lng: number } {
  const [lng, lat] = proj4(SWEREF99TM, 'WGS84', [e, n]);
  return { lat, lng };
}

// Loggar ett misslyckat trakt-importförsök i import_fel (läses av /datahalsa "Tappades något vid
// import?"). Så att en 500:ad import syns i appen i stället för att lämna en föräldralös fil i
// trakt-inbox som ingen tittar i (Wisent-läxan: tyst tapp upptäcks aldrig). En död funktion
// (OOM/timeout) kan inte logga sig själv — då loggar klienten via /api/import-trakt/logga-fel.
// Best-effort: en misslyckad loggning får ALDRIG maskera originalfelet.
async function loggaImportFel(service: any, filnamn: string | null, felkod: string, feltext: string) {
  try {
    await service.from('import_fel').insert({
      tabell: 'objekt', filnamn, felkod, feltext: (feltext ?? '').slice(0, 2000),
    });
  } catch (e) {
    console.error('Kunde inte logga import_fel:', e);
  }
}

export async function POST(request: NextRequest) {
  let sokvagForLogg: string | null = null; // hoistad så catch kan logga vilken fil som föll
  try {
    // Auth-gate: trakt-importen skriver markägardata — bara inloggad admin får köra den.
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

    // Filen ligger i trakt-inbox (klienten laddade upp via signerad URL). Vi får bara sökväg +
    // period som JSON, så requesten slår aldrig i Vercels ~4,5 MB body-gräns.
    const { sokvag, ar: arRaw, manad: manadRaw } = await request.json();
    const ar = parseInt(arRaw);
    const manad = parseInt(manadRaw);
    if (!sokvag || typeof sokvag !== 'string') {
      return NextResponse.json({ error: 'sokvag saknas' }, { status: 400 });
    }
    sokvagForLogg = sokvag;

    const service = skapaServiceKlient();
    const { data: blob, error: dlErr } = await service.storage.from('trakt-inbox').download(sokvag);
    if (dlErr || !blob) {
      return NextResponse.json(
        { error: `Kunde inte hämta filen ur trakt-inbox: ${dlErr?.message ?? 'saknas'}` },
        { status: 404 }
      );
    }
    const arrayBuffer = await blob.arrayBuffer();

    const varningar: string[] = [];

    // Tak-varning: bucketen tar 100 MB, men vi vill VETA när vi närmar oss i stället för att
    // upptäcka det genom ett avvisat objekt mitt i en arbetsdag. Vid >50 MB (halva taket) logga
    // i import_varningar. Den här var 43,6 MB (fyra traktkartor + översiktskarta); nästa kan vara
    // 80. blob.size = råfilens byte, före uppackning.
    const filMB = blob.size / (1024 * 1024);
    if (blob.size > 50 * 1024 * 1024) {
      varningar.push(`Filen är ${filMB.toFixed(1)} MB — över 50 MB (halva taket 100 MB). Håll koll så vi inte slår i taket.`);
    }

    // Envz (StanForD Envelope) eller vanlig zip? packaUppEnvz -> null om ingen .env (= zip).
    const envz = await packaUppEnvz(arrayBuffer);

    // Samla PDF:er + (zip) kartbild-filer + (envz) object-info.
    const pdfer: { namn: string; bytes: Uint8Array }[] = [];
    let jpgEntry: JSZip.JSZipObject | null = null;
    let jpgFilename = '';
    let jgwEntry: JSZip.JSZipObject | null = null;
    let bilagor: Map<string, Buffer> | null = null;
    let objektinfoXml: string | null = null;
    let ogiXml: string | null = null;

    if (envz) {
      varningar.push(...envz.varningar);
      bilagor = envz.bilagor;
      ogiXml = envz.ogiXml;
      // buf ÄR redan en Buffer (Uint8Array-subklass) — referera den, kopiera INTE med
      // new Uint8Array (sparar ~39 MB på en trakt med fyra 7–10 MB-kartor). pdf.js får en
      // egen kopia först vid textutdraget nedan (enda stället bufferten kan behöva vara fristående).
      for (const [namn, buf] of Array.from(bilagor)) {
        if (/\.pdf$/i.test(namn)) pdfer.push({ namn, bytes: buf });
        else if (/object-info\.xml$/i.test(namn)) objektinfoXml = buf.toString('utf-8');
      }
    } else {
      // JSZip laddas BARA i zip-fallbacken. För envz laddade packaUppEnvz redan arkivet —
      // en andra JSZip.loadAsync här höll ett helt extra arkiv i minnet i onödan (~40 MB).
      const zip = await JSZip.loadAsync(arrayBuffer);
      for (const [filename, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        const l = filename.toLowerCase();
        if (l.endsWith('.pdf')) pdfer.push({ namn: filename, bytes: new Uint8Array(await entry.async('arraybuffer')) });
        else if (l.endsWith('.jpg')) { jpgEntry = entry; jpgFilename = filename; }
        else if (l.endsWith('.jgw')) { jgwEntry = entry; }
      }
    }

    // Envz-fält + Executor-gate.
    let envzUttag: ReturnType<typeof parseObjektInfo> | null = null;
    if (envz && objektinfoXml) {
      envzUttag = parseObjektInfo(objektinfoXml, ogiXml);
      varningar.push(...envzUttag.varningar);
      if (!executorGodkand(envzUttag.executor)) {
        // Logga den AVVISADE leveransen i import_fel (utöver att visa felet) så vi har historik
        // över vad som stoppats — en avvisning som bara visas för den som råkar importera glöms.
        // Rik kontext så raden är självförklarande i /datahalsa: org.nr, trakt, VO, requestor.
        await loggaImportFel(
          service, sokvag, 'EXECUTOR_AVVISAD',
          `Executor "${envzUttag.executor ?? 'saknas'}" matchar inte ${forvantadExecutorOrgnr()}. ` +
          `Trakt ${envzUttag.falt.traktnr ?? '?'} (${envzUttag.falt.namn ?? '?'}), VO ${envzUttag.falt.vo_nummer ?? '?'}, Requestor ${envzUttag.falt.bolag ?? '?'}.`,
        );
        return NextResponse.json(
          { error: `Executor "${envzUttag.executor ?? 'saknas'}" matchar inte ${forvantadExecutorOrgnr()} — annan entreprenörs leverans, inget objekt skapat.` },
          { status: 403 }
        );
      }
    } else if (envz && !objektinfoXml) {
      varningar.push('envz saknar object-info.xml — bara TD-fält används.');
    }

    // Klassificera dokument (suffix-regler, arrayer, ingen fallback).
    const klass = klassificeraDokument(pdfer, envzUttag?.info);
    varningar.push(...klass.varningar);
    if (!klass.traktdirektiv) {
      return NextResponse.json({ error: 'Inget traktdirektiv (_TD.pdf) i filen — importen gissar inte.' }, { status: 400 });
    }

    // Traktnr ur TD-filnamnet (t.ex. "886465_TD.pdf" -> "886465").
    const tdNamn = klass.traktdirektiv.namn.split('/').pop() || klass.traktdirektiv.namn;
    const tdFilMatch = tdNamn.match(/(\d{6})_TD\.pdf/i);
    const traktnrFromFilename = tdFilMatch ? tdFilMatch[1] : '';

    // TD-text -> fält (samma parser för envz och zip).
    let text = '';
    try {
      const { extractText } = await import('unpdf');
      // Egen kopia till pdf.js (bytes kan nu vara en Buffer, vars .slice() ger en delad vy;
      // new Uint8Array kopierar). Bara traktdirektivet läses som text — inte de stora kartorna.
      text = (await extractText(new Uint8Array(klass.traktdirektiv.bytes), { mergePages: true })).text || '';
    } catch (e: any) {
      console.error('PDF extraction failed:', e);
      await loggaImportFel(service, sokvag, 'PDF_LAS', `Kunde inte läsa traktdirektiv-PDF: ${e?.message ?? e}`);
      return NextResponse.json({ error: 'Kunde inte läsa PDF' }, { status: 500 });
    }
    const td = parseTraktdirektivText(text, traktnrFromFilename);

    // Merge: TD som bas, envz vinner ENDAST där envz har ett värde.
    const tdRecord: Record<string, any> = {
      namn: td.namn, traktnr: td.traktnr, vo_nummer: td.vo_nummer,
      markagare: td.markagare, markagare_epost: td.markagare_epost, markagare_tel: td.markagare_tel,
      inkopare: td.inkopare, inkopare_tel: td.inkopare_tel,
      cert: td.cert, typ: td.typ, volym: td.volym, areal: td.areal,
      grot: td.grot, anteckningar: td.anteckningar, sortiment: td.sortiment,
      larmkoordinat_lat: td.larmkoordinat?.lat, larmkoordinat_lng: td.larmkoordinat?.lng,
      // Kontraktsnr finns BARA i TD-texten (OGI ContractNumber = VO, mappas ej sedan #512).
      // envz vinner bara där den har värde → TD-värdet står kvar.
      kontraktsnummer: td.kontraktsnummer,
    };
    const falt = envzUttag ? mergeFalt(tdRecord, envzUttag.falt) : tdRecord;

    // Geometri (envz) + kartpin. Pin = bbox-centrum för traktgränsen; nödlösning = larmkoordinat.
    let geoFeatures: any[] = [];
    let lat: number | null = null;
    let lng: number | null = null;
    if (envz && bilagor) {
      const geo = await packaGeometri(bilagor, ogiXml);
      varningar.push(...geo.varningar);
      geoFeatures = geo.features;
      const c = bboxCentrum(geo.features, 'traktgräns');
      if (c) { lat = c.lat; lng = c.lng; }
      else if (falt.larmkoordinat_lat != null) { lat = falt.larmkoordinat_lat; lng = falt.larmkoordinat_lng; }
    } else {
      // Zip: generisk koordinat ur TD-texten (oförändrat beteende).
      lat = td.lat; lng = td.lng;
    }

    const traktnr = String(falt.traktnr || td.traktnr || Date.now());

    // === KARTBILD (BARA zip — envz har TK-PDF, inte georef JPG). Bounds-blocket oförändrat. ===
    let kartbild_url: string | null = null;
    let kartbild_bounds: number[][] | null = null;
    if (!envz && jpgEntry) {
      try {
        const jpgData = new Uint8Array(await jpgEntry.async('arraybuffer'));
        const storagePath = `${traktnr}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('kartbilder')
          .upload(storagePath, jpgData, { contentType: 'image/jpeg', upsert: true });
        if (uploadError) {
          console.error('Kartbild upload error:', uploadError);
        } else {
          // Bucketen är PRIVAT — lagra PATH, aldrig URL. Läsning signerar via lib/kartfiler.ts.
          kartbild_url = storagePath;
        }
        if (jgwEntry) {
          const dimensions = getJpegDimensions(jpgData);
          const jgwText = await jgwEntry.async('string');
          const jgwLines = jgwText.trim().split(/\r?\n/);
          const parseJgwValue = (s: string) => parseFloat(s.replace(',', '.'));
          if (dimensions && jgwLines.length >= 6) {
            const pixelSizeX = parseJgwValue(jgwLines[0]);
            const pixelSizeY = parseJgwValue(jgwLines[3]);
            const pixelCenterX = parseJgwValue(jgwLines[4]);
            const pixelCenterY = parseJgwValue(jgwLines[5]);
            // JGW anger pixel-center, justera till pixel-kant (övre vänstra hörnet)
            const upperLeftX = pixelCenterX - pixelSizeX / 2;
            const upperLeftY = pixelCenterY - pixelSizeY / 2;
            const lowerRightX = upperLeftX + (dimensions.width * pixelSizeX);
            const lowerRightY = upperLeftY + (dimensions.height * pixelSizeY);
            const upperLeft = sweref99ToWgs84(upperLeftY, upperLeftX);
            const lowerRight = sweref99ToWgs84(lowerRightY, lowerRightX);
            kartbild_bounds = [
              [lowerRight.lat, upperLeft.lng], // Southwest corner
              [upperLeft.lat, lowerRight.lng]  // Northeast corner
            ];
          }
        }
      } catch (e) {
        console.error('Kartbild error:', e);
      }
    }

    // === DOKUMENT — spara paths i privata kartbilder-bucketen. Kända typer -> egna kolumner,
    // okända -> ovriga_dokument med originalnamnet bevarat. ===
    const laddaUppPdf = async (bytes: Uint8Array | null, path: string): Promise<string | null> => {
      if (!bytes) return null;
      const { error: pdfErr } = await supabase.storage.from('kartbilder')
        .upload(path, bytes, { contentType: 'application/pdf', upsert: true });
      if (pdfErr) { console.error(`PDF-uppladdning (${path}) misslyckades:`, pdfErr); return null; }
      return path;
    };
    // Alla PDF-uppladdningar körs PARALLELLT. De är oberoende och nätverksbundna; sekventiellt
    // låg 5 stora blad (~40 MB) i rad och bidrog till timeouten på 889174. Buffertarna finns redan
    // i minnet (bilagor), så parallellt kostar ingen extra minnestopp — bara kortare väggklocka.
    // Promise.all bevarar ordningen, så traktkartornas index/ordning står kvar. Storage-path är
    // ren ASCII (traktnr numeriskt) — inget Å/Ä/Ö i nyckeln.
    const [
      traktdirektiv_url,
      stamplingslangd_url,
      valtlapp_url,
      oversiktskarta_url,
      traktkartaResultat,
      ovrigaResultat,
    ] = await Promise.all([
      laddaUppPdf(klass.traktdirektiv.bytes, `${traktnr}_traktdirektiv.pdf`),
      laddaUppPdf(klass.stamplingslangd?.bytes ?? null, `${traktnr}_stamplingslangd.pdf`),
      laddaUppPdf(klass.valtlapp?.bytes ?? null, `${traktnr}_valtlapp.pdf`),
      laddaUppPdf(klass.oversiktskarta?.bytes ?? null, `${traktnr}_oversiktskarta.pdf`),
      Promise.all(klass.traktkartor.map((tk, i) =>
        laddaUppPdf(tk.bytes, `${traktnr}_traktkarta_${i + 1}.pdf`)
          .then((path) => (path ? { namn: tk.namn, path, ordning: tk.ordning } : null)),
      )),
      Promise.all(klass.ovriga.map((o, i) =>
        laddaUppPdf(o.bytes, `${traktnr}_ovrigt_${i}.pdf`)
          .then((path) => (path ? { namn: o.namn, path } : null)),
      )),
    ]);
    // traktkarta_url = första bladet (ordning 1) så befintlig UI (pill, prickar, planering) fungerar.
    const traktkartor = traktkartaResultat
      .filter((x): x is { namn: string; path: string; ordning: number } => x !== null)
      .sort((a, b) => a.ordning - b.ordning);
    const traktkarta_url = traktkartor[0]?.path ?? null;
    const ovriga_dokument = ovrigaResultat.filter((x): x is { namn: string; path: string } => x !== null);

    const harLarm = falt.larmkoordinat_lat != null && falt.larmkoordinat_lng != null;

    const data: Record<string, any> = {
      vo_nummer: falt.vo_nummer || null,
      traktnr: falt.traktnr || null,
      namn: falt.namn || 'Okänt objekt',
      bolag: falt.bolag || 'Vida',
      inkopare: falt.inkopare || null,
      inkopare_tel: falt.inkopare_tel || null,
      inkopare_epost: falt.inkopare_epost || null,          // OGI LoggingOrganisation (ny)
      markagare: falt.markagare || null,                    // TD-parsern (OGI ForestOwner = VIDA-kontakt, lagras EJ)
      markagare_adress: falt.markagare_adress || null,      // kolumn finns; fylls EJ ur OGI (manuellt/TD senare)
      markagare_tel: falt.markagare_tel || null,            // TD-parsern
      markagare_epost: falt.markagare_epost || null,        // TD-parsern
      fastighetsbeteckning: falt.fastighetsbeteckning || null, // OGI RealEstateIDObject (ny)
      kontraktsnummer: falt.kontraktsnummer || null,        // TD-parsern (header "Kontraktsnr … anges vid fakturering"); aldrig VO
      cert: falt.cert || null,
      typ: falt.typ,
      atgard: falt.typ === 'slutavverkning' ? 'Au' : 'Gallring',
      volym: falt.volym,
      areal: falt.areal ?? null,
      avverkningsform: falt.avverkningsform || null,
      region: falt.region || null,
      grot: falt.grot,
      lat,
      lng,
      larmkoordinat_lat: harLarm ? falt.larmkoordinat_lat : null,
      larmkoordinat_lng: harLarm ? falt.larmkoordinat_lng : null,
      larmkoordinat_kalla: harLarm ? (envz ? 'envz' : 'td') : null,
      larmkoordinat_bekraftad: harLarm ? false : null,
      sortiment: (falt.sortiment && falt.sortiment.length > 0) ? falt.sortiment : null,
      anteckningar: falt.anteckningar || null,
      // Checklist rått (frågor + svarsalternativ + alarm-flagga). Larm-tolkning: egen uppgift.
      checklist_items: (envzUttag && envzUttag.checklist.length > 0) ? envzUttag.checklist : null,
      kartbild_url,
      kartbild_bounds,
      traktdirektiv_url,
      stamplingslangd_url,
      traktkarta_url,                                          // första bladet (bakåtkompatibel)
      traktkartor: traktkartor.length > 0 ? traktkartor : null, // alla blad [{namn, path, ordning}]
      oversiktskarta_url,                                      // _ÖK.pdf (egen typ)
      valtlapp_url,
      ovriga_dokument: ovriga_dokument.length > 0 ? ovriga_dokument : null,
      import_varningar: varningar.length > 0 ? varningar : null,
      ar,
      manad,
      ordning: 1,
      // status utelämnas → DB-default 'planerad' vid INSERT. Vid omimport (UPDATE) skrivs
      // varken status, lat/lng, anteckningar eller planeringsfälten över — se SKYDDADE nedan.
      kalla: envz ? 'envz' : 'traktdirektiv',
    };

    // === Omimport-med-merge: matcha på vo_nummer (enda unika constraint, objekt_vo_nummer_key).
    // Ingen fallback på traktnr (ej unikt, tomt på hälften av raderna). Saknar envz vo_nummer
    // eller finns ingen rad med det -> INSERT. vo_nummer kan vara icke-numeriskt ("P-1012") ->
    // jämför som sträng. ===
    let befintlig: { id: string; larmkoordinat_kalla: string | null } | null = null;
    if (falt.vo_nummer) {
      const { data: rader } = await supabase
        .from('objekt')
        .select('id, larmkoordinat_kalla')
        .eq('vo_nummer', String(falt.vo_nummer))
        .limit(1);
      befintlig = rader && rader[0] ? (rader[0] as any) : null;
    }

    let saved: any = null;

    if (befintlig) {
      // === UPDATE (omimport) — bevara det användaren äger ===
      // SKYDDADE: kolumner som ALDRIG skrivs vid omimport. envz äger dem inte. Listan kommer
      // växa — lägg nya manuella fält HÄR, inte som spridda specialfall.
      //   lat, lng            manuellt flyttade kartpinnar
      //   anteckningar        användartext (redigeras i /objekt)
      //   ar, manad, ordning  planering (envz har dem inte ändå — skydda ändå explicit)
      //   status              planeringsstatus (sätts av planeringsvyn)
      //   larmkoordinat_*     villkorat nedan (bevaras helt om kalla='egen')
      const SKYDDADE = ['lat', 'lng', 'anteckningar', 'ar', 'manad', 'ordning', 'status'];

      // Larmkoordinat satt på plats ('egen') slår alltid en kontorsräknad koordinat -> rör
      // varken lat/lng/kalla/bekraftad. Logga att envz hade ett värde som inte skrevs.
      const bevaraLarm = befintlig.larmkoordinat_kalla === 'egen';
      if (bevaraLarm && harLarm) {
        varningar.push('Larmkoordinat bevarad (satt på plats, kalla=egen) — envz hade ett värde som inte skrevs över.');
      }

      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(data)) {
        if (SKYDDADE.includes(k)) continue;                                  // aldrig vid omimport
        if (k.startsWith('larmkoordinat_') && bevaraLarm) continue;          // 'egen' -> orört
        if (v === null || v === undefined) continue;                         // nollar aldrig befintligt värde
        if (typeof v === 'string' && v.trim() === '') continue;
        patch[k] = v;
      }
      patch.import_varningar = varningar.length > 0 ? varningar : null;       // varningar refreshas alltid

      const { data: upd, error: updErr } = await supabase
        .from('objekt').update(patch).eq('id', befintlig.id).select().single();
      if (updErr) {
        await loggaImportFel(service, sokvag, 'OBJEKT_UPDATE', updErr.message);
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      saved = upd;

      // Geometrin är importerad (inga manuella ändringar) -> ersätt helt: radera + skriv ny.
      await service.from('objekt_geometri').delete().eq('objekt_id', befintlig.id);
      if (geoFeatures.length > 0) {
        const { error: geoErr } = await service.from('objekt_geometri').insert({
          objekt_id: befintlig.id,
          geometri: { type: 'FeatureCollection', features: geoFeatures },
          kalla: 'envz',
        });
        if (geoErr) console.error('objekt_geometri insert (omimport) misslyckades:', geoErr);
      }
    } else {
      // === INSERT (nytt objekt) — hela data, inkl. lat/lng/anteckningar ===
      const { data: ins, error } = await supabase.from('objekt').insert(data).select().single();
      if (error) {
        console.error('Supabase error:', error);
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Objektet finns redan' }, { status: 409 });
        }
        await loggaImportFel(service, sokvag, 'OBJEKT_INSERT', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      saved = ins;
      if (geoFeatures.length > 0 && saved?.id) {
        const { error: geoErr } = await service.from('objekt_geometri').insert({
          objekt_id: saved.id,
          geometri: { type: 'FeatureCollection', features: geoFeatures },
          kalla: 'envz',
        });
        if (geoErr) console.error('objekt_geometri insert misslyckades:', geoErr);
      }
    }

    return NextResponse.json({ success: true, objekt: saved, uppdaterad: !!befintlig, varningar });

  } catch (err: any) {
    console.error('Import error:', err);
    // Best-effort synlig logg. service från try:n är inte i scope här — skapa en egen.
    try { await loggaImportFel(skapaServiceKlient(), sokvagForLogg, 'IMPORT_500', err?.message ?? String(err)); } catch {}
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
