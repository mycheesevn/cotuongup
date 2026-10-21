/** Share helpers: native share sheet on mobile, graceful fallbacks elsewhere. */

import { fetchMyReferralCode } from "@/lib/supabase/referral";

export type ShareOutcome = "shared" | "downloaded" | "failed";

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}

export function canNativeShareFiles(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "canShare" in navigator &&
    (() => {
      try {
        return navigator.canShare({
          files: [new File(["x"], "t.png", { type: "image/png" })],
        });
      } catch {
        return false;
      }
    })()
  );
}

export interface SharePayload {
  file: File;
  fileName: string;
  title: string;
  /** Text accompanying the share (includes the deep link). */
  text: string;
  /** Deep link, copied when native share isn't available. */
  url: string;
}

/** Canonical public URL for this game — every shared text must carry it. */
export const CANONICAL_URL = "https://cotuongup.synerworlds.com";

/**
 * Normalize a caller-supplied share URL onto the canonical host, preserving
 * its path/query/hash. Guards against stale origins (e.g. *.vercel.app or
 * localhost captured from the page origin) leaking into shared text.
 */
function canonicalShareUrl(raw: string): string {
  if (raw.includes(CANONICAL_URL)) return raw;
  try {
    const u = new URL(raw);
    return `${CANONICAL_URL}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return CANONICAL_URL;
  }
}

/**
 * Share a result card image. Prefers the native share sheet (Zalo, Facebook,
 * Messenger…); falls back to downloading the image + copying the link.
 */
export async function shareResultCard(p: SharePayload): Promise<ShareOutcome> {
  const url = canonicalShareUrl(p.url);
  // Always embed the (canonical) deep link in the shared text, so the text
  // itself contains the full clickable https://cotuongup.synerworlds.com URL
  // even where the receiver's app ignores the separate `url` field.
  const text = p.text.includes(url) ? p.text : `${p.text}\n${url}`;
  if (canNativeShareFiles()) {
    try {
      await navigator.share({ files: [p.file], title: p.title, text, url });
      return "shared";
    } catch (e) {
      // User dismissed the sheet — not an error.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  // Fallback: download the image and copy the link.
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(p.file);
    a.download = p.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch {
    return "failed";
  }
  await copyText(text);
  return "downloaded";
}

/**
 * Site origin for share/invite links — ALWAYS the canonical production
 * host. Never the page origin: a link shared from a preview deploy
 * or localhost must still point at the real site (family rule, 2026-10-21
 * share-URL audit).
 */
export function siteOrigin(): string {
  return CANONICAL_URL;
}

let refCodeCache: string | null | undefined; // undefined = not fetched yet

/**
 * Build a share link, auto-attaching the sharer's referral code (?ref=) when
 * logged in — so enthusiastic members earn +20 XP for everyone who joins
 * through their shared links. Falls back to the plain link for guests.
 */
export async function shareLink(path: string): Promise<string> {
  const base = `${siteOrigin()}${path}`;
  try {
    if (refCodeCache === undefined) refCodeCache = await fetchMyReferralCode();
    if (refCodeCache) {
      return `${base}${base.includes("?") ? "&" : "?"}ref=${refCodeCache}`;
    }
  } catch {
    /* ignore — share without referral */
  }
  return base;
}
