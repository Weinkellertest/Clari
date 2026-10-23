import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, CheckSquare, ShoppingBag, Trash2, Loader2,
  Check, Lock, Users, ListTodo, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { List, ListItem, Group } from '@/types/database';

export default function ListsScreen() {
  const { profile } = useAuth();
  const [lists, setLists] = useState<List[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedList, setSelectedList] = useState<List | null>(null);

  const loadLists = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('lists').select('*').order('created_at', { ascending: false });
    if (!error && data) setLists(data as List[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadLists(); }, [loadLists]);

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
    const channel = supabase.channel('lists-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists' }, () => loadLists())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadLists]);

  const groupName = (gid: string | null) => groups.find(g => g.id === gid)?.name ?? null;

  if (selectedList) {
    return <ListDetailView list={selectedList} groupName={groupName(selectedList.group_id)} onBack={() => setSelectedList(null)} />;
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-display font-bold text-sage-900">Listen</h2>
        <button onClick={() => setShowCreate(true)} className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition">
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : lists.length === 0 ? (
        <div className="card text-center py-10">
          <ListTodo className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">Noch keine Listen. Tippe auf + um eine zu erstellen.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {lists.map(list => (
            <ListRow key={list.id} list={list} groupName={groupName(list.group_id)} onClick={() => setSelectedList(list)} />
          ))}
        </div>
      )}

      {showCreate && <CreateListDialog groups={groups} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadLists(); }} />}
    </div>
  );
}

function ListRow({ list, groupName, onClick }: { list: List; groupName: string | null; onClick: () => void }) {
  const [count, setCount] = useState({ total: 0, done: 0 });
  useEffect(() => {
    supabase.from('list_items').select('completed', { count: 'exact', head: false }).eq('list_id', list.id).then(({ data }) => {
      if (data) {
        const items = data as Pick<ListItem, 'completed'>[];
        setCount({ total: items.length, done: items.filter(i => i.completed).length });
      }
    });
  }, [list.id]);

  const Icon = list.type === 'shopping' ? ShoppingBag : CheckSquare;

  return (
    <button onClick={onClick} className="card w-full flex items-center gap-3 text-left hover:bg-cream-50 transition py-3.5">
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${list.type === 'shopping' ? 'bg-brand-100' : 'bg-sage-100'}`}>
        <Icon className={`w-5 h-5 ${list.type === 'shopping' ? 'text-brand-600' : 'text-sage-600'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sage-900 text-sm truncate">{list.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-sage-400">
          {count.total > 0 && <span>{count.done}/{count.total} erledigt</span>}
          {groupName ? (
            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {groupName}</span>
          ) : (
            <span className="flex items-center gap-1"><Lock className="w-3 h-3" /> Privat</span>
          )}
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-sage-300 shrink-0" />
    </button>
  );
}

function ListDetailView({ list, groupName, onBack }: { list: List; groupName: string | null; onBack: () => void }) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ListItem[]>([]);
  const [newText, setNewText] = useState('');
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const canDelete = list.created_by === profile?.id || profile?.is_admin;

  const loadItems = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('list_items').select('*').eq('list_id', list.id).order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (data) setItems(data as ListItem[]);
    setLoading(false);
  }, [list.id]);

  useEffect(() => { loadItems(); }, [loadItems]);

  useEffect(() => {
    const channel = supabase.channel(`items-${list.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${list.id}` }, () => loadItems())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadItems, list.id]);

  async function addItem() {
    if (!newText.trim() || !profile) return;
    setAdding(true);
    const { data, error } = await supabase.from('list_items').insert({
      list_id: list.id,
      text: newText.trim(),
      created_by: profile.id,
      sort_order: items.length,
    }).select().single();
    if (!error && data) {
      setItems(prev => [...prev, data as ListItem]);
      setNewText('');
    }
    setAdding(false);
  }

  async function toggle(item: ListItem) {
    if (!profile) return;
    const completed = !item.completed;
    const { error } = await supabase.from('list_items').update({
      completed,
      completed_by: completed ? profile.id : null,
      completed_at: completed ? new Date().toISOString() : null,
    }).eq('id', item.id);
    if (!error) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, completed, completed_by: completed ? profile.id : null, completed_at: completed ? new Date().toISOString() : null } : i));
    }
  }

  async function deleteItem(item: ListItem) {
    const { error } = await supabase.from('list_items').delete().eq('id', item.id);
    if (!error) setItems(prev => prev.filter(i => i.id !== item.id));
  }

  async function deleteList() {
    if (!confirm('Liste löschen?')) return;
    const { error } = await supabase.from('lists').delete().eq('id', list.id);
    if (!error) onBack();
  }

  const Icon = list.type === 'shopping' ? ShoppingBag : CheckSquare;

  return (
    <div className="px-5 pt-6 pb-4">
      <button onClick={onBack} className="flex items-center gap-1 text-sage-500 mb-4 text-sm font-semibold">
        <X className="w-4 h-4" /> Zurück
      </button>

      <div className="flex items-center gap-3 mb-5">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${list.type === 'shopping' ? 'bg-brand-100' : 'bg-sage-100'}`}>
          <Icon className={`w-6 h-6 ${list.type === 'shopping' ? 'text-brand-600' : 'text-sage-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-display font-bold text-sage-900 truncate">{list.title}</h2>
          <p className="text-xs text-sage-400 flex items-center gap-1">
            {groupName ? <><Users className="w-3 h-3" /> {groupName}</> : <><Lock className="w-3 h-3" /> Privat</>}
          </p>
        </div>
      </div>

      {/* Neuer Eintrag */}
      <div className="flex gap-2 mb-4">
        <input
          className="input flex-1"
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
          placeholder={list.type === 'shopping' ? 'Artikel hinzufügen…' : 'Aufgabe hinzufügen…'}
        />
        <button onClick={addItem} disabled={adding || !newText.trim()} className="btn-primary px-4 shrink-0">
          {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
        </button>
      </div>

      {/* Einträge */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : items.length === 0 ? (
        <p className="text-sage-400 text-sm text-center py-8">Noch keine Einträge.</p>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className={`card flex items-center gap-3 py-3 ${item.completed ? 'opacity-60' : ''}`}>
              <button
                onClick={() => toggle(item)}
                className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center shrink-0 transition ${
                  item.completed ? 'bg-sage-500 border-sage-500 text-white' : 'border-sage-300 hover:border-sage-400'
                }`}
              >
                {item.completed && <Check className="w-4 h-4" strokeWidth={3} />}
              </button>
              <p className={`flex-1 text-sm ${item.completed ? 'line-through text-sage-400' : 'text-sage-900'}`}>{item.text}</p>
              <button onClick={() => deleteItem(item)} className="w-8 h-8 rounded-lg flex items-center justify-center text-sage-300 hover:text-red-400 hover:bg-red-50 transition shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fortschritt */}
      {items.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-sage-400 mb-1.5">
            <span>{items.filter(i => i.completed).length} von {items.length} erledigt</span>
            <span>{Math.round(items.filter(i => i.completed).length / items.length * 100)}%</span>
          </div>
          <div className="h-2 rounded-full bg-cream-200 overflow-hidden">
            <div className="h-full bg-sage-500 rounded-full transition-all" style={{ width: `${items.filter(i => i.completed).length / items.length * 100}%` }} />
          </div>
        </div>
      )}

      {canDelete && (
        <button onClick={deleteList} className="btn-secondary w-full mt-5 text-red-500 hover:bg-red-50">
          <Trash2 className="w-5 h-5" /> Liste löschen
        </button>
      )}
    </div>
  );
}

function CreateListDialog({ groups, onClose, onCreated }: { groups: Group[]; onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<'todo' | 'shopping'>('todo');
  const [groupId, setGroupId] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim() || !profile) return;
    setCreating(true);
    setError(null);
    const { error: insertError } = await supabase.from('lists').insert({
      title: title.trim(),
      type,
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
            <h3 className="font-display font-bold text-sage-900 text-lg">Neue Liste</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
          <div><label className="label">Titel</label><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Einkaufsliste" /></div>

          <div>
            <label className="label">Typ</label>
            <div className="flex rounded-2xl bg-cream-200 p-1">
              <button onClick={() => setType('todo')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${type === 'todo' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}>
                <CheckSquare className="w-4 h-4" /> To-do
              </button>
              <button onClick={() => setType('shopping')} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition ${type === 'shopping' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}>
                <ShoppingBag className="w-4 h-4" /> Einkauf
              </button>
            </div>
          </div>

          <div>
            <label className="label">Sichtbarkeit</label>
            <div className="space-y-2">
              <label className={`card flex items-center gap-3 py-3 cursor-pointer transition ${!groupId ? 'ring-2 ring-brand-400' : ''}`}>
                <input type="radio" name="list-visibility" checked={!groupId} onChange={() => setGroupId('')} className="accent-brand-500" />
                <div><p className="font-semibold text-sage-900 text-sm flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Privat</p><p className="text-xs text-sage-400">Nur für mich sichtbar</p></div>
              </label>
              {groups.map(g => (
                <label key={g.id} className={`card flex items-center gap-3 py-3 cursor-pointer transition ${groupId === g.id ? 'ring-2 ring-brand-400' : ''}`}>
                  <input type="radio" name="list-visibility" checked={groupId === g.id} onChange={() => setGroupId(g.id)} className="accent-brand-500" />
                  <div><p className="font-semibold text-sage-900 text-sm flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> {g.name}</p><p className="text-xs text-sage-400">Für alle Gruppenmitglieder</p></div>
                </label>
              ))}
            </div>
          </div>

          <button onClick={create} disabled={creating || !title.trim()} className="btn-primary w-full">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Liste erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
