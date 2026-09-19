import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { AuthModal } from './components/AuthModal';
import { CreatePollModal } from './components/CreatePollModal';
import { DashboardPage } from './pages/DashboardPage';
import { VotePage } from './pages/VotePage';

function MainApp() {
  const { isAuthenticated } = useAuth();
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [isCreatePollOpen, setIsCreatePollOpen] = useState(false);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  const handleOpenAuth = (mode = 'login') => {
    setAuthMode(mode);
    setIsAuthOpen(true);
  };

  const handleOpenCreatePoll = () => {
    if (!isAuthenticated) {
      handleOpenAuth('login');
      return;
    }
    setIsCreatePollOpen(true);
  };

  // Route matching: /vote/:id or /polls/:id
  const voteMatch = currentPath.match(/^\/(?:vote|polls)\/([a-fA-F0-9]{24})/);
  const activePollId = voteMatch ? voteMatch[1] : null;

  return (
    <div className="min-h-screen bg-[#0b0f19] flex flex-col text-slate-100 font-['Plus_Jakarta_Sans',sans-serif]">
      <Navbar
        onOpenAuth={handleOpenAuth}
        onOpenCreatePoll={handleOpenCreatePoll}
        currentView={activePollId ? 'vote' : 'dashboard'}
        navigateTo={navigateTo}
      />

      <main className="flex-1">
        {activePollId ? (
          <VotePage pollId={activePollId} navigateTo={navigateTo} />
        ) : (
          <DashboardPage
            onOpenCreatePoll={handleOpenCreatePoll}
            onOpenAuth={handleOpenAuth}
            navigateTo={navigateTo}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500 bg-slate-950/40">
        <p>PulsePoll • Real-Time Polling Engine built with React, Go, Gin, MongoDB & Redis Pub/Sub</p>
      </footer>

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        initialMode={authMode}
        onSuccess={() => {
          setIsAuthOpen(false);
          navigateTo('/');
        }}
      />

      <CreatePollModal
        isOpen={isCreatePollOpen}
        onClose={() => setIsCreatePollOpen(false)}
        onPollCreated={(createdPoll) => {
          // Navigate to the newly created poll's voting page immediately!
          navigateTo(`/vote/${createdPoll.id}`);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
