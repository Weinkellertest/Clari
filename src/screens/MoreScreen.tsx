import { useEffect, useState } from 'react';
import {
  LogOut, ShieldCheck, ShieldAlert, UserCog, Users, BadgeCheck,
  Crown, ChevronRight, Info, Clock, Sparkles, Gamepad2,
  ListChecks, ClipboardList, Home, CalendarDays, Wallet, MessageCircle,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { Profile, Group, Office } from '@/types/database';

interface MoreScreenProps {
  onOpenAdmin: () => void;
  onOpenInfo: () => void;
  onOpenChronik: () => void;
  onOpenMinifacts: () => void;
  onOpenGames: () => void;
  onOpenLists: () => void;
  onOpenDuties: () => void;
  onNavigate: (tab: 'home' | 'chats' | 'calendar' | 'finance' | 'more') => void;
}

export default function MoreScreen({
  onOpenAdmin, onOpenInfo, onOpenChronik, onOpenMinifacts, onOpenGames,
  onOpenLists, onOpenDuties, onNavigate,
}: MoreScreenProps) {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [myGroups, setMyGroups] = useState<(Group & { role: string })[]>([]);
  const [myOffices, setMyOffices] = useState<(Office & { group_name: string })[]>([]);

  const isAdmin = profile?.is_admin ?? false;

  useEffect(() => {
    if (!isAdmin) return;
    setLoadingUsers(true);
    supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setUsers(data as Profile[]);
        setLoadingUsers(false);
      });
  }, [isAdmin]);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('group_memberships')
      .select('role, groups!inner(id, name, description, color, created_by, created_at)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) {
          setMyGroups(data.map((d: Record<string, unknown>) => ({
            ...(d.groups as Group),
            role: d.role as string,
          })));
        }
      });

    supabase
      .from('office_holders')
      .select('office_id, offices!inner(id, name, description, group_id, permissions, created_at), offices.group_id')
      .eq('user_id', profile.id)
      .then(async ({ data }) => {
        if (!data) return;
        const result: (Office & { group_name: string })[] = [];
        for (const d of data as unknown as Record<string, unknown>[]) {
          const office = d.offices as Office;
          const { data: groupData } = await supabase
            .from('groups')
            .select('name')
            .eq('id', office.group_id)
            .maybeSingle();
          result.push({ ...office, group_name: (groupData as { name: string } | null)?.name ?? '' });
        }
        setMyOffices(result);
      });
  }, [profile]);

  async function toggleApproval(p: Profile) {
    setUpdating(p.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: !p.is_approved })
      .eq('id', p.id);
    if (!error) {
      setUsers((prev) => prev.map((u) => (u.id === p.id ? { ...u, is_approved: !p.is_approved } : u)));
    }
    setUpdating(null);
  }

  async function toggleAdmin(p: Profile) {
    setUpdating(p.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_admin: !p.is_admin })
      .eq('id', p.id);
    if (!error) {
      setUsers((prev) => prev.map((u) => (u.id === p.id ? { ...u, is_admin: !p.is_admin } : u)));
      if (p.id === user?.id) refreshProfile();
    }
    setUpdating(null);
  }

  const menuItems: { label: string; icon: typeof Info; onClick: () => void; color: string }[] = [
    { label: 'Listen', icon: ListChecks, onClick: onOpenLists, color: 'text-brand-500' },
    { label: 'Dienste', icon: ClipboardList, onClick: onOpenDuties, color: 'text-brand-500' },
    { label: 'Infos & Dateien', icon: Info, onClick: onOpenInfo, color: 'text-brand-500' },
    { label: 'Über mich', icon: Sparkles, onClick: onOpenMinifacts, color: 'text-brand-500' },
    { label: 'Chronik', icon: Clock, onClick: onOpenChronik, color: 'text-brand-500' },
    { label: 'Minigames', icon: Gamepad2, onClick: onOpenGames, color: 'text-brand-500' },
  ];

  const quickNavItems: { label: string; icon: typeof Home; onClick: () => void; color: string }[] = [
    { label: 'Start', icon: Home, onClick: () => onNavigate('home'), color: 'text-brand-500' },
    { label: 'Chats', icon: MessageCircle, onClick: () => onNavigate('chats'), color: 'text-brand-500' },
    { label: 'Kalender', icon: CalendarDays, onClick: () => onNavigate('calendar'), color: 'text-brand-500' },
    { label: 'Finanzen', icon: Wallet, onClick: () => onNavigate('finance'), color: 'text-brand-500' },
  ];

  return (
    <div className="px-5 pt-6 pb-4">
      <h2 className="text-2xl font-display font-bold text-sage-900 mb-5">Mehr</h2>

      {/* Profil */}
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-lg">
            {(profile?.display_name || profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sage-900 truncate">
              {profile?.display_name || profile?.full_name || 'Nutzer'}
            </p>
            <p className="text-sm text-sage-400 truncate">{profile?.email}</p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 text-sm text-brand-700 bg-brand-50 rounded-xl px-3 py-2">
            <ShieldCheck className="w-4 h-4" /> Administrator
          </div>
        )}
      </div>

      {/* Schnellzugriff auf Hauptbereiche */}
      <div className="mb-5">
        <h3 className="font-display font-bold text-sage-900 mb-3">Bereiche</h3>
        <div className="grid grid-cols-4 gap-2">
          {quickNavItems.map(item => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="card flex flex-col items-center gap-1.5 py-3 hover:bg-cream-50 transition"
            >
              <item.icon className={`w-5 h-5 ${item.color}`} />
              <span className="text-xs font-semibold text-sage-700">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Weitere Bereiche */}
      <div className="mb-5">
        <h3 className="font-display font-bold text-sage-900 mb-3">Weitere Bereiche</h3>
        <div className="space-y-2.5">
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="card w-full flex items-center justify-between py-3.5 hover:bg-cream-50 transition"
            >
              <div className="flex items-center gap-2.5">
                <item.icon className={`w-5 h-5 ${item.color}`} />
                <span className="font-semibold text-sage-900">{item.label}</span>
              </div>
              <ChevronRight className="w-5 h-5 text-sage-400" />
            </button>
          ))}
        </div>
      </div>

      {/* Meine Gruppen */}
      {myGroups.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-sage-700" />
            <h3 className="font-display font-bold text-sage-900">Meine Gruppen</h3>
          </div>
          <div className="space-y-2.5">
            {myGroups.map((g) => (
              <div key={g.id} className="card flex items-center justify-between py-3.5">
                <div>
                  <p className="font-semibold text-sage-900 text-sm">{g.name}</p>
                  <span className={`text-xs flex items-center gap-1 mt-0.5 ${g.role === 'admin' ? 'text-brand-600' : 'text-sage-400'}`}>
                    {g.role === 'admin' ? <Crown className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
                    {g.role === 'admin' ? 'Gruppen-Admin' : 'Mitglied'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Meine Ämter */}
      {myOffices.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <BadgeCheck className="w-5 h-5 text-sage-700" />
            <h3 className="font-display font-bold text-sage-900">Meine Ämter</h3>
          </div>
          <div className="space-y-2.5">
            {myOffices.map((o) => (
              <div key={o.id} className="card py-3.5">
                <p className="font-semibold text-sage-900 text-sm flex items-center gap-2">
                  <BadgeCheck className="w-4 h-4 text-brand-500" /> {o.name}
                </p>
                <p className="text-xs text-sage-400 mt-0.5">{o.group_name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Admin: Gruppen & Ämter verwalten */}
      {isAdmin && (
        <div className="mb-5">
          <button
            onClick={onOpenAdmin}
            className="card w-full flex items-center justify-between py-3.5 hover:bg-cream-50 transition"
          >
            <div className="flex items-center gap-2.5">
              <Users className="w-5 h-5 text-brand-500" />
              <span className="font-semibold text-sage-900">Gruppen & Ämter verwalten</span>
            </div>
            <ChevronRight className="w-5 h-5 text-sage-400" />
          </button>
        </div>
      )}

      {/* Admin-Freischaltung */}
      {isAdmin && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <UserCog className="w-5 h-5 text-sage-700" />
            <h3 className="font-display font-bold text-sage-900">Nutzerverwaltung</h3>
          </div>

          {loadingUsers ? (
            <p className="text-sage-400 text-sm">Lade Nutzer…</p>
          ) : (
            <div className="space-y-2.5">
              {users.map((p) => (
                <div key={p.id} className="card flex items-center justify-between gap-3 py-3.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-sage-900 truncate text-sm">
                      {p.full_name || p.email}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.is_approved ? (
                        <span className="text-xs text-sage-600 flex items-center gap-1">
                          <ShieldCheck className="w-3.5 h-3.5" /> Freigeschaltet
                        </span>
                      ) : (
                        <span className="text-xs text-brand-600 flex items-center gap-1">
                          <ShieldAlert className="w-3.5 h-3.5" /> Gesperrt
                        </span>
                      )}
                      {p.is_admin && (
                        <span className="text-xs text-brand-700">· Admin</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => toggleApproval(p)}
                      disabled={updating === p.id}
                      className={`btn text-sm px-3.5 py-2 ${
                        p.is_approved
                          ? 'bg-cream-200 text-sage-700 hover:bg-cream-100'
                          : 'bg-sage-500 text-white hover:bg-sage-600'
                      }`}
                    >
                      {p.is_approved ? 'Sperren' : 'Freischalten'}
                    </button>
                    <button
                      onClick={() => toggleAdmin(p)}
                      disabled={updating === p.id}
                      className={`btn text-sm px-3.5 py-2 ${
                        p.is_admin
                          ? 'bg-cream-200 text-sage-700 hover:bg-cream-100'
                          : 'bg-brand-500 text-white hover:bg-brand-600'
                      }`}
                    >
                      {p.is_admin ? 'Admin weg' : 'Admin'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={signOut} className="btn-secondary w-full mt-2">
        <LogOut className="w-5 h-5" /> Abmelden
      </button>
    </div>
  );
}
