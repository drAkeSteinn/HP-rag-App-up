'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

// Type declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

export type VoiceState = 'idle' | 'listening' | 'keyword-detected' | 'recording';

interface UseVoiceRecognitionConfig {
  keyword: string;
  pauseDuration: number;
  language: string;
  enabled: boolean;
  onMessage: (text: string) => void;
}

interface UseVoiceRecognitionReturn {
  state: VoiceState;
  transcript: string;
  lastSentTranscript: string;
  startListening: () => void;
  stopListening: () => void;
  supported: boolean;
}

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const SpeechRecognition = (window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return SpeechRecognition || null;
}

export function useVoiceRecognition({
  keyword,
  pauseDuration,
  language,
  enabled,
  onMessage,
}: UseVoiceRecognitionConfig): UseVoiceRecognitionReturn {
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastSentTranscript, setLastSentTranscript] = useState('');
  const [supported] = useState(() => !!getSpeechRecognition());

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const pauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordedTextRef = useRef('');
  const onMessageRef = useRef(onMessage);
  const keywordRef = useRef(keyword);
  const pauseDurationRef = useRef(pauseDuration);
  const languageRef = useRef(language);
  const enabledRef = useRef(enabled);
  const shouldRestartRef = useRef(false);
  // Use a ref for state to avoid stale closures in recognition callbacks
  const stateRef = useRef<VoiceState>('idle');
  // Track consecutive no-speech errors for backoff
  const noSpeechCountRef = useRef(0);
  // Flag to know if we're currently in the process of creating/restarting recognition
  const isCreatingRef = useRef(false);
  // Ref to hold the createRecognition function so it can be called from effects
  const createRecognitionRef = useRef<(() => void) | null>(null);

  // Keep refs in sync with latest props
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    keywordRef.current = keyword;
  }, [keyword]);

  useEffect(() => {
    pauseDurationRef.current = pauseDuration;
  }, [pauseDuration]);

  useEffect(() => {
    languageRef.current = language;
    // If recognition is active, recreate it with the new language
    if (shouldRestartRef.current && recognitionRef.current && enabledRef.current) {
      // Abort current and schedule restart with new language
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
      // Schedule a restart with the new language after a short delay
      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
      }
      restartTimerRef.current = setTimeout(() => {
        createRecognitionRef.current?.();
      }, 200);
    }
  }, [language]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const clearPauseTimer = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const finalizeRecording = useCallback(() => {
    clearPauseTimer();
    const text = recordedTextRef.current.trim();
    if (text) {
      setLastSentTranscript(text);
      onMessageRef.current(text);
    }
    recordedTextRef.current = '';
    setTranscript('');
    // Go back to listening for next keyword
    stateRef.current = 'listening';
    setState('listening');
  }, [clearPauseTimer]);

  // Create and start a new SpeechRecognition instance with current settings
  const createRecognition = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;

    // Prevent double-creation
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;

    // Clean up any existing recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = languageRef.current || 'es-ES';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const currentKeyword = keywordRef.current.toLowerCase();

      // Reset no-speech counter since we got a result
      noSpeechCountRef.current = 0;

      // Process all results from resultIndex to the end
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        const textLower = text.toLowerCase();

        const currentState = stateRef.current;

        if (currentState === 'listening' || currentState === 'idle') {
          // Check if keyword is in this result
          if (textLower.includes(currentKeyword)) {
            // Keyword detected! Extract text after keyword
            const keywordIndex = textLower.indexOf(currentKeyword);
            const afterKeyword = text.substring(keywordIndex + currentKeyword.length).trim();

            stateRef.current = 'keyword-detected';
            setState('keyword-detected');

            // Brief transition to keyword-detected, then recording
            setTimeout(() => {
              stateRef.current = 'recording';
              setState('recording');
            }, 600);

            if (afterKeyword) {
              recordedTextRef.current = afterKeyword;
              setTranscript(afterKeyword);

              // Start/restart pause timer
              clearPauseTimer();
              pauseTimerRef.current = setTimeout(() => {
                finalizeRecording();
              }, pauseDurationRef.current * 1000);
            } else {
              recordedTextRef.current = '';
              setTranscript('');
              // Start pause timer even with no text yet
              clearPauseTimer();
              pauseTimerRef.current = setTimeout(() => {
                finalizeRecording();
              }, pauseDurationRef.current * 1000);
            }
          }
        } else if (currentState === 'recording') {
          // We're recording - accumulate text after keyword
          if (result.isFinal) {
            // For final results, check if they contain the keyword and strip it
            if (textLower.includes(currentKeyword)) {
              const keywordIndex = textLower.indexOf(currentKeyword);
              const afterKeyword = text.substring(keywordIndex + currentKeyword.length).trim();
              if (afterKeyword) {
                recordedTextRef.current = (recordedTextRef.current + ' ' + afterKeyword).trim();
              }
            } else {
              recordedTextRef.current = (recordedTextRef.current + ' ' + text).trim();
            }
          }
          // Update transcript with current accumulated + interim
          setTranscript(recordedTextRef.current + (result.isFinal ? '' : ' ' + text));

          // Reset pause timer
          clearPauseTimer();
          pauseTimerRef.current = setTimeout(() => {
            finalizeRecording();
          }, pauseDurationRef.current * 1000);
        }
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        console.error('Speech recognition: microphone access denied');
        stateRef.current = 'idle';
        setState('idle');
        shouldRestartRef.current = false;
        isCreatingRef.current = false;
        return;
      }
      if (event.error === 'no-speech') {
        // This is expected - just means no speech was detected in this session
        // Increment counter for backoff
        noSpeechCountRef.current = Math.min(noSpeechCountRef.current + 1, 6);
        // Don't log this as a warning - it's normal behavior
        return;
      }
      if (event.error === 'aborted') {
        // This happens when we abort - also normal
        return;
      }
      // Log other unexpected errors
      console.warn('Speech recognition error:', event.error);
    };

    recognition.onend = () => {
      isCreatingRef.current = false;
      // Auto-restart if we should still be listening
      if (shouldRestartRef.current && enabledRef.current) {
        // Calculate backoff delay based on consecutive no-speech errors
        // 0 errors → 100ms, 1 → 200ms, 2 → 400ms, 3 → 800ms, etc. (max 3000ms)
        const backoffMs = Math.min(100 * Math.pow(2, noSpeechCountRef.current), 3000);

        if (restartTimerRef.current) {
          clearTimeout(restartTimerRef.current);
        }
        restartTimerRef.current = setTimeout(() => {
          if (shouldRestartRef.current && enabledRef.current) {
            createRecognitionRef.current?.();
          }
        }, backoffMs);
      } else {
        stateRef.current = 'idle';
        setState('idle');
      }
    };

    recognition.onstart = () => {
      isCreatingRef.current = false;
    };

    recognitionRef.current = recognition;
    recordedTextRef.current = '';

    try {
      recognition.start();
      stateRef.current = 'listening';
      setState('listening');
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      isCreatingRef.current = false;
      stateRef.current = 'idle';
      setState('idle');
    }
  }, [clearPauseTimer, clearRestartTimer, finalizeRecording]);

  // Keep the ref in sync
  useEffect(() => {
    createRecognitionRef.current = createRecognition;
  }, [createRecognition]);

  const startListening = useCallback(() => {
    noSpeechCountRef.current = 0;
    shouldRestartRef.current = true;
    clearRestartTimer();
    createRecognition();
  }, [createRecognition, clearRestartTimer]);

  const stopListening = useCallback(() => {
    shouldRestartRef.current = false;
    clearPauseTimer();
    clearRestartTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }

    recordedTextRef.current = '';
    setTranscript('');
    stateRef.current = 'idle';
    setState('idle');
  }, [clearPauseTimer, clearRestartTimer]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      clearPauseTimer();
      clearRestartTimer();
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [clearPauseTimer, clearRestartTimer]);

  return {
    state,
    transcript,
    lastSentTranscript,
    startListening,
    stopListening,
    supported,
  };
}
