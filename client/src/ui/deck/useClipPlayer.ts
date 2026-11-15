import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "../../config";
import { useStore } from "../../state/store";

export interface ClipPlayer {
  /** Concept whose clip is playing right now, or null. */
  playing: string | null;
  /** Play this concept's clip (stopping any other); pressing the playing one stops it. */
  toggle: (concept: string, clipUrl: string) => void;
}

/**
 * The partner's recorded voice for a deck word (§F17): `new Audio(API_BASE + clip_url).play()`.
 * One clip at a time for the whole deck; the volume follows the player's settings.
 */
export function useClipPlayer(): ClipPlayer {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const volume = useStore((s) => (s.settings.muted ? 0 : s.settings.volume));

  const stop = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
  }, []);

  const toggle = useCallback(
    (concept: string, clipUrl: string) => {
      const wasPlaying = playing === concept;
      stop();
      if (wasPlaying) {
        setPlaying(null);
        return;
      }
      const audio = new Audio(API_BASE + clipUrl);
      audio.volume = volume;
      const done = () => {
        if (audioRef.current !== audio) return;
        audioRef.current = null;
        setPlaying(null);
      };
      audio.onended = done;
      audio.onerror = done;
      audioRef.current = audio;
      setPlaying(concept);
      audio.play().catch(done);
    },
    [playing, stop, volume],
  );

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => stop, [stop]);

  return { playing, toggle };
}
