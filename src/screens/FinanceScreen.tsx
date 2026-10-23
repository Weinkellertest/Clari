import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Wallet, ArrowRight, Trash2, Loader2, CheckCircle2,
  TrendingUp, TrendingDown, Scale, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Transaction, Group, Profile } from '@/types/database';

function formatAmount(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n);
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function FinanceScreen() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('transaction_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (!error && data) setTransactions(data as Transaction[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('group_memberships')
      .select('groups!inner(id, name, description, color, created_by, created_at)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) setGroups(data.map((d: Record<string, unknown>) => d.groups as Group));
      });
  }, [profile]);

  useEffect(() => {
    const channel = supabase.channel('finance-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Saldo berechnen: Person bekommt +amount wenn creditor, -amount wenn debtor
  const myBalance = transactions.reduce((sum, t) => {
    let delta = 0;
    if (t.creditor_type === 'person' && t.creditor_id === profile?.id) delta += t.amount;
    if (t.debtor_type === 'person' && t.debtor_id === profile?.id) delta -= t.amount;
    if (t.status === 'settled') return sum; // beglichene Transaktionen nicht mehr im Saldo
    return sum + delta;
  }, 0);

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.group_id === filter);

  const openCount = transactions.filter(t => t.status === 'open').length;

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-display font-bold text-sage-900">Finanzen</h2>
        <button onClick={() => setShowCreate(true)} className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Saldo-Karte */}
      <div className="card mb-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-sage-400 font-semibold mb-1">Mein Saldo</p>
            <p className={`text-3xl font-display font-extrabold ${myBalance > 0 ? 'text-sage-600' : myBalance < 0 ? 'text-red-500' : 'text-sage-700'}`}>
              {formatAmount(myBalance)}
            </p>
          </div>
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${myBalance >= 0 ? 'bg-sage-100' : 'bg-red-100'}`}>
            {myBalance > 0 ? <TrendingUp className="w-6 h-6 text-sage-600" /> : myBalance < 0 ? <TrendingDown className="w-6 h-6 text-red-500" /> : <Scale className="w-6 h-6 text-sage-400" />}
          </div>
        </div>
        {openCount > 0 && (
          <p className="text-xs text-sage-400 mt-3">{openCount} offene Buchung{openCount > 1 ? 'en' : ''}</p>
        )}
      </div>

      {/* Filter */}
      {groups.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="Alle" />
          {groups.map(g => (
            <FilterChip key={g.id} active={filter === g.id} onClick={() => setFilter(g.id)} label={g.name} />
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-10">
          <Wallet className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">Noch keine Buchungen.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(t => (
            <TransactionRow key={t.id} transaction={t} canDelete={t.created_by === profile?.id || (profile?.is_admin ?? false)} onDeleted={load} />
          ))}
        </div>
      )}

      {showCreate && <CreateTransactionDialog groups={groups} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${active ? 'bg-sage-500 text-white' : 'bg-white text-sage-500 border border-sage-200'}`}>
      {label}
    </button>
  );
}

function TransactionRow({ transaction, canDelete, onDeleted }: { transaction: Transaction; canDelete: boolean; onDeleted: () => void }) {
  const [settling, setSettling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function settle() {
    setSettling(true);
    const { error } = await supabase.from('transactions').update({ status: 'settled' }).eq('id', transaction.id);
    if (!error) onDeleted();
    setSettling(false);
  }

  async function del() {
    if (!confirm('Buchung löschen?')) return;
    setDeleting(true);
    const { error } = await supabase.from('transactions').delete().eq('id', transaction.id);
    if (!error) onDeleted();
    setDeleting(false);
  }

  const isSettled = transaction.status === 'settled';

  return (
    <div className={`card py-3.5 ${isSettled ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sage-900 text-sm">{transaction.description}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-sage-400">
            <span>{formatDate(transaction.transaction_date)}</span>
            <span>·</span>
            <span className="flex items-center gap-1 truncate">
              {transaction.creditor_name}
              <ArrowRight className="w-3 h-3" />
              {transaction.debtor_name}
            </span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-bold text-sage-900">{formatAmount(transaction.amount)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {!isSettled && (
          <button onClick={settle} disabled={settling} className="btn text-xs px-3 py-1.5 bg-sage-100 text-sage-700 hover:bg-sage-200">
            {settling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />} Als beglichen markieren
          </button>
        )}
        {isSettled && (
          <span className="text-xs text-sage-500 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Beglichen</span>
        )}
        {canDelete && (
          <button onClick={del} disabled={deleting} className="btn text-xs px-3 py-1.5 text-red-400 hover:bg-red-50 ml-auto">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

interface ActorOption { type: 'person' | 'office'; id: string; name: string; }

function CreateTransactionDialog({ groups, onClose, onCreated }: { groups: Group[]; onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [groupId, setGroupId] = useState('');
  const [creditorType, setCreditorType] = useState<'person' | 'office'>('person');
  const [debtorType, setDebtorType] = useState<'person' | 'office'>('person');
  const [creditorId, setCreditorId] = useState('');
  const [debtorId, setDebtorId] = useState('');
  const [actors, setActors] = useState<ActorOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load profiles + offices for actor selection
    (async () => {
      const [{ data: profiles }, { data: offices }] = await Promise.all([
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('offices').select('id, name, group_id, groups!inner(name)').order('name'),
      ]);
      const opts: ActorOption[] = [];
      if (profiles) {
        for (const p of profiles as Profile[]) {
          opts.push({ type: 'person', id: p.id, name: p.full_name || p.email });
        }
      }
      if (offices) {
        for (const o of offices as Record<string, unknown>[]) {
          const office = o as unknown as { id: string; name: string; groups: { name: string } };
          opts.push({ type: 'office', id: office.id, name: `${office.name} (${office.groups.name})` });
        }
      }
      setActors(opts);
      // Default: self as creditor
      if (profile) {
        const me = opts.find(o => o.id === profile.id);
        if (me) { setCreditorId(me.id); setCreditorType('person'); }
      }
    })();
  }, [profile]);

  const personActors = actors.filter(a => a.type === 'person');
  const officeActors = actors.filter(a => a.type === 'office');

  async function create() {
    if (!amount || !description.trim() || !creditorId || !debtorId || !profile) return;
    if (creditorId === debtorId && creditorType === debtorType) { setError('Gläubiger und Schuldner dürfen nicht identisch sein.'); return; }
    setCreating(true);
    setError(null);

    const credActor = actors.find(a => a.id === creditorId && a.type === creditorType);
    const debtActor = actors.find(a => a.id === debtorId && a.type === debtorType);
    if (!credActor || !debtActor) { setError('Bitte wähle Gläubiger und Schuldner.'); setCreating(false); return; }

    const { error: insertError } = await supabase.from('transactions').insert({
      amount: parseFloat(amount),
      description: description.trim(),
      transaction_date: date,
      creditor_type: creditorType,
      creditor_id: creditorId,
      creditor_name: credActor.name,
      debtor_type: debtorType,
      debtor_id: debtorId,
      debtor_name: debtActor.name,
      group_id: groupId || null,
      created_by: profile.id,
    });

    if (insertError) { setError(insertError.message); setCreating(false); return; }
    onCreated();
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Neue Buchung</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}

          <div><label className="label">Beschreibung</label><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="z.B. Einkauf für Fest" /></div>

          <div className="flex gap-3">
            <div className="flex-1"><label className="label">Betrag (€)</label><input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" /></div>
            <div className="flex-1"><label className="label">Datum</label><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>

          <div>
            <label className="label">Gläubiger (erhält Geld)</label>
            <ActorSelector
              type={creditorType}
              typeId={creditorId}
              onTypeChange={(t) => { setCreditorType(t); setCreditorId(''); }}
              onIdChange={setCreditorId}
              personActors={personActors}
              officeActors={officeActors}
            />
          </div>

          <div>
            <label className="label">Schuldner (schuldet Geld)</label>
            <ActorSelector
              type={debtorType}
              typeId={debtorId}
              onTypeChange={(t) => { setDebtorType(t); setDebtorId(''); }}
              onIdChange={setDebtorId}
              personActors={personActors}
              officeActors={officeActors}
            />
          </div>

          <div>
            <label className="label">Gruppe (optional)</label>
            <select className="input" value={groupId} onChange={e => setGroupId(e.target.value)}>
              <option value="">Keine Gruppe</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          <button onClick={create} disabled={creating || !amount || !description.trim() || !creditorId || !debtorId} className="btn-primary w-full">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Buchung erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActorSelector({ type, typeId, onTypeChange, onIdChange, personActors, officeActors }: {
  type: 'person' | 'office';
  typeId: string;
  onTypeChange: (t: 'person' | 'office') => void;
  onIdChange: (id: string) => void;
  personActors: ActorOption[];
  officeActors: ActorOption[];
}) {
  const options = type === 'person' ? personActors : officeActors;
  return (
    <div className="space-y-2">
      <div className="flex rounded-xl bg-cream-200 p-1">
        <button onClick={() => onTypeChange('person')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${type === 'person' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}>Person</button>
        <button onClick={() => onTypeChange('office')} className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${type === 'office' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}>Amt</button>
      </div>
      <select className="input" value={typeId} onChange={e => onIdChange(e.target.value)}>
        <option value="">Auswählen…</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}
