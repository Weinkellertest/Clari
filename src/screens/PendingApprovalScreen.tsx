import { Hourglass, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function PendingApprovalScreen() {
  const { signOut } = useAuth();

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="w-20 h-20 rounded-3xl bg-brand-100 flex items-center justify-center mb-6 mx-auto">
          <Hourglass className="w-10 h-10 text-brand-500" />
        </div>
        <h1 className="text-2xl font-display font-bold text-sage-900 mb-3">
          Warte auf Freischaltung
        </h1>
        <p className="text-sage-500 mb-8">
          Dein Konto wurde erstellt, aber ein Administrator muss dich noch freischalten, bevor du Clari nutzen kannst.
        </p>
        <button onClick={signOut} className="btn-secondary w-full">
          <LogOut className="w-5 h-5" /> Abmelden
        </button>
      </div>
    </div>
  );
}
