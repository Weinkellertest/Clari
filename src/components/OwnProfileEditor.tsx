import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, Loader2, Save } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { profileName, uploadAvatar, validateAvatarFile } from '@/lib/profiles';
import type { Profile } from '@/types/database';
import UserAvatar from '@/components/UserAvatar';

interface OwnProfileEditorProps {
  profile: Profile;
  email: string | null;
  onSaved: (profile: Profile) => void;
}

interface Notice {
  type: 'ok' | 'error';
  text: string;
}

export default function OwnProfileEditor({ profile, email, onSaved }: OwnProfileEditorProps) {
  const { refreshProfile } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.display_name ?? '');
  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [showEmail, setShowEmail] = useState(profile.show_email);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    const updates = {
      display_name: displayName.trim() || null,
      full_name: fullName.trim() || null,
      show_email: showEmail,
    };
    const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
    setSaving(false);
    if (error) {
      setNotice({ type: 'error', text: 'Speichern fehlgeschlagen. Bitte versuche es erneut.' });
      return;
    }
    onSaved({ ...profile, ...updates });
    refreshProfile();
    setNotice({ type: 'ok', text: 'Gespeichert.' });
  }

  async function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const problem = validateAvatarFile(file);
    if (problem) {
      setNotice({ type: 'error', text: problem });
      return;
    }

    setAvatarBusy(true);
    setNotice(null);
    try {
      const path = await uploadAvatar(profile.id, file, profile.avatar_path);
      onSaved({ ...profile, avatar_path: path });
      refreshProfile();
      setNotice({ type: 'ok', text: 'Profilbild aktualisiert.' });
    } catch {
      setNotice({ type: 'error', text: 'Das Profilbild konnte nicht hochgeladen werden.' });
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <UserAvatar profile={profile} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-display font-bold text-sage-900 truncate">{profileName(profile)}</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={avatarBusy}
            className="mt-2 text-sm font-semibold text-brand-700 flex items-center gap-1.5 hover:text-brand-800 disabled:opacity-60"
          >
            {avatarBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            {profile.avatar_path ? 'Profilbild ändern' : 'Profilbild hinzufügen'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label htmlFor="profile-display-name" className="label">Anzeigename</label>
          <input
            id="profile-display-name"
            className="input"
            value={displayName}
            maxLength={60}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="profile-full-name" className="label">Vollständiger Name</label>
          <input
            id="profile-full-name"
            className="input"
            value={fullName}
            maxLength={80}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className="card space-y-3">
          <p className="label">Sichtbarkeit</p>
          <p className="text-sm text-sage-600">
            Name und Profilbild sehen alle freigegebenen Mitglieder. Admins sehen deine E-Mail immer.
          </p>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-sage-900">E-Mail für andere Mitglieder anzeigen</p>
              <p className="text-xs text-sage-400 break-all">{email ?? 'Keine E-Mail hinterlegt'}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={showEmail}
              onClick={() => setShowEmail((v) => !v)}
              className={`relative w-11 h-6 rounded-full transition shrink-0 ${showEmail ? 'bg-brand-500' : 'bg-sage-300'}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showEmail ? 'translate-x-5' : ''}`}
              />
            </button>
          </div>
        </div>

        {notice && (
          <p className={`text-sm ${notice.type === 'ok' ? 'text-sage-700' : 'text-brand-600'}`}>{notice.text}</p>
        )}

        <button type="submit" disabled={saving} className="btn-primary w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Speichern
        </button>
      </form>
    </div>
  );
}
