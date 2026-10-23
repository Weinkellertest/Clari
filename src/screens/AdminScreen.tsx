import { useEffect, useState, useCallback } from 'react';
import {
  Users, Plus, ChevronLeft, Trash2, Crown, BadgeCheck, X,
  Shield, ShieldCheck, AlertCircle, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Group, Office, Profile } from '@/types/database';

type View = 'overview' | 'group-detail';

export default function AdminScreen({ onBack }: { onBack: () => void }) {
  const { profile } = useAuth();
  const [view, setView] = useState<View>('overview');
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const loadGroups = useCallback(async () => {
    const { data } = await supabase.from('groups').select('*').order('name');
    setGroups((data as Group[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function createGroup() {
    if (!newGroupName.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('groups')
      .insert({ name: newGroupName.trim(), description: newGroupDesc.trim() || null })
      .select()
      .single();
    if (!error && data) {
      const group = data as Group;
      // Ersteller als Gruppen-Admin hinzufügen
      await supabase
        .from('group_memberships')
        .insert({ group_id: group.id, user_id: profile!.id, role: 'admin' });
      setGroups((prev) => [...prev, group]);
      setNewGroupName('');
      setNewGroupDesc('');
      setShowCreateGroup(false);
    }
    setCreating(false);
  }

  async function deleteGroup(g: Group) {
    if (!confirm(`Gruppe "${g.name}" wirklich löschen? Alle Ämter und Mitgliedschaften werden entfernt.`)) return;
    const { error } = await supabase.from('groups').delete().eq('id', g.id);
    if (!error) {
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
    }
  }

  if (view === 'group-detail' && selectedGroup) {
    return (
      <GroupDetail
        group={selectedGroup}
        onBack={() => { setView('overview'); setSelectedGroup(null); }}

      />
    );
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sage-500 text-sm font-semibold mb-4">
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>

      <div className="flex items-center gap-2 mb-1">
        <Shield className="w-6 h-6 text-brand-500" />
        <h2 className="text-2xl font-display font-bold text-sage-900">Gruppen & Ämter</h2>
      </div>
      <p className="text-sage-500 text-sm mb-5">Gruppen anlegen, Mitglieder verwalten und Ämter besetzen.</p>

      <button
        onClick={() => setShowCreateGroup(true)}
        className="btn-primary w-full mb-5"
      >
        <Plus className="w-5 h-5" /> Neue Gruppe
      </button>

      {showCreateGroup && (
        <div className="card mb-5 space-y-3">
          <div>
            <label className="label">Gruppenname</label>
            <input
              className="input"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="z.B. Vorstand"
            />
          </div>
          <div>
            <label className="label">Beschreibung (optional)</label>
            <input
              className="input"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
              placeholder="Kurze Beschreibung"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={createGroup} disabled={creating || !newGroupName.trim()} className="btn-primary flex-1">
              {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Erstellen'}
            </button>
            <button onClick={() => setShowCreateGroup(false)} className="btn-secondary">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card text-center py-8">
          <Users className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">Noch keine Gruppen vorhanden. Erstelle die erste Gruppe.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {groups.map((g) => (
            <div key={g.id} className="card flex items-center justify-between gap-3">
              <button
                onClick={() => { setSelectedGroup(g); setView('group-detail'); }}
                className="flex-1 text-left min-w-0"
              >
                <p className="font-semibold text-sage-900 truncate">{g.name}</p>
                {g.description && <p className="text-sm text-sage-400 truncate">{g.description}</p>}
              </button>
              <button
                onClick={() => deleteGroup(g)}
                className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sage-400 hover:bg-red-50 hover:text-red-500 transition"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================
// Group Detail: Mitglieder + Ämter
// =====================

function GroupDetail({
  group, onBack,
}: {
  group: Group;
  onBack: () => void;
}) {
  const { profile } = useAuth();
  const [members, setMembers] = useState<(Profile & { membership_id: string; role: 'admin' | 'member' })[]>([]);
  const [offices, setOffices] = useState<(Office & { holders: Profile[] })[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'members' | 'offices'>('members');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCreateOffice, setShowCreateOffice] = useState(false);
  const [showAssignHolder, setShowAssignHolder] = useState<string | null>(null);
  const [newOfficeName, setNewOfficeName] = useState('');
  const [newOfficeDesc, setNewOfficeDesc] = useState('');
  const [newOfficePerms, setNewOfficePerms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadData = useCallback(async () => {
    // Mitglieder laden
    const { data: memberData } = await supabase
      .from('group_memberships')
      .select('id, user_id, role, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
      .eq('group_id', group.id);

    const mappedMembers = (memberData ?? []).map((m: Record<string, unknown>) => ({
      ...(m.profiles as Profile),
      membership_id: m.id as string,
      role: m.role as 'admin' | 'member',
    }));
    setMembers(mappedMembers);

    // Ämter + Inhaber laden
    const { data: officeData } = await supabase
      .from('offices')
      .select('id, name, description, group_id, permissions, created_at')
      .eq('group_id', group.id)
      .order('name');

    const officesWithHolders: (Office & { holders: Profile[] })[] = [];
    for (const o of (officeData as Office[]) ?? []) {
      const { data: holderData } = await supabase
        .from('office_holders')
        .select('user_id, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
        .eq('office_id', o.id);
      const holders = (holderData ?? []).map((h: Record<string, unknown>) => h.profiles as Profile);
      officesWithHolders.push({ ...o, holders });
    }
    setOffices(officesWithHolders);

    // Alle Nutzer für Auswahllisten laden (nur Admins)
    if (profile?.is_admin) {
      const { data: userData } = await supabase
        .from('profiles')
        .select('id, email, full_name, display_name, is_admin, is_approved, created_at')
        .eq('is_approved', true)
        .order('full_name');
      setAllUsers((userData as Profile[]) ?? []);
    }

    setLoading(false);
  }, [group.id, profile?.is_admin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const memberIds = new Set(members.map((m) => m.id));

  async function addMember(userId: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('group_memberships')
      .insert({ group_id: group.id, user_id: userId, role: 'member' });
    if (error) {
      setError(error.message);
    } else {
      await loadData();
    }
    setBusy(false);
  }

  async function removeMember(membershipId: string) {
    const { error } = await supabase.from('group_memberships').delete().eq('id', membershipId);
    if (!error) {
      setMembers((prev) => prev.filter((m) => m.membership_id !== membershipId));
    }
  }

  async function toggleMemberRole(m: Profile & { membership_id: string; role: 'admin' | 'member' }) {
    const newRole = m.role === 'admin' ? 'member' : 'admin';
    const { error } = await supabase
      .from('group_memberships')
      .update({ role: newRole })
      .eq('id', m.membership_id);
    if (!error) {
      setMembers((prev) => prev.map((x) => x.membership_id === m.membership_id ? { ...x, role: newRole } : x));
    }
  }

  async function createOffice() {
    if (!newOfficeName.trim()) return;
    setBusy(true);
    setError(null);
    const perms = newOfficePerms
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const { error } = await supabase
      .from('offices')
      .insert({
        name: newOfficeName.trim(),
        description: newOfficeDesc.trim() || null,
        group_id: group.id,
        permissions: perms,
      });
    if (error) {
      setError(error.message);
    } else {
      setNewOfficeName('');
      setNewOfficeDesc('');
      setNewOfficePerms('');
      setShowCreateOffice(false);
      await loadData();
    }
    setBusy(false);
  }

  async function deleteOffice(officeId: string) {
    if (!confirm('Dieses Amt löschen?')) return;
    const { error } = await supabase.from('offices').delete().eq('id', officeId);
    if (!error) {
      setOffices((prev) => prev.filter((o) => o.id !== officeId));
    }
  }

  async function assignHolder(officeId: string, userId: string) {
    setBusy(true);
    setError(null);
    const { error } = await supabase
      .from('office_holders')
      .insert({ office_id: officeId, user_id: userId });
    if (error) {
      setError(error.message);
    } else {
      setShowAssignHolder(null);
      await loadData();
    }
    setBusy(false);
  }

  async function removeHolder(officeId: string, userId: string) {
    const { error } = await supabase
      .from('office_holders')
      .delete()
      .eq('office_id', officeId)
      .eq('user_id', userId);
    if (!error) {
      await loadData();
    }
  }

  // Wie viele Ämter hat ein Nutzer bereits insgesamt?
  const holderCount = (userId: string) =>
    offices.reduce((sum, o) => sum + o.holders.filter((h) => h.id === userId).length, 0);

  const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));

  return (
    <div className="px-5 pt-6 pb-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sage-500 text-sm font-semibold mb-3">
        <ChevronLeft className="w-4 h-4" /> Zurück zur Übersicht
      </button>

      <h2 className="text-2xl font-display font-bold text-sage-900 mb-1">{group.name}</h2>
      {group.description && <p className="text-sage-500 text-sm mb-5">{group.description}</p>}

      {error && (
        <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-2xl bg-cream-200 p-1 mb-5">
        <button
          onClick={() => setTab('members')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${tab === 'members' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}
        >
          <Users className="w-4 h-4 inline mr-1.5" /> Mitglieder ({members.length})
        </button>
        <button
          onClick={() => setTab('offices')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${tab === 'offices' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}
        >
          <BadgeCheck className="w-4 h-4 inline mr-1.5" /> Ämter ({offices.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : tab === 'members' ? (
        <div>
          <button onClick={() => setShowAddMember(true)} className="btn-secondary w-full mb-4">
            <Plus className="w-5 h-5" /> Mitglied hinzufügen
          </button>

          {showAddMember && (
            <div className="card mb-4">
              {availableUsers.length === 0 ? (
                <p className="text-sm text-sage-500 text-center py-2">Alle freigeschalteten Nutzer sind bereits Mitglieder.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {availableUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => addMember(u.id)}
                      disabled={busy}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-cream-100 transition text-left"
                    >
                      <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                        {(u.display_name || u.full_name || u.email).charAt(0).toUpperCase()}
                      </div>
                      <span className="font-semibold text-sage-900 text-sm truncate">
                        {u.display_name || u.full_name || u.email}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setShowAddMember(false)} className="btn-ghost w-full mt-2 text-sm">
                <X className="w-4 h-4" /> Abbrechen
              </button>
            </div>
          )}

          <div className="space-y-2.5">
            {members.map((m) => (
              <div key={m.membership_id} className="card flex items-center justify-between gap-3 py-3.5">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm shrink-0">
                    {(m.display_name || m.full_name || m.email).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sage-900 truncate text-sm">
                      {m.display_name || m.full_name || m.email}
                    </p>
                    <button
                      onClick={() => toggleMemberRole(m)}
                      className={`text-xs flex items-center gap-1 mt-0.5 ${m.role === 'admin' ? 'text-brand-600' : 'text-sage-400'}`}
                    >
                      {m.role === 'admin' ? <Crown className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                      {m.role === 'admin' ? 'Gruppen-Admin' : 'Mitglied'} · Tippen zum Wechseln
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => removeMember(m.membership_id)}
                  className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sage-400 hover:bg-red-50 hover:text-red-500 transition"
                >
                  <Trash2 className="w-4.5 h-4.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <button onClick={() => setShowCreateOffice(true)} className="btn-secondary w-full mb-4">
            <Plus className="w-5 h-5" /> Neues Amt
          </button>

          {showCreateOffice && (
            <div className="card mb-4 space-y-3">
              <div>
                <label className="label">Amtsbezeichnung</label>
                <input
                  className="input"
                  value={newOfficeName}
                  onChange={(e) => setNewOfficeName(e.target.value)}
                  placeholder="z.B. Vorsitzender"
                />
              </div>
              <div>
                <label className="label">Beschreibung (optional)</label>
                <input
                  className="input"
                  value={newOfficeDesc}
                  onChange={(e) => setNewOfficeDesc(e.target.value)}
                  placeholder="Was gehört zu diesem Amt?"
                />
              </div>
              <div>
                <label className="label">Berechtigungen (mit Komma trennen)</label>
                <input
                  className="input"
                  value={newOfficePerms}
                  onChange={(e) => setNewOfficePerms(e.target.value)}
                  placeholder="z.B. finance.read, calendar.edit"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={createOffice} disabled={busy || !newOfficeName.trim()} className="btn-primary flex-1">
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Erstellen'}
                </button>
                <button onClick={() => setShowCreateOffice(false)} className="btn-secondary">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {offices.length === 0 ? (
            <div className="card text-center py-8">
              <BadgeCheck className="w-10 h-10 text-sage-300 mx-auto mb-3" />
              <p className="text-sage-500 text-sm">Noch keine Ämter in dieser Gruppe.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offices.map((o) => (
                <div key={o.id} className="card">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sage-900">{o.name}</p>
                      {o.description && <p className="text-sm text-sage-400 mt-0.5">{o.description}</p>}
                      {o.permissions.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {o.permissions.map((p) => (
                            <span key={p} className="text-xs bg-sage-50 text-sage-700 rounded-lg px-2 py-0.5 font-medium">
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => deleteOffice(o.id)}
                      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-sage-400 hover:bg-red-50 hover:text-red-500 transition"
                    >
                      <Trash2 className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  {/* Inhaber */}
                  <div className="border-t border-cream-200 pt-3">
                    <p className="text-xs font-semibold text-sage-500 uppercase tracking-wide mb-2">Inhaber</p>
                    {o.holders.length === 0 ? (
                      <p className="text-sm text-sage-400 mb-2">Noch niemand zugewiesen.</p>
                    ) : (
                      <div className="space-y-2 mb-2">
                        {o.holders.map((h) => (
                          <div key={h.id} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-xs">
                                {(h.display_name || h.full_name || h.email).charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-sage-900">
                                {h.display_name || h.full_name || h.email}
                              </span>
                              <span className="text-xs text-sage-400">
                                ({holderCount(h.id)} Ämter)
                              </span>
                            </div>
                            <button
                              onClick={() => removeHolder(o.id, h.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-sage-400 hover:bg-red-50 hover:text-red-500 transition"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {showAssignHolder === o.id ? (
                      <div className="rounded-xl bg-cream-100 p-2.5">
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {members.map((m) => {
                            const already = o.holders.some((h) => h.id === m.id);
                            const maxed = holderCount(m.id) >= 3;
                            return (
                              <button
                                key={m.id}
                                onClick={() => already || maxed ? undefined : assignHolder(o.id, m.id)}
                                disabled={already || maxed || busy}
                                className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                                  already || maxed
                                    ? 'opacity-40 cursor-not-allowed'
                                    : 'hover:bg-white'
                                }`}
                              >
                                <span className="font-semibold text-sage-900 truncate">
                                  {m.display_name || m.full_name || m.email}
                                </span>
                                {already ? (
                                  <ShieldCheck className="w-4 h-4 text-sage-400" />
                                ) : maxed ? (
                                  <span className="text-xs text-brand-600">3 Ämter max.</span>
                                ) : (
                                  <Plus className="w-4 h-4 text-brand-500" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <button onClick={() => setShowAssignHolder(null)} className="btn-ghost w-full mt-2 text-sm">
                          Abbrechen
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAssignHolder(o.id)}
                        className="text-sm text-brand-600 font-semibold flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Inhaber zuweisen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
