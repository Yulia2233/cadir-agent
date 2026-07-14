import { useEffect, useState } from 'react';
import { useLocalStorageState } from './useLocalStorageState';

export type ThemePreference = 'light' | 'dark' | 'system';

export function useColorScheme() {
  const [preference, setPreference] = useLocalStorageState<ThemePreference>(
    'cadir.theme',
    'system',
  );
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return {
    preference,
    resolved: preference === 'system' ? (systemDark ? 'dark' : 'light') : preference,
    setPreference,
  } as const;
}
