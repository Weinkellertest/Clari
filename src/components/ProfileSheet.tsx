import { useEffect, useState } from 'react';
import { X, ShieldCheck, Mail, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { fetchProfilesByIds, fetchProfileEmail, profileName } from '@/lib/profiles';
import type { Profile } from '@/types/database';
import UserAvatar from '@/components/UserAvatar';
import OwnProfileEditor from '@/components/OwnProfileEditor';

interface ProfileSheetProps {
  userId: string;
  onClose: () => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export default function ProfileSheet({ userId, onClose }: ProfileSheetProps) {
  const { user, profile: viewer } = useAuth();
  const isOwn = user?.id === userId;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    let active = true;
    Promise.all([fetchProfilesByIds([userId]), fetchProfileEmail(userId)])
      .then(([rows, mail]) => {
        if (!active) return;
        if (rows.length === 0) {
          setState('error');
          return;
        }
        setProfile(rows[0]);
        setEmail(mail);
        setState('ready');
      })
      .catch(() => {
        if (active) setState('error');
      });
    return () => {
      active = false;
    };
  }, [userId]);

  return (
    <div className="fixed inset-0 z-40 bg-sage-900/40 flex items-end justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Profil"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-cream-50 rounded-t-3xl shadow-soft max-h-[90vh] overflow-y-auto px-6 pt-6 pb-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold text-sage-900">Profil</h2>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="w-9 h-9 rounded-xl bg-white border border-cream-200 flex items-center justify-center text-sage-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {state === 'loading' && <p className="text-sm text-sage-400 py-8 text-center">Profil wird geladen…</p>}
        {state === 'error' && (
          <p className="text-sm text-brand-600 py-8 text-center">Das Profil konnte nicht geladen werden.</p>
        )}

        {state === 'ready' && profile && isOwn && (
          <OwnProfileEditor profile={profile} email={email} onSaved={setProfile} />
        )}

        {state === 'ready' && profile && !isOwn && (
          <div className="space-y-6">
            <div className="flex items-center gap-4">
              <UserAvatar profile={profile} size="lg" />
              <div className="min-w-0">
                <p className="text-xl font-display font-bold text-sage-900 truncate">{profileName(profile)}</p>
                {profile.is_admin && (
                  <span className="text-xs text-brand-700 flex items-center gap-1 mt-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Administrator
                  </span>
                )}
              </div>
            </div>

            <div className="card">
              <p className="label mb-1">E-Mail</p>
              {email ? (
                <>
                  <a href={`mailto:${email}`} className="flex items-center gap-2 text-sm font-semibold text-brand-700 break-all">
                    <Mail className="w-4 h-4 shrink-0" /> {email}
                  </a>
                  {viewer?.is_admin && !profile.show_email && (
                    <p className="text-xs text-sage-400 mt-2">Als Admin siehst du diese E-Mail immer.</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-sage-500 flex items-center gap-2">
                  <EyeOff className="w-4 h-4 shrink-0" /> Diese Person hat ihre E-Mail nicht freigegeben.
                </p>
              )}
            </div>

            <p className="text-xs text-sage-400">
              Mitglied seit {new Date(profile.created_at).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
