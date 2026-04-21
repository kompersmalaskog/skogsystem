'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { OversiktObjekt, C, T, BTN, SP } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, grotDeadlineDays } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
  grotAnpassadVo: Set<string>;
  supabase: any;
  onRefresh: () => Promise<void>;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / 864e5);
}

function fmtDate(d: string): string {
  return new Date(d + (d.includes('T') ? '' : 'T00:00:00')).toLocaleDateString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function OversiktGrot({ objekt, grotAnpassadVo, supabase, onRefresh }: Props) {
  const [selG, setSelG] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [grotVol, setGrotVol] = useState<Record<string, string>>({});
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const [skotDates, setSkotDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [skordDates, setSkordDates] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [savedMsg, setSavedMsg] = useState<Record<string, boolean>>({});
  const autoSaveRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const savedMsgRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Fetch skordning_avslutad from dim_objekt
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('dim_objekt')
        .select('vo_nummer, skordning_avslutad')
        .not('skordning_avslutad', 'is', null);
      if (data) {
        const map: Record<string, string> = {};
        data.forEach((r: { vo_nummer: string; skordning_avslutad: string }) => {
          if (r.vo_nummer && r.skordning_avslutad) map[r.vo_nummer] = r.skordning_avslutad;
        });
        setSkordDates(map);
      }
    })();
  }, [supabase]);

  useEffect(() => {
    return () => {
      Object.values(autoSaveRef.current).forEach(clearTimeout);
      Object.values(savedMsgRef.current).forEach(clearTimeout);
    };
  }, []);

  const isSkotat = (o: OversiktObjekt) => o.grot_status === 'skotat' || o.grot_status === 'hoglagd' || o.grot_status === 'flisad' || o.grot_status === 'borttransporterad' || o.grot_status === 'bortkord';

  // Visa BARA grotanpassade objekt
  const grotObjekt = useMemo(() => {
    const list = objekt.filter(o => {
      // Måste vara grotanpassad (från dim_objekt)
      if (o.vo_nummer && grotAnpassadVo.has(o.vo_nummer)) return true;
      // Eller har grot-data redan registrerad
      if (o.grot_volym && o.grot_volym > 0) return true;
      if (o.grot_status && o.grot_status !== 'ej_aktuellt') return true;
      return false;
    });
    return list.sort((a, b) => {
      const sa = isSkotat(a);
      const sb = isSkotat(b);
      if (sa !== sb) return sa ? 1 : -1;
      if (a.grot_deadline && b.grot_deadline) return a.grot_deadline.localeCompare(b.grot_deadline);
      if (a.grot_deadline && !b.grot_deadline) return -1;
      if (!a.grot_deadline && b.grot_deadline) return 1;
      return a.namn.localeCompare(b.namn);
    });
  }, [objekt, grotAnpassadVo]);

  // Påminnelser: objekt med önskat skotningsdatum inom 3 dagar
  const reminders = useMemo(() => {
    return grotObjekt.filter(o => {
      const dateStr = skotDates[o.id] || o.grot_deadline;
      if (!dateStr || isSkotat(o)) return false;
      const days = grotDeadlineDays(dateStr);
      return days !== null && days >= 0 && days <= 3;
    });
  }, [grotObjekt, skotDates]);

  const saveAll = useCallback(async (id: string, showMsg: boolean) => {
    const obj = objekt.find(o => o.id === id);
    if (!obj) return;

    if (autoSaveRef.current[id]) {
      clearTimeout(autoSaveRef.current[id]);
      delete autoSaveRef.current[id];
    }

    const volStr = grotVol[id];
    const note = notes[id];
    const dl = deadlines[id];

    const update: Record<string, any> = {};
    if (volStr !== undefined) update.grot_volym = volStr ? parseFloat(volStr) : null;
    if (note !== undefined) update.grot_anteckning = note || null;
    if (dl !== undefined) update.grot_deadline = dl || null;

    if (Object.keys(update).length === 0) {
      setDirty(prev => ({ ...prev, [id]: false }));
      return;
    }

    await supabase.from('objekt').update(update).eq('id', id);
    setDirty(prev => ({ ...prev, [id]: false }));

    if (showMsg) {
      setSavedMsg(prev => ({ ...prev, [id]: true }));
      if (savedMsgRef.current[id]) clearTimeout(savedMsgRef.current[id]);
      savedMsgRef.current[id] = setTimeout(() => {
        setSavedMsg(prev => ({ ...prev, [id]: false }));
      }, 2000);
    }

    await onRefresh();
  }, [objekt, grotVol, notes, deadlines, supabase, onRefresh]);

  const startAutoSave = useCallback((id: string) => {
    if (autoSaveRef.current[id]) clearTimeout(autoSaveRef.current[id]);
    autoSaveRef.current[id] = setTimeout(() => {
      saveAll(id, false);
    }, 10000);
  }, [saveAll]);

  const markDirty = useCallback((id: string) => {
    setDirty(prev => ({ ...prev, [id]: true }));
    startAutoSave(id);
  }, [startAutoSave]);

  const handleNoteChange = (id: string, val: string) => {
    setNotes(prev => ({ ...prev, [id]: val }));
    markDirty(id);
  };

  const handleGrotVolChange = (id: string, val: string) => {
    setGrotVol(prev => ({ ...prev, [id]: val }));
    markDirty(id);
  };

  const handleDeadlineChange = (id: string, val: string) => {
    setDeadlines(prev => ({ ...prev, [id]: val }));
    markDirty(id);
  };

  const handleToggleSkotat = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const obj = objekt.find(o => o.id === id);
    if (!obj || saving) return;
    const newStatus = isSkotat(obj) ? 'ej_aktuellt' : 'skotat';
    setSaving(true);
    await supabase.from('objekt').update({ grot_status: newStatus }).eq('id', id);
    setSaving(false);
    await onRefresh();
  };

  const handleExpand = (id: string) => {
    if (selG === id && dirty[id]) {
      saveAll(id, false);
    }
    setSelG(prev => prev === id ? null : id);
  };

  const handleSave = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await saveAll(id, true);
  };

  const formatDeadline = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

  const getAvverkat = (obj: OversiktObjekt): string | null => {
    if (obj.vo_nummer && skordDates[obj.vo_nummer]) return skordDates[obj.vo_nummer];
    return null;
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: `${SP.md}px ${SP.lg}px 80px`, fontFamily: ff }}>

      {/* Påminnelser — 3 dagar före önskat datum */}
      {reminders.length > 0 && (
        <div style={{
          marginBottom: SP.lg, padding: `${SP.md}px ${SP.lg}px`,
          background: C.od, border: `1px solid ${C.orange}25`,
          borderRadius: SP.md,
        }}>
          <div style={{ ...T.body, fontWeight: 700, color: C.orange, marginBottom: SP.sm }}>
            Påminnelse — skotning snart
          </div>
          {reminders.map(o => {
            const dateStr = skotDates[o.id] || o.grot_deadline;
            const days = dateStr ? grotDeadlineDays(dateStr) : null;
            return (
              <div key={o.id} style={{ fontSize: 13, color: C.t1, marginBottom: 4 }}>
                {o.namn}
                <span style={{ color: C.orange, marginLeft: 8, fontWeight: 600 }}>
                  {days === 0 ? 'Idag' : days === 1 ? 'Imorgon' : `Om ${days} dagar`}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {grotObjekt.map(obj => {
        const expanded = selG === obj.id;
        const skotat = isSkotat(obj);
        const dl = deadlines[obj.id] !== undefined ? deadlines[obj.id] : obj.grot_deadline;
        const deadlineDays = grotDeadlineDays(dl);
        const isOverdue = !skotat && deadlineDays !== null && deadlineDays < 0;
        const isUrgent = !skotat && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14;
        const leftClr = isOverdue ? C.red : isUrgent ? C.yellow : skotat ? C.green : C.t4;
        const avverkat = getAvverkat(obj);
        const dagar = avverkat ? daysSince(avverkat) : null;
        const gv = grotVol[obj.id] !== undefined ? (grotVol[obj.id] ? parseFloat(grotVol[obj.id]) : null) : obj.grot_volym;
        const skotatDirekt = obj.skotare_ris_direkt === true;

        return (
          <div key={obj.id} onClick={() => handleExpand(obj.id)} style={{
            background: expanded ? C.cardGrad : 'transparent', borderRadius: SP.lg,
            padding: expanded ? SP.lg : SP.md, margin: expanded ? `${SP.sm}px 0` : 0,
            borderLeft: expanded ? `1px solid ${C.border}` : 'none',
            borderRight: expanded ? `1px solid ${C.border}` : 'none',
            borderTop: expanded ? `1px solid ${C.borderTop}` : 'none',
            borderBottom: expanded ? `1px solid ${C.border}` : `1px solid ${C.border}`,
            boxShadow: expanded ? C.shadowSm : 'none',
            cursor: 'pointer', opacity: skotat && !expanded ? 0.4 : 1, transition: 'all 0.15s',
          }}>
            {/* Collapsed row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: leftClr, opacity: expanded ? 0.7 : 0.35 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={T.body}>{obj.namn}</span>
                  {skotatDirekt && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.orange, padding: '2px 8px', background: C.od, borderRadius: 20 }}>Direkt</span>
                  )}
                  {isOverdue && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.red, padding: '2px 8px', background: C.rd, borderRadius: 20 }}>Försenad</span>
                  )}
                  {isUrgent && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.yellow, padding: '2px 8px', background: C.yd, borderRadius: 20 }}>
                      {deadlineDays === 0 ? 'Idag' : `${deadlineDays}d kvar`}
                    </span>
                  )}
                </div>
                {dl && !skotat && (
                  <div style={{ fontSize: 11, color: isOverdue ? C.red : isUrgent ? C.yellow : C.t3, marginTop: 2 }}>
                    Senast: {formatDeadline(dl)}
                  </div>
                )}
                {!dl && obj.vo_nummer && (
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{obj.vo_nummer}</div>
                )}
              </div>

              {/* GROT volume + days since */}
              <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {gv ? formatVolym(gv) : '–'}
                  <span style={{ fontSize: 11, fontWeight: 400, color: C.t4 }}> m³</span>
                </div>
                {dagar !== null && dagar >= 0 && (
                  <div style={{ fontSize: 11, color: C.t3 }}>{dagar}d</div>
                )}
              </div>

              <button
                onClick={(e) => handleToggleSkotat(obj.id, e)}
                disabled={saving}
                aria-label={skotat ? 'Markera som ej skotat' : 'Markera som skotat'}
                aria-pressed={skotat}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 20,
                  border: skotat ? 'none' : `1px solid ${C.border}`,
                  background: skotat ? C.green : 'transparent',
                  color: skotat ? '#fff' : C.t2,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                  transition: 'all 0.2s', opacity: saving ? 0.5 : 1,
                  minHeight: 44, minWidth: 44,
                }}
              >
                {skotat ? 'Skotat' : 'Ej skotat'}
              </button>
              <span
                className="material-symbols-outlined"
                aria-hidden="true"
                style={{
                  fontSize: 20, color: C.t4, flexShrink: 0,
                  transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 180ms ease-out',
                  marginLeft: 2,
                }}
              >chevron_right</span>
            </div>

            {/* Expanded panel */}
            <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 300, mass: 0.7 }}
                style={{ overflow: 'hidden', marginLeft: 15 }}
                onClick={e => e.stopPropagation()}
              >
              <div style={{ marginTop: 12 }}>
                {/* Avverkat datum from dim_objekt */}
                {avverkat && (
                  <div style={{ fontSize: 12, color: C.t2, marginBottom: 10 }}>
                    Avverkat: {fmtDate(avverkat)}
                    {dagar !== null && dagar >= 0 && (
                      <span style={{ color: C.t3 }}> · {dagar} dagar sedan</span>
                    )}
                  </div>
                )}

                {/* Skotas direkt / senare */}
                {skotatDirekt && (
                  <div style={{
                    fontSize: 12, fontWeight: 600, color: C.orange,
                    marginBottom: 10, padding: '6px 12px',
                    background: C.od, borderRadius: 10, display: 'inline-block',
                  }}>
                    GROT ska skotas direkt
                  </div>
                )}
                {!skotatDirekt && (
                  <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
                    Skotas senare
                  </div>
                )}

                {/* GROT-volym */}
                <div style={{ marginBottom: SP.md }}>
                  <label style={{ ...T.label, display: 'block', marginBottom: SP.xs }}>GROT-volym (m³)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={grotVol[obj.id] ?? (obj.grot_volym != null ? String(obj.grot_volym) : '')}
                    onChange={e => handleGrotVolChange(obj.id, e.target.value)}
                    placeholder="GROT m³"
                    aria-label="GROT-volym i kubikmeter"
                    style={{ width: 120, padding: `${SP.sm}px ${SP.md}px`, borderRadius: SP.md, border: `1px solid ${C.border}`, background: C.surface, color: C.t1, ...T.body, outline: 'none', fontFamily: ff, minHeight: 44 }}
                  />
                </div>

                {/* Notering */}
                <textarea
                  value={notes[obj.id] ?? obj.grot_anteckning ?? ''}
                  onChange={e => handleNoteChange(obj.id, e.target.value)}
                  placeholder="Skriv notering..."
                  rows={2}
                  style={{ width: '100%', padding: `${SP.sm}px ${SP.md}px`, borderRadius: SP.md, border: `1px solid ${C.border}`, background: C.surface, color: C.t1, ...T.caption, outline: 'none', resize: 'vertical', fontFamily: ff, boxSizing: 'border-box', marginBottom: SP.md }}
                />

                {/* Deadline — önskat skotningsdatum */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: C.t4, display: 'block', marginBottom: 4 }}>Önskat skotningsdatum</label>
                  <input
                    type="date"
                    value={deadlines[obj.id] ?? obj.grot_deadline ?? ''}
                    onChange={e => handleDeadlineChange(obj.id, e.target.value)}
                    style={{ width: 170, padding: `${SP.sm}px ${SP.md}px`, borderRadius: SP.md, border: `1px solid ${C.border}`, background: C.surface, color: C.t1, ...T.body, outline: 'none', fontFamily: ff, colorScheme: 'dark', minHeight: 44 }}
                  />
                </div>

                {/* Save button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: SP.md }}>
                  <button
                    onClick={(e) => handleSave(obj.id, e)}
                    style={{
                      ...BTN.primary, fontFamily: ff,
                      background: dirty[obj.id] ? C.green : BTN.primary.background,
                      color: dirty[obj.id] ? C.t1 : C.t3,
                      transition: 'all 0.2s',
                    }}
                  >
                    Spara
                  </button>
                  {savedMsg[obj.id] && (
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 22, color: C.green,
                        fontVariationSettings: "'FILL' 1, 'wght' 600",
                        animation: 'ovk-check-fade 2s ease-out forwards',
                      }}
                      aria-label="Sparat"
                    >check_circle</span>
                  )}
                </div>
              </div>
              </motion.div>
            )}
            </AnimatePresence>
          </div>
        );
      })}

      {grotObjekt.length === 0 && (
        <div style={{ textAlign: 'center', padding: `60px ${SP.xl}px`, color: C.t4 }}>
          <div style={T.body}>Inga grotanpassade objekt</div>
          <div style={{ ...T.caption, marginTop: SP.sm }}>Objekt måste vara markerade som grotanpassade i dim_objekt</div>
        </div>
      )}
    </div>
  );
}
