'use client';

// Kart- och lagermenyn. DELAD komponent.
//
// JSX:EN AR ORDAGRANT FLYTTAD ur app/planering/page.tsx (rad 14551-15147).
// Den ar KOPIERAD, inte omskriven: varje rad ar identisk sa nar som pa att sex
// planeringsspecifika sektioner har fatt en grind runt sig. Skickas inte deras
// props ritas de inte, och egenkontrollen far bara det som hor dit.
//
// VARFOR EN KOMPONENT: en andra implementation glider isar fran den forsta och
// ingen marker det forran nagon andrar i den ena. Driften har redan borjat -
// 27 lager beskrevs pa tva stallen innan lib/mapLayers.ts slogs ihop.
//
// PLANERINGSVYN ANVANDER DEN INTE AN. Den kor vidare pa sin egen inbakade meny
// tills PR B, sa att menyn hinner provas i egenkontrollen innan den vy forarna
// anvander varje dag byter ut sin.

import { wmsLayerGroups } from '@/lib/mapLayers';
import type { BaskartaId } from '@/lib/mapLayers';
import type { MapLayers } from '@/lib/hooks/useMapLayers';

/** Ett lager som vyn sjalv ager - egenkontrollens punkter, provytor, stammar. */
export type EgetLager = { id: string; namn: string; beskrivning: string };

type Typ = {
  oppen: boolean;
  onStang: () => void;
  mapType: BaskartaId;
  setMapType: (id: BaskartaId) => void;
  overlays: MapLayers;
  setOverlays: (f: (prev: MapLayers) => MapLayers) => void;
  /** Vyns egna lager. Utelamnas -> sektionen ritas inte. */
  egnaLager?: EgetLager[];
  egnaVarden?: Record<string, boolean>;
  setEgnaVarden?: (f: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  // --- Planeringsspecifikt. Utelamnas -> sektionen ritas inte. ---
  geoTyper?: Set<string>;
  visibleLayers?: Record<string, boolean>;
  setVisibleLayers?: (f: (prev: any) => any) => void;
  visibleLines?: Record<string, boolean>;
  setVisibleLines?: (f: (prev: any) => any) => void;
  visibleZones?: Record<string, boolean>;
  setVisibleZones?: (f: (prev: any) => any) => void;
  // Formen ar planeringsvyns egen (rad 6043/6060) - den kopierade JSX:en
  // laser striped/color2/dashed, sa typen maste bara dem.
  lineTypes?: { id: string; name: string; color: string; color2?: string; striped?: boolean; dashed?: boolean; isBackRoad?: boolean }[];
  zoneTypes?: { id: string; name: string; color: string; icon?: string }[];
  visaBrandrisk?: boolean;
  visaProduktionshogar?: boolean;
  onOppnaVarningar?: () => void;
  /**
   * MENYNS Z-INDEX. MASTE LIGGA OVER DEN VY SOM MONTERAR DEN.
   *
   * Defaulten 500 kommer fran planeringsvyn, dar menyn foddes: dar ligger
   * kartan pa z-index 0 och 500 racker med marginal.
   *
   * Egenkontrollens helskarmskarta ligger daremot pa 1150 med ogenomskinlig
   * bakgrund. Med defaulten monterades menyn UNDER den: knappen fyrade,
   * tillstandet vande, menyn ritades - och var helt osynlig. Ingenting
   * kastades, sa varken typkontroll eller bygge kunde se det.
   *
   * MONTERAR DU MENYN I EN TREDJE VY: ta reda pa vilket z-index den vyns
   * karta eller overlagring har, och skicka ett hogre varde har. Gor du inte
   * det ser felet ut som en knapp som inte gar att trycka pa.
   */
  zIndex?: number;
};

export default function KartLagerMeny(p: Typ) {
  const { mapType, setMapType, overlays, setOverlays } = p;
  const { egnaLager, egnaVarden, setEgnaVarden } = p;
  const { visaBrandrisk, visaProduktionshogar, onOppnaVarningar } = p;
  const { setVisibleLayers, setVisibleLines, setVisibleZones } = p;
  const { lineTypes, zoneTypes } = p;
  const zIndex = p.zIndex ?? 500;

  // Alias sa att den kopierade JSX:en nedan kan sta ORORD. Doper man om nagot
  // i sjalva JSX:en gar det inte langre att bevisa att den ar oforandrad.
  const layerMenuOpen = p.oppen;
  const briefingMode = false;
  const setLayerMenuOpen = (_v: boolean) => p.onStang();
  const setWarningMenuOpen = (_v: boolean) => p.onOppnaVarningar?.();

  // Tom mangd -> de datadrivna raderna i Overlay-sektionen faller bort av sig
  // sjalva. Ingen grind behovs inne i den kopierade listan.
  const geoTyper = p.geoTyper ?? new Set<string>();
  const visibleLayers = p.visibleLayers ?? {};
  const visibleLines = p.visibleLines ?? {};
  const visibleZones = p.visibleZones ?? {};
  const noop = (_f: any) => {};

  return (
    <>
      {layerMenuOpen && !briefingMode && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: '#000',
          zIndex,
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", sans-serif',
        }}>
          {/* Header */}
          <div style={{
            padding: '55px 20px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div 
              onClick={() => setLayerMenuOpen(false)}
              style={{ 
                padding: '8px', 
                marginLeft: '-8px', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ opacity: 0.6 }}>
                <path d="M15 18l-6-6 6-6"/>
              </svg>
              <span style={{ fontSize: '17px', opacity: 0.6 }}>Tillbaka</span>
            </div>
            <span style={{ fontSize: '17px', fontWeight: '600', color: '#fff' }}>Lager</span>
            <div style={{ width: '80px' }} />
          </div>

          {/* Content */}
          <div style={{ 
            flex: 1, 
            overflowY: 'auto',
            padding: '12px',
          }}>
            {/* Bakgrundskarta */}
            <div style={{
              background: '#0a0a0a', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                padding: '12px 16px 8px', 
                fontSize: '13px', 
                opacity: 0.4, 
 
 
              }}>
                Bakgrundskarta
              </div>
              {[
                { id: 'lantmateriet', name: 'Karta', desc: 'Lantmäteriet — dämpad' },
                { id: 'satellite', name: 'Flygfoto', desc: 'Lantmäteriet ortofoto 0,5 m' },
                { id: 'terrain', name: 'Topokarta', desc: 'Lantmäteriet — full färg' },
                { id: 'osm', name: 'OpenStreetMap', desc: 'Standardkarta' },
              ].map(type => (
                <div
                  key={type.id}
                  onClick={() => setMapType(type.id as 'osm' | 'satellite' | 'terrain' | 'lantmateriet')}
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    border: mapType === type.id ? 'none' : '2px solid rgba(255,255,255,0.2)',
                    background: mapType === type.id ? '#30d158' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    {mapType === type.id && (
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff' }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', color: '#fff' }}>{type.name}</div>
                    <div style={{ fontSize: '13px', opacity: 0.5, marginTop: '2px' }}>{type.desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Overlay-lager */}
            <div style={{
              background: '#0a0a0a', 
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ 
                padding: '12px 16px 8px', 
                fontSize: '13px', 
                opacity: 0.4, 
 
 
              }}>
                Overlay
              </div>
              {[
                { id: 'vidaKartbild', name: 'VIDA-kartbild', desc: 'Traktdirektivets kartbild', enabled: true },
                // Trakt-geometri (envz) — datadrivna: visas BARA när lagret faktiskt har data.
                ...(geoTyper.has('traktgräns') ? [{ id: 'traktGrans', name: 'Traktgräns', desc: 'Trakthandlingens gräns', enabled: true }] : []),
                ...(geoTyper.has('hänsynsyta') ? [{ id: 'hansyn', name: 'Hänsyn', desc: 'Hänsynsytor att spara', enabled: true }] : []),
                ...((geoTyper.has('linje') || geoTyper.has('punkt')) ? [{ id: 'korFara', name: 'Kör & fara', desc: 'Basväg, avlägg, larm & kraftledning', enabled: true }] : []),
                { id: 'wetlands', name: 'Sumpskog', desc: 'Blöta skogsområden', enabled: true },
                { id: 'sks_markfuktighet', name: 'Markfuktighet', desc: 'SLU via Skogsstyrelsen', enabled: true },
                { id: 'fastighetsgranser', name: 'Fastighetsgränser', desc: 'Lantmäteriet fastighetsindelning', enabled: true },
                { id: 'hydrografi', name: 'Diken & vattendrag', desc: 'Vattenytor och flödesackumulation (SKS)', enabled: true },
              ].map(overlay => (
                <div
                  key={overlay.id}
                  onClick={() => overlay.enabled && setOverlays(prev => ({ ...prev, [overlay.id]: !prev[overlay.id] }))}
                  style={{
                    padding: '14px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '12px',
                    cursor: overlay.enabled ? 'pointer' : 'not-allowed',
                    opacity: overlay.enabled ? 1 : 0.4,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', color: '#fff' }}>{overlay.name}</div>
                    <div style={{ fontSize: '13px', opacity: 0.5, marginTop: '2px' }}>{overlay.desc}</div>
                  </span>
                  <div style={{
                    width: '44px',
                    height: '26px',
                    borderRadius: '13px',
                    background: overlays[overlay.id] ? '#30d158' : 'rgba(255,255,255,0.1)',
                    padding: '2px',
                    transition: 'background 0.2s ease',
                  }}>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#fff',
                      transform: overlays[overlay.id] ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* WMS-lager grupperade */}
            {wmsLayerGroups.map(group => (
              <div key={group.group} style={{
                background: '#0a0a0a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{
                  padding: '12px 16px 8px',
                  fontSize: '13px',
                  opacity: 0.4,
                }}>
                  {group.group}
                </div>
                {group.layers.map(layer => (
                  <div
                    key={layer.id}
                    onClick={() => setOverlays(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: layer.color,
                      flexShrink: 0,
                      opacity: overlays[layer.id] ? 1 : 0.3,
                      transition: 'opacity 0.2s ease',
                    }} />
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>{layer.name}</div>
                      {layer.desc && <div style={{ fontSize: '13px', opacity: 0.4, marginTop: '2px' }}>{layer.desc}</div>}
                    </span>
                    <div style={{
                      width: '44px',
                      height: '26px',
                      borderRadius: '13px',
                      background: overlays[layer.id] ? '#30d158' : 'rgba(255,255,255,0.1)',
                      padding: '2px',
                      transition: 'background 0.2s ease',
                    }}>
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '50%',
                        background: '#fff',
                        transform: overlays[layer.id] ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            ))}

            {egnaLager && egnaLager.length > 0 && egnaVarden && setEgnaVarden && (
              <div style={{
                background: '#0a0a0a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ padding: '12px 16px 8px', fontSize: '13px', opacity: 0.4 }}>
                  Egenkontrollen
                </div>
                {egnaLager.map(lager => (
                  <div
                    key={lager.id}
                    onClick={() => setEgnaVarden(prev => ({ ...prev, [lager.id]: !prev[lager.id] }))}
                    style={{
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '16px',
                      borderRadius: '12px', cursor: 'pointer', minHeight: 44,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', color: '#fff' }}>{lager.namn}</div>
                      <div style={{ fontSize: '13px', opacity: 0.5, marginTop: '2px' }}>{lager.beskrivning}</div>
                    </span>
                    <div style={{
                      width: '44px', height: '26px', borderRadius: '13px', padding: '2px',
                      background: egnaVarden[lager.id] ? '#30d158' : 'rgba(255,255,255,0.1)',
                      transition: 'background 0.2s ease', flexShrink: 0,
                    }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                        transform: egnaVarden[lager.id] ? 'translateX(18px)' : 'translateX(0)',
                        transition: 'transform 0.2s ease',
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {visaBrandrisk && (<>
            {/* SMHI Brandrisk (API-baserad) */}
            <div style={{
              background: '#0a0a0a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{
                padding: '12px 16px 8px',
                fontSize: '13px',
                opacity: 0.4,
              }}>
                SMHI
              </div>
              <div
                onClick={() => setOverlays(prev => ({ ...prev, brandrisk: !prev.brandrisk }))}
                style={{
                  padding: '14px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#f97316',
                  flexShrink: 0,
                  opacity: overlays.brandrisk ? 1 : 0.3,
                  transition: 'opacity 0.2s ease',
                }} />
                <span style={{ flex: 1 }}>
                  <span style={{ fontSize: '15px', color: '#fff' }}>Brandrisk</span>
                  <div style={{ fontSize: '13px', color: '#8e8e93', marginTop: '2px' }}>SMHI prognos, uppdateras dagligen</div>
                </span>
                <div style={{
                  width: '44px',
                  height: '26px',
                  borderRadius: '13px',
                  background: overlays.brandrisk ? '#30d158' : 'rgba(255,255,255,0.1)',
                  padding: '2px',
                  transition: 'background 0.2s ease',
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#fff',
                    transform: overlays.brandrisk ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }} />
                </div>
              </div>
            </div>
            </>)}
            {p.visibleLayers && setVisibleLayers && (<>
            {/* Dina markeringar */}
            <div style={{
              background: '#0a0a0a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{
                padding: '12px 16px 8px',
                fontSize: '13px',
                opacity: 0.4,
              }}>
                Dina markeringar
              </div>
              {[
                { id: 'symbols', name: 'Symboler', icon: '●' },
                { id: 'lines', name: 'Linjer', icon: '━' },
                { id: 'zones', name: 'Zoner', icon: '▢' },
                { id: 'arrows', name: 'Pilar', icon: '→' },
              ].map(layer => (
                <div
                  key={layer.id}
                  onClick={() => (setVisibleLayers ?? noop)(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    borderRadius: '12px',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: '20px', opacity: 0.6, width: '28px', textAlign: 'center' }}>
                    {layer.icon}
                  </span>
                  <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>{layer.name}</span>
                  <div style={{
                    width: '44px',
                    height: '26px',
                    borderRadius: '13px',
                    background: visibleLayers[layer.id] ? '#30d158' : 'rgba(255,255,255,0.1)',
                    padding: '2px',
                    transition: 'background 0.2s ease',
                  }}>
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#fff',
                      transform: visibleLayers[layer.id] ? 'translateX(18px)' : 'translateX(0)',
                      transition: 'transform 0.2s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
            </>)}
            {visaProduktionshogar && (<>
            {/* Produktionshögar (HPR) */}
            <div style={{
              background: '#0a0a0a',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              padding: '8px',
              marginBottom: '16px',
            }}>
              <div style={{
                padding: '12px 16px 8px',
                fontSize: '13px',
                opacity: 0.4,
              }}>
                Produktionsdata
              </div>
              <div
                onClick={() => setOverlays(prev => ({ ...prev, produktionshogar: !prev.produktionshogar }))}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: overlays.produktionshogar
                    ? '#2d6a4f'
                    : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }} />
                <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>Avverkade stammar</span>
                <div style={{
                  width: '44px',
                  height: '26px',
                  borderRadius: '13px',
                  background: overlays.produktionshogar ? '#30d158' : 'rgba(255,255,255,0.1)',
                  padding: '2px',
                  transition: 'background 0.2s ease',
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#fff',
                    transform: overlays.produktionshogar ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }} />
                </div>
              </div>
              <div
                onClick={() => setOverlays(prev => ({ ...prev, grothogar: !prev.grothogar }))}
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: overlays.grothogar
                    ? '#f59e0b'
                    : 'rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                }} />
                <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>GROT (grenar & toppar)</span>
                <div style={{
                  width: '44px',
                  height: '26px',
                  borderRadius: '13px',
                  background: overlays.grothogar ? '#30d158' : 'rgba(255,255,255,0.1)',
                  padding: '2px',
                  transition: 'background 0.2s ease',
                }}>
                  <div style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    background: '#fff',
                    transform: overlays.grothogar ? 'translateX(18px)' : 'translateX(0)',
                    transition: 'transform 0.2s ease',
                  }} />
                </div>
              </div>
              {/* Kvar att köra — flyttad till huvudmenyn */}
            </div>
            </>)}
            {zoneTypes && (<>
            {/* Zontyper - visas om zoner är på */}
            {visibleLayers.zones && (
              <div style={{
                background: '#0a0a0a', 
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{ 
                  padding: '12px 16px 8px', 
                  fontSize: '13px', 
                  opacity: 0.4, 
 
 
                }}>
                  Zontyper
                </div>
                {(zoneTypes ?? []).map(zone => (
                  <div
                    key={zone.id}
                    onClick={() => (setVisibleZones ?? noop)(prev => ({ ...prev, [zone.id]: prev[zone.id] === false }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '6px',
                      background: `${zone.color}30`,
                      border: `2px solid ${zone.color}`,
                    }} />
                    <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>{zone.name}</span>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: visibleZones[zone.id] !== false ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      background: visibleZones[zone.id] !== false ? '#30d158' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {visibleZones[zone.id] !== false && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <path d="M5 12 L10 17 L19 8" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>)}
            {lineTypes && (<>
            {/* Linjetyper - visas om linjer är på */}
            {visibleLayers.lines && (
              <div style={{
                background: '#0a0a0a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '8px',
                marginBottom: '16px',
              }}>
                <div style={{
                  padding: '12px 16px 8px',
                  fontSize: '13px',
                  opacity: 0.4,
                }}>
                  Linjetyper
                </div>
                {(lineTypes ?? []).filter(l => !l.id.includes('sideRoad') && !l.id.includes('backRoad')).map(line => (
                  <div
                    key={line.id}
                    onClick={() => (setVisibleLines ?? noop)(prev => ({ ...prev, [line.id]: prev[line.id] === false }))}
                    style={{
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '16px',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '36px',
                      height: '4px',
                      borderRadius: '2px',
                      background: line.striped
                        ? `repeating-linear-gradient(90deg, ${line.color} 0px, ${line.color} 4px, ${line.color2} 4px, ${line.color2} 8px)`
                        : line.color,
                    }} />
                    <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>{line.name}</span>
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      border: visibleLines[line.id] !== false ? 'none' : '2px solid rgba(255,255,255,0.2)',
                      background: visibleLines[line.id] !== false ? '#30d158' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {visibleLines[line.id] !== false && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3">
                          <path d="M5 12 L10 17 L19 8" />
                        </svg>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            </>)}
            {onOppnaVarningar && (<>
            {/* Varningsinställningar - öppna knapp */}
            <div
              onClick={() => setWarningMenuOpen(true)}
              style={{
                background: '#0a0a0a',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '18px 20px',
                marginBottom: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                cursor: 'pointer',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <span style={{ flex: 1, fontSize: '15px', color: '#fff' }}>Varningsinställningar</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{ opacity: 0.4 }}>
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}
