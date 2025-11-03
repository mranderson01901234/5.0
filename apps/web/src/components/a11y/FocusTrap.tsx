// src/components/a11y/FocusTrap.tsx

import React from 'react';

type Props = { active?: boolean; children: React.ReactNode };

export const FocusTrap: React.FC<Props> = ({ active = true, children }) => {
  const startRef = React.useRef<HTMLSpanElement>(null);
  const endRef = React.useRef<HTMLSpanElement>(null);

  const onFocus = (e: React.FocusEvent<HTMLSpanElement>) => {
    if (!active) return;
    const root = e.currentTarget.parentElement!;
    const focusables = root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.currentTarget === startRef.current) last?.focus();
    else first?.focus();
  };

  return (
    <>
      <span tabIndex={active ? 0 : -1} ref={startRef} onFocus={onFocus} aria-hidden="true" />
      {children}
      <span tabIndex={active ? 0 : -1} ref={endRef} onFocus={onFocus} aria-hidden="true" />
    </>
  );
};

