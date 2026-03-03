'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { OversiktObjekt, C } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, grotDeadlineDays } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
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

export default function OversiktGrot({ objekt, supabase, onRefresh }: Props) {
  const [selG, setSelG] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [grotVol, setGrotVol] = useState<Record<string, string>>({});
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [skordDates, setSkordDates] = useState<Record<string, string>>({});
  // Dirty tracking per object
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  // "Sparat!" feedback per object
  const [savedMsg, setSavedMsg] = useState<Record<string, boolean>>({});
  // Auto-save timer refs (10 second timer per object)
  const autoSaveRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // "Sparat!" message timer refs
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(autoSaveRef.current).forEach(clearTimeout);
      Object.values(savedMsgRef.current).forEach(clearTimeout);
    };
  }, []);

  const isSkotat = (o: OversiktObjekt) => o.grot_status === 'skotat' || o.grot_status === 'hoglagd' || o.grot_status === 'flisad' || o.grot_status === 'borttransporterad' || o.grot_status === 'bortkord';

  const grotObjekt = useMemo(() => {
    const list = objekt.filter(o => o.typ === 'slutavverkning');
    return list.sort((a, b) => {
      const sa = isSkotat(a);
      const sb = isSkotat(b);
      if (sa !== sb) return sa ? 1 : -1;
      if (a.grot_deadline && b.grot_deadline) return a.grot_deadline.localeCompare(b.grot_deadline);
      if (a.grot_deadline && !b.grot_deadline) return -1;
      if (!a.grot_deadline && b.grot_deadline) return 1;
      return a.namn.localeCompare(b.namn);
    });
  }, [objekt]);

  /** Unified save: writes grot_volym, grot_anteckning, grot_deadline for one object */
  const saveAll = useCallback(async (id: string, showMsg: boolean) => {
    const obj = objekt.find(o => o.id === id);
    if (!obj) return;

    // Clear auto-save timer
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

  /** Start/restart 10-second auto-save timer */
  const startAutoSave = useCallback((id: string) => {
    if (autoSaveRef.current[id]) clearTimeout(autoSaveRef.current[id]);
    autoSaveRef.current[id] = setTimeout(() => {
      saveAll(id, false);
    }, 10000);
  }, [saveAll]);

  /** Mark dirty + start auto-save timer */
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
    // If collapsing and dirty → auto-save (no message)
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
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px 80px', fontFamily: ff }}>
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

        return (
          <div key={obj.id} onClick={() => handleExpand(obj.id)} style={{
            background: expanded ? C.card : 'transparent', borderRadius: 14,
            padding: expanded ? 16 : 14, margin: expanded ? '6px 0' : 0,
            borderBottom: expanded ? 'none' : `1px solid ${C.border}`,
            cursor: 'pointer', opacity: skotat && !expanded ? 0.4 : 1, transition: 'all 0.15s',
          }}>
            {/* Collapsed row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: leftClr, opacity: expanded ? 0.7 : 0.35 }} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{obj.namn}</span>
                  {isOverdue && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.red, padding: '2px 8px', background: C.rd, borderRadius: 5 }}>Försenad</span>
                  )}
                  {isUrgent && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.yellow, padding: '2px 8px', background: C.yd, borderRadius: 5 }}>
                      {deadlineDays === 0 ? 'Idag' : `${deadlineDays}d kvar`}
                    </span>
                  )}
                </div>
                {dl && !skotat && (
                  <div style={{ fontSize: 10, color: isOverdue ? C.red : isUrgent ? C.yellow : C.t3, marginTop: 2 }}>
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
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.t4 }}> m³</span>
                </div>
                {dagar !== null && dagar >= 0 && (
                  <div style={{ fontSize: 10, color: C.t3 }}>{dagar}d</div>
                )}
              </div>

              <button
                onClick={(e) => handleToggleSkotat(obj.id, e)}
                disabled={saving}
                style={{
                  flexShrink: 0, padding: '6px 14px', borderRadius: 20,
                  border: skotat ? 'none' : `1px solid ${C.border}`,
                  background: skotat ? C.green : 'transparent',
                  color: skotat ? '#fff' : C.t2,
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                  transition: 'all 0.2s', opacity: saving ? 0.5 : 1,
                }}
              >
                {skotat ? 'Skotat' : 'Ej skotat'}
              </button>
            </div>

            {/* Expanded panel */}
            {expanded && (
              <div style={{ marginTop: 12, marginLeft: 15 }} onClick={e => e.stopPropagation()}>
                {/* Avverkat datum from dim_objekt */}
                {avverkat && (
                  <div style={{ fontSize: 12, color: C.t2, marginBottom: 10 }}>
                    Avverkat: {fmtDate(avverkat)}
                    {dagar !== null && dagar >= 0 && (
                      <span style={{ color: C.t3 }}> · {dagar} dagar sedan</span>
                    )}
                  </div>
                )}

                {/* GROT-volym */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>GROT-volym (m³)</label>
                  <input
                    type="number"
                    value={grotVol[obj.id] ?? (obj.grot_volym != null ? String(obj.grot_volym) : '')}
                    onChange={e => handleGrotVolChange(obj.id, e.target.value)}
                    placeholder="GROT m³"
                    style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff }}
                  />
                </div>

                {/* Notering */}
                <textarea
                  value={notes[obj.id] ?? obj.grot_anteckning ?? ''}
                  onChange={e => handleNoteChange(obj.id, e.target.value)}
                  placeholder="Skriv notering..."
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: ff, boxSizing: 'border-box', marginBottom: 10 }}
                />

                {/* Deadline */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Ska vara borta senast</label>
                  <input
                    type="date"
                    value={deadlines[obj.id] ?? obj.grot_deadline ?? ''}
                    onChange={e => handleDeadlineChange(obj.id, e.target.value)}
                    style={{ width: 170, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff, colorScheme: 'dark' }}
                  />
                </div>

                {/* Save button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    onClick={(e) => handleSave(obj.id, e)}
                    style={{
                      padding: '8px 24px', borderRadius: 8,
                      border: 'none',
                      background: dirty[obj.id] ? C.green : 'rgba(255,255,255,0.08)',
                      color: dirty[obj.id] ? '#fff' : C.t3,
                      fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: ff,
                      transition: 'all 0.2s',
                    }}
                  >
                    Spara
                  </button>
                  {savedMsg[obj.id] && (
                    <span style={{ fontSize: 12, color: C.green, fontWeight: 600, transition: 'opacity 0.3s' }}>
                      Sparat!
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {grotObjekt.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: C.t4 }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Inga slutavverkningsobjekt</div>
          <div style={{ fontSize: 11 }}>GROT hanteras för slutavverkning</div>
        </div>
      )}
    </div>
  );
}
