import { Loader2 } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-cream-100 flex flex-col items-center justify-center">
      <div className="w-20 h-20 rounded-3xl bg-brand-500 flex items-center justify-center shadow-card mb-4">
        <Loader2 className="w-10 h-10 text-white animate-spin" strokeWidth={2.2} />
      </div>
      <p className="text-sage-400 font-semibold">Clari lädt…</p>
    </div>
  );
}
