# Voice Keyword Spotting (KWS) Feature Implementation

## Task ID: voice-kws-feature
## Agent: main

## Summary
Implemented a complete Voice Keyword Spotting feature for the HP Chat application, enabling hands-free voice activation using the browser's Web Speech API.

## Files Created

### 1. `/home/z/my-project/src/app/api/settings/voice/route.ts`
- Backend API for voice settings persistence
- GET: Returns voice config (keyword, pauseDuration, enabled) from `appSetting` with key `voice_config`
- PUT: Saves voice config using `upsert` pattern (same as web-search settings)
- Default config: `{ keyword: 'asistente HP', pauseDuration: 1.5, enabled: false }`

### 2. `/home/z/my-project/src/hooks/useVoiceRecognition.ts`
- Custom React hook for browser-based voice recognition
- Uses `webkitSpeechRecognition` / `SpeechRecognition` API (Chrome/Edge)
- States: `'idle' | 'listening' | 'keyword-detected' | 'recording'`
- Keyword detection is case-insensitive
- After keyword detected, captures subsequent speech
- Auto-sends after configurable pause duration (timer resets on each new speech)
- Returns: `{ state, transcript, startListening, stopListening, supported }`
- Handles browser compatibility gracefully (`supported` boolean)
- Auto-restarts recognition on end (for continuous listening)
- Cleans up recognition on unmount

### 3. Modified `/home/z/my-project/src/app/page.tsx`
Changes made:
- Added `Mic`, `MicOff` imports from lucide-react
- Added `useVoiceRecognition` hook import
- Added voice state variables: `voiceKeyword`, `voicePauseDuration`, `voiceEnabled`, `voiceActive`
- Added `fetchVoiceSettings` callback and included in initial useEffect
- Added `sendMessageRef` pattern to allow voice messages to be sent directly
- Modified `handleSendMessage` to accept optional `overrideText` parameter
- Added mic toggle button in chat input area (before Send button)
- Added voice status indicator above chat input (listening/keyword-detected/recording states)
- Added voice badge ("Voz activa") in the chat input footer
- Added voice settings section in settings panel (keyword input, pause duration input)
- Settings auto-save on blur via PUT to `/api/settings/voice`

## Lint Status
✅ All ESLint checks pass with zero errors/warnings

## Dev Server Status
✅ Running on port 3000, voice API returning 200 responses
