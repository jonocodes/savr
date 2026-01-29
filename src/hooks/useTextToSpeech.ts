import { useState, useEffect, useCallback, useRef } from "react";

export interface TTSState {
  isPlaying: boolean;
  isPaused: boolean;
  isSpeaking: boolean;
  rate: number;
  voice: SpeechSynthesisVoice | null;
  availableVoices: SpeechSynthesisVoice[];
  isSupported: boolean;
  // Progress tracking
  progress: number; // 0-100 percentage
  currentTime: number; // estimated seconds elapsed
  totalTime: number; // estimated total seconds
}

export interface TTSControls {
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
  setVoice: (voice: SpeechSynthesisVoice) => void;
  seekTo: (progress: number) => void; // 0-100 percentage
}

// Detect mobile/iOS for platform-specific workarounds
const isMobile = typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Maximum characters per utterance for mobile (mobile browsers struggle with long utterances)
const MAX_UTTERANCE_LENGTH = isMobile ? 2000 : 10000;

// Average words per minute at 1x speed for TTS (typical range is 150-180)
const WORDS_PER_MINUTE_BASE = 160;

/**
 * Count words in text for time estimation
 */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}

/**
 * Format seconds as mm:ss or h:mm:ss
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Split text into chunks for better mobile compatibility.
 * Tries to split on sentence boundaries to maintain natural speech flow.
 * Exported for testing.
 */
export function splitTextIntoChunks(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to find a sentence boundary within the limit
    let splitIndex = -1;
    const searchText = remaining.substring(0, maxLength);

    // Look for sentence endings (. ! ?) followed by space or end
    const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
    for (const ending of sentenceEndings) {
      const lastIndex = searchText.lastIndexOf(ending);
      if (lastIndex > splitIndex) {
        splitIndex = lastIndex + ending.length - 1;
      }
    }

    // If no sentence boundary, try paragraph or newline
    if (splitIndex === -1) {
      const newlineIndex = searchText.lastIndexOf('\n');
      if (newlineIndex > maxLength * 0.5) {
        splitIndex = newlineIndex;
      }
    }

    // If still no good boundary, split on last space
    if (splitIndex === -1) {
      const spaceIndex = searchText.lastIndexOf(' ');
      if (spaceIndex > maxLength * 0.5) {
        splitIndex = spaceIndex;
      }
    }

    // Last resort: hard cut at max length
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }

    chunks.push(remaining.substring(0, splitIndex + 1).trim());
    remaining = remaining.substring(splitIndex + 1).trim();
  }

  return chunks.filter(chunk => chunk.length > 0);
}

/**
 * Unlock audio on mobile browsers by creating and playing a silent audio context.
 * Must be called from a user gesture (click/tap) handler.
 */
let audioUnlocked = false;
function unlockAudio(): void {
  if (audioUnlocked) return;

  try {
    // Create AudioContext to unlock audio playback
    const AudioContext = window.AudioContext || (window as unknown as { webkitAudioContext: typeof window.AudioContext }).webkitAudioContext;
    if (AudioContext) {
      const ctx = new AudioContext();
      // Create a short silent buffer and play it
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);

      // Also try resuming in case it was suspended
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      console.log("TTS: Audio context unlocked");
    }
    audioUnlocked = true;
  } catch (e) {
    console.warn("TTS: Failed to unlock audio context:", e);
  }
}

/**
 * Hook for text-to-speech using the Web Speech API.
 * @param text - The text content to speak
 * @returns State and controls for TTS playback
 */
// Check for browser support once at module level
const isSpeechSynthesisSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export function useTextToSpeech(text: string): [TTSState, TTSControls] {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [rate, setRateState] = useState(1);
  const [voice, setVoiceState] = useState<SpeechSynthesisVoice | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const isSupported = isSpeechSynthesisSupported;

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const textRef = useRef(text);
  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);
  const totalChunksRef = useRef(0);
  const isStoppedRef = useRef(true); // Start as stopped
  const startTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playNextChunkRef = useRef<(() => void) | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const pausedElapsedTimeRef = useRef<number>(0);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update text ref when text changes
  useEffect(() => {
    textRef.current = text;
  }, [text]);

  // Load voices on mount
  useEffect(() => {
    if (!isSupported) return;

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
  }, [isSupported, voice]);

  // Start the progress timer
  const startProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
    }
    playbackStartTimeRef.current = Date.now();
    progressTimerRef.current = setInterval(() => {
      const elapsed = pausedElapsedTimeRef.current + (Date.now() - playbackStartTimeRef.current) / 1000;
      setElapsedTime(elapsed);
    }, 500); // Update every 500ms for smoother display
  }, []);

  // Stop the progress timer
  const stopProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      isStoppedRef.current = true;
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
      }
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Speak a single chunk of text
  const speakChunk = useCallback((chunkText: string) => {
    // Cancel any ongoing speech first
    window.speechSynthesis.cancel();

    // Small delay after cancel for iOS
    const startSpeaking = () => {
      const utterance = new SpeechSynthesisUtterance(chunkText);
      utterance.rate = rate;

      // Set voice if available
      if (voice) {
        utterance.voice = voice;
      }

      // Clear any existing start timeout
      if (startTimeoutRef.current) {
        clearTimeout(startTimeoutRef.current);
        startTimeoutRef.current = null;
      }

      utterance.onstart = () => {
        console.log("TTS: Chunk started speaking");
        if (startTimeoutRef.current) {
          clearTimeout(startTimeoutRef.current);
          startTimeoutRef.current = null;
        }
        setIsPlaying(true);
        setIsPaused(false);
      };

      utterance.onend = () => {
        console.log("TTS: Chunk finished speaking");
        if (startTimeoutRef.current) {
          clearTimeout(startTimeoutRef.current);
          startTimeoutRef.current = null;
        }
        // Move to next chunk
        if (!isStoppedRef.current) {
          currentChunkIndexRef.current++;
          playNextChunkRef.current?.();
        }
      };

      utterance.onerror = (event) => {
        if (startTimeoutRef.current) {
          clearTimeout(startTimeoutRef.current);
          startTimeoutRef.current = null;
        }
        // Don't log "interrupted" or "canceled" errors as they're expected when stopping
        if (event.error !== "interrupted" && event.error !== "canceled") {
          console.error("TTS: Speech synthesis error:", event.error);
        }
        // On error, try to continue with next chunk (unless it was a cancel)
        if (event.error !== "interrupted" && event.error !== "canceled") {
          if (!isStoppedRef.current) {
            currentChunkIndexRef.current++;
            playNextChunkRef.current?.();
          }
        } else {
          setIsPlaying(false);
          setIsPaused(false);
        }
      };

      utteranceRef.current = utterance;

      // Speak the utterance
      window.speechSynthesis.speak(utterance);

      // Chrome/Safari bug workaround: speechSynthesis can get stuck in pending state
      // Calling resume() helps kick-start it
      window.speechSynthesis.resume();

      // iOS workaround: onstart may not fire, so set a timeout to detect stuck state
      if (isMobile) {
        startTimeoutRef.current = setTimeout(() => {
          // Check if speech actually started
          if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
            console.log("TTS: Mobile fallback - assuming speech started");
            setIsPlaying(true);
            setIsPaused(false);
          }
        }, 500);
      }
    };

    // iOS needs a small delay after cancel before starting new speech
    if (isIOS) {
      setTimeout(startSpeaking, 100);
    } else {
      startSpeaking();
    }
  }, [rate, voice]);

  // Play the next chunk in the queue
  const playNextChunk = useCallback(() => {
    if (isStoppedRef.current) {
      console.log("TTS: Stopped, not playing next chunk");
      setIsPlaying(false);
      setIsPaused(false);
      return;
    }

    const chunks = chunksRef.current;
    const currentIndex = currentChunkIndexRef.current;

    if (currentIndex >= chunks.length) {
      console.log("TTS: All chunks finished");
      stopProgressTimer();
      setIsPlaying(false);
      setIsPaused(false);
      return;
    }

    console.log(`TTS: Playing chunk ${currentIndex + 1}/${chunks.length}`);
    speakChunk(chunks[currentIndex]);
  }, [speakChunk, stopProgressTimer]);

  // Keep ref updated with latest playNextChunk
  useEffect(() => {
    playNextChunkRef.current = playNextChunk;
  }, [playNextChunk]);

  const play = useCallback(() => {
    if (!isSupported) {
      console.warn("TTS: Speech synthesis not supported");
      return;
    }
    if (!textRef.current) {
      console.warn("TTS: No text to speak");
      return;
    }

    // Unlock audio on mobile (must be called from user gesture)
    if (isMobile) {
      unlockAudio();
    }

    // Mark as stopped to prevent any pending onend handlers from advancing
    isStoppedRef.current = true;
    stopProgressTimer();

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    // Split text into chunks for better mobile compatibility
    const chunks = splitTextIntoChunks(textRef.current, MAX_UTTERANCE_LENGTH);
    chunksRef.current = chunks;
    totalChunksRef.current = chunks.length;
    currentChunkIndexRef.current = 0;

    // Reset elapsed time for fresh playback
    pausedElapsedTimeRef.current = 0;
    setElapsedTime(0);

    console.log(`TTS: Split text into ${chunks.length} chunks (mobile: ${isMobile}, iOS: ${isIOS})`);

    // Set playing state immediately
    setIsPlaying(true);
    setIsPaused(false);

    // Start playing first chunk (with delay to ensure cancel completed and onend handlers finished)
    setTimeout(() => {
      // NOW we can mark as not stopped, after the async cancel events have fired
      isStoppedRef.current = false;
      startProgressTimer();
      playNextChunk();
    }, isIOS ? 150 : 50);
  }, [isSupported, playNextChunk, startProgressTimer, stopProgressTimer]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    window.speechSynthesis.pause();

    // Save elapsed time when pausing
    pausedElapsedTimeRef.current = pausedElapsedTimeRef.current + (Date.now() - playbackStartTimeRef.current) / 1000;
    stopProgressTimer();

    // Firefox bug: pause() doesn't work, check if it actually paused
    setTimeout(() => {
      if (window.speechSynthesis.paused) {
        console.log("TTS: Paused (native)");
        setIsPaused(true);
      } else {
        // Pause didn't work (Firefox/mobile), fall back to canceling but keep paused state
        console.warn("TTS: Native pause not supported, using soft pause");
        isStoppedRef.current = true;
        window.speechSynthesis.cancel();
        // Keep isPlaying true and set isPaused true so resume works correctly
        setIsPaused(true);
      }
    }, 50);
  }, [isSupported, stopProgressTimer]);

  const resume = useCallback(() => {
    if (!isSupported) return;

    // Check if we have a real pause (speechSynthesis is paused) or soft pause (was cancelled)
    if (window.speechSynthesis.paused) {
      // Real pause - just resume
      window.speechSynthesis.resume();
      startProgressTimer();
      console.log("TTS: Resumed (native)");
      setIsPaused(false);
    } else {
      // Soft pause - need to restart from current chunk
      console.log("TTS: Resuming from soft pause, restarting chunk", currentChunkIndexRef.current);

      // Unlock audio on mobile (must be called from user gesture)
      if (isMobile) {
        unlockAudio();
      }

      setIsPaused(false);

      // Start playing from current chunk (with delay to ensure clean state)
      setTimeout(() => {
        isStoppedRef.current = false;
        startProgressTimer();
        playNextChunk();
      }, isIOS ? 150 : 50);
    }
  }, [isSupported, startProgressTimer, playNextChunk]);

  const stop = useCallback(() => {
    if (!isSupported) return;
    isStoppedRef.current = true;
    stopProgressTimer();
    if (startTimeoutRef.current) {
      clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    // Reset elapsed time
    pausedElapsedTimeRef.current = 0;
    setElapsedTime(0);
  }, [isSupported, stopProgressTimer]);

  const setRate = useCallback((newRate: number) => {
    setRateState(newRate);
  }, []);

  const setVoice = useCallback((newVoice: SpeechSynthesisVoice) => {
    setVoiceState(newVoice);
  }, []);

  // Seek to a specific position (0-100 percentage) - currently disabled/no-op
  const seekTo = useCallback((_progress: number) => {
    // Seeking is disabled for now - slider is read-only
    console.log("TTS: Seeking is currently disabled");
  }, []);

  // Calculate progress percentage and time estimates
  const wordCount = countWords(text);
  const totalTime = wordCount > 0 ? (wordCount / WORDS_PER_MINUTE_BASE) * 60 / rate : 0;
  const currentTime = Math.min(elapsedTime, totalTime);
  const progress = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;

  const state: TTSState = {
    isPlaying,
    isPaused,
    isSpeaking: isPlaying && !isPaused,
    rate,
    voice,
    availableVoices,
    isSupported,
    progress,
    currentTime,
    totalTime,
  };

  const controls: TTSControls = {
    play,
    pause,
    resume,
    stop,
    setRate,
    setVoice,
    seekTo,
  };

  return [state, controls];
}
