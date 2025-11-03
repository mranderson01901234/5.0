import React from 'react';
import { useMobileChatStore } from '../store/useMobileChatStore';
import { clearQueue, getQueueSize } from '../services/offlineQueue';
import '@/index.css';
import '../styles.css';

export const MobileSettingsScreen: React.FC = () => {
  const clearMessages = useMobileChatStore((s) => s.clearMessages);
  const [queueSize, setQueueSize] = React.useState(0);

  React.useEffect(() => {
    void getQueueSize().then(setQueueSize);
  }, []);

  const handleClearMessages = () => {
    if (confirm('Clear all messages from this device?')) {
      clearMessages();
    }
  };

  const handleClearQueue = async () => {
    if (confirm('Clear all queued messages?')) {
      await clearQueue();
      setQueueSize(0);
    }
  };

  return (
    <div className="m-app font-sans text-[15px] leading-relaxed text-neutral-100">
      <header className="m-topbar">
        <a href="/mobile.html" className="text-sm opacity-70 hover:opacity-100">
          ← Back
        </a>
        <div className="m-title text-base font-semibold">Settings</div>
        <div className="w-12" />
      </header>

      <main className="m-scroll space-y-6 p-4">
        <section>
          <h2 className="text-lg font-semibold mb-4">Chat</h2>
          <button
            onClick={handleClearMessages}
            className="w-full px-4 py-3 bg-neutral-800 rounded-lg text-left hover:bg-neutral-700 transition-colors"
          >
            Clear Chat History
          </button>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">Offline Queue</h2>
          <div className="space-y-3">
            <div className="px-4 py-3 bg-neutral-800 rounded-lg">
              <div className="text-sm text-neutral-400">Queued Messages</div>
              <div className="text-2xl font-semibold">{queueSize}</div>
            </div>
            {queueSize > 0 && (
              <button
                onClick={handleClearQueue}
                className="w-full px-4 py-3 bg-red-900/30 text-red-400 rounded-lg text-left hover:bg-red-900/50 transition-colors"
              >
                Clear Queue
              </button>
            )}
          </div>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-4">About</h2>
          <div className="space-y-2 text-sm text-neutral-400">
            <div className="px-4 py-3 bg-neutral-800 rounded-lg">
              <div className="font-medium text-neutral-200">Version</div>
              <div>Mobile PWA v1.0.0</div>
            </div>
            <div className="px-4 py-3 bg-neutral-800 rounded-lg">
              <div className="font-medium text-neutral-200">Features</div>
              <ul className="mt-2 space-y-1">
                <li>✓ Offline support</li>
                <li>✓ Message queuing</li>
                <li>✓ Virtualized scrolling</li>
                <li>✓ PWA installable</li>
              </ul>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
