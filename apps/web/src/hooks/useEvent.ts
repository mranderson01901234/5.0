import * as React from 'react';

/**
 * useEvent hook - maintains a stable function reference while always calling the latest version
 * This avoids needing to include functions in dependency arrays that change every render
 * 
 * @example
 * const handleClick = useEvent(() => {
 *   console.log(propValue); // Always uses latest propValue
 * });
 * useEffect(() => {
 *   window.addEventListener('click', handleClick);
 *   return () => window.removeEventListener('click', handleClick);
 * }, [handleClick]); // handleClick is stable, so effect only runs once
 */
export function useEvent<T extends (...args: any[]) => any>(fn: T): T {
  const ref = React.useRef(fn);
  ref.current = fn;
  // @ts-expect-error correct generic return shape
  return React.useCallback(((...args) => ref.current(...args)) as T, []);
}

