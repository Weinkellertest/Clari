import { AuthProvider, useAuth } from '@/lib/auth';
import AuthScreen from '@/screens/AuthScreen';
import PendingApprovalScreen from '@/screens/PendingApprovalScreen';
import AppShell from '@/screens/AppShell';
import LoadingScreen from '@/screens/LoadingScreen';
import { AlertCircle, LogOut } from 'lucide-react';

function ProfileErrorScreen() {
  const { signOut } = useAuth();
  return (
    <div className="min-h-screen bg-cream-100 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 rounded-3xl bg-red-100 flex items-center justify-center mb-6 mx-auto">
          <AlertCircle className="w-10 h-10 text-red-500" />
        </div>
        <h1 className="text-2xl font-display font-bold text-sage-900 mb-3">
          Profil nicht gefunden
        </h1>
        <p className="text-sage-500 mb-8">
          Dein Konto existiert, aber das Profil konnte nicht geladen werden. Bitte melde dich ab und wieder neu an. Wenn das Problem weiterhin besteht, wende dich an einen Administrator.
        </p>
        <button onClick={signOut} className="btn-secondary w-full">
          <LogOut className="w-5 h-5" /> Abmelden
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { session, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!profile) return <ProfileErrorScreen />;
  if (!profile.is_approved) return <PendingApprovalScreen />;

  return <AppShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
