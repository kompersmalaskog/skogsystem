'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Maskin {
  id: string;
  maskin_id: string;
  namn: string;
  typ: string;
  marke: string;
  modell: string;
  aktiv: boolean;
}

interface ServiceEntry {
  id: string;
  maskin_id: string;
  del: string;
  kategori: string;
  beskrivning: string;
  timmar: number | null;
  datum: string;
  skapad_at: string;
}

const KATEGORIER = ['Service', 'Hydraulik', 'Slang', 'Punktering', 'Motor', 'Kran', 'Aggregat', 'Elektrisk', 'Övrigt'];
const kategoriValue = (label: string) => label.toLowerCase().replace('ö', 'o');

const HJUL = [
  { id: 'VF', label: 'VF', cx: 30, cy: 45 },
  { id: 'HF', label: 'HF', cx: 130, cy: 45 },
  { id: 'VB', label: 'VB', cx: 30, cy: 195 },
  { id: 'HB', label: 'HB', cx: 130, cy: 195 },
];

function HjulValjare({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div className="flex flex-col items-center py-4">
      <svg viewBox="0 0 160 240" className="w-[120px] h-auto">
        <rect x="45" y="20" width="70" height="200" rx="6" fill="none" stroke="hsl(var(--border))" strokeWidth="1" />
        <line x1="45" y1="120" x2="115" y2="120" stroke="hsl(var(--border))" strokeWidth="1" />
        <text x="80" y="38" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="9" fontWeight="500">FRAM</text>
        <text x="80" y="212" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="9" fontWeight="500">BAK</text>
        {HJUL.map(h => (
          <g key={h.id} onClick={() => onSelect(h.id)} style={{ cursor: 'pointer' }}>
            <circle cx={h.cx} cy={h.cy} r="18" fill={selected === h.id ? 'hsl(var(--secondary))' : 'none'} stroke={selected === h.id ? 'hsl(var(--ring))' : 'hsl(var(--border))'} strokeWidth="1.5" />
            <text x={h.cx} y={h.cy + 4} textAnchor="middle" fill={selected === h.id ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))'} fontSize="11" fontWeight="500">{h.label}</text>
          </g>
        ))}
      </svg>
      <p className="text-[10px] text-muted-foreground mt-2">Vänster/höger = förarens perspektiv i hytten</p>
    </div>
  );
}

export default function MaskinServicePage() {
  const [maskiner, setMaskiner] = useState<Maskin[]>([]);
  const [selectedMaskin, setSelectedMaskin] = useState<Maskin | null>(null);
  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [maskinTimmar, setMaskinTimmar] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kategori, setKategori] = useState('service');
  const [beskrivning, setBeskrivning] = useState('');
  const [timmar, setTimmar] = useState('');
  const [datum, setDatum] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedWheel, setSelectedWheel] = useState('');

  const fetchData = useCallback(async () => {
    setError(null);
    const { data: m, error: e1 } = await supabase.from('maskiner').select('*').eq('aktiv', true).order('namn');
    if (e1) { setError(e1.message); setLoading(false); return; }
    setMaskiner(m || []);

    const { data: s, error: e2 } = await supabase.from('maskin_service').select('*').order('datum', { ascending: false });
    if (e2) { setError(e2.message); setLoading(false); return; }
    setEntries(s || []);

    const { data: skift } = await supabase.from('fakt_skift').select('maskin_id, langd_sek');
    if (skift) {
      const map: Record<string, number> = {};
      for (const r of skift) map[r.maskin_id] = (map[r.maskin_id] || 0) + (r.langd_sek || 0);
      for (const k in map) map[k] = Math.round(map[k] / 3600);
      setMaskinTimmar(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getTimmar = (m: Maskin) => maskinTimmar[m.maskin_id] || 0;

  const maskinEntries = useMemo(() =>
    selectedMaskin ? entries.filter(e => e.maskin_id === selectedMaskin.id) : [],
    [selectedMaskin, entries]
  );

  const resetForm = () => {
    setEditingId(null);
    setKategori('service');
    setBeskrivning('');
    setTimmar(selectedMaskin ? getTimmar(selectedMaskin).toString() : '');
    setDatum(new Date().toISOString().split('T')[0]);
    setSelectedWheel('');
  };

  useEffect(() => {
    if (selectedMaskin) resetForm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMaskin]);

  const startEdit = (entry: ServiceEntry) => {
    setEditingId(entry.id);
    setKategori(entry.kategori);
    setBeskrivning(entry.beskrivning || '');
    setTimmar(entry.timmar?.toString() || '');
    setDatum(entry.datum);
  };

  const cancelEdit = () => resetForm();

  const handleDelete = async (entry: ServiceEntry) => {
    if (!confirm(`Ta bort "${entry.beskrivning || entry.kategori}" (${new Date(entry.datum).toLocaleDateString('sv-SE')})?`)) return;
    await supabase.from('maskin_service').delete().eq('id', entry.id);
    await fetchData();
  };

  const handleSave = async () => {
    if (!selectedMaskin) return;
    if (!beskrivning.trim()) { alert('Beskrivning krävs'); return; }
    if (!timmar || !parseFloat(timmar)) { alert('Timräknare krävs'); return; }
    if (!datum) { alert('Datum krävs'); return; }
    setSaving(true);
    const payload = {
      maskin_id: selectedMaskin.id,
      del: kategori,
      kategori,
      beskrivning: beskrivning.trim(),
      timmar: parseFloat(timmar) || null,
      datum,
    };
    const { error: err } = editingId
      ? await supabase.from('maskin_service').update(payload).eq('id', editingId)
      : await supabase.from('maskin_service').insert(payload);
    if (err) alert('Fel: ' + err.message);
    else { resetForm(); await fetchData(); }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-sm text-muted-foreground">Laddar...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-sm text-muted-foreground">{error}</p>
      <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchData(); }}>Försök igen</Button>
    </div>
  );

  return (
    <div className="max-w-[600px] mx-auto px-4 pt-6 pb-20">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Service</h1>

      {/* Maskinväljare */}
      <div className="flex overflow-x-auto border-b border-border mb-8 -mx-4 px-4">
        {maskiner.map(m => (
          <button
            key={m.id}
            onClick={() => setSelectedMaskin(m)}
            className={cn(
              "flex flex-col items-center gap-0.5 px-5 py-3 text-sm whitespace-nowrap border-b-2 transition-colors shrink-0",
              selectedMaskin?.id === m.id
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground/60"
            )}
          >
            <span className="font-medium text-[13px]">{m.namn}</span>
            {getTimmar(m) > 0 && (
              <span className="text-[11px] text-muted-foreground">{getTimmar(m).toLocaleString('sv-SE')} h</span>
            )}
          </button>
        ))}
      </div>

      {selectedMaskin ? (
        <>
          {/* Formulär */}
          <Card className="mb-8">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-medium">
                {editingId ? 'Redigera' : 'Ny åtgärd'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Kategorier */}
              <div className="flex flex-wrap gap-1.5">
                {KATEGORIER.map(k => (
                  <Badge
                    key={k}
                    variant={kategori === kategoriValue(k) ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer text-xs font-normal",
                      kategori === kategoriValue(k)
                        ? "bg-foreground text-background hover:bg-foreground/90"
                        : "hover:bg-secondary"
                    )}
                    onClick={() => setKategori(kategoriValue(k))}
                  >
                    {k}
                  </Badge>
                ))}
              </div>

              {/* Hjulväljare vid punktering */}
              {kategori === 'punktering' && (
                <HjulValjare selected={selectedWheel} onSelect={(id) => {
                  setSelectedWheel(id);
                  setBeskrivning(`Punktering ${id}`);
                }} />
              )}

              {/* Beskrivning */}
              <Textarea
                value={beskrivning}
                onChange={e => setBeskrivning(e.target.value)}
                placeholder="Vad gjordes?"
                rows={3}
              />

              {/* Timmar + Datum */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Timmar</label>
                  <Input type="number" value={timmar} onChange={e => setTimmar(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Datum</label>
                  <Input type="date" value={datum} onChange={e => setDatum(e.target.value)} />
                </div>
              </div>

              {/* Knappar */}
              <div className="flex justify-end gap-2 pt-1">
                {editingId && (
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>Avbryt</Button>
                )}
                <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
                  {saving ? 'Sparar...' : editingId ? 'Uppdatera' : 'Spara'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Historik */}
          {maskinEntries.length > 0 && (
            <div>
              <h2 className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-4">Historik</h2>
              <div className="space-y-0 divide-y divide-border">
                {maskinEntries.map(e => (
                  <div key={e.id} className={cn("py-3", editingId === e.id && "opacity-40")}>
                    <div className="flex items-baseline gap-2 mb-1 text-sm">
                      <span className="text-muted-foreground font-medium shrink-0">
                        {KATEGORIER.find(k => kategoriValue(k) === e.kategori) || e.kategori}
                      </span>
                      <span className="text-foreground/60 truncate">{e.beskrivning || '—'}</span>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span>{new Date(e.datum).toLocaleDateString('sv-SE')}</span>
                      {e.timmar && <span>· {e.timmar} h</span>}
                      <span className="ml-auto" />
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => startEdit(e)}>
                        Redigera
                      </Button>
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground hover:text-destructive" onClick={() => handleDelete(e)}>
                        Ta bort
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-16">Välj en maskin ovan</p>
      )}
    </div>
  );
}
