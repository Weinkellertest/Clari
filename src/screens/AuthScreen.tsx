import { useState, type FormEvent } from 'react';
import { Home, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Phase = 'form' | 'logging-in' | 'success';

export default function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('form');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPhase('logging-in');

    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        if (data.user) {
          setInfo('Konto wurde erstellt. Ein Admin muss dich freischalten, bevor du Clari nutzen kannst.');
          setMode('login');
          setPassword('');
          setPhase('form');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPhase('success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Etwas ist schiefgelaufen.';
      setError(msg);
      setPhase('form');
    }
  }

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 rounded-3xl bg-brand-500 flex items-center justify-center shadow-card mb-4">
            {phase === 'logging-in' ? (
              <Loader2 className="w-10 h-10 text-white animate-spin" strokeWidth={2.2} />
            ) : phase === 'success' ? (
              <CheckCircle2 className="w-10 h-10 text-white" strokeWidth={2.2} />
            ) : (
              <Home className="w-10 h-10 text-white" strokeWidth={2.2} />
            )}
          </div>
          <h1 className="text-4xl font-display font-extrabold text-sage-900 tracking-tight">Clari</h1>
          <p className="text-sage-500 mt-1.5 text-center">Adolf-Clarenbach-Haus Bonn</p>
        </div>

        {phase === 'logging-in' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
            <p className="text-sage-600 font-semibold">Anmeldung läuft…</p>
          </div>
        )}

        {phase === 'success' && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <CheckCircle2 className="w-12 h-12 text-sage-500" strokeWidth={2} />
            <p className="text-sage-700 font-semibold text-lg">Anmeldung erfolgreich!</p>
            <p className="text-sage-400 text-sm">Clari wird geladen…</p>
          </div>
        )}

        {phase === 'form' && (
          <>
            <div className="flex rounded-2xl bg-cream-200 p-1 mb-6">
              <button
                onClick={() => { setMode('login'); setError(null); setInfo(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                  mode === 'login' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
                }`}
              >
                Anmelden
              </button>
              <button
                onClick={() => { setMode('signup'); setError(null); setInfo(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition ${
                  mode === 'signup' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
                }`}
              >
                Registrieren
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <label className="label" htmlFor="fullName">Name</label>
                  <input
                    id="fullName"
                    className="input"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dein Name"
                    autoComplete="name"
                  />
                </div>
              )}
              <div>
                <label className="label" htmlFor="email">E-Mail</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@beispiel.de"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label" htmlFor="password">Passwort</label>
                <input
                  id="password"
                  className="input"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mind. 6 Zeichen"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2.5 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}
              {info && (
                <p className="text-sm text-sage-700 bg-sage-50 rounded-xl px-4 py-3">{info}</p>
              )}

              <button type="submit" className="btn-primary w-full">
                {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
