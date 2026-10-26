'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

const ColorModeContext = createContext({
  mode: 'light',
  toggleColorMode: () => {},
});
export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState('light');
  useEffect(() => {
    try {
      setMode(
        localStorage.getItem('astra-color-mode') === 'dark' ? 'dark' : 'light',
      );
    } catch {
      /* Storage can be disabled. */
    }
  }, []);
  useEffect(() => {
    document.documentElement.dataset.colorMode = mode;
  }, [mode]);
  function toggleColorMode() {
    setMode((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      try {
        localStorage.setItem('astra-color-mode', next);
      } catch {
        /* Session theme still works. */
      }
      return next;
    });
  }
  return (
    <ColorModeContext.Provider value={{ mode, toggleColorMode }}>
      {children}
    </ColorModeContext.Provider>
  );
}
export const useColorMode = () => useContext(ColorModeContext);
