import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, Trash2, Sparkles, UtensilsCrossed,
  Music, Cake, Lightbulb, Heart, Gamepad2, BookOpen, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Minifact } from '@/types/database';

const FACT_ICONS: Record<string, typeof Sparkles> = {
  Sparkles, UtensilsCrossed, Music, Cake, Lightbulb, Heart, Gamepad2, BookOpen,
};

const FACT_SUGGESTIONS = [
  { key: 'Lieblingsgericht', icon: 'UtensilsCrossed' },
  { key: 'Funfact', icon: 'Lightbulb' },
  { key: 'Lieblingsmusik', icon: 'Music' },
  { key: 'Geburtstag', icon: 'Cake' },
  { key: 'Hobby', icon: 'Gamepad2' },
  { key: 'Lieblingsbuch', icon: 'BookOpen' },
];

export default function MinifactsScreen() {
  const { profile } = useAuth();
  const [facts, setFacts] = useState<Minifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingFact, setEditingFact] = useState<Minifact | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('minifacts')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: true });
    if (data) setFacts(data as Minifact[]);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  async function del(id: string) {
    if (!confirm('Dieses Minifact löschen?')) return;
    await supabase.from('minifacts').delete().eq('id', id);
    load();
  }

  const availableSuggestions = FACT_SUGGESTIONS.filter(s => !facts.some(f => f.fact_key === s.key));

  return (
    <div className="px-5 pt-6 pb-4">
      <h2 className="text-2xl font-display font-bold text-sage-900 mb-1">Über mich</h2>
      <p className="text-sage-500 text-sm mb-5">Deine Minifacts — sichtbar für alle im Haus.</p>

      {/* Profil-Kopf */}
      <div className="card mb-5 flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xl">
          {(profile?.display_name || profile?.full_name || '?').charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-display font-bold text-sage-900">{profile?.display_name || profile?.full_name || 'Nutzer'}</p>
          <p className="text-xs text-sage-400">{facts.length} Minifacts</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : facts.length === 0 ? (
        <div className="card text-center py-10">
          <Sparkles className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm mb-3">Noch keine Minifacts. Füge dein erstes hinzu!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          {facts.map(f => {
            const Icon = FACT_ICONS[f.icon] ?? Sparkles;
            return (
              <div key={f.id} className="card relative group">
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center mb-2">
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-xs text-sage-400 font-medium">{f.fact_key}</p>
                <p className="text-sm font-semibold text-sage-900 mt-0.5 break-words">{f.fact_value}</p>
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => setEditingFact(f)} className="w-7 h-7 rounded-lg bg-cream-200 text-sage-500 flex items-center justify-center">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => del(f.id)} className="w-7 h-7 rounded-lg bg-cream-200 text-red-400 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button onClick={() => setShowAdd(true)} className="btn-primary w-full mt-2">
        <Plus className="w-5 h-5" /> Minifact hinzufügen
      </button>

      {(showAdd || editingFact) && (
        <EditMinifactDialog
          fact={editingFact}
          suggestions={availableSuggestions}
          onClose={() => { setShowAdd(false); setEditingFact(null); }}
          onSaved={() => { setShowAdd(false); setEditingFact(null); load(); }}
        />
      )}
    </div>
  );
}

function EditMinifactDialog({ fact, suggestions, onClose, onSaved }: {
  fact: Minifact | null;
  suggestions: typeof FACT_SUGGESTIONS;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [factKey, setFactKey] = useState(fact?.fact_key ?? '');
  const [factValue, setFactValue] = useState(fact?.fact_value ?? '');
  const [icon, setIcon] = useState(fact?.icon ?? 'Sparkles');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!factKey.trim() || !factValue.trim() || !profile) return;
    setSaving(true);
    setError(null);

    if (fact) {
      const { error: updateError } = await supabase.from('minifacts').update({
        fact_key: factKey.trim(),
        fact_value: factValue.trim(),
        icon,
      }).eq('id', fact.id);
      if (updateError) { setError(updateError.message); setSaving(false); return; }
    } else {
      const { error: insertError } = await supabase.from('minifacts').insert({
        user_id: profile.id,
        fact_key: factKey.trim(),
        fact_value: factValue.trim(),
        icon,
      });
      if (insertError) { setError(insertError.message); setSaving(false); return; }
    }

    onSaved();
    setSaving(false);
  }

  const iconNames = Object.keys(FACT_ICONS);

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">{fact ? 'Bearbeiten' : 'Neues Minifact'}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}

          <div>
            <label className="label">Kategorie</label>
            <input className="input" value={factKey} onChange={e => setFactKey(e.target.value)} placeholder="z.B. Lieblingsgericht" list="fact-suggestions" />
            <datalist id="fact-suggestions">
              {suggestions.map(s => <option key={s.key} value={s.key} />)}
            </datalist>
          </div>

          <div>
            <label className="label">Wert</label>
            <input className="input" value={factValue} onChange={e => setFactValue(e.target.value)} placeholder="z.B. Lasagne" />
          </div>

          <div>
            <label className="label">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {iconNames.map(name => {
                const Icon = FACT_ICONS[name];
                return (
                  <button
                    key={name}
                    onClick={() => setIcon(name)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                      icon === name ? 'bg-brand-500 text-white' : 'bg-cream-200 text-sage-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={save} disabled={saving || !factKey.trim() || !factValue.trim()} className="btn-primary w-full">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
