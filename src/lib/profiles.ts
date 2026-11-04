import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types/database';

export const PROFILE_COLUMNS = 'id, full_name, display_name, avatar_path, is_admin, is_approved, show_email, created_at';

const AVATAR_BUCKET = 'avatars';
const AVATAR_URL_TTL_SECONDS = 3600;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const AVATAR_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type NameFields = Pick<Profile, 'display_name' | 'full_name'>;

export function profileName(p: NameFields | null | undefined): string {
  return p?.display_name || p?.full_name || 'Unbekannt';
}

export function profileInitial(p: NameFields | null | undefined): string {
  return profileName(p).charAt(0).toUpperCase();
}

export async function fetchProfilesByIds(ids: string[]): Promise<Profile[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data, error } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', unique);
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchApprovedProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('is_approved', true)
    .order('full_name');
  if (error) throw error;
  return (data ?? []) as Profile[];
}

export async function fetchProfileEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_profile_email', { p_id: userId });
  if (error) throw error;
  return typeof data === 'string' && data.length > 0 ? data : null;
}

export async function createAvatarUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .createSignedUrl(path, AVATAR_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export function validateAvatarFile(file: File): string | null {
  if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'Bitte wähle ein Bild im Format JPG, PNG oder WebP.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return 'Das Bild ist zu groß (maximal 2 MB).';
  }
  return null;
}

export async function uploadAvatar(userId: string, file: File, previousPath: string | null): Promise<string> {
  const extension = AVATAR_EXTENSIONS[file.type];
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '3600' });
  if (uploadError) throw uploadError;

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_path: path })
    .eq('id', userId);
  if (updateError) {
    await supabase.storage.from(AVATAR_BUCKET).remove([path]);
    throw updateError;
  }

  if (previousPath) {
    await supabase.storage.from(AVATAR_BUCKET).remove([previousPath]);
  }
  return path;
}
