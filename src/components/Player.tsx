"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { attachSource, type AttachedSource } from "@profullstack/player";
import { safeImage } from "@/lib/format";

export type Track = {
  id: string;
  title: string;
  audio: string;
  duration: number | null;
  showSlug: string;
  showTitle: string;
  image: string | null;
};

type PlayerState = {
  track: Track | null;
  queue: Track[];
  playing: boolean;
  loading: boolean;
  error: string | null;
  position: number;
  duration: number;
  rate: number;
  volume: number;
  play: (track: Track, queue?: Track[]) => void;
  toggle: (track?: Track, queue?: Track[]) => void;
  pause: () => void;
  seek: (seconds: number) => void;
  nudge: (delta: number) => void;
  next: () => void;
  previous: () => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  close: () => void;
  isCurrent: (id: string) => boolean;
};

const Ctx = createContext<PlayerState | null>(null);

export function usePlayer(): PlayerState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer used outside PlayerProvider");
  return ctx;
}

const STORE = "p0d.player.v1";
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];

type Saved = {
  track: Track | null;
  queue: Track[];
  position: number;
  rate: number;
  volume: number;
};

function load(): Saved | null {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Saved;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    // Private windows and blocked site data both throw here rather than
    // returning null, so every read and write is guarded.
    return null;
  }
}

export function clock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [track, setTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRateState] = useState(1);
  const [volume, setVolumeState] = useState(1);
  // A restored session starts paused; the browser would refuse to autoplay
  // anyway, and resuming into someone's ears unasked is worse than a click.
  const restored = useRef<number | null>(null);

  useEffect(() => {
    const saved = load();
    if (!saved) return;
    if (saved.track) {
      setTrack(saved.track);
      setQueue(saved.queue || []);
      restored.current = saved.position || 0;
      setPosition(saved.position || 0);
    }
    if (saved.rate) setRateState(saved.rate);
    if (typeof saved.volume === "number") setVolumeState(saved.volume);
  }, []);

  /**
   * Get the episode's bytes into the element.
   *
   * Was `src={track.audio}`, which is right until a show publishes something
   * the browser cannot open on its own. `attachSource` names the source and
   * picks how to deliver it -- native for the ordinary MP3, hls.js for a
   * playlist -- and this component keeps everything else it already does: the
   * queue, the dock, the persisted position.
   *
   * Attaching is asynchronous because a delivery engine is only downloaded if
   * a source needs one, so a race is possible: two track changes in quick
   * succession would otherwise leave the first attachment running under the
   * second. `cancelled` is what makes the last press win.
   */
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track?.audio) return;

    let cancelled = false;
    let attached: AttachedSource | null = null;

    void attachSource(el, {
      src: track.audio,
      onError: (message) => {
        if (cancelled) return;
        setLoading(false);
        setPlaying(false);
        setError(message);
      },
    })
      .then((result) => {
        if (cancelled) {
          result.destroy();
          return;
        }
        attached = result;
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setError("This episode would not play. The show may have moved the file.");
        }
      });

    return () => {
      cancelled = true;
      attached?.destroy();
    };
  }, [track?.audio]);

  const persist = useCallback(
    (partial: Partial<Saved>) => {
      try {
        const base: Saved = { track, queue, position, rate, volume };
        localStorage.setItem(STORE, JSON.stringify({ ...base, ...partial }));
      } catch {
        /* storage unavailable — the player still works, it just forgets */
      }
    },
    [track, queue, position, rate, volume],
  );

  const play = useCallback(
    (nextTrack: Track, nextQueue?: Track[]) => {
      setError(null);
      setTrack((current) => {
        if (current?.id === nextTrack.id && current.audio === nextTrack.audio) {
          return current;
        }
        restored.current = null;
        setPosition(0);
        setDuration(nextTrack.duration || 0);
        return nextTrack;
      });
      if (nextQueue) setQueue(nextQueue);
      setPlaying(true);
      setLoading(true);
    },
    [],
  );

  const pause = useCallback(() => setPlaying(false), []);

  const toggle = useCallback(
    (maybeTrack?: Track, maybeQueue?: Track[]) => {
      if (maybeTrack && maybeTrack.id !== track?.id) {
        play(maybeTrack, maybeQueue);
        return;
      }
      if (!track) return;
      setPlaying((p) => !p);
    },
    [track, play],
  );

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el) return;
    const target = Math.max(0, seconds);
    el.currentTime = target;
    setPosition(target);
  }, []);

  const nudge = useCallback(
    (delta: number) => {
      const el = audioRef.current;
      if (!el) return;
      seek(Math.min(el.duration || Infinity, (el.currentTime || 0) + delta));
    },
    [seek],
  );

  const step = useCallback(
    (delta: number) => {
      if (!track || queue.length === 0) return;
      const at = queue.findIndex((t) => t.id === track.id);
      const to = at < 0 ? 0 : at + delta;
      if (to < 0 || to >= queue.length) return;
      play(queue[to], queue);
    },
    [track, queue, play],
  );

  const next = useCallback(() => step(1), [step]);
  const previous = useCallback(() => {
    const el = audioRef.current;
    // Same as every other player: rewind first, skip back only if already near
    // the start of the episode.
    if (el && el.currentTime > 5) {
      seek(0);
      return;
    }
    step(-1);
  }, [seek, step]);

  const setRate = useCallback(
    (value: number) => {
      setRateState(value);
      if (audioRef.current) audioRef.current.playbackRate = value;
      persist({ rate: value });
    },
    [persist],
  );

  const setVolume = useCallback(
    (value: number) => {
      setVolumeState(value);
      if (audioRef.current) audioRef.current.volume = value;
      persist({ volume: value });
    },
    [persist],
  );

  const close = useCallback(() => {
    setPlaying(false);
    setTrack(null);
    setQueue([]);
    setPosition(0);
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* nothing to forget */
    }
  }, []);

  // Drive the element from state rather than the other way round, so a play
  // that starts on one page keeps running when the route under it changes.
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !track) return;
    if (playing) {
      el.play().catch(() => {
        setPlaying(false);
        setError("This episode would not play. The show may have moved the file.");
      });
    } else {
      el.pause();
    }
  }, [playing, track]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
  }, [rate, track]);

  useEffect(() => {
    if (!track) return;
    persist({ track, queue, position: Math.floor(position) });
    // Writing on every timeupdate would hammer storage; the position is
    // rounded to whole seconds so this fires about once a second at most.
  }, [track, queue, position, persist]);

  // OS-level controls: lock screen, headphone buttons, media keys.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.showTitle,
      album: "p0dcasters",
      artwork: track.image ? [{ src: track.image, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    const handlers: [MediaSessionAction, () => void][] = [
      ["play", () => setPlaying(true)],
      ["pause", () => setPlaying(false)],
      ["seekbackward", () => nudge(-15)],
      ["seekforward", () => nudge(30)],
      ["previoustrack", previous],
      ["nexttrack", next],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* older browsers reject actions they do not implement */
      }
    }
  }, [track, playing, nudge, next, previous]);

  const isCurrent = useCallback((id: string) => track?.id === id, [track]);

  const value = useMemo<PlayerState>(
    () => ({
      track,
      queue,
      playing,
      loading,
      error,
      position,
      duration,
      rate,
      volume,
      play,
      toggle,
      pause,
      seek,
      nudge,
      next,
      previous,
      setRate,
      setVolume,
      close,
      isCurrent,
    }),
    [
      track, queue, playing, loading, error, position, duration, rate, volume,
      play, toggle, pause, seek, nudge, next, previous, setRate, setVolume, close,
      isCurrent,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        // No `src` here on purpose. An enclosure is whatever the show publishes:
        // usually an MP3, sometimes an HLS playlist, and a browser handed the
        // latter directly plays nothing and reports a bare media error. The
        // effect above routes it through the shared engine picker instead.
        preload="metadata"
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          setDuration(el.duration || 0);
          el.playbackRate = rate;
          el.volume = volume;
          if (restored.current != null) {
            el.currentTime = restored.current;
            restored.current = null;
          }
        }}
        onTimeUpdate={(e) => setPosition(Math.floor(e.currentTarget.currentTime))}
        onPlaying={() => {
          setLoading(false);
          setPlaying(true);
        }}
        onWaiting={() => setLoading(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          next();
        }}
        onError={() => {
          setLoading(false);
          setPlaying(false);
          setError("This episode would not play. The show may have moved the file.");
        }}
      />
      <PlayerBar />
    </Ctx.Provider>
  );
}

function PlayerBar() {
  const p = usePlayer();
  const [openRate, setOpenRate] = useState(false);
  if (!p.track) return null;

  const total = p.duration || p.track.duration || 0;
  const pct = total > 0 ? Math.min(100, (p.position / total) * 100) : 0;

  return (
    <div className="player" role="region" aria-label="Audio player">
      <div
        className="player-seek"
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(p.position)}
        aria-valuetext={`${clock(p.position)} of ${clock(total)}`}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") p.nudge(15);
          if (e.key === "ArrowLeft") p.nudge(-15);
        }}
        onClick={(e) => {
          if (!total) return;
          const box = e.currentTarget.getBoundingClientRect();
          p.seek(((e.clientX - box.left) / box.width) * total);
        }}
      >
        <div className="player-seek-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="player-inner">
        <Link className="player-show" href={`/podcast/${p.track.showSlug}`}>
          {safeImage(p.track.image) ? (
            // eslint-disable-next-line @next/next/no-img-element
            // Decorative on purpose here: the show title sits beside it in the
            // same link, so naming the art would just say it twice.
            <img src={safeImage(p.track.image)} alt="" />
          ) : (
            <span className="player-art-fallback" aria-hidden="true">
              {p.track.showTitle.charAt(0).toUpperCase()}
            </span>
          )}
          <span className="player-titles">
            <b>{p.track.title}</b>
            <i>{p.track.showTitle}</i>
          </span>
        </Link>

        <div className="player-controls">
          <button
            type="button"
            className="ghost"
            onClick={p.previous}
            aria-label="Previous episode"
          >
            ⏮
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => p.nudge(-15)}
            aria-label="Back 15 seconds"
          >
            ↺15
          </button>
          <button
            type="button"
            className="play"
            onClick={() => p.toggle()}
            aria-label={p.playing ? "Pause" : "Play"}
          >
            {p.loading && p.playing ? "…" : p.playing ? "❚❚" : "▶"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => p.nudge(30)}
            aria-label="Forward 30 seconds"
          >
            30↻
          </button>
          <button
            type="button"
            className="ghost"
            onClick={p.next}
            aria-label="Next episode"
          >
            ⏭
          </button>
        </div>

        <div className="player-right">
          <span className="player-time">
            {clock(p.position)} <i>/</i> {clock(total)}
          </span>
          <div className="player-rate">
            <button
              type="button"
              className="ghost"
              onClick={() => setOpenRate((v) => !v)}
              aria-expanded={openRate}
              aria-label="Playback speed"
            >
              {p.rate}×
            </button>
            {openRate && (
              <div className="player-rates">
                {RATES.map((r) => (
                  <button
                    type="button"
                    key={r}
                    className={r === p.rate ? "on" : ""}
                    onClick={() => {
                      p.setRate(r);
                      setOpenRate(false);
                    }}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            className="player-volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={p.volume}
            onChange={(e) => p.setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
          <button
            type="button"
            className="ghost"
            onClick={p.close}
            aria-label="Close player"
          >
            ✕
          </button>
        </div>
      </div>

      {p.error && <div className="player-error">{p.error}</div>}
    </div>
  );
}
