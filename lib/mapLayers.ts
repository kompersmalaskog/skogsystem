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
}

export interface LayerGroup {
  group: string
  layers: LayerDef[]
}

export const wmsLayerGroups: LayerGroup[] = [
  {
    group: 'Skogsstyrelsen',
    layers: [
      { id: 'nyckelbiotoper', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNyckelbiotop/MapServer/WmsServer', layers: 'Nyckelbiotop_Skogsstyrelsen', name: 'Nyckelbiotoper', color: '#a855f7', show3D: true },
      { id: 'naturvarde', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaObjektnaturvarde/MapServer/WmsServer', layers: 'Objektnaturvarde_Skogsstyrelsen', name: 'Naturvärde', color: '#30d158', show3D: true },
      { id: 'sumpskog', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSumpskog/MapServer/WmsServer', layers: 'Sumpskog_Skogsstyrelsen', name: 'Sumpskogar', color: '#3b82f6', show3D: true },
      { id: 'biotopskydd', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaBiotopskydd/MapServer/WmsServer', layers: 'Biotopskydd_Skogsstyrelsen', name: 'Biotopskydd', color: '#166534', show3D: true },
      { id: 'naturvardsavtal', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaNaturvardsavtal/MapServer/WmsServer', layers: 'Naturvardsavtal_Skogsstyrelsen', name: 'Naturvårdsavtal', color: '#14b8a6', show3D: true },
      { id: 'skoghistoria', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaSkoghistoria/MapServer/WmsServer', layers: 'SkoghistoriaYta_Skogsstyrelsen,SkoghistoriaLinje_Skogsstyrelsen,SkoghistoriaPunkt_Skogsstyrelsen', name: 'Skog & historia', color: '#f59e0b', show3D: true },
      { id: 'avverkningsanmalan', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaAvverkningsanmalan/MapServer/WmsServer', layers: 'Avverkningsanmalan_Skogsstyrelsen', name: 'Avverkningsanmälningar', color: '#eab308', show3D: true },
      { id: 'utfordavverkning', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaUtfordavverkning/MapServer/WmsServer', layers: 'UtfordAvverkning_Skogsstyrelsen', name: 'Utförda avverkningar', color: '#92400e', show3D: true },
      { id: 'hydrografi', url: 'https://geodpags.skogsstyrelsen.se/arcgis/services/Geodataportal/GeodataportalVisaFlodesackumulation/MapServer/WmsServer', layers: 'Vattenyta,Flödesackumulation__70ha41670,Flödesackumulation_20ha-70ha48822,Flödesackumulation_10ha-20ha19752', name: 'Diken & vattendrag', color: '#38bdf8', show3D: true },
    ],
  },
  {
    group: 'Riksantikvarieämbetet',
    layers: [
      { id: 'fornlamningar', url: 'https://pub.raa.se/visning/lamningar/wms', layers: 'fornlamningar', name: 'Fornlämningar', color: '#ff453a', srs: 'EPSG:3857', show3D: true },
    ],
  },
  {
    group: 'Naturvårdsverket',
    layers: [
      { id: 'naturreservat', url: 'https://geodata.naturvardsverket.se/naturvardsregistret/wms', layers: 'Naturreservat', name: 'Naturreservat', color: '#15803d', show3D: true },
      { id: 'natura2000', url: 'https://geodata.naturvardsverket.se/n2000/wms', layers: 'Habitatdirektivet,Fageldirektivet', name: 'Natura 2000', color: '#4ade80', show3D: true },
      { id: 'vattenskydd', url: 'https://geodata.naturvardsverket.se/naturvardsregistret/wms', layers: 'Vattenskyddsomrade', name: 'Vattenskyddsområden', color: '#7dd3fc', show3D: true },
    ],
  },
  {
    group: 'MSB',
    layers: [
      { id: 'oversvamning', url: 'https://inspire.msb.se/oversvamning/wms', layers: 'NZ_Oversvamning_100,NZ_Oversvamning_200,NZ_Oversvamning_BHF', name: 'Översvämningskarteringar', color: '#1e3a8a', show3D: true },
    ],
  },
  {
    group: 'SGU',
    layers: [
      { id: 'jordarter', url: 'https://maps3.sgu.se/geoserver/jord/ows', layers: 'jord:SE.GOV.SGU.JORD.GRUNDLAGER.25K', name: 'Jordarter', color: '#92400e', show3D: true },
    ],
  },
  {
    group: 'Trafikverket',
    layers: [
      { id: 'barighet', url: 'https://geo-netinfo.trafikverket.se/mapservice/wms.axd/NetInfo_1_8', layers: 'Barighet', name: 'Bärighet (BK-klass)', color: '#f97316', show3D: true },
    ],
  },
  {
    group: 'Svenska Kraftnät',
    layers: [
      { id: 'kraftledningar', url: 'https://inspire-skn.metria.se/geoserver/skn/ows', layers: 'US.ElectricityNetwork.Lines', name: 'Kraftledningar (stamnätet)', color: '#ff453a', show3D: true },
    ],
  },
  {
    group: 'Analys',
    layers: [
      { id: 'korbarhet', url: '/api/korbarhet-tiles', layers: '', name: 'Körbarhet', color: '#30d158', customApi: true, desc: 'Baserat på markfuktighet och lutning. Rita trakt för full analys inkl jordart.', show3D: false },
    ],
  },
  {
    group: 'Skogsstyrelsen Raster',
    layers: [
      { id: 'sks_markfuktighet', url: '/api/wms-proxy', layers: 'Markfuktighet_SLU_2_0', name: 'Markfuktighet', color: '#4FC3F7', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Markfuktighet_SLU_2_0/ImageServer/WMSServer', show3D: true },
      { id: 'sks_virkesvolym', url: '/api/wms-proxy', layers: 'SkogligaGrunddata_3_1', name: 'Virkesvolym', color: '#66BB6A', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/SkogligaGrunddata_3_1/ImageServer/WMSServer', show3D: true },
      { id: 'sks_tradhojd', url: '/api/wms-proxy', layers: 'Tradhojd_3_1', name: 'Trädhöjd', color: '#AED581', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Tradhojd_3_1/ImageServer/WMSServer', show3D: true },
      { id: 'sks_lutning', url: '/api/wms-proxy', layers: 'Lutning_1_0', name: 'Lutning', color: '#FF8A65', proxyTarget: 'https://geodata.skogsstyrelsen.se/arcgis/services/Publikt/Lutning_1_0/ImageServer/WMSServer', show3D: true },
      { id: 'sks_gallringsindex', url: '/api/wms-proxy', layers: '', name: 'Gallringsindex', color: '#E91E63', exportImage: 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/SkogligaGrunddata_3_1/ImageServer', renderingRule: '{"rasterFunction":"Gallringsindex","rasterFunctionArguments":{"sis":"g16-g22"}}', show3D: false },
    ],
  },
  {
    group: 'Lantmäteriet',
    layers: [
      { id: 'lm_skuggning', url: '/api/wms-proxy', layers: 'terrangskuggning', name: 'Skuggning', color: '#78909C', proxyTarget: 'https://minkarta.lantmateriet.se/map/hojdmodell', show3D: true },
      { id: 'lm_ortofoto', url: '/api/wms-proxy', layers: 'Ortofoto_0.5', name: 'Ortofoto LM', color: '#8D6E63', proxyTarget: 'https://minkarta.lantmateriet.se/map/ortofoto', show3D: true },
      { id: 'fastighetsgranser', url: 'https://minkarta.lantmateriet.se/map/fastighetsindelning/wms/v1.3', layers: 'granser', name: 'Fastighetsgränser', color: '#f59e0b', show3D: true },
    ],
  },
]

/** Flat lista över alla lager (samma som wmsLayerGroups.flatMap(g => g.layers)). */
export const wmsLayers: LayerDef[] = wmsLayerGroups.flatMap(g => g.layers)
