import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import { AdminAuth } from './components/AdminPanel/AdminAuth';
import { AdminLayout } from './components/AdminPanel/AdminLayout';

const AdminAppContent: React.FC = () => {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('real_ludo_admin_logged');
      if (saved === 'false') return false;
      return true;
    } catch {
      return true;
    }
  });

  const handleAdminLoginSuccess = () => {
    setIsAdminAuthenticated(true);
    try {
      localStorage.setItem('real_ludo_admin_logged', 'true');
    } catch {}
  };

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    try {
      localStorage.removeItem('real_ludo_admin_logged');
    } catch {}
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none sm:select-auto">
      {isAdminAuthenticated ? (
        <AdminLayout
          onLogoutAdmin={handleAdminLogout}
          onSwitchToUserApp={() => window.open('/', '_blank')}
        />
      ) : (
        <AdminAuth
          onSuccess={handleAdminLoginSuccess}
          onBackToApp={() => window.open('/', '_blank')}
        />
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AdminAppContent />
    </AppProvider>
  );
}
