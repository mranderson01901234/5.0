import * as React from 'react';

/**
 * useDebouncedEffect - delays execution of an effect until after dependencies haven't changed for a specified duration
 * 
 * @param effect - The effect function to execute
 * @param deps - Dependency array (similar to useEffect)
 * @param ms - Delay in milliseconds before executing the effect
 * 
 * @example
 * useDebouncedEffect(() => {
 *   fetchData(searchTerm);
 * }, [searchTerm], 300); // Wait 300ms after searchTerm stops changing
 */
export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  ms: number
): void {
  React.useEffect(() => {
    const id = setTimeout(() => {
      effect();
    }, ms);

    return () => {
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, ms]);
}

