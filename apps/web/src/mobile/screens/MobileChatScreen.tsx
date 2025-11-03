import React from 'react';
import { useMobileChatStore } from '../store/useMobileChatStore';
import { useMobileStream } from '../hooks/useMobileStream';
import { renderSafeMessage } from '@/utils/renderSafeMessage';
import '@/index.css'; // import shared theme for fonts/colors
import '../styles.css'; // keep mobile positioning only

export const MobileChatScreen: React.FC = () => {
  const { msgs, sending, send } = useMobileChatStore();
  const [val, setVal] = React.useState('');
  useMobileStream('mobile');

  const onSend = () => {
    const text = val.trim();
    if (!text) return;
    void send(text);
    setVal('');
  };

  return (
    <div className="m-app font-sans text-[15px] leading-relaxed text-neutral-100">
      <header className="m-topbar">
        <div className="m-title text-base font-semibold">Assistant</div>
        <a href="/" aria-label="Desktop" className="text-sm opacity-70 hover:opacity-100">Desktop</a>
      </header>

      <main
        className="m-scroll space-y-5 font-sans selection:bg-neutral-700 selection:text-white"
        role="feed"
        aria-label="Messages"
      >
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`transition-opacity duration-200 message-content ${
              m.role === 'user'
                ? 'message-content-user text-right'
                : 'text-left'
            }`}
            dangerouslySetInnerHTML={{ __html: renderSafeMessage(m.content) }}
          />
        ))}
        {sending ? <div className="text-neutral-500 italic">…</div> : null}
        <div style={{ height: 12 }} />
      </main>

      <form className="m-composer" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
        <input
          className="m-input font-sans text-[15px] leading-tight"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          inputMode="text"
          placeholder="Message..."
          aria-label="Type a message"
        />
        <button type="submit" className="m-send text-lg" aria-label="Send">➤</button>
      </form>
    </div>
  );
};

