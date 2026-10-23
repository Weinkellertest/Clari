import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, Clock,
  Users, DoorOpen,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Residence, Profile } from '@/types/database';

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function durationLabel(movedIn: string, movedOut: string | null): string {
  const start = new Date(movedIn + 'T00:00:00');
  const end = movedOut ? new Date(movedOut + 'T00:00:00') : new Date();
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (months < 1) return 'kurze Zeit';
  if (months < 12) return `${months} Monat${months === 1 ? '' : 'e'}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  if (remMonths === 0) return `${years} Jahr${years === 1 ? '' : 'e'}`;
  return `${years} J. ${remMonths} M.`;
}

export default function ChronikScreen() {
  const { profile } = useAuth();
  const [view, setView] = useState<'timeline' | 'current' | 'rooms'>('timeline');
  const [residences, setResidences] = useState<(Residence & { user_name: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedUser] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('residences')
      .select('*, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
      .order('moved_in', { ascending: false });
    if (!error && data) {
      const enriched = data.map((r: Record<string, unknown>) => {
        const p = r.profiles as Profile;
        return { ...(r as unknown as Residence), user_name: p.display_name || p.full_name || p.email };
      });
      setResidences(enriched);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Unique rooms
  const rooms = Array.from(new Set(residences.map(r => r.room_name))).sort();

  // Timeline view: all residences sorted by moved_in desc
  const timeline = [...residences].sort((a, b) => new Date(b.moved_in).getTime() - new Date(a.moved_in).getTime());

  // Current residents: moved_out is null
  const current = residences.filter(r => !r.moved_out);

  return (
    <div className="px-5 pt-6 pb-4">
      <h2 className="text-2xl font-display font-bold text-sage-900 mb-4">Chronik</h2>

      <div className="flex rounded-2xl bg-cream-200 p-1 mb-4">
        <ViewTab active={view === 'timeline'} onClick={() => setView('timeline')} label="Zeitstrahl" />
        <ViewTab active={view === 'current'} onClick={() => setView('current')} label="Bewohner" />
        <ViewTab active={view === 'rooms'} onClick={() => setView('rooms')} label="Zimmer" />
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : view === 'timeline' ? (
        <div>
          {timeline.length === 0 ? (
            <div className="card text-center py-10">
              <Clock className="w-10 h-10 text-sage-300 mx-auto mb-3" />
              <p className="text-sage-500 text-sm">Noch keine Wohnzeiten erfasst.</p>
            </div>
          ) : (
            <div className="relative pl-6">
              <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-cream-200" />
              <div className="space-y-4">
                {timeline.map(r => (
                  <div key={r.id} className="relative">
                    <div className={`absolute -left-5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${r.moved_out ? 'bg-sage-300' : 'bg-brand-500'}`} />
                    <div className="card py-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sage-900 text-sm">{r.user_name}</p>
                        <span className="text-xs text-sage-400">{durationLabel(r.moved_in, r.moved_out)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-sage-500">
                        <DoorOpen className="w-3.5 h-3.5" />
                        <span className="font-medium">{r.room_name}</span>
                      </div>
                      <p className="text-xs text-sage-400 mt-0.5">
                        {formatDate(r.moved_in)} — {r.moved_out ? formatDate(r.moved_out) : 'heute'}
                      </p>
                      {r.notes && <p className="text-xs text-sage-500 mt-1">{r.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : view === 'current' ? (
        <div>
          {current.length === 0 ? (
            <div className="card text-center py-10">
              <Users className="w-10 h-10 text-sage-300 mx-auto mb-3" />
              <p className="text-sage-500 text-sm">Keine aktuellen Bewohner.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {current.sort((a, b) => a.room_name.localeCompare(b.room_name)).map(r => (
                <div key={r.id} className="card flex items-center gap-3 py-3.5">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold shrink-0">
                    {r.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w0">
                    <p className="font-semibold text-sage-900 text-sm">{r.user_name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-sage-400">
                      <DoorOpen className="w-3 h-3" /> {r.room_name}
                    </div>
                  </div>
                  <span className="text-xs text-sage-400 shrink-0">{durationLabel(r.moved_in, null)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {rooms.length === 0 ? (
            <div className="card text-center py-10">
              <DoorOpen className="w-10 h-10 text-sage-300 mx-auto mb-3" />
              <p className="text-sage-500 text-sm">Noch keine Zimmer erfasst.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {rooms.map(room => {
                const roomResidents = residences
                  .filter(r => r.room_name === room)
                  .sort((a, b) => new Date(b.moved_in).getTime() - new Date(a.moved_in).getTime());
                return (
                  <div key={room} className="card py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <DoorOpen className="w-4 h-4 text-brand-500" />
                      <p className="font-semibold text-sage-900 text-sm">{room_name(room)}</p>
                      <span className="text-xs text-sage-400">{roomResidents.length} Bewohner</span>
                    </div>
                    <div className="space-y-1.5">
                      {roomResidents.map(r => (
                        <div key={r.id} className="flex items-center justify-between text-xs">
                          <span className={r.moved_out ? 'text-sage-400' : 'text-sage-900 font-medium'}>
                            {r.user_name}
                          </span>
                          <span className="text-sage-400">
                            {formatDate(r.moved_in)} — {r.moved_out ? formatDate(r.moved_out) : 'heute'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button onClick={() => setShowAdd(true)} className="btn-primary w-full mt-4">
        <Plus className="w-5 h-5" /> Wohnzeit hinzufügen
      </button>

      {showAdd && (
        <AddResidenceDialog
          userId={selectedUser?.id ?? profile?.id ?? ''}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); load(); }}
        />
      )}
    </div>
  );
}

function room_name(s: string): string { return s; }

function ViewTab({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${
        active ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
      }`}
    >
      {label}
    </button>
  );
}

function AddResidenceDialog({ userId, onClose, onCreated }: {
  userId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [personId, setPersonId] = useState(userId);
  const [roomName, setRoomName] = useState('');
  const [movedIn, setMovedIn] = useState('');
  const [movedOut, setMovedOut] = useState('');
  const [notes, setNotes] = useState('');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('profiles')
      .select('*')
      .eq('is_approved', true)
      .order('full_name')
      .then(({ data }) => {
        if (data) setProfiles(data as Profile[]);
      });
  }, []);

  async function save() {
    if (!personId || !roomName.trim() || !movedIn || !profile) return;
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from('residences').insert({
      user_id: personId,
      room_name: roomName.trim(),
      moved_in: movedIn,
      moved_out: movedOut || null,
      notes: notes.trim() || null,
      created_by: profile.id,
    });
    if (insertError) { setError(insertError.message); setSaving(false); return; }
    onCreated();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Wohnzeit hinzufügen</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}

          <div>
            <label className="label">Person</label>
            <select className="input" value={personId} onChange={e => setPersonId(e.target.value)}>
              <option value="">Auswählen…</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.display_name || p.full_name || p.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Zimmer</label>
            <input className="input" value={roomName} onChange={e => setRoomName(e.target.value)} placeholder="z.B. Zimmer 1.2" />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Eingezogen am</label>
              <input type="date" className="input" value={movedIn} onChange={e => setMovedIn(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Ausgezogen am (optional)</label>
              <input type="date" className="input" value={movedOut} onChange={e => setMovedOut(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Notiz (optional)</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="z.B. Formerzimmer" />
          </div>

          <button onClick={save} disabled={saving || !personId || !roomName.trim() || !movedIn} className="btn-primary w-full">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
