'use client';

import React, { useState } from 'react';
import { Maskin, MaskinKoItem, OversiktObjekt, C, TF } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, getMaskinDisplayName, getMaskinTyp, dKm, getWeekNumber } from './oversikt-utils';

interface Props {
  maskiner: Maskin[];
  maskinKo: MaskinKoItem[];
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

function Tag({ children, w }: { children: React.ReactNode; w?: boolean }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, color: w ? C.yellow : C.t2, padding: '3px 8px', background: w ? C.yd : 'rgba(255,255,255,0.04)', borderRadius: 6, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

export default function OversiktMaskiner({ maskiner, maskinKo, objekt, supabase, onRefresh }: Props) {
  const [openM, setOpenM] = useState<string | null>(null);
  const [addingToMaskin, setAddingToMaskin] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragMaskinId, setDragMaskinId] = useState<string | null>(null);

  const aktivaMaskiner = maskiner.filter(m => m.aktiv !== false);

  const getKoItems = (maskinId: string) =>
    maskinKo.filter(k => k.maskin_id === maskinId).sort((a, b) => a.ordning - b.ordning);

  const getObj = (objektId: string) => objekt.find(o => o.id === objektId);

  // Estimate schedule: days per object based on volume
  const getSchedule = (maskinId: string) => {
    const m = maskiner.find(mm => mm.maskin_id === maskinId);
    const isSk = getMaskinTyp(m?.typ) === 'skördare';
    const items = getKoItems(maskinId);
    let offset = 0;
    return items.map(ki => {
      const o = getObj(ki.objekt_id);
      if (!o) return null;
      const daysPerVol = isSk ? 12 : 10; // m³/dag approximation
      const days = Math.max(1, Math.ceil((o.volym || 0) / daysPerVol / 6));
      const start = offset;
      offset += days;
      return { objekt_id: ki.objekt_id, start, end: offset, days };
    }).filter(Boolean) as { objekt_id: string; start: number; end: number; days: number }[];
  };

  const handleAddToKo = async (maskinId: string, objektId: string) => {
    const existing = getKoItems(maskinId);
    const maxOrdning = existing.length > 0 ? Math.max(...existing.map(k => k.ordning)) : -1;
    await supabase.from('maskin_ko').insert({
      maskin_id: maskinId,
      objekt_id: objektId,
      ordning: maxOrdning + 1,
    });
    setAddingToMaskin(null);
    setSearchText('');
    await onRefresh();
  };

  const handleRemoveFromKo = async (koId: string) => {
    await supabase.from('maskin_ko').delete().eq('id', koId);
    await onRefresh();
  };

  const handleReorder = async (maskinId: string, fromIdx: number, toIdx: number) => {
    const items = getKoItems(maskinId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= items.length || toIdx >= items.length) return;
    const reordered = [...items];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    // Update all ordning values
    await Promise.all(reordered.map((ki, idx) =>
      supabase.from('maskin_ko').update({ ordning: idx }).eq('id', ki.id)
    ));
    await onRefresh();
  };

  const handleMoveBetweenMachines = async (fromMaskinId: string, fromIdx: number, toMaskinId: string) => {
    const fromItems = getKoItems(fromMaskinId);
    if (fromIdx < 0 || fromIdx >= fromItems.length) return;
    const item = fromItems[fromIdx];
    const toItems = getKoItems(toMaskinId);
    const maxOrdning = toItems.length > 0 ? Math.max(...toItems.map(k => k.ordning)) : -1;
    await supabase.from('maskin_ko').update({ maskin_id: toMaskinId, ordning: maxOrdning + 1 }).eq('id', item.id);
    await onRefresh();
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px 80px', fontFamily: ff }}>
      {aktivaMaskiner.map(maskin => {
        const displayName = getMaskinDisplayName(maskin);
        const maskinTyp = getMaskinTyp(maskin.typ);
        const isSk = maskinTyp === 'skördare';
        const isOpen = openM === maskin.maskin_id;
        const koItems = getKoItems(maskin.maskin_id);
        const hasItems = koItems.length > 0;
        const schedule = getSchedule(maskin.maskin_id);
        const totalDays = schedule.length > 0 ? schedule[schedule.length - 1].end : 0;
        const isDropTarget = dragMaskinId && dragMaskinId !== maskin.maskin_id;

        return (
          <div key={maskin.maskin_id} style={{ marginBottom: 10 }}
            onDragOver={e => { if (isDropTarget) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
            onDrop={e => {
              if (!isDropTarget || dragIdx === null || !dragMaskinId) return;
              e.preventDefault();
              handleMoveBetweenMachines(dragMaskinId, dragIdx, maskin.maskin_id);
              setDragIdx(null);
              setDragMaskinId(null);
            }}>

            {/* Machine header */}
            <div onClick={() => setOpenM(isOpen ? null : maskin.maskin_id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                background: isOpen ? C.card : isDropTarget ? '#131318' : '#0e0e10',
                borderRadius: isOpen ? '12px 12px 0 0' : 12, cursor: 'pointer',
                border: isDropTarget ? '1px dashed rgba(255,255,255,0.1)' : `1px solid ${C.border}`,
                borderBottom: isOpen ? 'none' : undefined, transition: 'all 0.15s',
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: isSk ? C.yd : C.gd,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>{isSk ? '🪵' : '🚛'}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{displayName}</div>
                <div style={{ fontSize: 10, color: C.t3 }}>
                  {isSk ? 'Skördare' : 'Skotare'}{hasItems ? ` · ${koItems.length} objekt` : ' · Ledig'}
                </div>
              </div>
              {isDropTarget && <span style={{ fontSize: 9, color: C.t3 }}>Släpp här</span>}
              {hasItems && totalDays > 0 && <span style={{ fontSize: 10, color: C.t4 }}>Klar {getWeekNumber(totalDays)}</span>}
              <span style={{ fontSize: 12, color: C.t4, transform: isOpen ? 'rotate(90deg)' : '', transition: 'transform 0.15s' }}>›</span>
            </div>

            {/* Expanded content */}
            {isOpen && (
              <div style={{
                background: C.card, borderRadius: '0 0 12px 12px',
                border: `1px solid ${C.border}`, borderTop: 'none',
                padding: '8px 14px 14px', animation: 'fadeIn .12s',
              }}>
                {hasItems ? (
                  <>
                    {/* Timeline bar */}
                    {totalDays > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.03)' }}>
                          {schedule.map((s, i) => {
                            const o = getObj(s.objekt_id);
                            const isFirst = i === 0;
                            return (
                              <div key={i} style={{
                                flex: s.days, background: o ? (TF[o.typ] || C.yellow) : '#525252',
                                opacity: isFirst ? 0.6 : 0.15,
                                borderRight: i < schedule.length - 1 ? `1px solid ${C.bg}` : 'none',
                              }} />
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', marginTop: 3 }}>
                          {schedule.map((s, i) => {
                            const o = getObj(s.objekt_id);
                            return (
                              <div key={i} style={{ flex: s.days, textAlign: 'center', fontSize: 8, color: C.t4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {o?.namn}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Queue items */}
                    {koItems.map((ki, idx) => {
                      const o = getObj(ki.objekt_id);
                      if (!o) return null;
                      const tf = TF[o.typ] || C.yellow;
                      const isLast = idx === koItems.length - 1;
                      const isFirst = idx === 0;
                      const prev = idx > 0 ? getObj(koItems[idx - 1].objekt_id) : null;
                      const dist = prev && prev.lat && prev.lng && o.lat && o.lng
                        ? dKm({ lat: prev.lat, lng: prev.lng }, { lat: o.lat, lng: o.lng }) : null;
                      const thisSchedule = schedule.find(s => s.objekt_id === ki.objekt_id);
                      const isDragging = dragMaskinId === maskin.maskin_id && dragIdx === idx;

                      return (
                        <div key={ki.id} draggable
                          onDragStart={(e) => { setDragIdx(idx); setDragMaskinId(maskin.maskin_id); e.dataTransfer.effectAllowed = 'move'; }}
                          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                          onDrop={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (dragMaskinId !== maskin.maskin_id || dragIdx === null || dragIdx === idx) return;
                            handleReorder(maskin.maskin_id, dragIdx, idx);
                            setDragIdx(null); setDragMaskinId(null);
                          }}
                          onDragEnd={() => { setDragIdx(null); setDragMaskinId(null); }}
                          style={{ opacity: isDragging ? 0.25 : 1, transition: 'opacity 0.15s' }}>

                          {/* Distance between objects */}
                          {dist !== null && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0 4px 8px' }}>
                              <div style={{ width: 12, display: 'flex', justifyContent: 'center' }}>
                                <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.04)' }} />
                              </div>
                              <span style={{ fontSize: 9, color: C.t4 }}>{dist} km · {dist > 15 ? 'Trailer' : 'Hjula'}</span>
                            </div>
                          )}

                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            {/* Timeline dot + line */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 12, flexShrink: 0, paddingTop: 2 }}>
                              <div style={{
                                width: isFirst ? 10 : 6, height: isFirst ? 10 : 6, borderRadius: '50%',
                                background: isFirst ? tf : 'rgba(255,255,255,0.06)',
                                border: isFirst ? 'none' : `1.5px solid ${tf}30`,
                                boxShadow: isFirst ? `0 0 8px ${tf}40` : 'none',
                              }} />
                              {!isLast && <div style={{ width: 1, flex: 1, minHeight: 12, background: 'rgba(255,255,255,0.04)', marginTop: 4 }} />}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, paddingBottom: isLast ? 0 : 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: isFirst ? 15 : 13, fontWeight: isFirst ? 600 : 400, color: isFirst ? C.t1 : C.t2 }}>{o.namn}</span>
                                <span style={{ fontSize: 9, color: C.t3, padding: '2px 6px', background: 'rgba(255,255,255,0.03)', borderRadius: 4 }}>
                                  {o.typ === 'slutavverkning' ? 'Slutavv.' : 'Gallring'}
                                </span>
                                {isFirst
                                  ? <span style={{ fontSize: 8, fontWeight: 600, color: C.t3, marginLeft: 'auto', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pågår</span>
                                  : thisSchedule && <span style={{ fontSize: 9, color: C.t4, marginLeft: 'auto' }}>{getWeekNumber(thisSchedule.start)} · ~{thisSchedule.days}d</span>
                                }
                                {/* Drag handle */}
                                <div style={{ cursor: 'grab', padding: '2px 4px', color: C.t4, fontSize: 12, userSelect: 'none' }}>⠿</div>
                                {/* Remove */}
                                <button onClick={(e) => { e.stopPropagation(); handleRemoveFromKo(ki.id); }}
                                  style={{ background: 'none', border: 'none', color: C.t4, fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}>✕</button>
                              </div>

                              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                                {formatVolym(o.volym || 0)} m³ · {o.areal || '–'} ha
                              </div>

                              {/* Tags */}
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                                {isSk && o.skordare_band && <Tag>Band {o.skordare_band_par || ''}p</Tag>}
                                {!isSk && o.skotare_band && <Tag>Band {o.skotare_band_par || ''}p</Tag>}
                                {!isSk && o.skotare_lastreder_breddat && <Tag>Brett</Tag>}
                                {!isSk && o.skotare_ris_direkt && <Tag>GROT direkt</Tag>}
                                {isSk && o.skordare_manuell_fallning && <Tag w>Manuell</Tag>}
                                {o.barighet && <Tag>{o.barighet}</Tag>}
                                {o.terrang && <Tag>{o.terrang}</Tag>}
                                {o.transport_trailer_in === false && <Tag w>Ej trailer</Tag>}
                                {o.markagare_ska_ha_ved && <Tag>Ved</Tag>}
                              </div>

                              {o.transport_kommentar && <div style={{ fontSize: 9, color: C.t3, marginTop: 4 }}>🚚 {o.transport_kommentar}</div>}
                              {o.info_anteckningar && <div style={{ fontSize: 9, color: C.t3, marginTop: 2 }}>📝 {o.info_anteckningar}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add object button */}
                    <button onClick={(e) => { e.stopPropagation(); setAddingToMaskin(maskin.maskin_id); }}
                      style={{ width: '100%', marginTop: 10, padding: '8px 0', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.t3, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: ff }}>
                      + Lägg till objekt
                    </button>

                    {/* Route mini map */}
                    {(() => {
                      const objs = koItems.map(k => getObj(k.objekt_id)).filter(o => o && o.lat && o.lng) as OversiktObjekt[];
                      if (objs.length < 1) return null;
                      const lats = objs.map(o => o.lat!);
                      const lngs = objs.map(o => o.lng!);
                      const pl = (Math.max(...lats) - Math.min(...lats)) * 0.35 || 0.02;
                      const pg = (Math.max(...lngs) - Math.min(...lngs)) * 0.35 || 0.04;
                      const nl = Math.min(...lats) - pl, xl = Math.max(...lats) + pl;
                      const ng = Math.min(...lngs) - pg, xg = Math.max(...lngs) + pg;
                      const rx = (lng: number) => ((lng - ng) / (xg - ng)) * 100;
                      const ry = (lat: number) => (1 - (lat - nl) / (xl - nl)) * 100;
                      const pts = objs.map(o => ({ x: rx(o.lng!), y: ry(o.lat!), o }));

                      return (
                        <div style={{ position: 'relative', height: 150, background: '#0b0b0d', borderRadius: 10, overflow: 'hidden', marginTop: 10, border: `1px solid ${C.border}` }}>
                          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                            {pts.map((p, i) => {
                              if (!i) return null;
                              const pv = pts[i - 1];
                              const d = dKm(pv.o, p.o);
                              const mx = (pv.x + p.x) / 2;
                              const my = (pv.y + p.y) / 2;
                              return (
                                <g key={i}>
                                  <line x1={`${pv.x}%`} y1={`${pv.y}%`} x2={`${p.x}%`} y2={`${p.y}%`} stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" strokeDasharray="4,4" />
                                  <text x={`${mx}%`} y={`${my}%`} textAnchor="middle" dominantBaseline="central" fill={C.t4} fontSize="9" fontWeight="500" fontFamily={ff}>{d} km</text>
                                </g>
                              );
                            })}
                          </svg>
                          {pts.map((p, i) => {
                            const isFirst = i === 0;
                            const tf = TF[p.o.typ] || C.yellow;
                            return (
                              <div key={i} style={{ position: 'absolute', left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%,-50%)', zIndex: 3 }}>
                                {isFirst && <div style={{ position: 'absolute', inset: -6, borderRadius: '50%', background: tf, opacity: 0.12, animation: 'pulse 2.5s infinite' }} />}
                                <div style={{
                                  width: isFirst ? 14 : 8, height: isFirst ? 14 : 8, borderRadius: '50%',
                                  background: isFirst ? tf : 'rgba(255,255,255,0.06)',
                                  border: `1.5px solid ${isFirst ? 'rgba(255,255,255,.2)' : tf + '30'}`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                  <span style={{ fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,.6)' }}>{i + 1}</span>
                                </div>
                                <div style={{
                                  position: 'absolute', top: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)',
                                  whiteSpace: 'nowrap', fontSize: isFirst ? 10 : 8, fontWeight: isFirst ? 600 : 400,
                                  color: isFirst ? C.t1 : C.t3, textShadow: '0 1px 6px rgba(0,0,0,.9)',
                                }}>{p.o.namn}</div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <>
                    <div style={{ padding: 20, textAlign: 'center', color: C.t4, fontSize: 11 }}>Inga objekt tilldelade</div>
                    <button onClick={(e) => { e.stopPropagation(); setAddingToMaskin(maskin.maskin_id); }}
                      style={{ width: '100%', padding: '8px 0', background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`, borderRadius: 8, color: C.t3, fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: ff }}>
                      + Lägg till objekt
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Modal: Add object to queue */}
      {addingToMaskin && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 }}
          onClick={() => { setAddingToMaskin(null); setSearchText(''); }}>
          <div style={{ background: C.card, borderRadius: '16px 16px 0 0', padding: 24, width: '100%', maxWidth: 500, border: `1px solid ${C.border}` }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: 'rgba(255,255,255,0.15)', borderRadius: 2, margin: '0 auto 20px' }} />
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 600 }}>Lägg till objekt</h2>
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="Sök objekt..." autoFocus
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', marginBottom: 12, fontFamily: ff }} />
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {objekt
                .filter(o => !maskinKo.some(k => k.maskin_id === addingToMaskin && k.objekt_id === o.id))
                .filter(o => !searchText || o.namn?.toLowerCase().includes(searchText.toLowerCase()))
                .map(o => (
                  <div key={o.id} onClick={() => handleAddToKo(addingToMaskin, o.id)}
                    style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer' }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{o.namn}</div>
                    <div style={{ fontSize: 11, color: C.t3 }}>
                      {o.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'} · {o.volym || 0} m³
                    </div>
                  </div>
                ))}
            </div>
            <button onClick={() => { setAddingToMaskin(null); setSearchText(''); }}
              style={{ width: '100%', marginTop: 12, padding: '10px 0', background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, borderRadius: 10, color: C.t3, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: ff }}>
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
