'use client';

import React, { useState, useMemo } from 'react';
import { OversiktObjekt, C } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, grotStepIndex, grotColor, grotDeadlineDays, grotEffectiveColor, GROT_STEPS } from './oversikt-utils';

interface Props {
  objekt: OversiktObjekt[];
  supabase: any;
  onRefresh: () => Promise<void>;
}

export default function OversiktGrot({ objekt, supabase, onRefresh }: Props) {
  const [selG, setSelG] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, { grot_status: string; grot_volym: string; grot_anteckning: string; grot_deadline: string }>>({});
  const [saving, setSaving] = useState(false);

  // GROT applies to slutavverkning objects
  const grotObjekt = useMemo(() => {
    const list = objekt.filter(o => o.typ === 'slutavverkning');
    // Sort by deadline (most urgent first), then no-deadline last
    return list.sort((a, b) => {
      const done_a = grotStepIndex(a.grot_status) >= 3;
      const done_b = grotStepIndex(b.grot_status) >= 3;
      // Done objects go to the bottom
      if (done_a !== done_b) return done_a ? 1 : -1;
      // Both have deadline: sort by date
      if (a.grot_deadline && b.grot_deadline) return a.grot_deadline.localeCompare(b.grot_deadline);
      // One has deadline, one doesn't: deadline first
      if (a.grot_deadline && !b.grot_deadline) return -1;
      if (!a.grot_deadline && b.grot_deadline) return 1;
      // Neither has deadline: sort by name
      return a.namn.localeCompare(b.namn);
    });
  }, [objekt]);

  const handleExpand = (id: string) => {
    if (selG === id) {
      setSelG(null);
    } else {
      setSelG(id);
      const obj = objekt.find(o => o.id === id);
      if (obj && !editValues[id]) {
        setEditValues(prev => ({
          ...prev,
          [id]: {
            grot_status: obj.grot_status || 'ej_aktuellt',
            grot_volym: obj.grot_volym?.toString() || '',
            grot_anteckning: obj.grot_anteckning || '',
            grot_deadline: obj.grot_deadline || '',
          },
        }));
      }
    }
  };

  const handleSave = async (id: string) => {
    const vals = editValues[id];
    if (!vals) return;
    setSaving(true);
    await supabase.from('objekt').update({
      grot_status: vals.grot_status,
      grot_volym: vals.grot_volym ? parseFloat(vals.grot_volym) : null,
      grot_anteckning: vals.grot_anteckning || null,
      grot_deadline: vals.grot_deadline || null,
    }).eq('id', id);
    setSaving(false);
    setSelG(null);
    await onRefresh();
  };

  /** Quickly advance status via step indicator without opening edit panel */
  const handleStepClick = async (id: string, stepKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const obj = objekt.find(o => o.id === id);
    if (!obj) return;
    // If already at this step, don't re-save
    if (obj.grot_status === stepKey) return;
    setSaving(true);
    await supabase.from('objekt').update({ grot_status: stepKey }).eq('id', id);
    // Also update local editValues if open
    if (editValues[id]) {
      setEditValues(prev => ({ ...prev, [id]: { ...prev[id], grot_status: stepKey } }));
    }
    setSaving(false);
    await onRefresh();
  };

  const getLass = (vol: number | null) => vol ? Math.ceil(vol / 20) : 0;

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '14px 16px 80px', fontFamily: ff }}>
      {grotObjekt.map(obj => {
        const s = selG === obj.id;
        const isDone = grotStepIndex(obj.grot_status) >= 3;
        const stepIdx = grotStepIndex(obj.grot_status);
        const statusClr = grotEffectiveColor(obj.grot_status, obj.grot_deadline);
        const lass = getLass(obj.grot_volym);
        const deadlineDays = grotDeadlineDays(obj.grot_deadline);
        const isOverdue = !isDone && deadlineDays !== null && deadlineDays < 0;
        const isUrgent = !isDone && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14;

        const vals = editValues[obj.id] || {
          grot_status: obj.grot_status || 'ej_aktuellt',
          grot_volym: obj.grot_volym?.toString() || '',
          grot_anteckning: obj.grot_anteckning || '',
          grot_deadline: obj.grot_deadline || '',
        };

        return (
          <div key={obj.id} onClick={() => handleExpand(obj.id)} style={{
            background: s ? C.card : 'transparent', borderRadius: 14,
            padding: s ? 16 : 14, margin: s ? '6px 0' : 0,
            borderBottom: s ? 'none' : `1px solid ${C.border}`,
            cursor: 'pointer', opacity: isDone ? 0.35 : 1, transition: 'all 0.15s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Left bar colored by status */}
              <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, background: statusClr, opacity: s ? 0.7 : 0.3 }} />
              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{obj.namn}</span>
                  {isOverdue && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.red, padding: '2px 8px', background: C.rd, borderRadius: 5 }}>Försenad</span>
                  )}
                  {isUrgent && (
                    <span style={{ fontSize: 9, fontWeight: 600, color: C.yellow, padding: '2px 8px', background: C.yd, borderRadius: 5 }}>
                      {deadlineDays === 0 ? 'Idag' : `${deadlineDays} dagar kvar`}
                    </span>
                  )}
                  {isDone && <span style={{ fontSize: 9, color: C.green }}>Klar</span>}
                </div>
                {/* Deadline row */}
                {obj.grot_deadline && !isDone && (
                  <div style={{ fontSize: 10, color: isOverdue ? C.red : isUrgent ? C.yellow : C.t3, marginTop: 2 }}>
                    Senast: {new Date(obj.grot_deadline + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                )}
                {!obj.grot_deadline && obj.vo_nummer && (
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{obj.vo_nummer}</div>
                )}
              </div>
              {/* Volume + loads */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>
                  {obj.grot_volym ? formatVolym(obj.grot_volym) : '–'}
                  <span style={{ fontSize: 10, fontWeight: 400, color: C.t4 }}> m³</span>
                </div>
                {lass > 0 && <div style={{ fontSize: 10, color: C.t3 }}>{lass} lass</div>}
              </div>
            </div>

            {/* 3-step status indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 10, marginLeft: 15 }} onClick={e => e.stopPropagation()}>
              {GROT_STEPS.map((step, i) => {
                const filled = stepIdx >= i + 1;
                const clr = filled ? step.color : 'rgba(255,255,255,0.08)';
                const textClr = filled ? step.color : C.t4;
                return (
                  <React.Fragment key={step.key}>
                    {i > 0 && (
                      <div style={{ width: 24, height: 2, background: filled ? step.color : 'rgba(255,255,255,0.06)', transition: 'background 0.2s' }} />
                    )}
                    <button
                      onClick={(e) => handleStepClick(obj.id, step.key, e)}
                      disabled={saving}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px',
                        background: filled ? `${step.color}15` : 'transparent',
                        border: `1px solid ${filled ? `${step.color}40` : 'rgba(255,255,255,0.05)'}`,
                        borderRadius: 8, cursor: 'pointer', fontFamily: ff, transition: 'all 0.2s',
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', background: clr,
                        boxShadow: filled ? `0 0 6px ${step.color}40` : 'none',
                        transition: 'all 0.2s',
                      }} />
                      <span style={{ fontSize: 10, fontWeight: filled ? 600 : 400, color: textClr, whiteSpace: 'nowrap', transition: 'color 0.2s' }}>
                        {step.label}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Expanded edit */}
            {s && !isDone && (
              <div style={{ marginTop: 12, animation: 'fadeIn .15s' }} onClick={(e) => e.stopPropagation()}>
                {/* Volume input */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>GROT-volym (m³)</label>
                  <input type="number" value={vals.grot_volym}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_volym: e.target.value } }))}
                    style={{ width: 120, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff }} />
                </div>

                {/* Deadline */}
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Ska vara borta senast</label>
                  <input type="date" value={vals.grot_deadline}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_deadline: e.target.value } }))}
                    style={{ width: 170, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 13, outline: 'none', fontFamily: ff, colorScheme: 'dark' }} />
                </div>

                {/* Note */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 10, color: C.t4, display: 'block', marginBottom: 4 }}>Notering</label>
                  <textarea value={vals.grot_anteckning}
                    onChange={(e) => setEditValues(prev => ({ ...prev, [obj.id]: { ...vals, grot_anteckning: e.target.value } }))}
                    rows={2} placeholder="T.ex. Plantering v.14"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'rgba(255,255,255,0.03)', color: C.t1, fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: ff, boxSizing: 'border-box' }} />
                </div>

                <button onClick={() => handleSave(obj.id)} disabled={saving}
                  style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: grotColor(vals.grot_status) || C.yellow, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.5 : 1, fontFamily: ff }}>
                  {saving ? 'Sparar...' : 'Spara'}
                </button>
              </div>
            )}

            {/* Expanded note (read-only for done) */}
            {s && isDone && obj.grot_anteckning && (
              <div style={{ marginTop: 8, fontSize: 11, color: C.t3, padding: '8px 10px', background: 'rgba(255,255,255,0.02)', borderRadius: 8, animation: 'fadeIn .15s' }}>
                {obj.grot_anteckning}
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
