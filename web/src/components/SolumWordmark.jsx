/** Wordmark vettoriale: tipografia web + erba/radici come nel marchio originale. */
export default function SolumWordmark({ className = "" }) {
  return (
    <svg
      className={`solum-wordmark${className ? ` ${className}` : ""}`}
      viewBox="0 0 300 92"
      role="img"
      aria-label="Solum"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text x="150" y="58" textAnchor="middle" className="solum-wordmark__text">
        solum
      </text>

      <g className="solum-wordmark__roots" fill="none" stroke="#6f58a8" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
        <path d="M52 62v8l-6 10M52 62v6l4 12M78 62v5l-3 14M78 62v7l5 11" />
        <path d="M104 62v9l-5 9M104 62v6l6 13M130 62v8l-4 11M130 62v5l3 15" />
        <path d="M156 62v7l-6 12M156 62v5l5 10M182 62v8l-4 13M182 62v6l7 9" />
        <path d="M208 62v5l-5 14M208 62v8l4 11M234 62v7l-3 12M234 62v6l6 10" />
        <path d="M260 62v9l-5 10M260 62v5l4 14" />
        <circle cx="46" cy="80" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="82" cy="78" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="99" cy="81" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="125" cy="79" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="150" cy="82" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="176" cy="80" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="203" cy="81" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="229" cy="78" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="255" cy="80" r="2.2" fill="#6f58a8" stroke="none" />
        <circle cx="264" cy="83" r="2.2" fill="#6f58a8" stroke="none" />
      </g>

      <g className="solum-wordmark__grass" fill="none" stroke="#3a7a4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M58 30l2-9 3 7M63 28l1-6 2 5" />
        <path d="M88 28l2-8 2 6M93 27l1-5 3 4" />
        <path d="M118 29l2-10 2 8M123 27l2-6 2 5" />
        <path d="M148 28l3-9 2 7M154 27l1-6 3 5" />
        <path d="M178 29l2-8 3 6M184 27l2-7 2 6" />
        <path d="M208 28l2-9 2 7M214 27l2-6 2 5" />
        <path d="M238 29l3-10 2 8M244 27l1-5 3 4" />
      </g>
    </svg>
  );
}
