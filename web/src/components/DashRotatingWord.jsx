import { useEffect, useMemo, useState } from "react";
import { frasiImpostazioniRotanti } from "../lib/impostazioniProfilo";

export default function DashRotatingWord({ profile, intervalMs = 3200 }) {
  const words = useMemo(() => frasiImpostazioniRotanti(profile), [profile]);

  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setIndex(0);
    setVisible(true);
  }, [words.join("|")]);

  useEffect(() => {
    if (words.length <= 1) return undefined;
    let swapTimer;
    const tick = setInterval(() => {
      setVisible(false);
      swapTimer = setTimeout(() => {
        setIndex((i) => (i + 1) % words.length);
        setVisible(true);
      }, 220);
    }, intervalMs);
    return () => {
      clearInterval(tick);
      clearTimeout(swapTimer);
    };
  }, [words.length, intervalMs]);

  const current = words[index] ?? words[0];

  return (
    <span className="dash-nav__settings" title={`Le tue impostazioni: ${current}`}>
      <span className="dash-nav__settings-label">Impostazioni</span>
      <span
        className={`dash-nav__rotator${visible ? " dash-nav__rotator--in" : ""}`}
        aria-live="polite"
      >
        {current}
      </span>
    </span>
  );
}
