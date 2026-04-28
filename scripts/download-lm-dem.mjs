#!/usr/bin/env node
/**
 * Ladda ner Lantmäteriets 1m DEM-rutor runt Kompersmåla via STAC API och
 * paketera till data/lm-dem.zip — redo att laddas upp till Cesium Ion.
 *
 * Cesium Ion kan ta en ZIP med flera GeoTIFF:er som "Raster Terrain" och göra
 * mosaic + reprojection själv server-side. Vi behöver alltså inte rasterio,
 * GDAL eller Python — bara nedladdning + ZIP.
 *
 * Kräver Node 18+ (för inbyggd fetch + Readable.fromWeb). jszip finns redan
 * i package.json så `npm install` räcker som setup.
 *
 * Användning:
 *   1. Lägg LM_SYSTEM_USER och LM_SYSTEM_PASS i .env.local
 *      (Geotorget-credentials, samma som Python-scriptet använder)
 *   2. npm run download-lm-dem
 *   3. Ladda upp data/lm-dem.zip till ion.cesium.com (Add Data → Raster Terrain)
 */

import { readFile, mkdir, stat, writeFile, readdir } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import JSZip from 'jszip'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_DIR = join(__dirname, '..')

// === CONFIG (samma bbox som scripts/build-terrain-tiles.py) ===
const SEARCH_BBOX = [15.76, 56.59, 15.94, 56.71]    // ~12×12 km runt Kompersmåla
const OUTPUT_DIR = join(PROJECT_DIR, 'data', 'lm-dem')
const ZIP_PATH = join(PROJECT_DIR, 'data', 'lm-dem.zip')
const STAC_SEARCH_URL = 'https://api.lantmateriet.se/stac-hojd/v1/search'
const STAC_COLLECTION = 'mhm-62_5'                  // 1 m markhöjdmodell

async function loadEnv() {
  const envPath = join(PROJECT_DIR, '.env.local')
  try {
    const content = await readFile(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const key = t.slice(0, eq).trim()
      let val = t.slice(eq + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    // .env.local saknas — env-vars kan komma från shell
  }

  const user = process.env.LM_SYSTEM_USER
  const pass = process.env.LM_SYSTEM_PASS
  if (!user || !pass) {
    console.error('FEL: LM_SYSTEM_USER och LM_SYSTEM_PASS måste vara satta.')
    console.error('     Lägg dem i .env.local eller exportera i shell.')
    process.exit(1)
  }
  return { user, pass }
}

const basicAuth = (u, p) => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64')

async function searchStac(auth) {
  const bbox = SEARCH_BBOX.join(',')
  const url = `${STAC_SEARCH_URL}?collections=${STAC_COLLECTION}&bbox=${bbox}&limit=50`
  console.log(`[STAC] Söker: ${url}`)
  const resp = await fetch(url, { headers: { Authorization: auth } })
  if (!resp.ok) throw new Error(`STAC ${resp.status}: ${resp.statusText}`)
  const json = await resp.json()
  const features = json.features || []
  console.log(`[STAC] ${features.length} rutor hittade`)
  for (const f of features) {
    const bb = f.bbox
    const sz = ((f.assets?.data?.['file:size']) || 0) / 1024 / 1024
    console.log(
      `  ${(f.id || '').padEnd(15)}` +
      `  lon ${bb[0].toFixed(3)}–${bb[2].toFixed(3)}` +
      `  lat ${bb[1].toFixed(3)}–${bb[3].toFixed(3)}` +
      `  ${sz.toFixed(1)} MB`
    )
  }
  return features
}

async function downloadTile(url, dest, auth) {
  // Skip om filen redan finns och är icke-tom (möjliggör avbruten omkörning)
  try {
    const s = await stat(dest)
    if (s.size > 1000) {
      console.log(`  [skip] ${basename(dest)} (${(s.size / 1024 / 1024).toFixed(1)} MB)`)
      return
    }
  } catch { /* fil saknas — ladda ner */ }

  process.stdout.write(`  [ladda] ${basename(dest)} ...`)
  const resp = await fetch(url, { headers: { Authorization: auth } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} för ${url}`)
  if (!resp.body) throw new Error(`Ingen body för ${url}`)
  await pipeline(Readable.fromWeb(resp.body), createWriteStream(dest))
  const s = await stat(dest)
  console.log(` ${(s.size / 1024 / 1024).toFixed(1)} MB`)
}

async function buildZip(srcDir, zipPath) {
  console.log(`\n[zip] Bygger ${basename(zipPath)} ...`)
  const zip = new JSZip()
  const files = (await readdir(srcDir)).filter(f => f.toLowerCase().endsWith('.tif'))
  let totalRaw = 0
  for (const f of files) {
    const buf = await readFile(join(srcDir, f))
    zip.file(f, buf)
    totalRaw += buf.length
  }
  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  await writeFile(zipPath, out)
  console.log(
    `[zip] ${files.length} filer, ${(totalRaw / 1024 / 1024).toFixed(1)} MB ` +
    `→ ${(out.length / 1024 / 1024).toFixed(1)} MB komprimerat`
  )
}

async function main() {
  console.log('='.repeat(60))
  console.log('Lantmäteriet 1m DEM → data/lm-dem.zip (för Cesium Ion)')
  console.log('='.repeat(60))

  const { user, pass } = await loadEnv()
  console.log(`[auth] LM_SYSTEM_USER=${user}`)

  await mkdir(OUTPUT_DIR, { recursive: true })
  const auth = basicAuth(user, pass)

  const features = await searchStac(auth)
  if (features.length === 0) {
    console.error('FEL: Inga rutor inom bbox.')
    process.exit(1)
  }

  const totalEst = features.reduce(
    (s, f) => s + (f.assets?.data?.['file:size'] || 10_000_000), 0
  )
  console.log(
    `\n[ladda] ${features.length} rutor (~${(totalEst / 1024 / 1024).toFixed(0)} MB) → ${OUTPUT_DIR}`
  )
  for (const f of features) {
    const url = f.assets.data.href
    const filename = url.split('/').pop()
    const dest = join(OUTPUT_DIR, filename)
    try {
      await downloadTile(url, dest, auth)
    } catch (e) {
      console.error(`\nFEL ${filename}:`, e.message)
      process.exit(1)
    }
  }

  await buildZip(OUTPUT_DIR, ZIP_PATH)

  console.log(`\n${'='.repeat(60)}`)
  console.log('KLART!')
  console.log('')
  console.log('Nästa steg:')
  console.log('  1. ion.cesium.com → My Assets → Add Data')
  console.log('  2. Source Type: "Raster Terrain"')
  console.log(`  3. Ladda upp ${ZIP_PATH}`)
  console.log('  4. Vänta på processing (5–30 min)')
  console.log('  5. Kopiera asset-id från panelen, skicka till Claude')
  console.log('='.repeat(60))
}

main().catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
