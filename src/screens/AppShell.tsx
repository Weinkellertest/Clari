import { useState } from 'react';
import { Home, MessageCircle, CalendarDays, Wallet, Menu, X, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import HomeScreen from '@/screens/HomeScreen';
import ChatsScreen from '@/screens/ChatsScreen';
import CalendarScreen from '@/screens/CalendarScreen';
import FinanceScreen from '@/screens/FinanceScreen';
import ListsScreen from '@/screens/ListsScreen';
import DutiesScreen from '@/screens/DutiesScreen';
import InfoFilesScreen from '@/screens/InfoFilesScreen';
import MoreScreen from '@/screens/MoreScreen';
import AdminScreen from '@/screens/AdminScreen';
import ChronikScreen from '@/screens/ChronikScreen';
import MinifactsScreen from '@/screens/MinifactsScreen';
import GamesScreen from '@/screens/GamesScreen';

type Tab = 'home' | 'chats' | 'calendar' | 'finance' | 'more';
type SecondaryTab = 'lists' | 'duties' | null;
type Overlay = 'admin' | 'info' | 'chronik' | 'minifacts' | 'games' | null;

const tabs: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Start', icon: Home },
  { id: 'chats', label: 'Chats', icon: MessageCircle },
  { id: 'calendar', label: 'Kalender', icon: CalendarDays },
  { id: 'finance', label: 'Finanzen', icon: Wallet },
  { id: 'more', label: 'Mehr', icon: Menu },
];

export default function AppShell() {
  const [tab, setTab] = useState<Tab>('home');
  const [secondaryTab, setSecondaryTab] = useState<SecondaryTab>(null);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const { profile } = useAuth();
  const greetingName = profile?.display_name || profile?.full_name || 'Clari';

  function navigateToTab(newTab: Tab) {
    setSecondaryTab(null);
    setTab(newTab);
  }

  function openSecondary(name: 'lists' | 'duties') {
    setSecondaryTab(name);
  }

  let screenContent: React.ReactNode;

  if (secondaryTab === 'lists') {
    screenContent = <SecondaryScreen title="Listen" onBack={() => { setSecondaryTab(null); setTab('more'); }}><ListsScreen /></SecondaryScreen>;
  } else if (secondaryTab === 'duties') {
    screenContent = <SecondaryScreen title="Dienste" onBack={() => { setSecondaryTab(null); setTab('more'); }}><DutiesScreen /></SecondaryScreen>;
  } else if (tab === 'home') {
    screenContent = <HomeScreen onNavigate={navigateToTab} onOpenSecondary={openSecondary} onOpenGames={() => setOverlay('games')} />;
  } else if (tab === 'chats') {
    screenContent = <ChatsScreen />;
  } else if (tab === 'calendar') {
    screenContent = <CalendarScreen />;
  } else if (tab === 'finance') {
    screenContent = <FinanceScreen />;
  } else if (tab === 'more') {
    screenContent = (
      <MoreScreen
        onOpenAdmin={() => setOverlay('admin')}
        onOpenInfo={() => setOverlay('info')}
        onOpenChronik={() => setOverlay('chronik')}
        onOpenMinifacts={() => setOverlay('minifacts')}
        onOpenGames={() => setOverlay('games')}
        onOpenLists={() => openSecondary('lists')}
        onOpenDuties={() => openSecondary('duties')}
        onNavigate={navigateToTab}
      />
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 flex flex-col max-w-md mx-auto">
      <header className="sticky top-0 z-20 bg-cream-50/90 backdrop-blur-sm border-b border-cream-200">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h1 className="text-2xl font-display font-extrabold text-sage-900 tracking-tight">Clari</h1>
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center text-brand-600 font-bold text-sm">
            {greetingName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24">
        {screenContent}
      </main>

      {overlay === 'admin' && (
        <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto overflow-y-auto">
          <AdminScreen onBack={() => setOverlay(null)} />
        </div>
      )}
      {overlay === 'info' && (
        <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto overflow-y-auto">
          <InfoFilesScreen />
          <OverlayCloseButton onClose={() => setOverlay(null)} />
        </div>
      )}
      {overlay === 'chronik' && (
        <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto overflow-y-auto">
          <ChronikScreen />
          <OverlayCloseButton onClose={() => setOverlay(null)} />
        </div>
      )}
      {overlay === 'minifacts' && (
        <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto overflow-y-auto">
          <MinifactsScreen />
          <OverlayCloseButton onClose={() => setOverlay(null)} />
        </div>
      )}
      {overlay === 'games' && (
        <div className="fixed inset-0 z-30 bg-cream-100 max-w-md mx-auto overflow-y-auto">
          <GamesScreen />
          <OverlayCloseButton onClose={() => setOverlay(null)} />
        </div>
      )}

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white border-t border-cream-200 z-20">
        <div className="flex items-stretch justify-around px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.map(({ id, label, icon: Icon }) => {
            const active = tab === id && secondaryTab === null;
            return (
              <button
                key={id}
                onClick={() => navigateToTab(id)}
                className="flex flex-col items-center gap-1 flex-1 py-1.5 transition"
              >
                <span
                  className={`flex items-center justify-center w-12 h-8 rounded-2xl transition ${
                    active ? 'bg-brand-100 text-brand-600' : 'text-sage-400'
                  }`}
                >
                  <Icon className="w-5.5 h-5.5" strokeWidth={active ? 2.4 : 2} style={{ width: 22, height: 22 }} />
                </span>
                <span className={`text-[11px] font-semibold ${active ? 'text-brand-700' : 'text-sage-400'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SecondaryScreen({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 bg-cream-50/90 backdrop-blur-sm border-b border-cream-200 px-5 py-3 flex items-center gap-3">
        <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white border border-cream-200 flex items-center justify-center text-sage-600 shadow-soft">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-display font-bold text-sage-900">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function OverlayCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <div className="sticky bottom-0 bg-cream-50/90 backdrop-blur-sm border-t border-cream-200 px-5 py-3">
      <button onClick={onClose} className="text-sm font-semibold text-sage-600 flex items-center gap-1">
        <X className="w-4 h-4" /> Schließen
      </button>
    </div>
  );
}
