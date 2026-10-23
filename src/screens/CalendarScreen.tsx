import { useEffect, useState, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, X, MapPin, Clock,
  CalendarDays, List, LayoutGrid, Loader2, Trash2, Lock,
  DoorOpen, Pencil,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Event, Group, RoomReservation } from '@/types/database';
import RoomsScreen from '@/screens/RoomsScreen';

type ViewMode = 'month' | 'week' | 'list';
type FilterMode = 'mine' | string;

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const DAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(d: Date): string {
  return `${DAYS_FULL[d.getDay() === 0 ? 6 : d.getDay() - 1]}, ${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarScreen() {
  const { profile } = useAuth();
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState<FilterMode>('mine');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [showRooms, setShowRooms] = useState(false);
  const [reservations, setReservations] = useState<RoomReservation[]>([]);

  // Meine Gruppen laden
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('group_memberships')
      .select('groups!inner(id, name, description, color, created_by, created_at)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) {
          setGroups(data.map((d: Record<string, unknown>) => d.groups as Group));
        }
      });
  }, [profile]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    let startDate: Date;
    let endDate: Date;

    if (view === 'month') {
      const s = startOfMonth(currentDate);
      const e = endOfMonth(currentDate);
      // Puffer für Wochenanfang/-ende
      startDate = startOfWeek(s);
      endDate = new Date(e);
      endDate.setDate(endDate.getDate() + (7 - endDate.getDay()));
    } else if (view === 'week') {
      startDate = startOfWeek(currentDate);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
    } else {
      // List: aktuelle Woche bis +3 Monate
      startDate = startOfWeek(currentDate);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 3);
    }

    let query = supabase
      .from('events')
      .select('*')
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true });

    if (filter !== 'mine') {
      query = query.eq('group_id', filter);
    }

    const { data, error } = await query;
    if (!error && data) {
      let filtered = data as Event[];
      // Bei "meine": private Events nur zeigen, wenn sie vom Nutzer erstellt wurden
      if (filter === 'mine' && profile) {
        filtered = filtered.filter((e) => !e.is_private || e.created_by === profile.id);
      }
      setEvents(filtered);
    }
    setLoading(false);
  }, [view, currentDate, filter, profile]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Raum-Reservierungen laden (für Kalender-Anzeige)
  useEffect(() => {
    let startDate: Date;
    let endDate: Date;
    if (view === 'month') {
      startDate = startOfWeek(startOfMonth(currentDate));
      endDate = new Date(endOfMonth(currentDate));
      endDate.setDate(endDate.getDate() + (7 - endDate.getDay()));
    } else if (view === 'week') {
      startDate = startOfWeek(currentDate);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 7);
    } else {
      startDate = startOfWeek(currentDate);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 3);
    }
    supabase
      .from('room_reservations')
      .select('*')
      .gte('start_time', startDate.toISOString())
      .lte('start_time', endDate.toISOString())
      .order('start_time', { ascending: true })
      .then(({ data }) => { if (data) setReservations(data as RoomReservation[]); });
  }, [view, currentDate]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel('events-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => loadEvents())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadEvents]);

  const prevPeriod = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() - 1);
    else if (view === 'week') d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 7);
    setCurrentDate(d);
  };

  const nextPeriod = () => {
    const d = new Date(currentDate);
    if (view === 'month') d.setMonth(d.getMonth() + 1);
    else if (view === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 7);
    setCurrentDate(d);
  };

  const headerLabel = view === 'month'
    ? `${MONTHS[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    : view === 'week'
    ? () => {
        const s = startOfWeek(currentDate);
        const e = new Date(s);
        e.setDate(e.getDate() + 6);
        return `${s.getDate()}.–${e.getDate()}. ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
      }
    : 'Anstehende Termine';

  // Raum-Reservierungen in Event-ähnliche Objekte umwandeln und mit Events zusammenführen
  const reservationEvents: Event[] = reservations.map(r => ({
    id: `res-${r.id}`,
    title: r.title,
    description: r.notes,
    start_time: r.start_time,
    end_time: r.end_time,
    location: null,
    created_by: r.user_id,
    group_id: null,
    is_private: false,
    created_at: r.created_at,
  }));
  const mergedEvents = [...events, ...reservationEvents].sort((a, b) =>
    new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-display font-bold text-sage-900">Kalender</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRooms(true)}
            className="w-10 h-10 rounded-2xl bg-white text-brand-600 flex items-center justify-center border border-sage-200 shadow-soft active:scale-95 transition"
          >
            <DoorOpen className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Ansicht-Umschalter */}
      <div className="flex rounded-2xl bg-cream-200 p-1 mb-4">
        <ViewTabBtn active={view === 'month'} onClick={() => setView('month')} icon={LayoutGrid} label="Monat" />
        <ViewTabBtn active={view === 'week'} onClick={() => setView('week')} icon={CalendarDays} label="Woche" />
        <ViewTabBtn active={view === 'list'} onClick={() => setView('list')} icon={List} label="Liste" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-3">
        <FilterChip active={filter === 'mine'} onClick={() => setFilter('mine')} label="Mein Kalender" />
        {groups.map((g) => (
          <FilterChip
            key={g.id}
            active={filter === g.id}
            onClick={() => setFilter(g.id)}
            label={g.name}
          />
        ))}
      </div>

      {/* Navigation */}
      {view !== 'list' && (
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevPeriod} className="w-9 h-9 rounded-xl flex items-center justify-center text-sage-600 hover:bg-cream-200 transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="font-semibold text-sage-900 text-sm">
            {typeof headerLabel === 'function' ? headerLabel() : headerLabel}
          </span>
          <button onClick={nextPeriod} className="w-9 h-9 rounded-xl flex items-center justify-center text-sage-600 hover:bg-cream-200 transition">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : view === 'month' ? (
        <MonthView currentDate={currentDate} events={mergedEvents} onSelect={setSelectedEvent} />
      ) : view === 'week' ? (
        <WeekView currentDate={currentDate} events={mergedEvents} onSelect={setSelectedEvent} />
      ) : (
        <ListView events={mergedEvents} onSelect={setSelectedEvent} />
      )}

      {showCreate && (
        <CreateEventDialog
          groups={groups}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); loadEvents(); }}
        />
      )}

      {selectedEvent && (
        <EventDetailDialog
          event={selectedEvent}
          groupName={groups.find((g) => g.id === selectedEvent.group_id)?.name ?? null}
          canDelete={selectedEvent.created_by === profile?.id || profile?.is_admin === true}
          canEdit={selectedEvent.created_by === profile?.id || profile?.is_admin === true}
          groups={groups}
          onClose={() => setSelectedEvent(null)}
          onDeleted={() => { setSelectedEvent(null); loadEvents(); }}
          onEdited={() => { setSelectedEvent(null); loadEvents(); }}
        />
      )}

      {showRooms && (
        <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto overflow-y-auto">
          <div className="sticky top-0 bg-cream-50/90 backdrop-blur-sm border-b border-cream-200 px-5 py-3">
            <button onClick={() => setShowRooms(false)} className="text-sm font-semibold text-sage-600 flex items-center gap-1">
              <X className="w-4 h-4" /> Schließen
            </button>
          </div>
          <RoomsScreen />
        </div>
      )}
    </div>
  );
}

function ViewTabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof List; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
        active ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        active ? 'bg-sage-500 text-white' : 'bg-white text-sage-500 border border-sage-200'
      }`}
    >
      {label}
    </button>
  );
}

// =====================
// Monatsansicht
// =====================

function MonthView({ currentDate, events, onSelect }: { currentDate: Date; events: Event[]; onSelect: (e: Event) => void }) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const days: Date[] = [];
  const d = new Date(calStart);
  while (d <= monthEnd || days.length % 7 !== 0) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }

  const today = new Date();
  const eventsByDay = new Map<string, Event[]>();
  for (const e of events) {
    const key = new Date(e.start_time).toDateString();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(e);
  }

  return (
    <div>
      <div className="grid grid-cols-7 mb-1.5">
        {DAYS_SHORT.map((day) => (
          <div key={day} className="text-center text-xs font-semibold text-sage-400">{day}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((day, i) => {
          const inMonth = day.getMonth() === currentDate.getMonth();
          const isToday = isSameDay(day, today);
          const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
          return (
            <button
              key={i}
              onClick={() => dayEvents.length > 0 && onSelect(dayEvents[0])}
              className={`aspect-square rounded-xl flex flex-col items-center justify-start pt-1.5 transition relative ${
                !inMonth ? 'text-sage-300' : 'text-sage-700'
              } ${isToday ? 'bg-brand-100 text-brand-700 font-bold' : 'hover:bg-cream-200'}`}
            >
              <span className={`text-sm ${isToday ? 'font-bold' : ''}`}>{day.getDate()}</span>
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                  {dayEvents.slice(0, 3).map((_, idx) => (
                    <span key={idx} className={`w-1.5 h-1.5 rounded-full ${isToday ? 'bg-brand-500' : 'bg-sage-400'}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      {/* Anstehende Termine in diesem Monat */}
      <div className="mt-5">
        <p className="text-sm font-semibold text-sage-700 mb-2">Termine in diesem Monat</p>
        {events.length === 0 ? (
          <p className="text-sm text-sage-400">Keine Termine in diesem Monat.</p>
        ) : (
          <div className="space-y-2">
            {events.slice(0, 5).map((e) => (
              <EventRow key={e.id} event={e} onClick={() => onSelect(e)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =====================
// Wochenansicht
// =====================

function WeekView({ currentDate, events, onSelect }: { currentDate: Date; events: Event[]; onSelect: (e: Event) => void }) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const today = new Date();
  const eventsByDay = new Map<string, Event[]>();
  for (const e of events) {
    const key = new Date(e.start_time).toDateString();
    if (!eventsByDay.has(key)) eventsByDay.set(key, []);
    eventsByDay.get(key)!.push(e);
  }

  return (
    <div className="space-y-3">
      {days.map((day, i) => {
        const dayEvents = eventsByDay.get(day.toDateString()) ?? [];
        const isToday = isSameDay(day, today);
        return (
          <div key={i}>
            <div className={`flex items-center gap-2 mb-1.5 ${isToday ? '' : ''}`}>
              <span className={`text-xs font-bold uppercase ${isToday ? 'text-brand-600' : 'text-sage-400'}`}>
                {DAYS_SHORT[day.getDay() === 0 ? 6 : day.getDay() - 1]}
              </span>
              <span className={`text-sm font-semibold ${isToday ? 'text-brand-600' : 'text-sage-700'}`}>
                {day.getDate()}. {MONTHS[day.getMonth()].slice(0, 3)}
              </span>
              {isToday && <span className="text-xs text-brand-500 font-semibold">· Heute</span>}
            </div>
            {dayEvents.length === 0 ? (
              <p className="text-sm text-sage-300 pl-1">—</p>
            ) : (
              <div className="space-y-2">
                {dayEvents.map((e) => (
                  <EventRow key={e.id} event={e} onClick={() => onSelect(e)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =====================
// Listenansicht
// =====================

function ListView({ events, onSelect }: { events: Event[]; onSelect: (e: Event) => void }) {
  if (events.length === 0) {
    return (
      <div className="card text-center py-10">
        <CalendarDays className="w-10 h-10 text-sage-300 mx-auto mb-3" />
        <p className="text-sage-500 text-sm">Keine anstehenden Termine.</p>
      </div>
    );
  }

  // Nach Tag gruppieren
  const grouped = new Map<string, Event[]>();
  for (const e of events) {
    const d = new Date(e.start_time);
    const key = d.toDateString();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([day, dayEvents]) => {
        const d = new Date(day);
        return (
          <div key={day}>
            <p className="text-xs font-bold text-sage-400 uppercase tracking-wide mb-2">{formatDate(d)}</p>
            <div className="space-y-2">
              {dayEvents.map((e) => (
                <EventRow key={e.id} event={e} onClick={() => onSelect(e)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =====================
// Event-Reihe (shared)
// =====================

function EventRow({ event, onClick }: { event: Event; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="card w-full flex items-start gap-3 py-3 text-left hover:bg-cream-50 transition"
    >
      <div className="shrink-0 w-1.5 h-12 rounded-full bg-brand-400" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {event.is_private && <Lock className="w-3.5 h-3.5 text-sage-400" />}
          <p className="font-semibold text-sage-900 text-sm truncate">{event.title}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 text-xs text-sage-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" /> {formatTime(event.start_time)}
          </span>
          {event.location && (
            <span className="flex items-center gap-1 truncate">
              <MapPin className="w-3.5 h-3.5" /> {event.location}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// =====================
// Termin-Details
// =====================

function EventDetailDialog({
  event, groupName, canDelete, canEdit, groups, onClose, onDeleted, onEdited,
}: {
  event: Event;
  groupName: string | null;
  canDelete: boolean;
  canEdit: boolean;
  groups: Group[];
  onClose: () => void;
  onDeleted: () => void;
  onEdited: () => void;
}) {
  const [showEdit, setShowEdit] = useState(false);

  async function deleteEvent() {
    if (!confirm('Diesen Termin löschen?')) return;
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (!error) onDeleted();
  }

  if (showEdit && canEdit) {
    return (
      <EditEventDialog
        event={event}
        groups={groups}
        onClose={() => setShowEdit(false)}
        onSaved={() => onEdited()}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between mb-3">
            <h3 className="font-display font-bold text-sage-900 text-lg flex-1">{event.title}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {event.is_private && (
            <div className="flex items-center gap-1.5 text-xs text-sage-500 bg-cream-200 rounded-lg px-3 py-1.5 mb-3 w-fit">
              <Lock className="w-3.5 h-3.5" /> Privat
            </div>
          )}

          {groupName && (
            <div className="flex items-center gap-1.5 text-xs text-brand-600 bg-brand-50 rounded-lg px-3 py-1.5 mb-3 w-fit">
              {groupName}
            </div>
          )}

          <div className="space-y-2.5 mb-3">
            <div className="flex items-center gap-2.5 text-sm text-sage-700">
              <Clock className="w-4 h-4 text-sage-400" />
              <span>
                {formatDate(new Date(event.start_time))}
                <br />
                {formatTime(event.start_time)} – {formatTime(event.end_time)}
              </span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2.5 text-sm text-sage-700">
                <MapPin className="w-4 h-4 text-sage-400" />
                <span>{event.location}</span>
              </div>
            )}
          </div>

          {event.description && (
            <p className="text-sm text-sage-600 bg-white rounded-xl p-3 mb-3">{event.description}</p>
          )}

          {canEdit && (
            <button onClick={() => setShowEdit(true)} className="btn-secondary w-full mb-2">
              <Pencil className="w-5 h-5" /> Termin bearbeiten
            </button>
          )}

          {canDelete && (
            <button onClick={deleteEvent} className="btn-secondary w-full text-red-500 hover:bg-red-50">
              <Trash2 className="w-5 h-5" /> Termin löschen
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================
// Termin bearbeiten
// =====================

function EditEventDialog({
  event, groups, onClose, onSaved,
}: {
  event: Event;
  groups: Group[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const startDate = new Date(event.start_time);
  const endDate = new Date(event.end_time);

  const [title, setTitle] = useState(event.title);
  const [description, setDescription] = useState(event.description ?? '');
  const [date, setDate] = useState(startDate.toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState(startDate.toTimeString().slice(0, 5));
  const [endTime, setEndTime] = useState(endDate.toTimeString().slice(0, 5));
  const [location, setLocation] = useState(event.location ?? '');
  const [groupId, setGroupId] = useState(event.group_id ?? '');
  const [isPrivate, setIsPrivate] = useState(event.is_private);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);

    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const endISO = new Date(`${date}T${endTime}`).toISOString();

    if (endISO <= startISO) {
      setError('Die Endzeit muss nach der Startzeit liegen.');
      setSaving(false);
      return;
    }

    const { error: updateError } = await supabase.from('events').update({
      title: title.trim(),
      description: description.trim() || null,
      start_time: startISO,
      end_time: endISO,
      location: location.trim() || null,
      group_id: groupId || null,
      is_private: isPrivate || !groupId,
    }).eq('id', event.id);

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Termin bearbeiten</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>
          )}

          <div>
            <label className="label">Titel</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Termin-Titel" />
          </div>

          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Von</label>
              <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Bis</label>
              <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Ort (optional)</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z.B. Gemeindehaus" />
          </div>

          <div>
            <label className="label">Sichtbarkeit</label>
            <div className="space-y-2">
              <label className={`card flex items-center gap-3 py-3 cursor-pointer transition ${!groupId ? 'ring-2 ring-brand-400' : ''}`}>
                <input
                  type="radio"
                  name="edit-visibility"
                  checked={!groupId}
                  onChange={() => { setGroupId(''); setIsPrivate(true); }}
                  className="accent-brand-500"
                />
                <div>
                  <p className="font-semibold text-sage-900 text-sm">Privat</p>
                  <p className="text-xs text-sage-400">Nur für mich sichtbar</p>
                </div>
              </label>
              {groups.map((g) => (
                <label key={g.id} className={`card flex items-center gap-3 py-3 cursor-pointer transition ${groupId === g.id ? 'ring-2 ring-brand-400' : ''}`}>
                  <input
                    type="radio"
                    name="edit-visibility"
                    checked={groupId === g.id}
                    onChange={() => { setGroupId(g.id); setIsPrivate(false); }}
                    className="accent-brand-500"
                  />
                  <div>
                    <p className="font-semibold text-sage-900 text-sm">{g.name}</p>
                    <p className="text-xs text-sage-400">Für alle Gruppenmitglieder sichtbar</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Beschreibung (optional)</label>
            <textarea
              className="input min-h-20 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Zusätzliche Infos"
            />
          </div>

          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="btn-primary w-full"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Änderungen speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================
// Termin anlegen
// =====================

function CreateEventDialog({
  groups, onClose, onCreated,
}: {
  groups: Group[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [location, setLocation] = useState('');
  const [groupId, setGroupId] = useState<string>('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim() || !profile) return;
    setCreating(true);
    setError(null);

    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const endISO = new Date(`${date}T${endTime}`).toISOString();

    if (endISO <= startISO) {
      setError('Die Endzeit muss nach der Startzeit liegen.');
      setCreating(false);
      return;
    }

    const { error: insertError } = await supabase.from('events').insert({
      title: title.trim(),
      description: description.trim() || null,
      start_time: startISO,
      end_time: endISO,
      location: location.trim() || null,
      created_by: profile.id,
      group_id: groupId || null,
      is_private: isPrivate || !groupId,
    });

    if (insertError) {
      setError(insertError.message);
      setCreating(false);
      return;
    }

    onCreated();
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Neuer Termin</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-3.5">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>
          )}

          <div>
            <label className="label">Titel</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Termin-Titel" />
          </div>

          <div>
            <label className="label">Datum</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label">Von</label>
              <input type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="label">Bis</label>
              <input type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Ort (optional)</label>
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z.B. Gemeindehaus" />
          </div>

          <div>
            <label className="label">Sichtbarkeit</label>
            <div className="space-y-2">
              <label className={`card flex items-center gap-3 py-3 cursor-pointer transition ${!groupId ? 'ring-2 ring-brand-400' : ''}`}>
                <input
                  type="radio"
                  name="visibility"
                  checked={!groupId}
                  onChange={() => { setGroupId(''); setIsPrivate(true); }}
                  className="accent-brand-500"
                />
                <div>
                  <p className="font-semibold text-sage-900 text-sm">Privat</p>
                  <p className="text-xs text-sage-400">Nur für mich sichtbar</p>
                </div>
              </label>
              {groups.map((g) => (
                <label key={g.id} className={`card flex items-center gap-3 py-3 cursor-pointer transition ${groupId === g.id ? 'ring-2 ring-brand-400' : ''}`}>
                  <input
                    type="radio"
                    name="visibility"
                    checked={groupId === g.id}
                    onChange={() => { setGroupId(g.id); setIsPrivate(false); }}
                    className="accent-brand-500"
                  />
                  <div>
                    <p className="font-semibold text-sage-900 text-sm">{g.name}</p>
                    <p className="text-xs text-sage-400">Für alle Gruppenmitglieder sichtbar</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Beschreibung (optional)</label>
            <textarea
              className="input min-h-20 resize-none"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Zusätzliche Infos"
            />
          </div>

          <button
            onClick={create}
            disabled={creating || !title.trim()}
            className="btn-primary w-full"
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Termin erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}
