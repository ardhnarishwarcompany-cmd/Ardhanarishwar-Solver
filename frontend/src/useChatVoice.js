import { useState, useEffect, useRef, useCallback } from 'react'

function getRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function isRecognitionSupported() {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
}

function isSynthesisSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
}

export function useChatVoice() {
  const [isSupported] = useState(() => isRecognitionSupported())
  const [ttsSupported] = useState(() => isSynthesisSupported())
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const [voiceOn, setVoiceOn] = useState(false) // voice assistant mode (mic button ON)

  const recRef = useRef(null)
  // Single source of truth: does the USER currently want the mic on?
  // Only startListening() sets this true and only stopListening()/fatal errors set it false.
  const wantListening = useRef(false)
  const baseRef = useRef('')          // text that was in the input when the mic was switched on
  const committedRef = useRef('')     // finalised speech from earlier recognition sessions
  const sessionFinalRef = useRef('')  // finalised speech in the current recognition session
  const sessionStartRef = useRef(0)
  const failStreakRef = useRef(0)
  const onTextRef = useRef(null)      // callback: receives the full live text (base + speech)
  const restartTimerRef = useRef(null)
  const tokenRef = useRef(0)          // identifies the ONE recognizer that is allowed to act
  const voiceEnabled = useRef(false)
  // Set when the user silences the AI voice. While true nothing new may be spoken, even though the
  // answer is still streaming in. Cleared only when the user sends the next message.
  const speechMuted = useRef(false)
  const voiceSession = useRef(0)

  // TTS queue for streaming incremental speech
  const speakQueueRef = useRef([])
  const isSpeakingRef = useRef(false)
  const playNextRef = useRef(null)

  // Stop whatever is being spoken right now (does not silence future sentences)
  const flushSpeech = useCallback(() => {
    speakQueueRef.current = []
    isSpeakingRef.current = false
    if (ttsSupported && typeof window !== 'undefined') {
      try { window.speechSynthesis.cancel() } catch {}
    }
    setIsSpeaking(false)
  }, [ttsSupported])

  // User silences the AI voice: also stays silent for the rest of this answer
  const cancelSpeak = useCallback(() => {
    speechMuted.current = true
    flushSpeech()
  }, [flushSpeech])

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
  }, [])

  const _playNext = useCallback(() => {
    if (!ttsSupported || typeof window === 'undefined') return
    if (!voiceEnabled.current) return
    if (isSpeakingRef.current) return
    const next = speakQueueRef.current.shift()
    if (!next) {
      setIsSpeaking(false)
      isSpeakingRef.current = false
      return
    }
    const clean = next.trim().slice(0, 900)
    const plain = clean.replace(/[#*_`[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    const session = voiceSession.current
    const scheduleNext = (delay) => {
      setTimeout(() => {
        if (session !== voiceSession.current || !voiceEnabled.current) return
        playNextRef.current?.()
      }, delay)
    }
    if (!plain) {
      // Skip empty and try next
      scheduleNext(0)
      return
    }
    const utter = new SpeechSynthesisUtterance(plain)
    utter.lang = 'en-US'
    utter.rate = 1
    isSpeakingRef.current = true
    setIsSpeaking(true)
    utter.onstart = () => {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = true
      setIsSpeaking(true)
    }
    utter.onend = () => {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
      // Small delay to let next queued speak
      scheduleNext(30)
    }
    utter.onerror = () => {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
      scheduleNext(30)
    }
    try { window.speechSynthesis.speak(utter) } catch {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
      scheduleNext(30)
    }
  }, [ttsSupported])

  // Keep ref updated for recursive calls
  useEffect(() => { playNextRef.current = _playNext }, [_playNext])

  const queueSpeak = useCallback((text) => {
    if (!ttsSupported || !text || !text.trim()) return
    if (!voiceEnabled.current || speechMuted.current) return
    const clean = text.trim()
    if (!clean) return
    speakQueueRef.current.push(clean)
    // If not currently speaking, start playback
    if (!isSpeakingRef.current) {
      // Use ref to avoid stale closure
      if (playNextRef.current) playNextRef.current()
      else _playNext()
    }
  }, [ttsSupported, _playNext])

  const speak = useCallback((text) => {
    if (!ttsSupported || !text || !text.trim()) return
    if (!voiceEnabled.current || speechMuted.current) return
    // For non-streaming fallback, use queue path to avoid overlap: cancel then queue single
    try { window.speechSynthesis.cancel() } catch {}
    speakQueueRef.current = []
    isSpeakingRef.current = false
    const clean = text.trim().slice(0, 900)
    // Strip markdown-ish artifacts for more natural speech
    const plain = clean.replace(/[#*_`[\]]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!plain) return
    const session = voiceSession.current
    const utter = new SpeechSynthesisUtterance(plain)
    utter.lang = 'en-US'
    utter.rate = 1
    utter.onstart = () => {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = true
      setIsSpeaking(true)
    }
    utter.onend = () => {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
      // If queued items remain (fallback queue), play next
      if (speakQueueRef.current.length > 0) _playNext()
    }
    utter.onerror = () => {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
    }
    isSpeakingRef.current = true
    setIsSpeaking(true)
    try { window.speechSynthesis.speak(utter) } catch {
      if (session !== voiceSession.current || !voiceEnabled.current) return
      isSpeakingRef.current = false
      setIsSpeaking(false)
    }
  }, [ttsSupported, _playNext])

  const join = (...parts) => parts.map(p => (p || '').trim()).filter(Boolean).join(' ')

  // Hard kill: invalidate the current recognizer completely. Its handlers are removed, its
  // pending timers become no-ops and the browser is told to release the microphone.
  // A killed recognizer can never restart itself - a new one is created on the next start.
  const killRecognizer = useCallback(() => {
    tokenRef.current += 1
    clearRestartTimer()
    const rec = recRef.current
    recRef.current = null
    if (rec) {
      rec.onstart = null
      rec.onresult = null
      rec.onend = null
      rec.onerror = null
      try { rec.abort() } catch {}
    }
  }, [clearRestartTimer])

  const stopListening = useCallback(() => {
    wantListening.current = false
    failStreakRef.current = 0
    killRecognizer()
    setIsListening(false)
    setInterim('')
  }, [killRecognizer])

  const stopVoice = useCallback(() => {
    // Voice mode OFF: mic off, AI voice off (even in the middle of an answer), until turned on again
    voiceEnabled.current = false
    voiceSession.current += 1
    setVoiceOn(false)
    stopListening()
    cancelSpeak()
  }, [stopListening, cancelSpeak])

  const startListening = useCallback((baseText = '') => {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      setError('Voice input is not supported in this browser. Please use Chrome or Edge, or type your message.')
      return false
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('Microphone needs a secure page (https or localhost). Please open the app via localhost or https.')
      return false
    }
    killRecognizer() // always start from a clean slate
    voiceEnabled.current = true
    speechMuted.current = false
    setVoiceOn(true)
    voiceSession.current += 1
    flushSpeech() // never listen while the AI is talking (it would hear itself)
    setError(null)
    baseRef.current = baseText || ''
    committedRef.current = ''
    sessionFinalRef.current = ''
    failStreakRef.current = 0
    wantListening.current = true

    const token = ++tokenRef.current
    // A callback may only act if it belongs to the current recognizer AND the user still wants the mic on
    const alive = () => token === tokenRef.current && wantListening.current

    const rec = new Ctor()
    rec.continuous = true       // keep listening through natural pauses
    rec.interimResults = true
    rec.lang = 'en-US'
    rec.maxAlternatives = 1

    const fatal = (message) => {
      if (token !== tokenRef.current) return
      wantListening.current = false
      voiceEnabled.current = false
      setVoiceOn(false)
      killRecognizer()
      setIsListening(false)
      setInterim('')
      setError(message)
    }

    rec.onstart = () => {
      if (!alive()) return
      sessionStartRef.current = Date.now()
      sessionFinalRef.current = ''
      setIsListening(true)
    }

    rec.onresult = (event) => {
      if (!alive()) return // late results after the user turned the mic off are ignored
      failStreakRef.current = 0
      let finals = ''
      let interimText = ''
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i]
        const t = r[0]?.transcript || ''
        if (r.isFinal) finals += t + ' '
        else interimText += t + ' '
      }
      sessionFinalRef.current = finals.trim()
      setInterim(interimText.trim())
      const full = join(baseRef.current, committedRef.current, finals, interimText)
      if (onTextRef.current) onTextRef.current(full)
    }

    rec.onend = () => {
      if (!alive()) return
      // Browser ended the session (silence / time limit) but the user still wants the mic ON -> restart
      committedRef.current = join(committedRef.current, sessionFinalRef.current)
      sessionFinalRef.current = ''
      if (Date.now() - sessionStartRef.current < 800) failStreakRef.current += 1
      if (failStreakRef.current >= 5) {
        fatal('Microphone keeps stopping. Check that it is connected and allowed, then press the mic again.')
        return
      }
      clearRestartTimer()
      restartTimerRef.current = setTimeout(() => {
        if (!alive()) return
        try { rec.start() } catch {}
      }, 250)
    }

    rec.onerror = (e) => {
      if (!alive()) return
      const code = e.error || 'unknown'
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'permission-denied') {
        fatal('Microphone permission denied. Click the lock icon in the address bar, allow the microphone, then try again.')
      } else if (code === 'audio-capture') {
        fatal('No microphone found. Please connect one or continue typing.')
      } else if (code === 'network') {
        fatal('Speech service is unreachable. Voice input needs an internet connection.')
      } else if (code === 'language-not-supported') {
        fatal('This language is not supported for voice input.')
      }
      // 'no-speech' and 'aborted' are normal: onend decides whether to restart
    }

    recRef.current = rec
    setIsListening(true)
    setInterim('')
    try {
      rec.start()
    } catch {
      fatal('Could not start the microphone. Please press the mic again.')
      return false
    }
    return true
  }, [flushSpeech, clearRestartTimer, killRecognizer])

  // Unmount / route change: make sure nothing keeps listening or speaking
  useEffect(() => {
    return () => {
      try { if (ttsSupported) window.speechSynthesis.cancel() } catch {}
      wantListening.current = false
      killRecognizer()
    }
  }, [ttsSupported, killRecognizer])

  // Always-fresh answer to "is the mic on right now?" (not subject to React render timing)
  const isMicOn = useCallback(() => wantListening.current, [])
  const isVoiceOn = useCallback(() => voiceEnabled.current, [])

  // Voice mode ON without opening the microphone (used when turned on in the middle of an answer:
  // the AI starts reading the rest of the answer aloud, and listening resumes when it finishes)
  const enableSpeechOnly = useCallback(() => {
    voiceEnabled.current = true
    speechMuted.current = false
    setVoiceOn(true)
    voiceSession.current += 1
  }, [])

  // true while the AI still has something to say (currently speaking or queued)
  const hasPendingSpeech = useCallback(() => isSpeakingRef.current || speakQueueRef.current.length > 0, [])

  // Called when a new message is sent: the AI may speak again for the new answer
  const unmuteSpeech = useCallback(() => { speechMuted.current = false }, [])

  // Register the callback that receives the live text (typed text + speech so far)
  const setOnFinal = useCallback((cb) => { onTextRef.current = cb }, [])

  return {
    isSupported,
    ttsSupported,
    isListening,
    isSpeaking,
    interim,
    error,
    startListening,
    stopListening,
    isMicOn,
    isVoiceOn,
    voiceOn,
    enableSpeechOnly,
    hasPendingSpeech,
    unmuteSpeech,
    stopVoice,
    speak,
    queueSpeak,
    cancelSpeak,
    setOnFinal,
    clearError: () => setError(null)
  }
}
