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
  const [deadlines, setDeadlines] = useState<Record<string, string>>({});
  const [avverkatDates, setAvverkatDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

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

  const saveNote = useCallback((id: string, val: string) => {
    if (debounceRef.current[id]) clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(async () => {
      await supabase.from('objekt').update({ grot_anteckning: val || null }).eq('id', id);
    }, 500);
  }, [supabase]);

  useEffect(() => {
    return () => { Object.values(debounceRef.current).forEach(clearTimeout); };
  }, []);

  const handleNoteChange = (id: string, val: string) => {
    setNotes(prev => ({ ...prev, [id]: val }));
    saveNote(id, val);
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

  const handleDeadlineSave = async (id: string, val: string) => {
    setDeadlines(prev => ({ ...prev, [id]: val }));
    await supabase.from('objekt').update({ grot_deadline: val || null }).eq('id', id);
    await onRefresh();
  };

  const handleAvverkatSave = async (id: string, val: string) => {
    setAvverkatDates(prev => ({ ...prev, [id]: val }));
    await supabase.from('objekt').update({ faktisk_slut: val || null }).eq('id', id);
    await onRefresh();
  };

  const handleExpand = (id: string) => {
    setSelG(prev => prev === id ? null : id);
  };

  const formatDeadline = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });

  /** Get the avverkat date for an object (local override or DB value) */
  const getAvverkat = (obj: OversiktObjekt): string | null => {
    if (avverkatDates[obj.id] !== undefined) return avverkatDates[obj.id] || null;
    return obj.faktisk_slut || null;
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px 80px', fontFamily: ff }}>
      {grotObjekt.map(obj => {
        const expanded = selG === obj.id;
        const skotat = isSkotat(obj);
        const dl = obj.grot_deadline;
        const deadlineDays = grotDeadlineDays(dl);
        const isOverdue = !skotat && deadlineDays !== null && deadlineDays < 0;
        const isUrgent = !skotat && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14;
        const leftClr = isOverdue ? C.red : isUrgent ? C.yellow : skotat ? C.green : C.t4;
        const avverkat = getAvverkat(obj);
        const dagar = avverkat ? daysSince(avverkat) : null;

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

              {/* Volume + days since */}
              <div style={{ textAlign: 'right', flexShrink: 0, marginRight: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {obj.grot_volym ? formatVolym(obj.grot_volym) : '–'}
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
                {/* Avverkat datum */}
                {avverkat ? (
                  <div style={{ fontSize: 12, color: C.t2, marginBottom: 10 }}>
                    Avverkat: {fmtDate(avverkat)}
                    {dagar !== null && dagar >= 0 && (
                      <span style={{ color: C.t3 }}> · {dagar} dagar sedan</span>
                    )}
                  </div>
                ) : (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Avverkat datum</label>
                    <input
                      type="date"
                      value={avverkatDates[obj.id] ?? ''}
                      onChange={e => handleAvverkatSave(obj.id, e.target.value)}
                      style={{ width: 170, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff, colorScheme: 'dark' }}
                    />
                  </div>
                )}

                {/* Notering */}
                <textarea
                  value={notes[obj.id] ?? obj.grot_anteckning ?? ''}
                  onChange={e => handleNoteChange(obj.id, e.target.value)}
                  placeholder="Skriv notering..."
                  rows={2}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: ff, boxSizing: 'border-box', marginBottom: 10 }}
                />

                {/* Deadline */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Ska vara borta senast</label>
                  <input
                    type="date"
                    value={deadlines[obj.id] ?? obj.grot_deadline ?? ''}
                    onChange={e => handleDeadlineSave(obj.id, e.target.value)}
                    style={{ width: 170, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff, colorScheme: 'dark' }}
                  />
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
