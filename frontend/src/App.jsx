import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { WalletProvider } from './context/WalletContext';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import MeetingRoom from './pages/MeetingRoom';
import Reputation from './pages/Reputation';
import Governance from './pages/Governance';
import Verify from './pages/Verify'; // New
import Login from './pages/Login';
import AuthGate from './components/AuthGate';
import { useWallet } from './hooks/useWallet';

const projectId = import.meta.env.VITE_HUDDLE_PROJECT_ID;
// Huddle removed

function AppContent() {
  const { account, connectWallet } = useWallet();
  const location = useLocation();
  const isMeetingRoom = location.pathname.startsWith('/meeting/') || location.pathname.startsWith('/room/');

  return (
    <div className="min-h-screen bg-black text-white font-sans antialiased selection:bg-white selection:text-black">
      {!isMeetingRoom && <Navbar account={account} connectWallet={connectWallet} />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={<AuthGate><Dashboard /></AuthGate>} />
        <Route path="/meetings" element={<AuthGate><Dashboard /></AuthGate>} />
        <Route path="/meeting/:roomId" element={<AuthGate><MeetingRoom /></AuthGate>} />
        <Route path="/room/:roomId" element={<AuthGate><MeetingRoom /></AuthGate>} />
        <Route path="/reputation" element={<AuthGate><Reputation /></AuthGate>} />
        <Route path="/governance" element={<AuthGate><Governance /></AuthGate>} />
        <Route path="/verify" element={<AuthGate><Verify /></AuthGate>} />
      </Routes>
    </div>
  );
}

import { ToastProvider } from './context/ToastContext';

function App() {
  return (
    <ToastProvider>
      <WalletProvider>
        <Router>
          <AppContent />
        </Router>
      </WalletProvider>
    </ToastProvider>
  );
}

export default App;
