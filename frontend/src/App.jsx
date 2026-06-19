// StuntCock — Root application shell
import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar.jsx';
import SetupWizard from './components/SetupWizard.jsx';
import MessageFeed from './components/MessageFeed.jsx';
import RulesEditor from './components/RulesEditor.jsx';
import Settings from './components/Settings.jsx';
import Analytics from './components/Analytics.jsx';
import Personas from './components/Personas.jsx';
import CrashBanner from './components/CrashBanner.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { useWebSocket } from './hooks/useWebSocket.js';
import { API } from './lib/utils.js';

const PAGE_TITLES = {
  feed:      'Message Feed',
  rules:     'Rules',
  personas:  'Personas',
  analytics: 'Analytics',
  settings:  'Settings',
};

function AppInner() {
  const [page, setPage] = useState('feed');
  const [setupDone, setSetupDone] = useState(null);
  const [signalStatus, setSignalStatus] = useState({ running: false });
  const [whatsappStatus, setWhatsappStatus] = useState({ running: false, authenticated: false });
  const [stats, setStats] = useState({});
  const [crashMessage, setCrashMessage] = useState('');
  const [liveMessages, setLiveMessages] = useState([]);
  const toast = useToast();

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/settings`).then(r => r.json()).catch(() => ({})),
      fetch(`${API}/api/signal/status`).then(r => r.json()).catch(() => ({ running: false })),
      fetch(`${API}/api/whatsapp/status`).then(r => r.json()).catch(() => ({ running: false })),
      fetch(`${API}/api/analytics`).then(r => r.json()).catch(() => ({})),
    ]).then(([settings, signalSt, waSt, analytics]) => {
      setSetupDone(settings.setup_complete === 'true');
      setSignalStatus(signalSt);
      setWhatsappStatus(waSt);
      setStats({
        total: analytics.today?.total ?? 0,
        replied: analytics.today?.replied ?? 0,
        activeRules: analytics.activeRules ?? 0,
      });
    });
  }, []);

  useWebSocket((event, data) => {
    if (event === 'message') {
      setLiveMessages(prev => [...prev, data]);
      setStats(s => ({
        ...s,
        total: (s.total || 0) + 1,
        replied: data.response_type !== 'none' ? (s.replied || 0) + 1 : (s.replied || 0),
      }));
    } else if (event === 'signal_status') {
      setSignalStatus(s => ({ ...s, ...data }));
    } else if (event === 'signal_crashed') {
      setCrashMessage('StuntCock lost its Signal connection. Reconnecting…');
    } else if (event === 'whatsapp_status') {
      setWhatsappStatus(s => ({ ...s, ...data }));
    } else if (event === 'error') {
      toast(data.message, 'error');
    }
  });

  if (setupDone === null) {
    return (
      <div className="h-screen flex items-center justify-center" style={{
        background: 'linear-gradient(135deg, #0B1535 0%, #172255 60%, #0E1C48 100%)',
      }}>
        <div className="flex items-center gap-3">
          <img src="/sc_bubble.jpg" alt="" className="w-8 h-8 opacity-50" style={{ objectFit: 'cover', borderRadius: '22%' }} />
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading StuntCock…</span>
        </div>
      </div>
    );
  }

  if (!setupDone) {
    return <SetupWizard onComplete={() => setSetupDone(true)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{
      background: 'linear-gradient(135deg, #0B1535 0%, #172255 50%, #0E1C48 100%)',
    }}>
      <Sidebar page={page} setPage={setPage} signalStatus={signalStatus} whatsappStatus={whatsappStatus} stats={stats} />

      <main className="flex-1 flex flex-col min-w-0">
        {crashMessage && <CrashBanner message={crashMessage} onDismiss={() => setCrashMessage('')} />}

        {/* Page header */}
        <div className="px-5 py-4 flex-shrink-0" style={{
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(8,13,40,0.3)',
          backdropFilter: 'blur(8px)',
        }}>
          <h1 className="text-white font-semibold text-base">{PAGE_TITLES[page]}</h1>
        </div>

        {page === 'feed'      && <MessageFeed liveMessages={liveMessages} />}
        {page === 'rules'     && <RulesEditor />}
        {page === 'personas'  && <Personas />}
        {page === 'analytics' && <Analytics />}
        {page === 'settings'  && <Settings />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
