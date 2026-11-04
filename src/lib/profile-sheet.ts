import { createContext, useContext } from 'react';

export interface ProfileSheetApi {
  openProfile: (userId: string) => void;
}

export const ProfileSheetContext = createContext<ProfileSheetApi>({
  openProfile: () => {},
});

export function useProfileSheet() {
  return useContext(ProfileSheetContext);
}
