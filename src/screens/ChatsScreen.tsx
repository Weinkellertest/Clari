import { useEffect, useState, useRef, useCallback } from 'react';
import {
  ChevronLeft, Send, MessageCircle, Users, Plus, X,
  BadgeCheck, Loader2, Search,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Profile, Group, Office } from '@/types/database';

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  group_id: string | null;
  created_by: string;
  created_at: string;
}

interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'admin' | 'member';
  last_read_at: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  sender_office_id: string | null;
  sender_office_name: string | null;
  created_at: string;
}

interface ConversationWithMeta extends Conversation {
  other_user?: Profile;
  group?: Group;
  last_message?: Message;
  unread_count?: number;
}

export default function ChatsScreen() {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversation, setActiveConversation] = useState<ConversationWithMeta | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!profile) return;
    const { data: memberData } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', profile.id);

    if (!memberData || memberData.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const members = memberData as unknown as ConversationMember[];
    const convIds = members.map(m => m.conversation_id);
    const lastReadMap = new Map(members.map(m => [m.conversation_id, m.last_read_at]));

    const { data: convData } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convIds)
      .order('created_at', { ascending: false });

    const result: ConversationWithMeta[] = [];
    for (const conv of (convData as Conversation[]) ?? []) {
      const meta: ConversationWithMeta = { ...conv };

      // Letzte Nachricht
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      meta.last_message = lastMsg as Message | undefined;

      // Ungelesene Anzahl
      const lastRead = lastReadMap.get(conv.id) ?? '1970-01-01';
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .gt('created_at', lastRead)
        .neq('sender_id', profile.id);
      meta.unread_count = count ?? 0;

      if (conv.type === 'direct') {
        // Anderen Nutzer finden
        const { data: otherMember } = await supabase
          .from('conversation_members')
          .select('user_id, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
          .eq('conversation_id', conv.id)
          .neq('user_id', profile.id)
          .maybeSingle();
        if (otherMember) {
          meta.other_user = (otherMember as Record<string, unknown>).profiles as Profile;
        }
      } else if (conv.group_id) {
        const { data: groupData } = await supabase
          .from('groups')
          .select('*')
          .eq('id', conv.group_id)
          .maybeSingle();
        meta.group = groupData as Group | undefined;
      }

      result.push(meta);
    }

    // Sortieren: neueste Nachricht zuerst
    result.sort((a, b) => {
      const aTime = a.last_message?.created_at ?? a.created_at;
      const bTime = b.last_message?.created_at ?? b.created_at;
      return bTime.localeCompare(aTime);
    });

    setConversations(result);
    setLoading(false);
  }, [profile]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Realtime: neue Nachrichten
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('conversations-changes')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => loadConversations()
      )
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'conversation_members' },
        () => loadConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile, loadConversations]);

  if (activeConversation) {
    return (
      <ChatView
        conversation={activeConversation}
        onBack={() => { setActiveConversation(null); loadConversations(); }}
      />
    );
  }

  return (
    <div className="px-5 pt-6 pb-4">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-2xl font-display font-bold text-sage-900">Chats</h2>
        <button
          onClick={() => setShowNewChat(true)}
          className="w-10 h-10 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showNewChat && (
        <NewChatDialog
          onClose={() => setShowNewChat(false)}
          onCreated={() => { setShowNewChat(false); loadConversations(); }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="card text-center py-10">
          <MessageCircle className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">Noch keine Unterhaltungen. Tippe auf das + um eine neue zu beginnen.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setActiveConversation(conv)}
              className="card w-full flex items-center gap-3 py-3.5 hover:bg-cream-50 transition text-left"
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                conv.type === 'group' ? 'bg-sage-100 text-sage-600' : 'bg-brand-100 text-brand-600'
              }`}>
                {conv.type === 'group' ? <Users className="w-6 h-6" /> : (
                  <span className="font-bold text-lg">
                    {(conv.other_user?.display_name || conv.other_user?.full_name || conv.other_user?.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sage-900 truncate text-sm">
                  {conv.type === 'direct'
                    ? conv.other_user?.display_name || conv.other_user?.full_name || conv.other_user?.email || 'Unbekannt'
                    : conv.title || conv.group?.name || 'Gruppenchat'}
                </p>
                <p className="text-sm text-sage-400 truncate">
                  {conv.last_message
                    ? (conv.last_message.sender_office_name ? `[${conv.last_message.sender_office_name}] ` : '') + conv.last_message.content
                    : 'Noch keine Nachrichten'}
                </p>
              </div>
              {conv.unread_count !== undefined && conv.unread_count > 0 && (
                <span className="shrink-0 bg-brand-500 text-white text-xs font-bold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center">
                  {conv.unread_count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================
// Chat-Ansicht (Nachrichten)
// =====================

function ChatView({ conversation, onBack }: { conversation: ConversationWithMeta; onBack: () => void }) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [writeAsOffice, setWriteAsOffice] = useState(false);
  const [myOffices, setMyOffices] = useState<Office[]>([]);
  const [selectedOffice, setSelectedOffice] = useState<Office | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Andere Teilnehmer laden
  const [otherUsers, setOtherUsers] = useState<Profile[]>([]);

  const title = conversation.type === 'direct'
    ? conversation.other_user?.display_name || conversation.other_user?.full_name || conversation.other_user?.email || 'Unbekannt'
    : conversation.title || conversation.group?.name || 'Gruppenchat';

  // Meine Ämter laden (für "als Amt schreiben")
  useEffect(() => {
    if (!profile) return;
    supabase
      .from('office_holders')
      .select('office_id, offices!inner(id, name, description, group_id, permissions, created_at)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) {
          setMyOffices(data.map((d: Record<string, unknown>) => d.offices as Office));
        }
      });
  }, [profile]);

  const loadMessages = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversation.id)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) ?? []);
    setLoading(false);

    // last_read_at aktualisieren
    if (profile) {
      await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversation.id)
        .eq('user_id', profile.id);
    }
  }, [conversation.id, profile]);

  // Mitglieder laden für Namen-Anzeige
  useEffect(() => {
    supabase
      .from('conversation_members')
      .select('user_id, profiles!inner(id, email, full_name, display_name, is_admin, is_approved, created_at)')
      .eq('conversation_id', conversation.id)
      .then(({ data }) => {
        if (data) {
          setOtherUsers(data.map((d: Record<string, unknown>) => d.profiles as Profile));
        }
      });
  }, [conversation.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Realtime für neue Nachrichten
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          // last_read aktualisieren
          if (profile) {
            supabase
              .from('conversation_members')
              .update({ last_read_at: new Date().toISOString() })
              .eq('conversation_id', conversation.id)
              .eq('user_id', profile.id);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, profile]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function sendMessage() {
    if (!input.trim() || !profile) return;
    setSending(true);
    const office = writeAsOffice ? selectedOffice : null;
    const { data } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversation.id,
        sender_id: profile.id,
        content: input.trim(),
        sender_office_id: office?.id ?? null,
        sender_office_name: office?.name ?? null,
      })
      .select()
      .single();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      setInput('');
    }
    setSending(false);
  }

  const getSenderName = (senderId: string) => {
    const u = otherUsers.find((p) => p.id === senderId);
    return u?.display_name || u?.full_name || u?.email?.split('@')[0] || 'Unbekannt';
  };

  return (
    <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-cream-50/95 backdrop-blur-sm border-b border-cream-200">
        <div className="px-3 pt-4 pb-3 flex items-center gap-2">
          <button onClick={onBack} className="w-9 h-9 rounded-xl flex items-center justify-center text-sage-600 hover:bg-cream-200 transition">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
            conversation.type === 'group' ? 'bg-sage-100 text-sage-600' : 'bg-brand-100 text-brand-600'
          }`}>
            {conversation.type === 'group' ? <Users className="w-5 h-5" /> : (
              <span className="font-bold text-sm">
                {title.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sage-900 truncate">{title}</p>
            {conversation.type === 'group' && (
              <p className="text-xs text-sage-400">{otherUsers.length} Mitglieder</p>
            )}
          </div>
        </div>
      </header>

      {/* Nachrichten */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sage-400 text-sm">Noch keine Nachrichten. Schreib etwas!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === profile?.id;
            return (
              <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                {!isMe && (
                  <span className="text-xs text-sage-400 font-semibold mb-0.5 ml-1">
                    {msg.sender_office_name ?? getSenderName(msg.sender_id)}
                  </span>
                )}
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                  isMe
                    ? 'bg-brand-500 text-white rounded-br-md'
                    : 'bg-white text-sage-900 rounded-bl-md shadow-soft'
                }`}>
                  {msg.sender_office_name && (
                    <div className={`flex items-center gap-1 text-xs font-bold mb-1 ${
                      isMe ? 'text-brand-100' : 'text-brand-600'
                    }`}>
                      <BadgeCheck className="w-3.5 h-3.5" />
                      {msg.sender_office_name}
                    </div>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-brand-200' : 'text-sage-300'}`}>
                    {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Amt-Umschalter */}
      {myOffices.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => { setWriteAsOffice(false); setSelectedOffice(null); }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                !writeAsOffice ? 'bg-sage-500 text-white' : 'bg-white text-sage-500 border border-sage-200'
              }`}
            >
              Als ich
            </button>
            {myOffices.map((o) => (
              <button
                key={o.id}
                onClick={() => { setWriteAsOffice(true); setSelectedOffice(o); }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold flex items-center gap-1 transition ${
                  writeAsOffice && selectedOffice?.id === o.id
                    ? 'bg-brand-500 text-white'
                    : 'bg-white text-sage-500 border border-sage-200'
                }`}
              >
                <BadgeCheck className="w-3.5 h-3.5" />
                {o.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Eingabe */}
      <div className="border-t border-cream-200 bg-white px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <input
            className="flex-1 rounded-2xl border border-sage-200 bg-cream-50 px-4 py-2.5 text-sm text-sage-900 placeholder-sage-300 focus:outline-none focus:ring-2 focus:ring-brand-400"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={writeAsOffice && selectedOffice ? `Als ${selectedOffice.name} schreiben…` : 'Nachricht…'}
            disabled={sending}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-2xl bg-brand-500 text-white flex items-center justify-center shadow-soft active:scale-95 transition disabled:opacity-40"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================
// Neue Unterhaltung starten
// =====================

function NewChatDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [users, setUsers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!profile) return;
    Promise.all([
      supabase.from('profiles').select('*').eq('is_approved', true).neq('id', profile.id).order('full_name'),
      supabase.from('group_memberships').select('group_id, groups!inner(id, name, description, color, created_by, created_at)').eq('user_id', profile.id),
    ]).then(([userRes, groupRes]) => {
      setUsers((userRes.data as Profile[]) ?? []);
      setGroups((groupRes.data ?? []).map((d: Record<string, unknown>) => d.groups as Group));
      setLoading(false);
    });
  }, [profile]);

  async function createConversation() {
    if (!profile) return;
    setCreating(true);

    if (mode === 'direct') {
      if (selectedUsers.size !== 1) { setCreating(false); return; }
      const otherId = Array.from(selectedUsers)[0];

      // Prüfen ob schon ein Direktchat existiert
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id);

      if (myConvs && myConvs.length > 0) {
        for (const mc of myConvs) {
          const { data: otherMember } = await supabase
            .from('conversation_members')
            .select('conversation_id')
            .eq('conversation_id', mc.conversation_id)
            .eq('user_id', otherId)
            .maybeSingle();
          if (otherMember) {
            const { data: conv } = await supabase
              .from('conversations')
              .select('*')
              .eq('id', mc.conversation_id)
              .eq('type', 'direct')
              .maybeSingle();
            if (conv) {
              onCreated();
              setCreating(false);
              return;
            }
          }
        }
      }

      const { data: conv, error } = await supabase
        .from('conversations')
        .insert({ type: 'direct', created_by: profile.id })
        .select()
        .single();
      if (!error && conv) {
        await supabase.from('conversation_members').insert([
          { conversation_id: conv.id, user_id: profile.id, role: 'admin' },
          { conversation_id: conv.id, user_id: otherId, role: 'member' },
        ]);
        onCreated();
      }
    } else {
      if (selectedGroupId) {
        // Gruppenchat für existierende Gruppe
        const { data: conv, error } = await supabase
          .from('conversations')
          .insert({ type: 'group', group_id: selectedGroupId, title: groupTitle || null, created_by: profile.id })
          .select()
          .single();
        if (!error && conv) {
          // Alle Gruppenmitglieder hinzufügen
          const { data: members } = await supabase
            .from('group_memberships')
            .select('user_id, role')
            .eq('group_id', selectedGroupId);
          if (members && members.length > 0) {
            await supabase.from('conversation_members').insert(
              members.map((m: Record<string, unknown>) => ({
                conversation_id: conv.id,
                user_id: m.user_id as string,
                role: (m.role as string) === 'admin' ? 'admin' : 'member',
              }))
            );
          } else {
            await supabase.from('conversation_members').insert({
              conversation_id: conv.id, user_id: profile.id, role: 'admin',
            });
          }
          onCreated();
        }
      } else if (selectedUsers.size > 0) {
        // Ad-hoc Gruppenchat
        const { data: conv, error } = await supabase
          .from('conversations')
          .insert({ type: 'group', title: groupTitle || `Gruppe (${selectedUsers.size + 1})`, created_by: profile.id })
          .select()
          .single();
        if (!error && conv) {
          const allIds = [profile.id, ...Array.from(selectedUsers)];
          await supabase.from('conversation_members').insert(
            allIds.map((uid) => ({
              conversation_id: conv.id,
              user_id: uid,
              role: uid === profile.id ? 'admin' : 'member',
            }))
          );
          onCreated();
        }
      }
    }
    setCreating(false);
  }

  const filteredUsers = users.filter((u) => {
    const name = u.display_name || u.full_name || u.email;
    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-sage-900 text-lg">Neue Unterhaltung</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex rounded-2xl bg-cream-200 p-1">
            <button
              onClick={() => setMode('direct')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${mode === 'direct' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}
            >
              Einzeln
            </button>
            <button
              onClick={() => setMode('group')}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition ${mode === 'group' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'}`}
            >
              Gruppe
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
            </div>
          ) : mode === 'group' ? (
            <>
              {groups.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-semibold text-sage-700 mb-2">Aus Gruppe erstellen</p>
                  <div className="space-y-2">
                    {groups.map((g) => (
                      <button
                        key={g.id}
                        onClick={() => { setSelectedGroupId(g.id); setSelectedUsers(new Set()); }}
                        className={`card w-full flex items-center gap-3 py-3 text-left transition ${
                          selectedGroupId === g.id ? 'ring-2 ring-brand-400' : ''
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-sage-100 text-sage-600 flex items-center justify-center shrink-0">
                          <Users className="w-5 h-5" />
                        </div>
                        <span className="font-semibold text-sage-900 text-sm">{g.name}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-sage-400 mt-2 text-center">— oder Personen auswählen —</p>
                </div>
              )}
              <div className="mb-3">
                <label className="label">Gruppenname (optional)</label>
                <input
                  className="input"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  placeholder="Name des Gruppenchats"
                  disabled={!!selectedGroupId}
                />
              </div>
            </>
          ) : null}

          {mode === 'direct' && (
            <div className="mb-3">
              <div className="relative">
                <Search className="w-4 h-4 text-sage-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="input pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Suche nach Namen…"
                />
              </div>
            </div>
          )}

          {mode === 'group' && !selectedGroupId && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredUsers.map((u) => {
                const selected = selectedUsers.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      const next = new Set(selectedUsers);
                      if (selected) next.delete(u.id); else next.add(u.id);
                      setSelectedUsers(next);
                      setSelectedGroupId(null);
                    }}
                    className={`card w-full flex items-center gap-3 py-3 text-left transition ${selected ? 'ring-2 ring-brand-400' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {(u.display_name || u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-sage-900 text-sm flex-1 min-w-0 truncate">
                      {u.display_name || u.full_name || u.email}
                    </span>
                    {selected && <BadgeCheck className="w-5 h-5 text-brand-500" />}
                  </button>
                );
              })}
            </div>
          )}

          {mode === 'direct' && (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {filteredUsers.map((u) => {
                const selected = selectedUsers.has(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      const next = new Set<string>();
                      if (selected) { next.clear(); } else { next.add(u.id); }
                      setSelectedUsers(next);
                    }}
                    className={`card w-full flex items-center gap-3 py-3 text-left transition ${selected ? 'ring-2 ring-brand-400' : ''}`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center font-bold text-sm shrink-0">
                      {(u.display_name || u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold text-sage-900 text-sm flex-1 min-w-0 truncate">
                      {u.display_name || u.full_name || u.email}
                    </span>
                    {selected && <BadgeCheck className="w-5 h-5 text-brand-500" />}
                  </button>
                );
              })}
            </div>
          )}

          <button
            onClick={createConversation}
            disabled={creating || (mode === 'direct' ? selectedUsers.size !== 1 : selectedUsers.size === 0 && !selectedGroupId)}
            className="btn-primary w-full mt-4"
          >
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Unterhaltung starten'}
          </button>
        </div>
      </div>
    </div>
  );
}
