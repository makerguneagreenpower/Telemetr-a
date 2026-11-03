'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { Moon, Sun } from 'lucide-react';
import { ThemeProvider, useTheme } from 'next-themes';

const subscribe = () => () => {};

export default function ThemeControls({ children }: { children: ReactNode }) {
    return <ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem={false} storageKey="mgrt-theme" disableTransitionOnChange>
        {children}
        <ThemeToggle />
    </ThemeProvider>;
}

function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const mounted = useSyncExternalStore(subscribe, () => true, () => false);
    const dark = mounted && resolvedTheme === 'dark';
    const label = dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
    return <button type="button" className="theme-toggle" aria-label={label} title={label} disabled={!mounted} onClick={() => setTheme(dark ? 'light' : 'dark')}>
        {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        <span>{dark ? 'Tema claro' : 'Tema oscuro'}</span>
    </button>;
}
