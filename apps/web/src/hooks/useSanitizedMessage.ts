import { useEffect, useState } from 'react';
import { renderSafeMessageAsync } from '../utils/renderSafeMessage';

export function useSanitizedMessage(text: string): string {
  const [safeHtml, setSafeHtml] = useState<string>('');

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const out = await renderSafeMessageAsync(text);
        if (alive) setSafeHtml(out);
      } catch (error) {
        console.error('Worker error:', error);
        // Fallback to empty string
        if (alive) setSafeHtml('');
      }
    };
    void run();
    return () => { alive = false; };
  }, [text]);

  return safeHtml;
}
