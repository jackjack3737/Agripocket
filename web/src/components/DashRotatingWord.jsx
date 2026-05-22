import { useEffect, useState } from "react";

export const ROTATING_HERO_WORDS = [
  "giardino",
  "pieno sole",
  "automatica",
  "maturo",
  "rigoglioso",
  "concimato",
  "irrigato",
  "tagliato",
];

export default function DashRotatingWord({ words = ROTATING_HERO_WORDS, intervalMs = 2800 }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

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
    <span
      className={`dash-nav__rotator${visible ? " dash-nav__rotator--in" : ""}`}
      aria-live="polite"
    >
      {current}
    </span>
  );
}
