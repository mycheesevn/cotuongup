"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<(e: BeforeInstallPromptEvent | null) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    promptListeners.forEach((cb) => cb(deferredPrompt));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    promptListeners.forEach((cb) => cb(null));
  });
}

function notifyPrompt(e: BeforeInstallPromptEvent | null) {
  promptListeners.forEach((cb) => cb(e));
}

/** True when already running as an installed app. */
export function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true
  );
}

/** True on iOS/iPadOS (no beforeinstallprompt — manual install only). */
export function isIos(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined")
    return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/**
 * PWA install state. On Android/desktop Chrome the browser fires
 * beforeinstallprompt and we can trigger the native install dialog.
 * On iOS we show manual instructions instead.
 */
export function usePwaInstall() {
  const [promptEvent, setPromptEvent] =
    useState<BeforeInstallPromptEvent | null>(deferredPrompt);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isInstalled());
    setIos(isIos());
    setPromptEvent(deferredPrompt);
    const cb = (e: BeforeInstallPromptEvent | null) => setPromptEvent(e);
    promptListeners.add(cb);
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      promptListeners.delete(cb);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      notifyPrompt(null);
      setInstalled(true);
      return true;
    }
    return false;
  }, []);

  return {
    /** Native install prompt is available (Android/desktop Chrome/Edge). */
    canPrompt: !!promptEvent && !installed,
    /** Show the button at all (hide when already installed). */
    showInstall: !installed,
    isIos: ios,
    promptInstall,
  };
}
