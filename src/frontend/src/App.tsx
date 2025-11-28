import { useState, useEffect } from 'react';
import { useMentraAuth } from '@mentra/react';
import Template from './pages/Template';

export default function App() {
  const { userId, isLoading, error, isAuthenticated } = useMentraAuth();
  const [isDark, setIsDark] = useState(true);

  // Log authentication state to console
  useEffect(() => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔐 [Mentra Auth] Authentication State Update');
    console.log('═══════════════════════════════════════════════════');
    console.log('👤 User ID:', userId || 'Not authenticated');
    console.log('🔄 Loading:', isLoading);
    console.log('✅ Authenticated:', isAuthenticated);
    console.log('❌ Error:', error || 'None');
    console.log('🕐 Timestamp:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════════');

    if (isAuthenticated && userId) {
      console.log('✨ User successfully authenticated with ID:', userId);
    }
  }, [userId, isLoading, error, isAuthenticated]);

  // Load theme preference from backend when user authenticates
  useEffect(() => {
    if (isAuthenticated && userId) {
      console.log('🎨 [Theme] Loading theme preference for user:', userId);

      fetch(`/api/theme-preference?userId=${encodeURIComponent(userId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.theme) {
            console.log('🎨 [Theme] Loaded theme preference:', data.theme);
            setIsDark(data.theme === 'dark');
          }
        })
        .catch(error => {
          console.error('🎨 [Theme] Failed to load theme preference:', error);
          // Keep default theme on error
        });
    }
  }, [isAuthenticated, userId]);

  // Handle theme change and save to backend
  const handleThemeChange = async (newIsDark: boolean) => {
    // Update UI immediately for responsive feel
    setIsDark(newIsDark);

    // Save to backend if user is authenticated
    if (userId) {
      const theme = newIsDark ? 'dark' : 'light';
      console.log(`🎨 [Theme] Saving theme preference for user ${userId}:`, theme);

      try {
        const response = await fetch('/api/theme-preference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, theme })
        });

        const data = await response.json();

        if (data.success) {
          console.log('🎨 [Theme] Theme preference saved successfully:', theme);
        } else {
          console.error('🎨 [Theme] Failed to save theme preference:', data);
        }
      } catch (error) {
        console.error('🎨 [Theme] Error saving theme preference:', error);
        // Continue using the theme locally even if save fails
      }
    }
  };

  // Handle loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
          <p className="text-gray-400">Loading authentication...</p>
        </div>
      </div>
    );
  }

  // Handle error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center p-8">
          <h2 className="text-red-500 text-2xl font-semibold mb-4">Authentication Error</h2>
          <p className="text-red-400 font-medium mb-2">{error}</p>
          <p className="text-gray-400 text-sm">
            Please ensure you are opening this page from the MentraOS app.
          </p>
        </div>
      </div>
    );
  }

  // Handle unauthenticated state
  // if (!isAuthenticated || !userId) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-slate-900">
  //       <div className="text-center p-8">
  //         <h2 className="text-red-500 text-2xl font-semibold mb-4">Not Authenticated</h2>
  //         <p className="text-gray-400">Please open this page from the MentraOS manager app.</p>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className={`min-h-screen ${isDark ? 'dark' : 'light'}`} style={{
      background: 'linear-gradient(to bottom right, var(--bg-primary), var(--bg-secondary), var(--bg-tertiary))'
    }}>
      {/* Animated background grid */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 animate-grid-pulse" style={{
          backgroundImage: `linear-gradient(var(--grid-color) 1px, transparent 1px), linear-gradient(90deg, var(--grid-color) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Header */}
      <header className="relative bg-transparent backdrop-blur-xl sticky top-0 z-50">
        <div className="relative px-6 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <svg width="32" height="17" viewBox="0 0 726 387" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect y="215" width="172" height="172" fill="#36C07D"/>
              <path d="M136 0L446 215V387L136 172V0Z" fill="#36C07D"/>
              <path d="M416 0L726 215V387L416 172V0Z" fill="#36C07D"/>
            </svg>
            <span className="font-bold text-lg" style={{ color: isDark ? '#f1f5f9' : 'var(--accent-emerald)' }}>Mentra</span>
          </div>

          {/* User Info */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
            <span className="text-xs text-emerald-400 font-mono">
              {userId?.substring(0, 8)}...
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main>
        <Template isDark={isDark} setIsDark={handleThemeChange} userId={userId || ''} />
      </main>
    </div>
  );
}
