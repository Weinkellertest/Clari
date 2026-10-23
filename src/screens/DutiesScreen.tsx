import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, CheckCircle2, Circle, ShieldCheck, Clock,
  Repeat, AlertTriangle, ClipboardList,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Duty, DutyStatus, DutyRecurrence, Profile, Office } from '@/types/database';

const RECURRENCE_LABELS: Record<DutyRecurrence, string> = {
  none: 'Einmalig',
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
};

const STATUS_META: Record<DutyStatus, { label: string; color: string; bg: string; icon: typeof Circle }> = {
  open: { label: 'Offen', color: 'text-sage-600', bg: 'bg-sage-100', icon: Circle },
  done: { label: 'Erledigt', color: 'text-brand-600', bg: 'bg-brand-50', icon: CheckCircle2 },
  checked: { label: 'Kontrolliert', color: 'text-green-600', bg: 'bg-green-50', icon: ShieldCheck },
  overdue: { label: 'Überfällig', color: 'text-red-600', bg: 'bg-red-50', icon: AlertTriangle },
};

function formatDateTime(s: string): string {
  const d = new Date(s);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short' }) + ' · ' +
    d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function DutiesScreen() {
  const { profile } = useAuth();
  const [view, setView] = useState<'mine' | 'assigned'>('mine');
  const [duties, setDuties] = useState<Duty[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [myOffices, setMyOffices] = useState<Office[]>([]);
  const [canAssign, setCanAssign] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('office_holders')
      .select('offices!inner(id, name, description, group_id, permissions, created_at)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) {
          const offices = data.map((d: Record<string, unknown>) => d.offices as Office);
          setMyOffices(offices);
          setCanAssign(offices.some(o => o.permissions.includes('duties')) || profile.is_admin);
        }
      });
  }, [profile]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    let query = supabase.from('duties').select('*').order('due_date', { ascending: true });
    if (view === 'mine') {
      query = query.eq('assigned_user_id', profile.id);
    } else {
      const officeIds = myOffices.filter(o => o.permissions.includes('duties')).map(o => o.id);
      if (officeIds.length > 0 || profile.is_admin) {
        if (!profile.is_admin && officeIds.length > 0) {
          query = query.in('assigned_office_id', officeIds);
        }
      } else {
        setDuties([]);
        setLoading(false);
        return;
      }
    }
    const { data, error } = await query;
    if (!error && data) {
      setDuties(data as Duty[]);
    }
    setLoading(false);
  }, [view, profile, myOffices]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('duties-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'duties' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const grouped = {
    overdue: duties.filter(d => d.status === 'overdue' || (d.status === 'open' && d.due_date && new Date(d.due_date) < new Date())),
    open: duties.filter(d => d.status === 'open' && (!d.due_date || new Date(d.due_date) >= new Date())),
    done: duties.filter(d => d.status === 'done' || d.status === 'checked'),
  };

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-display font-bold text-sage-900">Dienste</h2>
        {canAssign && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Ansicht-Umschalter */}
      <div className="flex rounded-2xl bg-cream-200 p-1 mb-4">
        <button
          onClick={() => setView('mine')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
            view === 'mine' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
          }`}
        >
          <ClipboardList className="w-4 h-4" /> Meine Dienste
        </button>
        <button
          onClick={() => setView('assigned')}
          disabled={!canAssign}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
            view === 'assigned' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
          } ${!canAssign ? 'opacity-40' : ''}`}
        >
          <ShieldCheck className="w-4 h-4" /> Vom Amt vergeben
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : duties.length === 0 ? (
        <div className="card text-center py-10">
          <ClipboardList className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">
            {view === 'mine' ? 'Keine Dienste für dich.' : 'Noch keine Dienste vergeben.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.overdue.length > 0 && (
            <DutyGroup title="Überfällig" duties={grouped.overdue} view={view} onChanged={load} profile={profile} />
          )}
          {grouped.open.length > 0 && (
            <DutyGroup title="Offen" duties={grouped.open} view={view} onChanged={load} profile={profile} />
          )}
          {grouped.done.length > 0 && (
            <DutyGroup title="Erledigt" duties={grouped.done} view={view} onChanged={load} profile={profile} />
          )}
        </div>
      )}

      {showCreate && (
        <CreateDutyDialog
          offices={myOffices.filter(o => o.permissions.includes('duties'))}
          isAdmin={profile?.is_admin ?? false}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function DutyGroup({ title, duties, view, onChanged, profile }: {
  title: string;
  duties: Duty[];
  view: 'mine' | 'assigned';
  onChanged: () => void;
  profile: Profile | null;
}) {
  return (
    <div>
      <h3 className="text-xs font-bold text-sage-400 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-2.5">
        {duties.map(d => (
          <DutyRow key={d.id} duty={d} view={view} onChanged={onChanged} profile={profile} />
        ))}
      </div>
    </div>
  );
}

function DutyRow({ duty, view, onChanged, profile }: {
  duty: Duty;
  view: 'mine' | 'assigned';
  onChanged: () => void;
  profile: Profile | null;
}) {
  const [updating, setUpdating] = useState(false);
  const meta = STATUS_META[duty.status];
  const StatusIcon = meta.icon;
  const isOverdue = duty.status === 'overdue' || (duty.status === 'open' && duty.due_date && new Date(duty.due_date) < new Date());

  async function markDone() {
    setUpdating(true);
    await supabase.from('duties').update({
      status: 'done',
      completed_at: new Date().toISOString(),
    }).eq('id', duty.id);
    setUpdating(false);
    onChanged();
  }

  async function markChecked() {
    setUpdating(true);
    await supabase.from('duties').update({
      status: 'checked',
      checked_at: new Date().toISOString(),
      checked_by: profile?.id ?? null,
    }).eq('id', duty.id);
    setUpdating(false);
    onChanged();
  }

  async function reopen() {
    setUpdating(true);
    await supabase.from('duties').update({
      status: 'open',
      completed_at: null,
      checked_at: null,
      checked_by: null,
    }).eq('id', duty.id);
    setUpdating(false);
    onChanged();
  }

  return (
    <div className={`card py-3.5 ${isOverdue ? 'ring-1 ring-red-200' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sage-900 text-sm">{duty.title}</p>
          {duty.description && (
            <p className="text-xs text-sage-500 mt-0.5 line-clamp-2">{duty.description}</p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs font-semibold flex items-center gap-1 ${meta.color} ${meta.bg} rounded-full px-2 py-0.5`}>
              <StatusIcon className="w-3 h-3" /> {meta.label}
            </span>
            {duty.due_date && (
              <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-sage-400'}`}>
                <Clock className="w-3 h-3" /> {formatDateTime(duty.due_date)}
              </span>
            )}
            {duty.recurrence !== 'none' && (
              <span className="text-xs text-sage-400 flex items-center gap-1">
                <Repeat className="w-3 h-3" /> {RECURRENCE_LABELS[duty.recurrence]}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Aktionen */}
      <div className="flex items-center gap-2 mt-2.5">
        {view === 'mine' && duty.status === 'open' && (
          <button onClick={markDone} disabled={updating} className="btn text-xs px-3 py-1.5 bg-brand-100 text-brand-700 hover:bg-brand-200">
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Als erledigt markieren
          </button>
        )}
        {view === 'assigned' && duty.status === 'done' && (
          <button onClick={markChecked} disabled={updating} className="btn text-xs px-3 py-1.5 bg-green-100 text-green-700 hover:bg-green-200">
            {updating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Als kontrolliert markieren
          </button>
        )}
        {view === 'assigned' && (duty.status === 'done' || duty.status === 'checked') && (
          <button onClick={reopen} disabled={updating} className="btn text-xs px-3 py-1.5 bg-cream-200 text-sage-600 hover:bg-cream-100">
            Wieder öffnen
          </button>
        )}
      </div>
    </div>
  );
}

function CreateDutyDialog({ offices, isAdmin, onClose, onCreated }: {
  offices: Office[];
  isAdmin: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [officeId, setOfficeId] = useState(offices[0]?.id ?? '');
  const [userId, setUserId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [recurrence, setRecurrence] = useState<DutyRecurrence>('none');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [creating, setCreating] = useState(false);
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

  async function create() {
    if (!title.trim() || !officeId || !userId || !profile) return;
    setCreating(true);
    setError(null);

    const due = dueDate ? new Date(dueDate).toISOString() : null;

    const { error: insertError } = await supabase.from('duties').insert({
      title: title.trim(),
      description: description.trim() || null,
      assigned_office_id: officeId,
      assigned_user_id: userId,
      due_date: due,
      recurrence,
      status: 'open',
      created_by: profile.id,
    });

    if (insertError) {
      setError(insertError.message);
      setCreating(false);
      return;
    }

    onCreated();
    setCreating(false);
  }

  const officeOptions = isAdmin ? offices : offices;

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Dienst vergeben</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}

          <div>
            <label className="label">Titel</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Müll rausbringen" />
          </div>

          <div>
            <label className="label">Beschreibung (optional)</label>
            <textarea className="input min-h-16 resize-none" value={description} onChange={e => setDescription(e.target.value)} placeholder="Details zum Dienst" />
          </div>

          <div>
            <label className="label">Amt</label>
            <select className="input" value={officeId} onChange={e => setOfficeId(e.target.value)}>
              {officeOptions.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Person</label>
            <select className="input" value={userId} onChange={e => setUserId(e.target.value)}>
              <option value="">Auswählen…</option>
              {profiles.map(p => (
                <option key={p.id} value={p.id}>{p.display_name || p.full_name || p.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Fälligkeit (optional)</label>
            <input type="datetime-local" className="input" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>

          <div>
            <label className="label">Wiederholung</label>
            <select className="input" value={recurrence} onChange={e => setRecurrence(e.target.value as DutyRecurrence)}>
              <option value="none">Einmalig</option>
              <option value="daily">Täglich</option>
              <option value="weekly">Wöchentlich</option>
              <option value="monthly">Monatlich</option>
            </select>
          </div>

          <button onClick={create} disabled={creating || !title.trim() || !officeId || !userId} className="btn-primary w-full">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Dienst vergeben'}
          </button>
        </div>
      </div>
    </div>
  );
}
