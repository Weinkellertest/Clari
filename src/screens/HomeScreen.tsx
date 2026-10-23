import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles, CalendarDays, ClipboardList, Wallet, MessageCircle,
  Gamepad2, Grid3x3, Circle, Brain, ListChecks,
  Settings2, ArrowUp, ArrowDown, Eye, EyeOff, X, ChevronRight, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Minifact, Profile, Event, Duty, WidgetId } from '@/types/database';
import type { GameType } from '@/types/database';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const DEFAULT_WIDGETS: WidgetId[] = ['minifacts', 'events', 'duties', 'finance', 'messages', 'games', 'shortcuts'];

const WIDGET_META: { id: WidgetId; label: string; icon: typeof Sparkles }[] = [
  { id: 'minifacts', label: 'Minifacts', icon: Sparkles },
  { id: 'events', label: 'Nächste Termine', icon: CalendarDays },
  { id: 'duties', label: 'Offene Dienste', icon: ClipboardList },
  { id: 'finance', label: 'Finanzsaldo', icon: Wallet },
  { id: 'messages', label: 'Nachrichten', icon: MessageCircle },
  { id: 'games', label: 'Minigames', icon: Gamepad2 },
  { id: 'shortcuts', label: 'Schnellzugriffe', icon: ListChecks },
];

interface HomeScreenProps {
  onNavigate: (tab: 'home' | 'chats' | 'calendar' | 'finance' | 'more') => void;
  onOpenSecondary: (name: 'lists' | 'duties') => void;
  onOpenGames: () => void;
}

export default function HomeScreen({ onNavigate, onOpenSecondary, onOpenGames }: HomeScreenProps) {
  const { profile } = useAuth();
  const greetingName = profile?.display_name || profile?.full_name || 'Clari';
  const [widgets, setWidgets] = useState<WidgetId[]>(DEFAULT_WIDGETS);
  const [editMode, setEditMode] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  const [randomFact, setRandomFact] = useState<Minifact | null>(null);
  const [factUser, setFactUser] = useState<Profile | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([]);
  const [openDuties, setOpenDuties] = useState<Duty[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadConfig = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase
      .from('user_home_config')
      .select('*')
      .eq('user_id', profile.id)
      .maybeSingle();
    if (data) {
      const cfg = data as { widgets: WidgetId[] };
      setWidgets(cfg.widgets);
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
    setConfigLoading(false);
  }, [profile]);

  const saveConfig = useCallback(async (newWidgets: WidgetId[]) => {
    if (!profile) return;
    setWidgets(newWidgets);
    await supabase
      .from('user_home_config')
      .upsert({ user_id: profile.id, widgets: newWidgets, updated_at: new Date().toISOString() });
  }, [profile]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (!profile) return;
    const now = new Date().toISOString();

    supabase
      .from('minifacts')
      .select('*, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
      .neq('user_id', profile.id)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const random = data[Math.floor(Math.random() * data.length)] as Record<string, unknown>;
          setRandomFact(random as unknown as Minifact);
          setFactUser(random.profiles as Profile);
        }
      });

    supabase
      .from('events')
      .select('*')
      .gte('start_time', now)
      .order('start_time', { ascending: true })
      .limit(3)
      .then(({ data }) => {
        if (data) setUpcomingEvents(data as Event[]);
      });

    supabase
      .from('duties')
      .select('*')
      .eq('assigned_user_id', profile.id)
      .eq('status', 'open')
      .order('due_date', { ascending: true })
      .limit(5)
      .then(({ data }) => {
        if (data) setOpenDuties(data as Duty[]);
      });

    supabase
      .from('transactions')
      .select('amount, debtor_id, creditor_id, status')
      .eq('status', 'open')
      .then(({ data }) => {
        if (!data || !profile) return;
        let owed = 0, owes = 0;
        for (const t of data as Array<{ amount: number; debtor_id: string; creditor_id: string; status: string }>) {
          if (t.creditor_id === profile.id) owed += t.amount;
          if (t.debtor_id === profile.id) owes += t.amount;
        }
        setBalance(owed - owes);
      });

    supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', profile.id)
      .then(async ({ data }) => {
        if (!data || data.length === 0) return;
        const members = data as Array<{ conversation_id: string; last_read_at: string }>;
        let total = 0;
        for (const m of members) {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', m.conversation_id)
            .gt('created_at', m.last_read_at ?? '1970-01-01')
            .neq('sender_id', profile.id);
          total += count ?? 0;
        }
        setUnreadCount(total);
      });
  }, [profile]);

  const today = new Date();
  const dateLabel = `${today.getDate()}. ${MONTHS[today.getMonth()]}`;
  const hour = today.getHours();
  const greeting = hour < 11 ? 'Guten Morgen' : hour < 17 ? 'Hallo' : 'Guten Abend';

  function moveWidget(idx: number, dir: -1 | 1) {
    const newWidgets = [...widgets];
    const target = idx + dir;
    if (target < 0 || target >= newWidgets.length) return;
    [newWidgets[idx], newWidgets[target]] = [newWidgets[target], newWidgets[idx]];
    saveConfig(newWidgets);
  }

  function toggleWidget(id: WidgetId) {
    if (widgets.includes(id)) {
      saveConfig(widgets.filter(w => w !== id));
    } else {
      saveConfig([...widgets, id]);
    }
  }

  if (configLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    );
  }

  const hiddenWidgets = WIDGET_META.filter(w => !widgets.includes(w.id));

  return (
    <div className="px-5 pt-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-sm text-sage-400">{dateLabel}</p>
          <h2 className="text-2xl font-display font-bold text-sage-900">{greeting}, {greetingName}</h2>
        </div>
        <button
          onClick={() => setEditMode(!editMode)}
          className={`w-10 h-10 rounded-2xl flex items-center justify-center transition ${
            editMode ? 'bg-brand-500 text-white' : 'bg-white border border-cream-200 text-sage-600 shadow-soft'
          }`}
        >
          <Settings2 className="w-5 h-5" />
        </button>
      </div>

      {editMode && (
        <div className="card mb-4 bg-brand-50 border-brand-100">
          <div className="flex items-center gap-2 mb-3">
            <Settings2 className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-bold text-brand-700">Startseite anpassen</span>
          </div>
          <p className="text-xs text-sage-500 mb-3">
            Aktiviere oder deaktiviere Elemente und ändere ihre Reihenfolge mit den Pfeilen.
          </p>
          <div className="space-y-2">
            {widgets.map((id, idx) => {
              const meta = WIDGET_META.find(w => w.id === id);
              if (!meta) return null;
              return (
                <div key={id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5">
                  <meta.icon className="w-4 h-4 text-brand-500 shrink-0" />
                  <span className="text-sm font-semibold text-sage-800 flex-1">{meta.label}</span>
                  <button onClick={() => moveWidget(idx, -1)} disabled={idx === 0} className="w-7 h-7 rounded-lg bg-cream-100 flex items-center justify-center text-sage-600 disabled:opacity-30">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveWidget(idx, 1)} disabled={idx === widgets.length - 1} className="w-7 h-7 rounded-lg bg-cream-100 flex items-center justify-center text-sage-600 disabled:opacity-30">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleWidget(id)} className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center text-red-400">
                    <EyeOff className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {hiddenWidgets.length > 0 && (
            <div className="mt-3 pt-3 border-t border-brand-100">
              <p className="text-xs font-semibold text-sage-400 mb-2">Ausgeblendete Elemente:</p>
              <div className="flex flex-wrap gap-2">
                {hiddenWidgets.map(meta => (
                  <button
                    key={meta.id}
                    onClick={() => toggleWidget(meta.id)}
                    className="flex items-center gap-1.5 bg-white rounded-xl px-3 py-2 text-sm font-semibold text-sage-600 border border-cream-200"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button
            onClick={() => setEditMode(false)}
            className="btn-primary w-full mt-3 text-sm py-2.5"
          >
            <X className="w-4 h-4" /> Fertig
          </button>
        </div>
      )}

      {widgets.map(widgetId => {
        if (widgetId === 'minifacts') {
          return <MinifactWidget key="minifacts" fact={randomFact} factUser={factUser} editMode={editMode} />;
        }
        if (widgetId === 'events') {
          return <EventsWidget key="events" events={upcomingEvents} editMode={editMode} onNavigate={() => onNavigate('calendar')} />;
        }
        if (widgetId === 'duties') {
          return <DutiesWidget key="duties" duties={openDuties} editMode={editMode} onNavigate={() => onOpenSecondary('duties')} />;
        }
        if (widgetId === 'finance') {
          return <FinanceWidget key="finance" balance={balance} editMode={editMode} onNavigate={() => onNavigate('finance')} />;
        }
        if (widgetId === 'messages') {
          return <MessagesWidget key="messages" unreadCount={unreadCount} editMode={editMode} onNavigate={() => onNavigate('chats')} />;
        }
        if (widgetId === 'games') {
          return <GamesWidget key="games" editMode={editMode} onOpenGames={onOpenGames} />;
        }
        if (widgetId === 'shortcuts') {
          return <ShortcutsWidget key="shortcuts" editMode={editMode} onNavigate={onNavigate} onOpenSecondary={onOpenSecondary} onOpenGames={onOpenGames} />;
        }
        return null;
      })}
    </div>
  );
}

function WidgetWrapper({ editMode, children }: { editMode: boolean; children: React.ReactNode }) {
  if (editMode) return <div className="mb-3 opacity-60 pointer-events-none">{children}</div>;
  return <div className="mb-4">{children}</div>;
}

function MinifactWidget({ fact, factUser, editMode }: { fact: Minifact | null; factUser: Profile | null; editMode: boolean }) {
  if (!fact || !factUser) return null;
  return (
    <WidgetWrapper editMode={editMode}>
      <div className="card bg-gradient-to-br from-brand-50 to-cream-100 border-brand-100">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-brand-500" />
          <span className="text-xs font-bold text-brand-600">Minifact</span>
        </div>
        <p className="text-sm text-sage-700">
          <span className="font-semibold">{factUser.display_name || factUser.full_name}</span> — {fact.fact_key}: {fact.fact_value}
        </p>
      </div>
    </WidgetWrapper>
  );
}

function EventsWidget({ events, editMode, onNavigate }: { events: Event[]; editMode: boolean; onNavigate: () => void }) {
  if (events.length === 0) return null;
  return (
    <WidgetWrapper editMode={editMode}>
      <div>
        <h3 className="text-xs font-bold text-sage-400 uppercase tracking-wide mb-2">Anstehend</h3>
        <div className="space-y-2">
          {events.map(ev => (
            <button key={ev.id} onClick={onNavigate} className="card w-full flex items-center gap-3 py-3 text-left">
              <div className="w-1.5 h-10 rounded-full bg-brand-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sage-900 text-sm truncate">{ev.title}</p>
                <p className="text-xs text-sage-400">
                  {new Date(ev.start_time).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })} · {new Date(ev.start_time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </WidgetWrapper>
  );
}

function DutiesWidget({ duties, editMode, onNavigate }: { duties: Duty[]; editMode: boolean; onNavigate: () => void }) {
  if (duties.length === 0) return null;
  return (
    <WidgetWrapper editMode={editMode}>
      <div>
        <h3 className="text-xs font-bold text-sage-400 uppercase tracking-wide mb-2">Deine Dienste</h3>
        <div className="space-y-2">
          {duties.map(d => (
            <button key={d.id} onClick={onNavigate} className="card w-full flex items-center gap-3 py-3 text-left">
              <ClipboardList className="w-4 h-4 text-sage-400 shrink-0" />
              <p className="font-semibold text-sage-900 text-sm flex-1 truncate">{d.title}</p>
              {d.due_date && (
                <span className="text-xs text-sage-400 shrink-0">
                  {new Date(d.due_date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short' })}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </WidgetWrapper>
  );
}

function FinanceWidget({ balance, editMode, onNavigate }: { balance: number | null; editMode: boolean; onNavigate: () => void }) {
  if (balance === null) return null;
  return (
    <WidgetWrapper editMode={editMode}>
      <button onClick={onNavigate} className="card w-full text-left">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${balance >= 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
            <Wallet className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-sage-400">Finanzsaldo</p>
            <p className="font-bold text-sage-900">{balance >= 0 ? '+' : ''}{balance.toFixed(2)}€</p>
          </div>
          <p className="text-xs text-sage-400">{balance >= 0 ? 'Du bekommst' : 'Du schuldest'}</p>
        </div>
      </button>
    </WidgetWrapper>
  );
}

function MessagesWidget({ unreadCount, editMode, onNavigate }: { unreadCount: number; editMode: boolean; onNavigate: () => void }) {
  return (
    <WidgetWrapper editMode={editMode}>
      <button onClick={onNavigate} className="card w-full text-left">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${unreadCount > 0 ? 'bg-brand-100 text-brand-600' : 'bg-cream-200 text-sage-400'}`}>
            <MessageCircle className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-sage-400">Nachrichten</p>
            <p className="font-bold text-sage-900">{unreadCount > 0 ? `${unreadCount} ungelesen` : 'Alles gelesen'}</p>
          </div>
          {unreadCount > 0 && (
            <span className="bg-brand-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </div>
      </button>
    </WidgetWrapper>
  );
}

function GamesWidget({ editMode, onOpenGames }: { editMode: boolean; onOpenGames: () => void }) {
  const games: { type: GameType; title: string; icon: typeof Grid3x3; color: string }[] = [
    { type: 'tictactoe', title: 'Tic-Tac-Toe', icon: Grid3x3, color: 'bg-brand-100 text-brand-600' },
    { type: 'connect4', title: 'Vier gewinnt', icon: Circle, color: 'bg-sage-100 text-sage-600' },
    { type: 'quiz', title: 'Clari-Quiz', icon: Brain, color: 'bg-amber-100 text-amber-600' },
  ];
  return (
    <WidgetWrapper editMode={editMode}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-sage-400 uppercase tracking-wide flex items-center gap-1.5">
            <Gamepad2 className="w-3.5 h-3.5" /> Minigames
          </h3>
          <button onClick={onOpenGames} className="text-xs font-semibold text-brand-600 flex items-center gap-0.5">
            Alle <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {games.map(g => (
            <button
              key={g.type}
              onClick={onOpenGames}
              className="card flex flex-col items-center gap-2 py-3.5 hover:bg-cream-50 transition"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${g.color}`}>
                <g.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-sage-700 text-center leading-tight">{g.title}</span>
            </button>
          ))}
        </div>
      </div>
    </WidgetWrapper>
  );
}

function ShortcutsWidget({ editMode, onNavigate, onOpenSecondary, onOpenGames }: {
  editMode: boolean;
  onNavigate: (tab: 'home' | 'chats' | 'calendar' | 'finance' | 'more') => void;
  onOpenSecondary: (name: 'lists' | 'duties') => void;
  onOpenGames: () => void;
}) {
  const shortcuts: { label: string; icon: typeof ListChecks; onClick: () => void; color: string }[] = [
    { label: 'Listen', icon: ListChecks, onClick: () => onOpenSecondary('lists'), color: 'bg-brand-100 text-brand-600' },
    { label: 'Dienste', icon: ClipboardList, onClick: () => onOpenSecondary('duties'), color: 'bg-sage-100 text-sage-600' },
    { label: 'Kalender', icon: CalendarDays, onClick: () => onNavigate('calendar'), color: 'bg-amber-100 text-amber-600' },
    { label: 'Finanzen', icon: Wallet, onClick: () => onNavigate('finance'), color: 'bg-green-50 text-green-600' },
    { label: 'Chats', icon: MessageCircle, onClick: () => onNavigate('chats'), color: 'bg-brand-100 text-brand-600' },
    { label: 'Spiele', icon: Gamepad2, onClick: onOpenGames, color: 'bg-purple-100 text-purple-600' },
  ];
  return (
    <WidgetWrapper editMode={editMode}>
      <div>
        <h3 className="text-xs font-bold text-sage-400 uppercase tracking-wide mb-2">Schnellzugriffe</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {shortcuts.map(s => (
            <button
              key={s.label}
              onClick={s.onClick}
              className="card flex flex-col items-center gap-2 py-3.5 hover:bg-cream-50 transition"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}>
                <s.icon className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold text-sage-700">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </WidgetWrapper>
  );
}
