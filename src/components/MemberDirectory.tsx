import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fetchApprovedProfiles, profileName } from '@/lib/profiles';
import { useProfileSheet } from '@/lib/profile-sheet';
import type { Profile } from '@/types/database';
import UserAvatar from '@/components/UserAvatar';

type LoadState = 'loading' | 'ready' | 'error';

export default function MemberDirectory() {
  const { openProfile } = useProfileSheet();
  const [members, setMembers] = useState<Profile[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    fetchApprovedProfiles()
      .then((rows) => {
        if (!active) return;
        setMembers(rows);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, []);

  if (state === 'loading') return <p className="text-sage-400 text-sm">Lade Mitglieder…</p>;
  if (state === 'error') return <p className="text-brand-600 text-sm">Mitglieder konnten nicht geladen werden.</p>;
  if (members.length === 0) return <p className="text-sage-400 text-sm">Noch keine Mitglieder.</p>;

  return (
    <div className="space-y-2.5">
      {members.map((m) => (
        <button
          key={m.id}
          onClick={() => openProfile(m.id)}
          className="card w-full flex items-center gap-3 py-3 hover:bg-cream-50 transition text-left"
        >
          <UserAvatar profile={m} size="sm" />
          <span className="flex-1 min-w-0 font-semibold text-sage-900 text-sm truncate">{profileName(m)}</span>
          {m.is_admin && <span className="text-xs text-brand-700">Admin</span>}
          <ChevronRight className="w-4 h-4 text-sage-400 shrink-0" />
        </button>
      ))}
    </div>
  );
}
