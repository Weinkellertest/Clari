import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, DoorOpen, Clock, Trash2, Loader2, Users, CalendarPlus,
  AlertCircle, ChevronLeft,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Room, RoomReservation } from '@/types/database';

function formatTime(s: string): string {
  return new Date(s).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(s: string): string {
  const d = new Date(s);
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${d.getDate()}. ${months[d.getMonth()]}`;
}

export default function RoomsScreen() {
  const { profile } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<RoomReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showReserve, setShowReserve] = useState<Room | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [{ data: roomsData }, { data: resData }] = await Promise.all([
      supabase.from('rooms').select('*').order('name'),
      supabase.from('room_reservations').select('*').gte('start_time', new Date().toISOString()).order('start_time', { ascending: true }),
    ]);
    if (roomsData) setRooms(roomsData as Room[]);
    if (resData) setReservations(resData as RoomReservation[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const channel = supabase.channel('rooms-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_reservations' }, () => loadData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  const isAdmin = profile?.is_admin ?? false;
  const roomReservations = selectedRoom ? reservations.filter(r => r.room_id === selectedRoom.id) : [];

  if (selectedRoom) {
    return (
      <div className="px-5 pt-6 pb-4">
        <button onClick={() => setSelectedRoom(null)} className="flex items-center gap-1 text-sage-500 mb-4 text-sm font-semibold">
          <ChevronLeft className="w-4 h-4" /> Zurück zu Räumen
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center">
            <DoorOpen className="w-6 h-6 text-brand-600" />
          </div>
          <div>
            <h2 className="text-xl font-display font-bold text-sage-900">{selectedRoom.name}</h2>
            {selectedRoom.capacity && (
              <p className="text-sm text-sage-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> {selectedRoom.capacity} Personen
              </p>
            )}
          </div>
        </div>

        {selectedRoom.description && (
          <p className="text-sm text-sage-600 mb-4">{selectedRoom.description}</p>
        )}

        <button onClick={() => setShowReserve(selectedRoom)} className="btn-primary w-full mb-5">
          <CalendarPlus className="w-5 h-5" /> Raum reservieren
        </button>

        <h3 className="font-display font-bold text-sage-900 mb-3">Anstehende Reservierungen</h3>
        {roomReservations.length === 0 ? (
          <p className="text-sage-400 text-sm">Keine Reservierungen.</p>
        ) : (
          <div className="space-y-2">
            {roomReservations.map(r => (
              <ReservationRow key={r.id} reservation={r} canDelete={r.user_id === profile?.id || isAdmin} onDeleted={loadData} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-display font-bold text-sage-900">Räume</h2>
        {isAdmin && (
          <button onClick={() => setShowCreateRoom(true)} className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition">
            <Plus className="w-5 h-5" />
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-brand-500 animate-spin" /></div>
      ) : rooms.length === 0 ? (
        <div className="card text-center py-10">
          <DoorOpen className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">{isAdmin ? 'Noch keine Räume angelegt.' : 'Noch keine Räume verfügbar.'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map(room => {
            const upcoming = reservations.filter(r => r.room_id === room.id).length;
            return (
              <button key={room.id} onClick={() => setSelectedRoom(room)} className="card w-full flex items-center gap-3 text-left hover:bg-cream-50 transition">
                <div className="w-12 h-12 rounded-2xl bg-brand-100 flex items-center justify-center shrink-0">
                  <DoorOpen className="w-6 h-6 text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sage-900">{room.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-sage-400">
                    {room.capacity && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {room.capacity}</span>}
                    {upcoming > 0 && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {upcoming} anstehend</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreateRoom && <CreateRoomDialog onClose={() => setShowCreateRoom(false)} onCreated={() => { setShowCreateRoom(false); loadData(); }} />}
      {showReserve && <ReserveDialog room={showReserve} onClose={() => setShowReserve(null)} onCreated={() => { setShowReserve(null); loadData(); }} />}
    </div>
  );
}

function ReservationRow({ reservation, canDelete, onDeleted }: { reservation: RoomReservation; canDelete: boolean; onDeleted: () => void }) {
  const [deleting, setDeleting] = useState(false);
  async function del() {
    if (!confirm('Reservierung löschen?')) return;
    setDeleting(true);
    const { error } = await supabase.from('room_reservations').delete().eq('id', reservation.id);
    if (!error) onDeleted();
    setDeleting(false);
  }
  return (
    <div className="card flex items-center gap-3 py-3">
      <div className="shrink-0 w-1.5 h-12 rounded-full bg-brand-400" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sage-900 text-sm truncate">{reservation.title}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-sage-400">
          <span>{formatDateShort(reservation.start_time)}</span>
          <span>{formatTime(reservation.start_time)} – {formatTime(reservation.end_time)}</span>
        </div>
      </div>
      {canDelete && (
        <button onClick={del} disabled={deleting} className="w-9 h-9 rounded-xl flex items-center justify-center text-red-400 hover:bg-red-50 transition shrink-0">
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      )}
    </div>
  );
}

function CreateRoomDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const { error: insertError } = await supabase.from('rooms').insert({
      name: name.trim(),
      description: description.trim() || null,
      capacity: capacity ? parseInt(capacity) : null,
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
            <h3 className="font-display font-bold text-sage-900 text-lg">Neuer Raum</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
          <div><label className="label">Name</label><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Gemeindesaal" /></div>
          <div><label className="label">Beschreibung (optional)</label><input className="input" value={description} onChange={e => setDescription(e.target.value)} placeholder="z.B. Mit Beamer und Küche" /></div>
          <div><label className="label">Kapazität (optional)</label><input className="input" type="number" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="z.B. 50" /></div>
          <button onClick={create} disabled={creating || !name.trim()} className="btn-primary w-full">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Raum anlegen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReserveDialog({ room, onClose, onCreated }: { room: Room; onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('12:00');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!title.trim() || !profile) return;
    setCreating(true);
    setError(null);
    const startISO = new Date(`${date}T${startTime}`).toISOString();
    const endISO = new Date(`${date}T${endTime}`).toISOString();
    if (endISO <= startISO) { setError('Die Endzeit muss nach der Startzeit liegen.'); setCreating(false); return; }

    const { error: insertError } = await supabase.from('room_reservations').insert({
      room_id: room.id,
      user_id: profile.id,
      title: title.trim(),
      start_time: startISO,
      end_time: endISO,
      notes: notes.trim() || null,
    });

    if (insertError) {
      if (insertError.message.includes('overlapping')) {
        setError('Dieser Zeitraum ist bereits belegt. Bitte wähle einen anderen Zeitpunkt.');
      } else {
        setError(insertError.message);
      }
      setCreating(false);
      return;
    }
    onCreated();
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Reservieren: {room.name}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
          <div><label className="label">Titel</label><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Team-Meeting" /></div>
          <div><label className="label">Datum</label><input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="flex gap-3">
            <div className="flex-1"><label className="label">Von</label><input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div className="flex-1"><label className="label">Bis</label><input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
          <div><label className="label">Notiz (optional)</label><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="z.B. Vorstandssitzung" /></div>
          <button onClick={create} disabled={creating || !title.trim()} className="btn-primary w-full">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Reservieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
