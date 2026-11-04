import { useMemo, useState, type ReactNode } from 'react';
import { ProfileSheetContext } from '@/lib/profile-sheet';
import ProfileSheet from '@/components/ProfileSheet';

export default function ProfileSheetProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const api = useMemo(() => ({ openProfile: setUserId }), []);

  return (
    <ProfileSheetContext.Provider value={api}>
      {children}
      {userId && <ProfileSheet key={userId} userId={userId} onClose={() => setUserId(null)} />}
    </ProfileSheetContext.Provider>
  );
}
