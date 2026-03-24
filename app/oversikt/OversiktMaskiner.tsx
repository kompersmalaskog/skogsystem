'use client';

import React, { useState } from 'react';
import {
  DndContext,
  closestCenter,
  TouchSensor,
  MouseSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Maskin, MaskinKoItem, OversiktObjekt, C, T, BTN, SP } from './oversikt-types';
import { ff } from './oversikt-styles';
import { getMaskinDisplayName, getMaskinTyp } from './oversikt-utils';

interface Props {
  maskiner: Maskin[];
  maskinKo: MaskinKoItem[];
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

/* ── Sortable row ── */
function SortableRow({
  ki, idx, objName, isMenuOpen, onMenuToggle,
}: {
  ki: MaskinKoItem;
  idx: number;
  objName: string;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ki.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div ref={setNodeRef} style={{ ...style, position: 'relative' }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: `${SP.xl}px ${SP.xs}px`,
        borderBottom: `1px solid ${C.border}`,
        background: 'transparent',
      }}>
        {/* Nummer */}
        <div style={{
          width: 40, flexShrink: 0,
          fontSize: 20, fontWeight: 700, color: C.t4,
          fontVariantNumeric: 'tabular-nums',
        }}>{idx + 1}</div>

        {/* Objektnamn */}
        <div style={{
          flex: 1, minWidth: 0, ...T.h2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{objName}</div>

        {/* ⋮ meny-knapp */}
        <button
          onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
          style={{
            width: 44, height: 44, flexShrink: 0,
            background: 'none', border: 'none',
            color: C.t4, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontFamily: ff,
          }}
        >⋮</button>

        {/* Drag handle — touch-aktiverad */}
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          style={{
            flexShrink: 0, padding: `${SP.sm}px ${SP.xs}px`,
            color: C.t4, cursor: 'grab', touchAction: 'none',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── Drag overlay (the "lifted" row while dragging) ── */
function DragOverlayRow({ objName, idx }: { objName: string; idx: number }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: `${SP.xl}px ${SP.xs}px`,
      background: C.surface3, borderRadius: SP.md,
      border: `1px solid ${C.borderStrong}`,
      boxShadow: C.shadowMd, fontFamily: ff,
    }}>
      <div style={{
        width: 40, flexShrink: 0,
        fontSize: 20, fontWeight: 700, color: C.t2,
        fontVariantNumeric: 'tabular-nums',
      }}>{idx + 1}</div>
      <div style={{
        flex: 1, minWidth: 0, ...T.h2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{objName}</div>
      <div style={{ flexShrink: 0, padding: `${SP.sm}px ${SP.xs}px`, color: C.t3 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      </div>
    </div>
  );
}

export default function OversiktMaskiner({ maskiner, maskinKo, objekt, supabase, onRefresh }: Props) {
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [movingItem, setMovingItem] = useState<{ koId: string; objektId: string; fromMaskin: string } | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [addTypFilter, setAddTypFilter] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMaskin, setActiveMaskin] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
  );

  const aktivaMaskiner = maskiner.filter(m => m.aktiv !== false);
  const getKo = (mid: string) => maskinKo.filter(k => k.maskin_id === mid).sort((a, b) => a.ordning - b.ordning);
  const getObj = (oid: string) => objekt.find(o => o.id === oid);
  const getTilldelade = (mid: string) => new Set(getKo(mid).map(k => k.objekt_id));

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    // Find which machine this item belongs to
    const ko = maskinKo.find(k => k.id === event.active.id);
    setActiveMaskin(ko?.maskin_id || null);
    setMenuOpen(null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveMaskin(null);

    if (!over || active.id === over.id || !activeMaskin) return;

    const items = getKo(activeMaskin);
    const oldIndex = items.findIndex(k => k.id === active.id);
    const newIndex = items.findIndex(k => k.id === over.id);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    await Promise.all(reordered.map((ki, i) => supabase.from('maskin_ko').update({ ordning: i }).eq('id', ki.id)));
    await onRefresh();
  };

  const handleMoveTo = async (targetMaskinId: string) => {
    if (!movingItem) return;
    const targetKo = getKo(targetMaskinId);
    const maxOrd = targetKo.length > 0 ? Math.max(...targetKo.map(k => k.ordning)) + 1 : 0;
    await supabase.from('maskin_ko').update({ maskin_id: targetMaskinId, ordning: maxOrd }).eq('id', movingItem.koId);
    setMovingItem(null);
    setMenuOpen(null);
    await onRefresh();
  };

  const handleAdd = async (maskinId: string, objektId: string) => {
    const existing = getKo(maskinId);
    const maxOrd = existing.length > 0 ? Math.max(...existing.map(k => k.ordning)) + 1 : 0;
    await supabase.from('maskin_ko').insert({ maskin_id: maskinId, objekt_id: objektId, ordning: maxOrd }).select();
    setAddingTo(null);
    setSearchText('');
    await onRefresh();
  };

  const handleRemove = async (koId: string) => {
    await supabase.from('maskin_ko').delete().eq('id', koId);
    setMenuOpen(null);
    await onRefresh();
  };

  // Find active item info for overlay
  const activeKo = activeId ? maskinKo.find(k => k.id === activeId) : null;
  const activeObj = activeKo ? getObj(activeKo.objekt_id) : null;
  const activeIdx = activeKo && activeMaskin
    ? getKo(activeMaskin).findIndex(k => k.id === activeId)
    : -1;

  return (
    <div style={{
      height: '100%', overflowY: 'auto',
      padding: '16px 16px 140px',
      fontFamily: ff,
    }}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {aktivaMaskiner.map((maskin) => {
          const name = getMaskinDisplayName(maskin);
          const isSk = getMaskinTyp(maskin.typ) === 'skördare';
          const ko = getKo(maskin.maskin_id);

          return (
            <div key={maskin.maskin_id} style={{ marginBottom: 32 }}>
              {/* Maskinnamn + status */}
              <div style={{ padding: `0 ${SP.xs}px ${SP.lg}px` }}>
                <div style={T.h1}>{name}</div>
                <div style={{ ...T.caption, marginTop: SP.xs }}>
                  {isSk ? 'Skördare' : 'Skotare'}
                  {(() => {
                    if (ko.length === 0) return <span style={{ color: C.t4 }}> · Ledig</span>;
                    const firstObj = getObj(ko[0].objekt_id);
                    if (!firstObj) return null;
                    const isAct = firstObj.status === 'pagaende' || firstObj.status === 'skordning' || firstObj.status === 'skotning';
                    return isAct
                      ? <span style={{ color: C.green }}> · Pågående: {firstObj.namn}</span>
                      : <span style={{ color: C.t3 }}> · Nästa: {firstObj.namn}</span>;
                  })()}
                </div>
              </div>

              {/* Objektlista med drag-and-drop */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <SortableContext items={ko.map(k => k.id)} strategy={verticalListSortingStrategy}>
                  {ko.map((ki, idx) => {
                    const o = getObj(ki.objekt_id);
                    if (!o) return null;
                    const isMenuOpen = menuOpen === ki.id;

                    return (
                      <div key={ki.id} style={{ position: 'relative' }}>
                        <SortableRow
                          ki={ki}
                          idx={idx}
                          objName={o.namn}
                          isMenuOpen={isMenuOpen}
                          onMenuToggle={() => {
                            setMenuOpen(isMenuOpen ? null : ki.id);
                            setMovingItem(null);
                          }}
                        />

                        {/* ── Dropdown-meny ── */}
                        {isMenuOpen && !movingItem && (
                          <div style={{
                            position: 'absolute', right: SP.sm, top: '100%',
                            zIndex: 50, background: C.surface3,
                            border: `1px solid ${C.borderStrong}`,
                            borderRadius: SP.md, overflow: 'hidden',
                            minWidth: 220, boxShadow: C.shadowMd,
                          }}>
                            <button
                              onClick={() => setMovingItem({ koId: ki.id, objektId: ki.objekt_id, fromMaskin: maskin.maskin_id })}
                              style={{
                                width: '100%', padding: `${SP.lg}px ${SP.xl}px`,
                                background: 'none', border: 'none',
                                ...T.body, textAlign: 'left', cursor: 'pointer', fontFamily: ff,
                                borderBottom: `1px solid ${C.border}`,
                              }}
                            >Flytta till annan maskin</button>
                            <button
                              onClick={() => handleRemove(ki.id)}
                              style={{
                                width: '100%', padding: `${SP.lg}px ${SP.xl}px`,
                                background: 'none', border: 'none',
                                color: C.t3, fontSize: 15, fontWeight: 500,
                                textAlign: 'left', cursor: 'pointer', fontFamily: ff,
                              }}
                            >Ta bort</button>
                          </div>
                        )}

                        {/* ── Välj målmaskin ── */}
                        {isMenuOpen && movingItem && (
                          <div style={{
                            position: 'absolute', right: SP.sm, top: '100%',
                            zIndex: 50, background: C.surface3,
                            border: `1px solid ${C.borderStrong}`,
                            borderRadius: SP.md, overflow: 'hidden',
                            minWidth: 220, boxShadow: C.shadowMd,
                          }}>
                            <div style={{
                              padding: `${SP.md}px ${SP.xl}px`,
                              ...T.label, borderBottom: `1px solid ${C.border}`,
                            }}>Flytta till:</div>
                            {aktivaMaskiner
                              .filter(m => m.maskin_id !== maskin.maskin_id)
                              .map(m => (
                                <button
                                  key={m.maskin_id}
                                  onClick={() => handleMoveTo(m.maskin_id)}
                                  style={{
                                    width: '100%', padding: `${SP.lg}px ${SP.xl}px`,
                                    background: 'none', border: 'none',
                                    ...T.body, textAlign: 'left', cursor: 'pointer', fontFamily: ff,
                                    borderBottom: `1px solid ${C.border}`,
                                  }}
                                >{getMaskinDisplayName(m)}</button>
                              ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </SortableContext>

                {/* ── Lägg till objekt ── */}
                {ko.length === 0 && (
                  <div style={{ padding: `${SP.xl}px ${SP.xs}px`, ...T.body, color: C.t4 }}>Inga objekt</div>
                )}
                <button
                  onClick={() => { setAddingTo(maskin.maskin_id); setSearchText(''); setMenuOpen(null); }}
                  style={{
                    width: '100%', padding: `${SP.xl}px ${SP.xs}px`,
                    background: 'none', border: 'none',
                    borderBottom: `1px solid ${C.border}`, color: C.t4,
                    ...T.body, fontWeight: 400,
                    textAlign: 'left', cursor: 'pointer', fontFamily: ff,
                  }}
                >+ Lägg till objekt</button>
              </div>
            </div>
          );
        })}

        {/* Drag overlay — the "floating" row */}
        <DragOverlay>
          {activeId && activeObj ? (
            <DragOverlayRow objName={activeObj.namn} idx={activeIdx} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ── Bakgrundsklick stänger menyer ── */}
      {menuOpen && (
        <div
          onClick={() => { setMenuOpen(null); setMovingItem(null); }}
          style={{ position: 'fixed', inset: 0, zIndex: 40 }}
        />
      )}

      {/* ── Modal: Lägg till objekt ── */}
      {addingTo && (
        <div
          onClick={() => { setAddingTo(null); setSearchText(''); setAddTypFilter('alla'); }}
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.surface3,
              borderRadius: `${SP.xl}px ${SP.xl}px 0 0`,
              padding: `${SP.md}px ${SP.xl}px ${SP.xxxl}px`,
              width: '100%', maxWidth: 500,
              border: `1px solid ${C.border}`,
              borderBottom: 'none',
            }}
          >
            <div style={{
              width: 36, height: 4,
              background: C.t4, borderRadius: 100,
              margin: `0 auto ${SP.xxl}px`,
            }} />

            <div style={{ ...T.h1, marginBottom: SP.lg }}>Lägg till objekt</div>

            {/* Typfilter */}
            <div style={{ display: 'flex', gap: SP.sm, marginBottom: SP.md }}>
              {([
                { k: 'alla' as const, l: 'Alla' },
                { k: 'slutavverkning' as const, l: 'Slutavv.' },
                { k: 'gallring' as const, l: 'Gallring' },
              ]).map(f => (
                <button key={f.k} onClick={() => setAddTypFilter(f.k)}
                  style={addTypFilter === f.k ? { ...BTN.primary, fontSize: 13 } : { ...BTN.secondary, fontSize: 13 }}
                >{f.l}</button>
              ))}
            </div>

            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Sök objekt..."
              autoFocus
              style={{
                width: '100%', padding: `${SP.lg}px`,
                borderRadius: SP.md, border: `1px solid ${C.border}`,
                background: C.surface, color: C.t1, ...T.body,
                outline: 'none', fontFamily: ff, marginBottom: SP.md,
              }}
            />

            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {(() => {
                const PLANERADE_STATUS = ['planerad', 'pagaende', 'skordning', 'skotning'];
                const filtered = objekt
                  .filter(o => PLANERADE_STATUS.includes(o.status))
                  .filter(o => addTypFilter === 'alla' || o.typ === addTypFilter || (addTypFilter === 'slutavverkning' && o.typ === 'slut'))
                  .filter(o => !searchText || o.namn?.toLowerCase().includes(searchText.toLowerCase()));
                return filtered.length > 0 ? filtered.map(o => {
                  const alreadyOn = addingTo ? getTilldelade(addingTo).has(o.id) : false;
                  return (
                    <button key={o.id} onClick={() => handleAdd(addingTo!, o.id)}
                      style={{
                        width: '100%', padding: `${SP.lg}px`,
                        background: 'none', border: 'none',
                        borderBottom: `1px solid ${C.border}`,
                        color: alreadyOn ? C.t4 : C.t1,
                        ...T.body, textAlign: 'left', cursor: 'pointer', fontFamily: ff,
                        display: 'flex', alignItems: 'center', gap: SP.md,
                      }}
                    >
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {o.namn}{alreadyOn ? ' (redan tillagd)' : ''}
                      </span>
                      <span style={{ ...T.caption, flexShrink: 0 }}>{o.typ === 'gallring' ? 'G' : 'S'}</span>
                    </button>
                  );
                }) : (
                  <div style={{ padding: `${SP.xxl}px ${SP.lg}px`, color: C.t4, ...T.body, textAlign: 'center' }}>
                    Inga planerade objekt
                  </div>
                );
              })()}
            </div>

            <button
              onClick={() => { setAddingTo(null); setSearchText(''); setAddTypFilter('alla'); }}
              style={{ ...BTN.secondary, width: '100%', marginTop: SP.lg, fontFamily: ff }}
            >Avbryt</button>
          </div>
        </div>
      )}
    </div>
  );
}
