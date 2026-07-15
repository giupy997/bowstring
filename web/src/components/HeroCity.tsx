"use client";

/**
 * Animated SVG cityscape hero. Inspired by virtuals.io's hand-drawn hero,
 * but pure vector + CSS keyframes — no images, no JS animation loop.
 *
 * Three depth layers of geometric buildings (parallax via opacity), a
 * ground line, and twelve silhouette walkers that translateX across the
 * scene on independent loops.
 */
export function HeroCity() {
  return (
    <div className="hero-city">
      <svg
        viewBox="0 0 1600 720"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Bowstring city — agents at work"
        role="img"
      >
        <defs>
          <linearGradient id="hero-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0a0a0c" />
            <stop offset="55%" stopColor="#0c0c0e" />
            <stop offset="100%" stopColor="#141418" />
          </linearGradient>
          <radialGradient id="hero-glow" cx="50%" cy="55%" r="55%">
            <stop offset="0%" stopColor="#ccff00" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hero-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#08080a" stopOpacity="0" />
            <stop offset="100%" stopColor="#08080a" stopOpacity="1" />
          </linearGradient>

          {/* One reusable walker silhouette.
              IMPORTANT: this is a <g>, not a <symbol>. With <symbol>, a
              <use> without explicit width/height scales the content to
              100% of the parent SVG — turning each silhouette into a
              giant blob. With <g>, the x/y on <use> is just a translate,
              and the walker keeps its native ~32px height.
              Walker's feet sit at y=0; head extends up to y=-32. */}
          <g id="walker">
            {/* head */}
            <circle cx="0" cy="-29" r="3" fill="#ffffff" />
            {/* body (slight taper, shoulders > waist) */}
            <path
              d="M-3.2,-26 L3.2,-26 L2.6,-12 L-2.6,-12 Z"
              fill="#ffffff"
            />
            {/* arms (subtle swing implied via positions) */}
            <line
              x1="-3.2"
              y1="-23"
              x2="-3.8"
              y2="-14"
              stroke="#ffffff"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            <line
              x1="3.2"
              y1="-23"
              x2="3.8"
              y2="-14"
              stroke="#ffffff"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
            {/* legs */}
            <line
              x1="-1.5"
              y1="-12"
              x2="-1.8"
              y2="-1"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <line
              x1="1.5"
              y1="-12"
              x2="1.8"
              y2="-1"
              stroke="#ffffff"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
        </defs>

        {/* Sky */}
        <rect width="1600" height="720" fill="url(#hero-sky)" />
        <rect width="1600" height="720" fill="url(#hero-glow)" />

        {/* ----- Far skyline (depth 1) ----- */}
        <g opacity="0.18" stroke="#ffffff" fill="none" strokeWidth="1">
          <rect x="40" y="380" width="60" height="200" />
          <rect x="120" y="320" width="44" height="260" />
          <rect x="180" y="360" width="80" height="220" />
          <rect x="280" y="290" width="36" height="290" />
          <rect x="330" y="350" width="58" height="230" />
          <rect x="410" y="310" width="70" height="270" />
          <rect x="500" y="340" width="42" height="240" />
          <rect x="560" y="280" width="80" height="300" />
          <rect x="660" y="330" width="50" height="250" />
          <rect x="730" y="300" width="46" height="280" />
          <rect x="790" y="370" width="74" height="210" />
          <rect x="880" y="320" width="40" height="260" />
          <rect x="940" y="290" width="64" height="290" />
          <rect x="1020" y="350" width="52" height="230" />
          <rect x="1090" y="310" width="78" height="270" />
          <rect x="1190" y="340" width="42" height="240" />
          <rect x="1250" y="280" width="74" height="300" />
          <rect x="1340" y="330" width="46" height="250" />
          <rect x="1400" y="360" width="60" height="220" />
          <rect x="1480" y="310" width="44" height="270" />
          <rect x="1540" y="350" width="48" height="230" />
        </g>

        {/* ----- Mid skyline (depth 2) ----- */}
        <g opacity="0.4" stroke="#ffffff" fill="none" strokeWidth="1.2" strokeLinejoin="round">
          {/* Left cluster */}
          <rect x="60" y="300" width="80" height="280" />
          <line x1="60" y1="340" x2="140" y2="340" />
          <line x1="60" y1="380" x2="140" y2="380" />
          <line x1="60" y1="420" x2="140" y2="420" />
          <line x1="60" y1="460" x2="140" y2="460" />
          <line x1="60" y1="500" x2="140" y2="500" />
          <line x1="60" y1="540" x2="140" y2="540" />
          <line x1="100" y1="300" x2="100" y2="580" />

          <rect x="170" y="240" width="56" height="340" />
          <line x1="170" y1="290" x2="226" y2="290" />
          <line x1="170" y1="340" x2="226" y2="340" />
          <line x1="170" y1="390" x2="226" y2="390" />
          <line x1="170" y1="440" x2="226" y2="440" />
          <line x1="170" y1="490" x2="226" y2="490" />
          <line x1="170" y1="540" x2="226" y2="540" />

          <polygon points="226,240 226,210 248,210 248,240" />
          <line x1="237" y1="210" x2="237" y2="170" />

          {/* Mid */}
          <rect x="700" y="220" width="120" height="360" />
          <line x1="700" y1="260" x2="820" y2="260" />
          <line x1="700" y1="300" x2="820" y2="300" />
          <line x1="700" y1="340" x2="820" y2="340" />
          <line x1="700" y1="380" x2="820" y2="380" />
          <line x1="700" y1="420" x2="820" y2="420" />
          <line x1="700" y1="460" x2="820" y2="460" />
          <line x1="700" y1="500" x2="820" y2="500" />
          <line x1="700" y1="540" x2="820" y2="540" />
          <line x1="740" y1="220" x2="740" y2="580" />
          <line x1="780" y1="220" x2="780" y2="580" />
          <polygon points="700,220 760,180 820,220" />
          <line x1="760" y1="180" x2="760" y2="130" />
          <circle cx="760" cy="125" r="4" stroke="#ccff00" fill="rgba(204, 255, 0, 0.25)" />

          {/* Right cluster */}
          <rect x="1260" y="270" width="90" height="310" />
          <line x1="1260" y1="310" x2="1350" y2="310" />
          <line x1="1260" y1="350" x2="1350" y2="350" />
          <line x1="1260" y1="390" x2="1350" y2="390" />
          <line x1="1260" y1="430" x2="1350" y2="430" />
          <line x1="1260" y1="470" x2="1350" y2="470" />
          <line x1="1260" y1="510" x2="1350" y2="510" />
          <line x1="1305" y1="270" x2="1305" y2="580" />
          <polygon points="1260,270 1305,240 1350,270" />

          <rect x="1380" y="320" width="60" height="260" />
          <line x1="1380" y1="360" x2="1440" y2="360" />
          <line x1="1380" y1="400" x2="1440" y2="400" />
          <line x1="1380" y1="440" x2="1440" y2="440" />
          <line x1="1380" y1="480" x2="1440" y2="480" />
          <line x1="1380" y1="520" x2="1440" y2="520" />
          <line x1="1410" y1="320" x2="1410" y2="580" />
        </g>

        {/* ----- Foreground (depth 3) ----- */}
        <g stroke="#ffffff" fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.85">
          {/* Big market canopy left */}
          <polygon points="120,460 320,400 520,460 520,490 120,490" fill="rgba(255, 255, 255, 0.04)" />
          <line x1="320" y1="400" x2="320" y2="380" />
          <line x1="320" y1="380" x2="280" y2="380" />
          <line x1="320" y1="380" x2="360" y2="380" />
          <line x1="160" y1="490" x2="160" y2="580" />
          <line x1="280" y1="490" x2="280" y2="580" />
          <line x1="380" y1="490" x2="380" y2="580" />
          <line x1="480" y1="490" x2="480" y2="580" />
          <rect x="180" y="510" width="60" height="70" />
          <line x1="180" y1="530" x2="240" y2="530" />
          <rect x="290" y="510" width="60" height="70" />
          <line x1="290" y1="530" x2="350" y2="530" />
          <rect x="400" y="510" width="60" height="70" />
          <line x1="400" y1="530" x2="460" y2="530" />

          {/* Central tower */}
          <rect x="900" y="180" width="140" height="400" fill="rgba(255, 255, 255, 0.03)" />
          <line x1="900" y1="220" x2="1040" y2="220" />
          <line x1="900" y1="260" x2="1040" y2="260" />
          <line x1="900" y1="300" x2="1040" y2="300" />
          <line x1="900" y1="340" x2="1040" y2="340" />
          <line x1="900" y1="380" x2="1040" y2="380" />
          <line x1="900" y1="420" x2="1040" y2="420" />
          <line x1="900" y1="460" x2="1040" y2="460" />
          <line x1="900" y1="500" x2="1040" y2="500" />
          <line x1="900" y1="540" x2="1040" y2="540" />
          <line x1="940" y1="180" x2="940" y2="580" />
          <line x1="980" y1="180" x2="980" y2="580" />
          <line x1="1020" y1="180" x2="1020" y2="580" />
          <polygon points="900,180 970,130 1040,180" fill="rgba(255, 255, 255, 0.05)" />
          <line x1="970" y1="130" x2="970" y2="80" />
          <circle cx="970" cy="74" r="6" stroke="#ccff00" fill="rgba(204, 255, 0, 0.55)" />

          {/* Right pavilion canopy */}
          <polygon points="1080,470 1240,420 1400,470 1400,500 1080,500" fill="rgba(255, 255, 255, 0.04)" />
          <line x1="1240" y1="420" x2="1240" y2="400" />
          <circle cx="1240" cy="395" r="4" stroke="#ccff00" fill="rgba(204, 255, 0, 0.25)" />
          <line x1="1130" y1="500" x2="1130" y2="580" />
          <line x1="1240" y1="500" x2="1240" y2="580" />
          <line x1="1350" y1="500" x2="1350" y2="580" />
          <rect x="1145" y="520" width="80" height="60" />
          <rect x="1255" y="520" width="80" height="60" />

          {/* Industrial structures */}
          <line x1="600" y1="500" x2="600" y2="580" />
          <line x1="612" y1="500" x2="612" y2="580" />
          <line x1="600" y1="500" x2="612" y2="500" />
          <line x1="606" y1="500" x2="606" y2="470" />
          <circle cx="606" cy="465" r="3" stroke="#ccff00" fill="rgba(204, 255, 0, 0.25)" />

          <line x1="850" y1="490" x2="850" y2="580" />
          <line x1="860" y1="490" x2="860" y2="580" />
          <line x1="850" y1="490" x2="860" y2="490" />
          <line x1="855" y1="490" x2="855" y2="450" />
          <circle cx="855" cy="445" r="3" stroke="#ccff00" fill="rgba(204, 255, 0, 0.25)" />

          {/* Far right antenna stack */}
          <rect x="1480" y="380" width="50" height="200" fill="rgba(255, 255, 255, 0.03)" />
          <line x1="1480" y1="420" x2="1530" y2="420" />
          <line x1="1480" y1="460" x2="1530" y2="460" />
          <line x1="1480" y1="500" x2="1530" y2="500" />
          <line x1="1480" y1="540" x2="1530" y2="540" />
          <line x1="1505" y1="380" x2="1505" y2="320" />
          <circle cx="1505" cy="316" r="4" stroke="#ccff00" fill="rgba(204, 255, 0, 0.25)" />
        </g>

        {/* Ground line */}
        <g stroke="#ffffff" strokeLinecap="round">
          <line x1="0" y1="600" x2="1600" y2="600" strokeWidth="1" opacity="0.55" />
          <line x1="0" y1="610" x2="1600" y2="610" strokeWidth="0.5" opacity="0.25" />
        </g>

        {/* Subtle ground tick marks */}
        <g stroke="#ffffff" strokeWidth="0.8" opacity="0.18">
          <line x1="60" y1="600" x2="60" y2="608" />
          <line x1="180" y1="600" x2="180" y2="608" />
          <line x1="300" y1="600" x2="300" y2="608" />
          <line x1="420" y1="600" x2="420" y2="608" />
          <line x1="540" y1="600" x2="540" y2="608" />
          <line x1="660" y1="600" x2="660" y2="608" />
          <line x1="780" y1="600" x2="780" y2="608" />
          <line x1="900" y1="600" x2="900" y2="608" />
          <line x1="1020" y1="600" x2="1020" y2="608" />
          <line x1="1140" y1="600" x2="1140" y2="608" />
          <line x1="1260" y1="600" x2="1260" y2="608" />
          <line x1="1380" y1="600" x2="1380" y2="608" />
          <line x1="1500" y1="600" x2="1500" y2="608" />
        </g>

        {/* ===== Walkers (animated) =====
            Each is a <use> of #walker translated to its lane (y=600 ground),
            wrapped in a <g> whose class drives a CSS keyframe translateX.
            The "bob" group applies a tiny vertical wobble on top. */}
        <g className="walker-lane">
          <g className="walker-bob bob-a">
            <g className="walk walk-right-slow">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-b">
            <g className="walk walk-right-med">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-c">
            <g className="walk walk-right-fast">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-a">
            <g className="walk walk-right-slower">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-b">
            <g className="walk walk-right-med2">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-c">
            <g className="walk walk-right-fast2">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>

          <g className="walker-bob bob-a">
            <g className="walk walk-left-slow">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-b">
            <g className="walk walk-left-med">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-c">
            <g className="walk walk-left-fast">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-a">
            <g className="walk walk-left-slower">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-b">
            <g className="walk walk-left-med2">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
          <g className="walker-bob bob-c">
            <g className="walk walk-left-fast2">
              <use href="#walker" x="0" y="600" />
            </g>
          </g>
        </g>

        {/* Soft bottom fade so the ground blends into the page bg */}
        <rect x="0" y="620" width="1600" height="100" fill="url(#hero-fade)" />
      </svg>

      <style jsx>{`
        .hero-city {
          position: relative;
          width: 100%;
          margin-top: 8px;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid var(--border);
          background: var(--bg);
        }
        .hero-city svg {
          display: block;
          width: 100%;
          height: auto;
          /* Cap the hero height so it doesn't dominate small screens */
          max-height: 480px;
        }

        /* ===== Walker animations =====
           Each "walk *" class translates the silhouette from off-screen one
           side to off-screen the other. The viewBox is 1600 wide, so we
           translate from -40 to 1640 (or vice versa) for a full pass.
           Different durations give the crowd irregular pacing. */
        :global(.walk) {
          will-change: transform;
        }
        :global(.walk-right-slow)   { animation: walk-right 38s linear -3s infinite; }
        :global(.walk-right-med)    { animation: walk-right 28s linear -12s infinite; }
        :global(.walk-right-fast)   { animation: walk-right 22s linear -7s infinite; }
        :global(.walk-right-slower) { animation: walk-right 44s linear -20s infinite; }
        :global(.walk-right-med2)   { animation: walk-right 31s linear -25s infinite; }
        :global(.walk-right-fast2)  { animation: walk-right 19s linear -14s infinite; }

        :global(.walk-left-slow)    { animation: walk-left 40s linear -8s infinite; }
        :global(.walk-left-med)     { animation: walk-left 26s linear -18s infinite; }
        :global(.walk-left-fast)    { animation: walk-left 21s linear -2s infinite; }
        :global(.walk-left-slower)  { animation: walk-left 46s linear -33s infinite; }
        :global(.walk-left-med2)    { animation: walk-left 29s linear -11s infinite; }
        :global(.walk-left-fast2)   { animation: walk-left 24s linear -19s infinite; }

        @keyframes walk-right {
          from { transform: translateX(-40px); }
          to   { transform: translateX(1640px); }
        }
        @keyframes walk-left {
          from { transform: translateX(1640px); }
          to   { transform: translateX(-40px); }
        }

        /* Tiny vertical bob — applied to the wrapper so it composes with the
           horizontal walk above. Three flavors so neighbors aren't in sync. */
        :global(.walker-bob) { transform-origin: center; }
        :global(.bob-a) { animation: bob-a 0.55s ease-in-out infinite; }
        :global(.bob-b) { animation: bob-b 0.62s ease-in-out infinite; }
        :global(.bob-c) { animation: bob-c 0.48s ease-in-out infinite; }

        @keyframes bob-a {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.2px); }
        }
        @keyframes bob-b {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-1.6px); }
        }
        @keyframes bob-c {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-0.9px); }
        }

        /* Respect prefers-reduced-motion: freeze everyone */
        @media (prefers-reduced-motion: reduce) {
          :global(.walk),
          :global(.walker-bob) {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
