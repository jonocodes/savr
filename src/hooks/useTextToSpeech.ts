import { useState, useEffect, useCallback, useRef } from "react";

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isSpeaking: boolean;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  availableVoices: SpeechSynthesisVoice[];
  isSupported: boolean;
}

export interface TTSControls {
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
}

/**
 * Hook for text-to-speech using the Web Speech API.
 * @param text - The text content to speak
 * @returns State and controls for TTS playback
 */
export function useTextToSpeech(text: string): [TTSState, TTSControls] {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRateState] = useState(1);
  const [voice, setVoiceState] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [isSupported, setIsSupported] = useState(false);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textRef = useRef(text);

  // Update text ref when text changes
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Check for browser support and load voices
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setIsSupported(true);

      const loadVoices = () => {
        const voices = window.speechSynthesis.getVoices();
        console.log("TTS: Loaded", voices.length, "voices");
        if (voices.length > 0) {
          setAvailableVoices(voices);
          // Set default voice (prefer English voices)
          const englishVoice = voices.find(
            (v) => v.lang.startsWith("en") && v.localService
          );
          const defaultVoice = englishVoice || voices[0];
          if (!voice) {
            console.log("TTS: Setting default voice:", defaultVoice?.name);
            setVoiceState(defaultVoice);
          }
        }
      };

      // Load voices immediately if available
      loadVoices();

      // Also listen for voiceschanged event (needed for some browsers)
      window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

      return () => {
        window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      };
    }
  }, [voice]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const play = useCallback(() => {
    if (!isSupported) {
      console.warn("TTS: Speech synthesis not supported");
      return;
    }
    if (!textRef.current) {
      console.warn("TTS: No text to speak");
      return;
    }

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Create utterance with the text
    const utterance = new SpeechSynthesisUtterance(textRef.current);
    utterance.rate = rate;

    // Set voice if available
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      console.log("TTS: Started speaking");
      setIsPlaying(true);
      setIsPaused(false);
    };

    utterance.onend = () => {
      console.log("TTS: Finished speaking");
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = (event) => {
      // Don't log "interrupted" errors as they're expected when stopping/restarting
      if (event.error !== "interrupted") {
        console.error("TTS: Speech synthesis error:", event.error);
      }
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;

    // Speak the utterance
    window.speechSynthesis.speak(utterance);

    // Chrome bug workaround: speechSynthesis can get stuck in pending state
    // Calling resume() helps kick-start it
    window.speechSynthesis.resume();

    // Set playing state immediately and rely on onstart/onerror to correct it if needed
    setIsPlaying(true);
  }, [isSupported, rate, voice]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();

    // Firefox bug: pause() doesn't work, check if it actually paused
    setTimeout(() => {
      if (window.speechSynthesis.paused) {
        console.log("TTS: Paused");
        setIsPaused(true);
      } else {
        // Pause didn't work (Firefox), fall back to stop
        console.warn("TTS: Pause not supported, stopping instead");
        window.speechSynthesis.cancel();
        setIsPlaying(false);
        setIsPaused(false);
      }
    }, 50);
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.resume();
    console.log("TTS: Resumed");
    setIsPaused(false);
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
  }, [isSupported]);

  const setRate = useCallback((newRate: number) => {
    setRateState(newRate);
  }, []);

  const setVoice = useCallback((newVoice: SpeechSynthesisVoice) => {
    setVoiceState(newVoice);
  }, []);

  const state: TTSState = {
    isPlaying,
    isPaused,
    isSpeaking: isPlaying && !isPaused,
    rate,
    voice,
    availableVoices,
    isSupported,
  };

  const controls: TTSControls = {
    play,
    pause,
    resume,
    stop,
    setRate,
    setVoice,
  };

  return [state, controls];
}
