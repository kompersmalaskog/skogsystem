/**
 * Delad lager-konfiguration för planering (2D MapLibre) och korvy (3D Cesium).
 *
 * Lyfts ut ur app/planering/page.tsx så att båda vyer kan kalla samma
 * lista. show3D-property markerar vilka lager som är meningsfulla i
 * 3D-vyn — 3D-lagermenyn filtrerar bort de som har show3D=false.
 *
 * 2D-vyn ignorerar show3D helt — alla lager visas där som tidigare.
 */

export interface LayerDef {
  id: string
  url: string
  layers: string
  name: string
  color: string
  /**
   * true = visas i 3D-körvyns lager-meny.
   * false = filtreras bort i 3D (2D fortsätter visa det).
   *
   * 3D-värdelösa lager just nu:
   * - korbarhet: kräver dragen trakt-polygon för full analys (jordart
   *   m.m.) — den interaktionen finns bara i 2D-planeringsvyn.
   * - sks_gallringsindex: ArcGIS ImageServer "exportImage"-anrop med
   *   renderingRule, inte WMS. Vår Cesium-mapping stödjer bara WMS
   *   och URL-template-tiles — gallringsindex kräver egen adapter.
   *
   * lm_skuggning är PÅ i 3D nu (var av tidigare): 1m DEM ger hillshade via
   * vertex-normaler + lighting i teorin, men föraren tycker LMs hillshade-WMS
   * ger tydligare topografi i kombination med lutning + cockpit-bg. Den
   * dubblerade skuggningen är medveten — bättre läsbarhet > teoretisk renhet.
   */
  show3D: boolean
  desc?: string
  customApi?: boolean
  proxyTarget?: string
  exportImage?: string
  renderingRule?: string
  srs?: string
  /**
   * FARDIG MapLibre-tile-mall ({bbox-epsg-3857} fylls av MapLibre).
   *
   * Flyttad hit ur app/planering/page.tsx (wmsLayerDefs, rad ~1261) sa varje
   * lager beskrivs EN gang. Faltet ar VALFRITT och planeringsvyn laser det
   * inte an - den kor vidare pa sin egen inline-lista tills PR B. Ingen
   * befintlig konsument paverkas.
   */
  tiles?: string[]
  /** raster-opacity for tiles. Saknas den galler 0,7 - samma default som forr. */
  tileOpacity?: number
}

export interface LayerGroup {
  group: string
  layers: LayerDef[]
}

export const wmsLayerGroups: LayerGroup[] = [
  {
    group: 'Skogsstyrelsen',
    layers: [
      { id: 'nyckelbiotoper', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNyckelbiotop/MapServer/WmsServer', layers: 'Nyckelbiotop_Skogsstyrelsen', name: 'Nyckelbiotoper', color: '#a855f7', show3D: true, tiles: ['/api/wms-proxy?layer=nyckelbiotoper&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'naturvarde', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaObjektnaturvarde/MapServer/WmsServer', layers: 'Objektnaturvarde_Skogsstyrelsen', name: 'Naturvärde', color: '#30d158', show3D: true, tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaObjektnaturvarde/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Objektnaturvarde_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'sumpskog', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer', layers: 'Sumpskog_Skogsstyrelsen', name: 'Sumpskogar', color: '#3b82f6', show3D: true, tiles: ['/api/wms-proxy?layer=sumpskog&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'biotopskydd', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaBiotopskydd/MapServer/WmsServer', layers: 'Biotopskydd_Skogsstyrelsen', name: 'Biotopskydd', color: '#166534', show3D: true, tiles: ['/api/wms-proxy?layer=biotopskydd&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'naturvardsavtal', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNaturvardsavtal/MapServer/WmsServer', layers: 'Naturvardsavtal_Skogsstyrelsen', name: 'Naturvårdsavtal', color: '#14b8a6', show3D: true, tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNaturvardsavtal/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Naturvardsavtal_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'skoghistoria', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer/WmsServer', layers: 'SkoghistoriaYta_Skogsstyrelsen,SkoghistoriaLinje_Skogsstyrelsen,SkoghistoriaPunkt_Skogsstyrelsen', name: 'Skog & historia', color: '#f59e0b', show3D: true, tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=SkoghistoriaYta_Skogsstyrelsen,SkoghistoriaLinje_Skogsstyrelsen,SkoghistoriaPunkt_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'avverkningsanmalan', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaAvverkningsanmalan/MapServer/WmsServer', layers: 'Avverkningsanmalan_Skogsstyrelsen', name: 'Avverkningsanmälningar', color: '#eab308', show3D: true, tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaAvverkningsanmalan/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Avverkningsanmalan_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'utfordavverkning', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaUtfordavverkning/MapServer/WmsServer', layers: 'UtfordAvverkning_Skogsstyrelsen', name: 'Utförda avverkningar', color: '#92400e', show3D: true, tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaUtfordavverkning/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=UtfordAvverkning_Skogsstyrelsen&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
      { id: 'hydrografi', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaFlodesackumulation/MapServer/WmsServer', layers: 'Vattenyta,Flödesackumulation__70ha41670,Flödesackumulation_20ha-70ha48822,Flödesackumulation_10ha-20ha19752', name: 'Diken & vattendrag', color: '#38bdf8', show3D: true, tiles: ['https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaFlodesackumulation/MapServer/WmsServer?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Vattenyta,Fl%C3%B6desackumulation__70ha41670,Fl%C3%B6desackumulation_20ha-70ha48822,Fl%C3%B6desackumulation_10ha-20ha19752&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'], tileOpacity: 0.7 },
    ],
  },
  {
    group: 'Riksantikvarieämbetet',
    layers: [
      { id: 'fornlamningar', url: 'https://pub.raa.se/visning/lamningar/wms', layers: 'fornlamningar', name: 'Fornlämningar', color: '#ff453a', srs: 'EPSG:3857', show3D: true, tiles: ['/api/wms-proxy?layer=raa_lamningar&bbox={bbox-epsg-3857}&width=256&height=256'] },
    ],
  },
  {
    group: 'Naturvårdsverket',
    layers: [
      { id: 'naturreservat', url: 'https://geodata.naturvardsverket.se/naturvardsregistret/wms', layers: 'Naturreservat', name: 'Naturreservat', color: '#15803d', show3D: true, tiles: ['/api/wms-proxy?layer=naturreservat&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'natura2000', url: 'https://geodata.naturvardsverket.se/n2000/wms', layers: 'Habitatdirektivet,Fageldirektivet', name: 'Natura 2000', color: '#4ade80', show3D: true, tiles: ['/api/wms-proxy?layer=natura2000&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'vattenskydd', url: 'https://geodata.naturvardsverket.se/naturvardsregistret/wms', layers: 'Vattenskyddsomrade', name: 'Vattenskyddsområden', color: '#7dd3fc', show3D: true, tiles: ['/api/wms-proxy?layer=vattenskydd&bbox={bbox-epsg-3857}&width=256&height=256'] },
      // Ritunderlag för gallringszoner: NMD-basskiktet klassar skog i trädslagsklasser (barr/löv/bland).
      // Årtalet står i namnet; desc bär ärligheten (fingervisning, inte facit). show3D=false → körvyn orörd.
      { id: 'nmd_tradslag', url: '/api/wms-proxy', layers: 'LC.LandCoverRaster.Bas_2.0', name: 'Trädslag (NMD 2023)', color: '#4ade80', proxyTarget: 'https://geodata.naturvardsverket.se/inspire/lc-nmd/ows', desc: '10 m, barr/löv/blandskog. Underlag när du ritar — fingervisning, inte facit (löv underskattas ofta).', show3D: false, tiles: ['/api/wms-proxy?layer=nmd_tradslag&bbox={bbox-epsg-3857}&width=256&height=256'], tileOpacity: 0.65 },
    ],
  },
  {
    group: 'MSB',
    layers: [
      { id: 'oversvamning', url: 'https://inspire.msb.se/oversvamning/wms', layers: 'NZ_Oversvamning_100,NZ_Oversvamning_200,NZ_Oversvamning_BHF', name: 'Översvämningskarteringar', color: '#1e3a8a', show3D: true, tiles: ['https://inspire.msb.se/oversvamning/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=NZ_Oversvamning_100,NZ_Oversvamning_200,NZ_Oversvamning_BHF&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
    ],
  },
  {
    group: 'SGU',
    layers: [
      { id: 'jordarter', url: 'https://maps3.sgu.se/geoserver/jord/ows', layers: 'jord:SE.GOV.SGU.JORD.GRUNDLAGER.25K', name: 'Jordarter', color: '#92400e', show3D: true, tiles: ['https://maps3.sgu.se/geoserver/jord/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=jord:SE.GOV.SGU.JORD.GRUNDLAGER.25K&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
    ],
  },
  {
    group: 'Trafikverket',
    layers: [
      { id: 'barighet', url: 'https://geo-netinfo.trafikverket.se/mapservice/wms.axd/NetInfo_1_8', layers: 'Barighet', name: 'Bärighet (BK-klass)', color: '#f97316', show3D: true, tiles: ['https://geo-netinfo.trafikverket.se/mapservice/wms.axd/NetInfo_1_8?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=Barighet&STYLES=&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'] },
    ],
  },
  {
    group: 'Svenska Kraftnät',
    layers: [
      { id: 'kraftledningar', url: 'https://inspire-skn.metria.se/geoserver/skn/ows', layers: 'US.ElectricityNetwork.Lines', name: 'Kraftledningar (stamnätet)', color: '#ff453a', show3D: true, tiles: ['/api/wms-proxy?layer=kraftledningar&bbox={bbox-epsg-3857}&width=256&height=256'] },
    ],
  },
  {
    group: 'Analys',
    layers: [
      { id: 'korbarhet', url: '/api/korbarhet-tiles', layers: '', name: 'Körbarhet', color: '#30d158', customApi: true, desc: 'Baserat på markfuktighet och lutning. Rita trakt för full analys inkl jordart.', show3D: false, tiles: ['/api/korbarhet-tiles?bbox={bbox-epsg-3857}&width=256&height=256'] },
    ],
  },
  {
    group: 'Skogsstyrelsen Raster',
    layers: [
      { id: 'sks_markfuktighet', url: '/api/wms-proxy', layers: 'Markfuktighet_SLU_2_0', name: 'Markfuktighet', color: '#4FC3F7', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Markfuktighet_SLU_2_0/ImageServer/WMSServer', show3D: true, tiles: ['/api/wms-proxy?layer=sks_markfuktighet&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_virkesvolym', url: '/api/wms-proxy', layers: 'SkogligaGrunddata_3_1', name: 'Virkesvolym', color: '#66BB6A', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/SkogligaGrunddata_3_1/ImageServer/WMSServer', show3D: true, tiles: ['/api/wms-proxy?layer=sks_virkesvolym&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_tradhojd', url: '/api/wms-proxy', layers: 'Tradhojd_3_1', name: 'Trädhöjd', color: '#AED581', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Tradhojd_3_1/ImageServer/WMSServer', show3D: true, tiles: ['/api/wms-proxy?layer=sks_tradhojd&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_lutning', url: '/api/wms-proxy', layers: 'Lutning_1_0', name: 'Lutning', color: '#FF8A65', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Lutning_1_0/ImageServer/WMSServer', show3D: true, tiles: ['/api/wms-proxy?layer=sks_lutning&bbox={bbox-epsg-3857}&width=256&height=256'] },
      { id: 'sks_gallringsindex', url: '/api/wms-proxy', layers: '', name: 'Gallringsindex', color: '#E91E63', exportImage: 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer', renderingRule: '{"rasterFunction":"Gallringsindex","rasterFunctionArguments":{"sis":"g16-g22"}}', show3D: false, tiles: ['/api/wms-proxy?layer=sks_gallringsindex&bbox={bbox-epsg-3857}&width=256&height=256'] },
    ],
  },
  {
    group: 'Lantmäteriet',
    layers: [
      { id: 'lm_skuggning', url: '/api/wms-proxy', layers: 'terrangskuggning', name: 'Skuggning', color: '#78909C', proxyTarget: 'https://minkarta.lantmateriet.se/map/hojdmodell', show3D: true, tiles: ['/api/wms-proxy?layer=lm_skuggning&bbox={bbox-epsg-3857}&width=256&height=256'], tileOpacity: 0.35 },
      { id: 'lm_ortofoto', url: '/api/wms-proxy', layers: 'Ortofoto_0.5', name: 'Ortofoto LM', color: '#8D6E63', proxyTarget: 'https://minkarta.lantmateriet.se/map/ortofoto', show3D: true, tiles: ['/api/wms-proxy?layer=lm_ortofoto&bbox={bbox-epsg-3857}&width=256&height=256'], tileOpacity: 1.0 },
      // IR-ortofoto: falskfärg där lövkronor lyser rött → skiljer löv från barr. Ritunderlag, samma
      // öppna minkarta-väg. Flygår varierar per område (Kompersmåla-trakten: 2024). show3D=false → körvyn orörd.
      { id: 'lm_ortofoto_ir', url: '/api/wms-proxy', layers: 'Ortofoto_IR', name: 'Ortofoto IR (löv rött)', color: '#ff453a', proxyTarget: 'https://minkarta.lantmateriet.se/map/ortofoto', desc: '0,5 m falskfärg — lövkronor rött, barr mörkt. Flygår varierar (Kompersmåla ~2024).', show3D: false, tiles: ['/api/wms-proxy?layer=lm_ortofoto_ir&bbox={bbox-epsg-3857}&width=256&height=256'], tileOpacity: 1.0 },
      { id: 'fastighetsgranser', url: 'https://minkarta.lantmateriet.se/map/fastighetsindelning/wms/v1.3', layers: 'granser', name: 'Fastighetsgränser', color: '#f59e0b', show3D: true, tiles: ['https://minkarta.lantmateriet.se/map/fastighetsindelning/wms/v1.3?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&LAYERS=granser&STYLES=morkbakgrund&FORMAT=image/png&TRANSPARENT=true&SRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256'], tileOpacity: 0.7 },
    ],
  },
]

/** Flat lista över alla lager (samma som wmsLayerGroups.flatMap(g => g.layers)). */
export const wmsLayers: LayerDef[] = wmsLayerGroups.flatMap(g => g.layers)

// ---------------------------------------------------------------------------
// BAKGRUNDSKARTOR (tillagg, PR A)
//
// Flyttade hit ur app/planering/page.tsx (mapStyleConfig, rad ~948) sa att
// egenkontrollens karta kan erbjuda SAMMA fyra bakgrunder som planeringsvyn i
// stallet for att fa en egen uppsattning som glider isar.
//
// Kallorna och paint-varden ar kopierade ordagrant - inte omtolkade. Alla fyra
// gar genom /api/forarkarta (server-cache + host-validering) utom OpenStreetMap,
// som ar ett direktanrop till tile.openstreetmap.org.
//
// PLANERINGSVYN LASER INTE HARIFRAN AN. Den kor vidare pa sin egen inline-lista
// tills PR B - det ar hela poangen med att detta ar ett tillagg.
// ---------------------------------------------------------------------------

export type BaskartaId = 'lantmateriet' | 'satellite' | 'terrain' | 'osm'

export interface Baskarta {
  id: BaskartaId
  /** MapLibre-lagrets id. Samma namn som i planeringsvyn. */
  layerId: string
  name: string
  desc: string
  tiles: string[]
  /** raster-paint, ordagrant ur planeringsvyn. */
  paint?: Record<string, number>
}

/** Ordningen ar menyns ordning - samma som i planeringsvyn. */
export const BASKARTOR: Baskarta[] = [
  {
    id: 'lantmateriet', layerId: 'lm-layer', name: 'Karta', desc: 'Lantmäteriet — dämpad',
    tiles: ['/api/forarkarta?z={z}&x={x}&y={y}'],
    paint: { 'raster-saturation': -0.45, 'raster-contrast': -0.06, 'raster-opacity': 0.9 },
  },
  {
    id: 'satellite', layerId: 'satellite-layer', name: 'Flygfoto', desc: 'Lantmäteriet ortofoto 0,5 m',
    tiles: ['/api/forarkarta?layer=ortofoto&z={z}&x={x}&y={y}'],
    paint: { 'raster-brightness-max': 0.7, 'raster-contrast': 0.15, 'raster-saturation': -0.2 },
  },
  {
    id: 'terrain', layerId: 'terrain-layer', name: 'Topokarta', desc: 'Lantmäteriet — full färg',
    tiles: ['/api/forarkarta?layer=farg&z={z}&x={x}&y={y}'],
  },
  {
    id: 'osm', layerId: 'osm-layer', name: 'OpenStreetMap', desc: 'Standardkarta',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
  },
]

/** Samma default som planeringsvyn: den tysta LM-kartan. */
export const BASKARTA_DEFAULT: BaskartaId = 'lantmateriet'

/**
 * `wetlands` — DUBBLETTEN, medvetet kvar.
 *
 * Den pekar pa SAMMA Skogsstyrelsetjanst som `sumpskog` och finns bara i
 * planeringsvyns inline-lista, aldrig i grupperna ovan. Den kan inte tas bort
 * har: menyn har en egen kurerad "Overlay"-sektion dar `wetlands` ar ett
 * hardkodat id, och den sektionen kopieras ORDAGRANT till KartLagerMeny.
 *
 * VILKET VARDE VANN: proxy-varianten. Inline-listan anropade
 * geodpags.skogsstyrelsen.se direkt; har far bada ids samma proxade tiles som
 * `sumpskog` redan har (/api/wms-proxy) - server-cache och ingen CORS-risk.
 * Att slå ihop sjalva LAGREN hor till PR B, nar menyn ar en enda.
 */
export const wetlandsAlias: LayerDef = {
  ...wmsLayers.find(l => l.id === 'sumpskog')!,
  id: 'wetlands',
  name: 'Sumpskog',
}

/** Allt som RundKarta ska lagga pa kartan: grupperna + dubbletten. */
export const wmsTileLayers: LayerDef[] = [...wmsLayers, wetlandsAlias].filter(l => l.tiles)

/**
 * MapLibre-stil med ALLA fyra bakgrundskartor pa plats.
 *
 * Bara den aktiva ar synlig; de ovriga ligger med visibility 'none' och tands
 * med setLayoutProperty - exakt som planeringsvyn gor. Att bygga om stilen vid
 * varje byte hade tagit bort alla lager kartan lagt till efterat.
 *
 * Skiljer sig fran app/oversikt/forarkarta-stil.ts, som har EN fast bakgrund.
 * Den ror vi inte: den anvands av oversiktens och skordarens kartor, och de
 * ska inte byta utseende i en PR om egenkontrollen.
 */
export function buildKartStil(aktiv: BaskartaId = BASKARTA_DEFAULT): any {
  return {
    version: 8,
    sources: Object.fromEntries(
      BASKARTOR.map(b => [b.id, { type: 'raster', tiles: b.tiles, tileSize: 256 }]),
    ),
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#e8e8e8' } },
      ...BASKARTOR.map(b => ({
        id: b.layerId,
        type: 'raster',
        source: b.id,
        ...(b.paint ? { paint: b.paint } : {}),
        layout: { visibility: b.id === aktiv ? 'visible' : 'none' },
      })),
    ],
  }
}
