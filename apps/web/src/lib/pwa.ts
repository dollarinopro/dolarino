import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPromptGlobal: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPromptGlobal = e as BeforeInstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
}

export function usePwaInstall() {
  const [, setTick] = useState(0);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const update = () => setTick((t) => t + 1);
    listeners.add(update);
    const mq = window.matchMedia?.('(display-mode: standalone)');
    const nav = window.navigator as Navigator & { standalone?: boolean };
    setIsInstalled(Boolean(mq?.matches || nav.standalone));

    const onInstalled = () => {
      deferredPromptGlobal = null;
      setIsInstalled(true);
      update();
    };
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      listeners.delete(update);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canPromptNatively = Boolean(deferredPromptGlobal);
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const isWindows = /Windows/i.test(ua);
  const isAndroid = /Android/i.test(ua);

  const promptInstall = async (): Promise<'installed' | 'dismissed' | 'manual'> => {
    if (!deferredPromptGlobal) return 'manual';
    await deferredPromptGlobal.prompt();
    const res = await deferredPromptGlobal.userChoice;
    if (res.outcome === 'accepted') {
      deferredPromptGlobal = null;
      setTick((t) => t + 1);
      return 'installed';
    }
    return 'dismissed';
  };

  return {
    canPromptNatively,
    isInstalled,
    isIos,
    isWindows,
    isAndroid,
    promptInstall,
  };
}
