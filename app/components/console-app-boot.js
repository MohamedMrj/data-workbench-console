'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function ConsoleAppBoot() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;

    const start = () => {
      if (cancelled) {
        return;
      }

      if (typeof window.initConsoleApp === 'function') {
        window.initConsoleApp(pathname).catch((error) => {
          console.error('Failed to initialize console app.', error);
        });
        return;
      }

      window.setTimeout(start, 25);
    };

    start();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
