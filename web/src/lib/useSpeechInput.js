import { useCallback, useEffect, useRef, useState } from "react";

function getSpeechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Dettatura vocale (Web Speech API, it-IT).
 * @param {{ lang?: string, onFinal?: (text: string) => void }} opts
 */
export function useSpeechInput({ lang = "it-IT", onFinal } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* già fermato */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Dettatura non supportata su questo browser. Usa Chrome o Edge.");
      return;
    }

    setError("");
    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.continuous = false;
    rec.maxAlternatives = 1;

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last?.[0]?.transcript?.trim();
      if (text) onFinalRef.current?.(text);
    };

    rec.onerror = (ev) => {
      const code = ev.error;
      const msg =
        code === "not-allowed" || code === "service-not-allowed"
          ? "Permesso microfono negato. Consenti l'accesso nelle impostazioni del browser."
          : code === "no-speech"
            ? "Nessun audio rilevato. Riprova parlando più vicino al microfono."
            : code === "aborted"
              ? ""
              : "Dettatura non riuscita. Riprova.";
      if (msg) setError(msg);
      setListening(false);
      recRef.current = null;
    };

    rec.onend = () => {
      setListening(false);
      recRef.current = null;
    };

    try {
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setError("Impossibile avviare il microfono.");
      recRef.current = null;
      setListening(false);
    }
  }, [lang, listening, stop]);

  useEffect(() => () => stop(), [stop]);

  const clearError = useCallback(() => setError(""), []);

  return { supported, listening, error, toggle, stop, clearError };
}
