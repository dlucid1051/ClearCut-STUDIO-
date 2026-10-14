import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { WifiOff, Sparkles } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-amber-600/90 backdrop-blur-md px-3.5 py-2 text-xs font-semibold text-white shadow-xl border border-amber-400/30 animate-in slide-in-from-bottom duration-300">
      <WifiOff className="w-4 h-4 animate-pulse text-amber-200" />
      <span>Offline Mode active — AI processing runs 100% locally in your browser</span>
      <Sparkles className="w-3.5 h-3.5 text-amber-200" />
    </div>
  );
};
