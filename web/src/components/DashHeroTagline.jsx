import { useEffect, useState } from "react";

const DEFAULT_WORDS = [
  "giardino",
  "pieno sole",
  "automatica",
  "maturo",
  "rigoglioso",
  "concimato",
  "irrigato",
  "tagliato",
];

export default function DashHeroTagline({ words = DEFAULT_WORDS, intervalMs = 2800 }) {
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
    <p className="dash-header__hero-tagline">
      <span className="dash-header__hero-fixed">la scienza sotto il verde</span>
      <span className={`dash-header__hero-word${visible ? " dash-header__hero-word--in" : ""}`}>
        {current}
      </span>
    </p>
  );
}
