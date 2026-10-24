"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/supabase/AuthContext";
import { getSupabase } from "@/lib/supabase/client";
import {
  fetchProfile,
  updateProfile,
  uploadAvatar,
  type UserProfile,
} from "@/lib/supabase/profile";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import {
  displayName as dispName,
  levelForXp,
  ratingTitle,
  START_RATING,
} from "@/lib/jieqi/rating";
import { shareAchievement } from "@/lib/jieqi/achievementCard";
import { ReferralCard } from "./ReferralCard";

interface Props {
  lang: Lang;
  onClose: () => void;
}

export function ProfileView({ lang, onClose }: Props) {
  const s = STR[lang];
  const { user, changePassword } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullName, setFullName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBust, setAvatarBust] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [stats, setStats] = useState<{
    rating: number;
    xp: number;
    invites: number;
    refXp: number;
  } | null>(null);
  const [sharingAch, setSharingAch] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile().then((p) => {
      setProfile(p);
      if (p) {
        setFullName(p.full_name ?? "");
        setBirthDate(p.birth_date ?? "");
        setCity(p.city ?? "");
        setCountry(p.country ?? "");
        setAvatarUrl(p.avatar_url);
      }
      setLoading(false);
    });
    // Rating/XP for the achievement card.
    (async () => {
      try {
        const sb = getSupabase();
        if (!sb) return;
        const {
          data: { user: u },
        } = await sb.auth.getUser();
        if (!u) return;
        const { data } = await sb
          .from("profiles")
          .select("rating,xp,referral_invites,referral_xp_earned")
          .eq("id", u.id)
          .maybeSingle();
        if (data) {
          setStats({
            rating: data.rating ?? START_RATING,
            xp: data.xp ?? 0,
            invites: data.referral_invites ?? 0,
            refXp: data.referral_xp_earned ?? 0,
          });
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  /** Share the user's profile as an achievement card. */
  const shareProfile = async () => {
    if (sharingAch) return;
    setSharingAch(true);
    try {
      const name =
        profile?.full_name?.trim() ||
        dispName(profile?.username ?? null, user?.email ?? null, lang);
      const rating = stats?.rating ?? START_RATING;
      const level = levelForXp(stats?.xp ?? 0);
      const title = ratingTitle(rating, lang);
      const outcome = await shareAchievement(
        "profile",
        {
          title: s.achProfileTitle,
          displayName: name,
          playerTitle: title,
          rating,
          level,
        },
        lang
      );
      setShareToast(outcome === "shared" ? s.shareDone : s.shareDownloaded);
      window.setTimeout(() => setShareToast(null), 4000);
    } catch {
      /* ignore */
    } finally {
      setSharingAch(false);
    }
  };

  const onPickAvatar = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setSaved(false);
    const { url, error: err } = await uploadAvatar(file);
    setUploading(false);
    if (err || !url) {
      setError(err ?? "Upload failed");
      return;
    }
    const saveErr = await updateProfile({ avatar_url: url });
    if (saveErr) {
      setError(saveErr);
      return;
    }
    setAvatarUrl(url);
    setAvatarBust(Date.now());
    setSaved(true);
  };

  const onSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const err = await updateProfile({
      full_name: fullName.trim() || null,
      birth_date: birthDate || null,
      city: city.trim() || null,
      country: country.trim() || null,
    });
    setSaving(false);
    if (err) setError(err);
    else setSaved(true);
  };

  const avatarSrc = avatarUrl ? `${avatarUrl}?v=${avatarBust}` : null;

  const onChangePassword = async () => {
    setPwMsg(null);
    if (pw1.length < 6) {
      setPwMsg({ ok: false, text: s.passwordTooShort });
      return;
    }
    if (pw1 !== pw2) {
      setPwMsg({ ok: false, text: s.passwordMismatch });
      return;
    }
    setPwBusy(true);
    const { error: err } = await changePassword(pw1);
    setPwBusy(false);
    if (err) {
      setPwMsg({ ok: false, text: err });
    } else {
      setPwMsg({ ok: true, text: s.passwordChanged });
      setPw1("");
      setPw2("");
    }
  };

  return (
    <div className="cu-modal-backdrop" onClick={onClose}>
      <div
        className="cu-modal cu-profile-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={s.profile}
      >
        <div className="cu-profile-head">
          <h2>👤 {s.profile}</h2>
          <button
            type="button"
            className="cu-btn cu-btn-icon"
            onClick={onClose}
            aria-label={s.authClose}
          >
            ✕
          </button>
        </div>
        {loading ? (
          <p className="cu-muted">…</p>
        ) : (
          <>
            <div className="cu-profile-avatar-row">
              <div className="cu-profile-avatar">
                {avatarSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarSrc} alt={s.profileAvatar} />
                ) : (
                  <span>👤</span>
                )}
              </div>
              <div>
                <button
                  type="button"
                  className="cu-btn small"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? s.profileUploading : s.profileChangeAvatar}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    onPickAvatar(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
            <label className="cu-field">
              <span>{s.profileFullName}</span>
              <input
                className="cu-input"
                value={fullName}
                maxLength={80}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={profile?.username ?? ""}
              />
            </label>
            <label className="cu-field">
              <span>{s.profileBirthDate}</span>
              <input
                className="cu-input"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <label className="cu-field">
              <span>{s.profileCity}</span>
              <input
                className="cu-input"
                value={city}
                maxLength={80}
                onChange={(e) => setCity(e.target.value)}
              />
            </label>
            <label className="cu-field">
              <span>{s.profileCountry}</span>
              <input
                className="cu-input"
                value={country}
                maxLength={80}
                onChange={(e) => setCountry(e.target.value)}
              />
            </label>
            <div className="cu-profile-readonly">
              <div>
                <span className="cu-muted">{s.profileUsername}: </span>
                <strong>{profile?.username ?? "—"}</strong>
              </div>
              <div>
                <span className="cu-muted">{s.profileEmail}: </span>
                <strong>{user?.email ?? "—"}</strong>
              </div>
            </div>
            {error && <p className="cu-error">{error}</p>}
            {saved && <p className="cu-ok">{s.profileSaved}</p>}
            <button
              type="button"
              className="cu-btn cu-btn-primary cu-profile-save"
              onClick={onSave}
              disabled={saving || uploading}
            >
              {saving ? "…" : s.profileSave}
            </button>
            <button
              type="button"
              className="cu-btn cu-profile-save"
              onClick={shareProfile}
              disabled={sharingAch}
            >
              {sharingAch ? "…" : s.achShare}
            </button>
            {shareToast && <div className="cu-toast">{shareToast}</div>}
            {stats && stats.invites > 0 && (
              <div className="cu-ambassador-line">
                🎁 {fmt(s.ambStats, { invites: stats.invites, xp: stats.refXp })}
              </div>
            )}
            <ReferralCard lang={lang} />
            <div className="cu-profile-pw">
              <h3>🔑 {s.changePassword}</h3>
              <input
                className="cu-input"
                type="password"
                autoComplete="new-password"
                placeholder={s.newPassword}
                value={pw1}
                onChange={(e) => setPw1(e.target.value)}
              />
              <input
                className="cu-input"
                type="password"
                autoComplete="new-password"
                placeholder={s.confirmPassword}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
              <button
                type="button"
                className="cu-btn"
                onClick={onChangePassword}
                disabled={pwBusy || !pw1 || !pw2}
              >
                {pwBusy ? "…" : s.changePassword}
              </button>
              {pwMsg && (
                <p className={pwMsg.ok ? "cu-ok" : "cu-error"}>{pwMsg.text}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
