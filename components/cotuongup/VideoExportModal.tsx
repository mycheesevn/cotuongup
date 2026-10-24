"use client";

import { useEffect, useRef, useState } from "react";
import { fmt, STR, type Lang } from "@/lib/jieqi/i18n";
import {
  exportReplayVideo,
  type ReplayVideoInput,
} from "@/lib/jieqi/replayVideo";
import { shareResultCard, siteOrigin } from "@/lib/jieqi/share";
import type { JieqiState } from "@/lib/jieqi/types";

export interface VideoGame {
  /** True start state of the game (the deal / setup position). */
  state: JieqiState;
  moves: string[];
  title: string;
  subtitle: string;
  shareUrl?: string;
}

interface Props {
  lang: Lang;
  game: VideoGame | null;
  onClose: () => void;
}

type Phase = "ready" | "recording" | "done" | "error";

/** Export a game replay as a shareable video clip (MP4 on Safari, WebM on Chrome). */
export function VideoExportModal({ lang, game, onClose }: Props) {
  const s = STR[lang];
  const [phase, setPhase] = useState<Phase>("ready");
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stopMic = () => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
  };

  const toggleMic = async () => {
    if (micOn) {
      stopMic();
      setMicOn(false);
      setMicError(false);
      return;
    }
    setMicError(false);
    try {
      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = ms;
      setMicOn(true);
    } catch {
      setMicError(true);
    }
  };

  useEffect(() => {
    if (game) {
      setPhase("ready");
      setProgress(0);
      setVideoUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
      setFile(null);
    } else {
      abortRef.current?.abort();
      stopMic();
      setMicOn(false);
      setMicError(false);
    }
  }, [game]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      stopMic();
      setVideoUrl((u) => {
        if (u) URL.revokeObjectURL(u);
        return null;
      });
    };
  }, []);

  if (!game) return null;

  const startRecording = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase("recording");
    setProgress(0);
    try {
      const input: ReplayVideoInput = {
        moveCodes: game.moves,
        startState: game.state,
        title: game.title,
        subtitle: game.subtitle,
        lang,
        speed,
        micStream: micStreamRef.current,
        signal: ctrl.signal,
        onProgress: (p) => setProgress(p),
      };
      const f = await exportReplayVideo(input);
      setFile(f);
      setVideoUrl(URL.createObjectURL(f));
      setPhase("done");
    } catch (e) {
      if (e instanceof Error && e.message === "cancelled") {
        setPhase("ready");
        setProgress(0);
      } else {
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const shareFile = async () => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await shareResultCard({
        file,
        fileName: file.name,
        title: game.title,
        text: `${game.title}\n${game.subtitle}`,
        url: game.shareUrl ?? siteOrigin(),
      });
    } finally {
      setBusy(false);
    }
  };

  const downloadFile = () => {
    if (!videoUrl || !file) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="cu-modal-backdrop" onClick={onClose}>
      <div className="cu-modal" onClick={(e) => e.stopPropagation()}>
        <h2>🎬 {s.videoTitle}</h2>
        {phase === "ready" && (
          <>
            <p className="cu-empty-note">{s.videoDesc}</p>
            <p className="cu-empty-note">
              {fmt(s.videoMoves, { n: game.moves.length })}
            </p>
            <div className="cu-video-row">
              <span className="cu-video-label">{s.videoSpeed}</span>
              <div className="cu-seg" role="group" aria-label={s.videoSpeed}>
                {(
                  [
                    { v: 0.5, label: s.videoSpeedSlow },
                    { v: 1, label: s.videoSpeedNormal },
                    { v: 1.5, label: s.videoSpeedFast },
                  ] as const
                ).map((o) => (
                  <button
                    key={o.v}
                    type="button"
                    className={speed === o.v ? "active" : ""}
                    onClick={() => setSpeed(o.v)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="cu-video-mic">
              <input
                type="checkbox"
                checked={micOn}
                onChange={toggleMic}
              />
              <span>{s.videoMic}</span>
            </label>
            {micError && <p className="cu-form-error">{s.videoMicDenied}</p>}
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn"
                onClick={startRecording}
              >
                ● {s.videoStart}
              </button>
              <button
                type="button"
                className="cu-btn small"
                onClick={onClose}
              >
                {s.videoClose}
              </button>
            </div>
          </>
        )}
        {phase === "recording" && (
          <>
            <p className="cu-empty-note">{s.videoRecording}</p>
            <div className="cu-progress">
              <div
                className="cu-progress-fill"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            <p className="cu-empty-note">{Math.round(progress * 100)}%</p>
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn small"
                onClick={() => abortRef.current?.abort()}
              >
                {s.videoCancel}
              </button>
            </div>
          </>
        )}
        {phase === "done" && videoUrl && (
          <>
            <p className="cu-empty-note">{s.videoDone}</p>
            <video
              className="cu-video-preview"
              src={videoUrl}
              controls
              playsInline
            />
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn"
                disabled={busy}
                onClick={shareFile}
              >
                📤 {s.videoShare}
              </button>
              <button
                type="button"
                className="cu-btn small"
                onClick={downloadFile}
              >
                ⬇️ {s.videoDownload}
              </button>
              <button
                type="button"
                className="cu-btn small"
                onClick={onClose}
              >
                {s.videoClose}
              </button>
            </div>
          </>
        )}
        {phase === "error" && (
          <>
            <p className="cu-form-error">{s.videoError}</p>
            <div className="cu-modal-actions">
              <button
                type="button"
                className="cu-btn small"
                onClick={onClose}
              >
                {s.videoClose}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
