import { useEffect, useState } from 'react';
import { createAvatarUrl, profileInitial } from '@/lib/profiles';
import type { Profile } from '@/types/database';

type AvatarSize = 'sm' | 'md' | 'lg';

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 rounded-xl text-xs',
  md: 'w-10 h-10 rounded-xl text-sm',
  lg: 'w-20 h-20 rounded-2xl text-2xl',
};

interface UserAvatarProps {
  profile: Pick<Profile, 'display_name' | 'full_name' | 'avatar_path'> | null | undefined;
  size?: AvatarSize;
  className?: string;
}

export default function UserAvatar({ profile, size = 'md', className = '' }: UserAvatarProps) {
  const path = profile?.avatar_path ?? null;
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let active = true;
    createAvatarUrl(path).then((url) => {
      if (active && url) setSigned({ path, url });
    });
    return () => {
      active = false;
    };
  }, [path]);

  const src = path && signed?.path === path ? signed.url : null;

  return (
    <div
      className={`${sizeClasses[size]} bg-brand-100 text-brand-600 font-bold flex items-center justify-center overflow-hidden shrink-0 ${className}`}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        profileInitial(profile)
      )}
    </div>
  );
}
