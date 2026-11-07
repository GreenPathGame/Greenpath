import React, { memo } from "react";

/* ═══════════════════════════════════════════════════
   NATURE SCENE
   A layered, animated landscape drawn behind every panel
   screen: sky + sun + clouds, snowy mountains, rolling
   hills, forests, a waterfall feeding a winding river and
   a lily pond, meadows full of flowers, butterflies and
   birds. Pure SVG (no image downloads), scales to any
   screen with xMidYMax slice so the ground always shows.
   Colours follow the game's existing palette.
   Animations are CSS and are switched off automatically
   for players who ask for reduced motion (GlobalStyles).
═══════════════════════════════════════════════════ */

// Small deterministic pseudo-random generator so the scene looks
// "natural" but is identical on every render and every device.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const FLOWER_COLORS = ["#f472b6", "#fb7185", "#facc15", "#a78bfa", "#60a5fa", "#fb923c", "#ffffff", "#f43f5e", "#c084fc"];

function buildForest(seed, count, x0, x1, yBase, yJitter, scaleMin, scaleMax) {
  const r = rng(seed);
  const trees = [];
  for (let i = 0; i < count; i++) {
    const x = x0 + (x1 - x0) * (i + r() * 0.8) / count;
    const s = scaleMin + (scaleMax - scaleMin) * r();
    trees.push({ x, y: yBase + r() * yJitter, s, kind: r() < 0.55 ? "pine" : r() < 0.8 ? "round" : "birch", shade: r() });
  }
  return trees.sort((a, b) => a.y - b.y);
}

function buildFlowers(seed, count, x0, x1, y0, y1) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: x0 + (x1 - x0) * r(),
      y: y0 + (y1 - y0) * r(),
      c: FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)],
      s: 0.7 + r() * 0.9,
      sway: r() * 3,
    });
  }
  return out.sort((a, b) => a.y - b.y);
}

const FAR_FOREST = buildForest(11, 46, -20, 1460, 520, 26, 0.45, 0.7);
const MID_FOREST_L = buildForest(23, 14, -30, 420, 590, 40, 0.8, 1.15);
const MID_FOREST_R = buildForest(37, 16, 1000, 1470, 580, 44, 0.8, 1.2);
const NEAR_TREES = [
  { x: 40, y: 820, s: 2.1, kind: "round", shade: 0.3 },
  { x: 150, y: 860, s: 1.6, kind: "pine", shade: 0.6 },
  { x: 1300, y: 830, s: 2.0, kind: "pine", shade: 0.2 },
  { x: 1410, y: 870, s: 2.3, kind: "round", shade: 0.7 },
];
const MEADOW_FLOWERS = buildFlowers(51, 120, 0, 1440, 735, 900);
const HILL_FLOWERS = buildFlowers(67, 60, 0, 1440, 640, 720);

function Pine({ x, y, s, shade }) {
  const g1 = shade < 0.5 ? "#166534" : "#14532d";
  const g2 = shade < 0.5 ? "#15803d" : "#166534";
  const g3 = shade < 0.5 ? "#22c55e" : "#16a34a";
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3" y="-8" width="6" height="14" fill="#7c4a1e" />
      <path d="M0 -62 L-24 -8 L24 -8 Z" fill={g1} />
      <path d="M0 -74 L-19 -30 L19 -30 Z" fill={g2} />
      <path d="M0 -86 L-13 -52 L13 -52 Z" fill={g3} />
    </g>
  );
}
function RoundTree({ x, y, s, shade }) {
  const c = shade < 0.33 ? ["#15803d", "#22c55e"] : shade < 0.66 ? ["#166534", "#4ade80"] : ["#3f6212", "#84cc16"];
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-3.5" y="-26" width="7" height="30" rx="2" fill="#8b5a2b" />
      <circle cx="0" cy="-40" r="22" fill={c[0]} />
      <circle cx="-12" cy="-30" r="14" fill={c[0]} />
      <circle cx="12" cy="-31" r="15" fill={c[0]} />
      <circle cx="-6" cy="-48" r="11" fill={c[1]} opacity="0.55" />
      {shade > 0.8 && <><circle cx="8" cy="-36" r="3" fill="#ef4444" /><circle cx="-9" cy="-28" r="3" fill="#ef4444" /></>}
    </g>
  );
}
function Birch({ x, y, s }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-2.5" y="-46" width="5" height="50" fill="#f1f5f9" />
      <rect x="-2.5" y="-36" width="5" height="2" fill="#334155" />
      <rect x="-2.5" y="-20" width="5" height="2" fill="#334155" />
      <ellipse cx="0" cy="-56" rx="14" ry="20" fill="#65a30d" />
      <ellipse cx="4" cy="-62" rx="8" ry="11" fill="#a3e635" opacity="0.6" />
    </g>
  );
}
function Tree(t) {
  if (t.kind === "pine") return <Pine {...t} />;
  if (t.kind === "birch") return <Birch {...t} />;
  return <RoundTree {...t} />;
}

function Flower({ x, y, c, s, sway, still = false }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className={still ? undefined : "gp-sway"} style={still ? undefined : { animationDelay: `${sway}s` }}>
        <path d="M0 0 Q1 -7 0 -13" stroke="#15803d" strokeWidth="1.6" fill="none" />
        <ellipse cx="-3" cy="-6" rx="3" ry="1.4" fill="#22c55e" transform="rotate(-30 -3 -6)" />
        {[0, 72, 144, 216, 288].map(a => (
          <ellipse key={a} cx="0" cy="-17.5" rx="2.6" ry="4" fill={c} transform={`rotate(${a} 0 -13)`} />
        ))}
        <circle cx="0" cy="-13" r="2.2" fill={c === "#facc15" ? "#b45309" : "#fde047"} />
      </g>
    </g>
  );
}

function Butterfly({ x, y, c, delay }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="gp-flutter-path" style={{ animationDelay: `${delay}s` }}>
        <g className="gp-flutter" style={{ animationDelay: `${delay}s` }}>
          <ellipse cx="-5" cy="-3" rx="5" ry="4" fill={c} />
          <ellipse cx="5" cy="-3" rx="5" ry="4" fill={c} />
          <ellipse cx="-4" cy="3" rx="3.5" ry="3" fill={c} opacity="0.85" />
          <ellipse cx="4" cy="3" rx="3.5" ry="3" fill={c} opacity="0.85" />
          <rect x="-0.8" y="-5" width="1.6" height="10" rx="0.8" fill="#1f2937" />
        </g>
      </g>
    </g>
  );
}

function Bird({ x, y, delay, s = 1 }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="gp-bird" style={{ animationDelay: `${delay}s` }}>
        <path d="M-10 0 Q-5 -6 0 0 Q5 -6 10 0" stroke="#1e3a5f" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
    </g>
  );
}

function Cloud({ x, y, s, dur, delay, opacity = 0.9 }) {
  return (
    <g className="gp-cloud" style={{ animationDuration: `${dur}s`, animationDelay: `${delay}s` }}>
      <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
        <ellipse cx="0" cy="0" rx="60" ry="20" fill="#ffffff" />
        <ellipse cx="-28" cy="-10" rx="30" ry="22" fill="#ffffff" />
        <ellipse cx="18" cy="-18" rx="34" ry="28" fill="#ffffff" />
        <ellipse cx="45" cy="-4" rx="24" ry="16" fill="#f8fafc" />
      </g>
    </g>
  );
}

function NatureSceneImpl({ waterfall = true }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMax slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0, pointerEvents: "none" }}
    >
      <defs>
        <linearGradient id="ns-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4fa8e0" />
          <stop offset="45%" stopColor="#8fd0ef" />
          <stop offset="70%" stopColor="#c9ecd5" />
        </linearGradient>
        <radialGradient id="ns-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fffbe6" />
          <stop offset="45%" stopColor="#fde68a" />
          <stop offset="100%" stopColor="#fde68a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ns-mtn-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7c93b8" />
          <stop offset="100%" stopColor="#9bb7c9" />
        </linearGradient>
        <linearGradient id="ns-mtn-near" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5b7a8f" />
          <stop offset="100%" stopColor="#6f9a86" />
        </linearGradient>
        <linearGradient id="ns-hill1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#86c96a" />
          <stop offset="100%" stopColor="#5fae4f" />
        </linearGradient>
        <linearGradient id="ns-hill2" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5cb85c" />
          <stop offset="100%" stopColor="#3f9a45" />
        </linearGradient>
        <linearGradient id="ns-meadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4caf50" />
          <stop offset="100%" stopColor="#2d7d32" />
        </linearGradient>
        <linearGradient id="ns-water" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="ns-fall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="100%" stopColor="#7dd3fc" />
        </linearGradient>
        <radialGradient id="ns-pond" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="70%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#0369a1" />
        </radialGradient>
      </defs>

      {/* Sky + sun */}
      <rect x="0" y="0" width="1440" height="900" fill="url(#ns-sky)" />
      <circle cx="1180" cy="130" r="150" fill="url(#ns-sun)" className="gp-sun-glow" />
      <circle cx="1180" cy="130" r="46" fill="#fde047" />
      <circle cx="1180" cy="130" r="38" fill="#fef08a" />

      {/* Clouds drifting */}
      <Cloud x={160} y={110} s={1.1} dur={70} delay={-10} />
      <Cloud x={620} y={70} s={0.8} dur={90} delay={-40} opacity={0.8} />
      <Cloud x={980} y={200} s={0.6} dur={80} delay={-25} opacity={0.75} />
      <Cloud x={1320} y={60} s={0.9} dur={100} delay={-60} opacity={0.85} />

      {/* Birds */}
      <Bird x={420} y={170} delay={0} />
      <Bird x={455} y={190} delay={0.4} s={0.8} />
      <Bird x={880} y={140} delay={0.8} s={0.9} />

      {/* Far snowy mountains */}
      <path d="M-20 470 L120 300 L210 380 L330 220 L470 400 L560 330 L700 180 L860 390 L960 300 L1090 210 L1230 380 L1330 290 L1460 400 L1460 520 L-20 520 Z" fill="url(#ns-mtn-far)" />
      <path d="M330 220 L300 258 L318 252 L335 266 L352 250 L372 262 Z M700 180 L668 222 L690 214 L706 230 L724 214 L742 226 Z M1090 210 L1060 248 L1080 242 L1096 256 L1112 242 L1128 252 Z" fill="#f8fafc" opacity="0.95" />
      {/* Nearer mountains */}
      <path d="M-20 520 L90 400 L190 470 L300 360 L430 480 L520 430 L640 350 L760 470 L900 380 L1010 460 L1120 370 L1260 470 L1380 410 L1460 450 L1460 560 L-20 560 Z" fill="url(#ns-mtn-near)" opacity="0.9" />

      {/* Distant forest band on far hills */}
      <path d="M-20 540 Q200 500 420 530 Q700 570 980 520 Q1220 490 1460 530 L1460 600 L-20 600 Z" fill="url(#ns-hill1)" />
      {FAR_FOREST.map((t, i) => <Tree key={`ff${i}`} {...t} />)}

      {/* Waterfall from the left cliff */}
      {waterfall && (
        <g>
          {/* Rocky cliff with mossy top */}
          <path d="M120 600 L128 470 L150 418 L185 400 L245 398 L285 414 L305 460 L312 600 Z" fill="#6b7280" />
          <path d="M128 470 L150 418 L170 430 L160 600 L120 600 Z" fill="#4b5563" />
          <path d="M285 414 L305 460 L312 600 L290 600 L278 470 Z" fill="#525c69" />
          <path d="M140 520 L170 515 M270 500 L298 505 M150 560 L175 556" stroke="#374151" strokeWidth="3" strokeLinecap="round" />
          <path d="M148 420 Q165 400 190 402 Q215 392 245 398 Q275 398 290 418 Q260 410 230 412 Q200 405 175 414 Q160 418 148 420 Z" fill="#22c55e" />
          <path d="M150 421 Q170 432 182 418 M220 412 Q232 426 246 410" stroke="#16a34a" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M182 412 Q215 405 245 413 L250 600 Q215 596 180 600 Z" fill="url(#ns-fall)" opacity="0.92" />
          {[192, 205, 218, 231, 242].map((x, i) => (
            <rect key={i} x={x} y={418} width="3" height="170" rx="1.5" fill="#ffffff" opacity="0.7"
              className="gp-fall-streak" style={{ animationDelay: `${i * 0.18}s` }} />
          ))}
          <ellipse cx="215" cy="602" rx="58" ry="12" fill="#ffffff" opacity="0.55" className="gp-mist" />
          {[[118,585,22],[140,570,16],[300,582,20],[318,594,15],[262,598,12]].map(([cx,cy,r],i)=>(
            <g key={i}><circle cx={cx} cy={cy} r={r} fill="#15803d" /><circle cx={cx-r*0.3} cy={cy-r*0.35} r={r*0.55} fill="#22c55e" opacity="0.7" /></g>
          ))}
        </g>
      )}

      {/* Mid hills with forests */}
      <path d="M-20 600 Q160 560 360 590 Q560 620 760 590 Q980 560 1180 595 Q1330 615 1460 590 L1460 700 L-20 700 Z" fill="url(#ns-hill2)" />
      {MID_FOREST_L.map((t, i) => <Tree key={`ml${i}`} {...t} />)}
      {MID_FOREST_R.map((t, i) => <Tree key={`mr${i}`} {...t} />)}
      {HILL_FLOWERS.map((f, i) => <Flower key={`hf${i}`} {...f} s={f.s * 0.6} still />)}

      {/* River winding from the waterfall to the pond */}
      <path d="M215 605 C 320 640, 420 640, 520 665 S 700 720, 820 712 S 1000 700, 1080 735"
        stroke="url(#ns-water)" strokeWidth="26" fill="none" strokeLinecap="round" opacity="0.95" />
      <path d="M215 605 C 320 640, 420 640, 520 665 S 700 720, 820 712 S 1000 700, 1080 735"
        stroke="#e0f2fe" strokeWidth="3" fill="none" strokeDasharray="10 22" className="gp-river-flow" opacity="0.8" />

      {/* Meadow (foreground) */}
      <path d="M-20 700 Q240 670 520 700 Q800 735 1080 700 Q1280 680 1460 705 L1460 900 L-20 900 Z" fill="url(#ns-meadow)" />

      {/* Pond with lily pads and reeds */}
      <g>
        <ellipse cx="1110" cy="760" rx="150" ry="40" fill="#166534" opacity="0.35" />
        <ellipse cx="1110" cy="752" rx="138" ry="34" fill="url(#ns-pond)" />
        <ellipse cx="1080" cy="742" rx="70" ry="9" fill="#e0f2fe" opacity="0.35" className="gp-ripple" />
        <g fill="#22c55e">
          <path d="M1040 758 a14 7 0 1 0 0.1 0 Z M1040 758 l12 -3 l-2 6 Z" />
          <ellipse cx="1150" cy="748" rx="16" ry="7" />
          <ellipse cx="1185" cy="765" rx="12" ry="5" />
        </g>
        <circle cx="1150" cy="744" r="4.5" fill="#f9a8d4" />
        <circle cx="1150" cy="744" r="2" fill="#fde047" />
        {[978, 986, 994, 1236, 1244].map((x, i) => (
          <g key={i} className="gp-sway" style={{ animationDelay: `${i * 0.5}s` }}>
            <path d={`M${x} 770 Q${x + 2} 735 ${x - 2} 712`} stroke="#3f6212" strokeWidth="3" fill="none" />
            <rect x={x - 4} y={712} width="6" height="16" rx="3" fill="#78350f" />
          </g>
        ))}
        {/* A duck */}
        <g className="gp-duck">
          <ellipse cx="1100" cy="752" rx="13" ry="7" fill="#fafafa" />
          <circle cx="1111" cy="743" r="6" fill="#fafafa" />
          <path d="M1116 743 l7 1.5 l-7 2 Z" fill="#f59e0b" />
          <circle cx="1112" cy="741.5" r="1.1" fill="#111827" />
        </g>
      </g>

      {/* Stepping stones + small wooden bridge over the river */}
      <g>
        <rect x="585" y="672" width="90" height="10" rx="3" fill="#a16207" />
        {[590, 605, 620, 635, 650, 665].map(x => <rect key={x} x={x} y="666" width="7" height="22" rx="2" fill="#854d0e" />)}
        <path d="M585 672 Q630 650 675 672" stroke="#78350f" strokeWidth="3" fill="none" />
      </g>

      {/* Rocks */}
      <ellipse cx="330" cy="780" rx="34" ry="15" fill="#94a3b8" />
      <ellipse cx="320" cy="774" rx="20" ry="9" fill="#cbd5e1" />
      <ellipse cx="880" cy="815" rx="26" ry="11" fill="#94a3b8" />

      {/* Meadow flowers + grass tufts */}
      {MEADOW_FLOWERS.map((f, i) => <Flower key={`mf${i}`} {...f} />)}
      {Array.from({ length: 36 }, (_, i) => {
        const x = (i * 41 + 17) % 1440, y = 760 + ((i * 53) % 130);
        return <path key={`g${i}`} d={`M${x} ${y} l-4 -12 M${x} ${y} l0 -15 M${x} ${y} l5 -11`} stroke="#166534" strokeWidth="2" strokeLinecap="round" />;
      })}

      {/* Foreground trees framing the scene */}
      {NEAR_TREES.map((t, i) => <Tree key={`nt${i}`} {...t} />)}

      {/* Mushrooms */}
      <g>
        <rect x="246" y="845" width="6" height="12" fill="#f5f5f4" />
        <path d="M238 847 Q249 830 260 847 Z" fill="#dc2626" />
        <circle cx="245" cy="841" r="1.6" fill="#fff" /><circle cx="252" cy="839" r="1.4" fill="#fff" />
        <rect x="1220" y="860" width="5" height="10" fill="#f5f5f4" />
        <path d="M1213 862 Q1222.5 848 1232 862 Z" fill="#ea580c" />
      </g>

      {/* Butterflies */}
      <Butterfly x={520} y={760} c="#f472b6" delay={0} />
      <Butterfly x={760} y={690} c="#facc15" delay={1.3} />
      <Butterfly x={1000} y={800} c="#a78bfa" delay={2.1} />
      <Butterfly x={300} y={690} c="#fb923c" delay={0.7} />
    </svg>
  );
}

const NatureScene = memo(NatureSceneImpl);
export default NatureScene;

/* CSS animations used above (injected once by GlobalStyles in file.jsx). */
export const NATURE_SCENE_CSS = `
  .gp-cloud { animation: gpCloud linear infinite; }
  @keyframes gpCloud { from { transform: translateX(-260px); } to { transform: translateX(1700px); } }
  .gp-sun-glow { animation: gpSun 6s ease-in-out infinite; transform-origin: 1180px 130px; }
  @keyframes gpSun { 0%,100% { transform: scale(1); opacity: 0.9; } 50% { transform: scale(1.08); opacity: 1; } }
  .gp-bird { animation: gpBird 0.9s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
  @keyframes gpBird { from { transform: scaleY(1); } to { transform: scaleY(0.4); } }
  .gp-sway { animation: gpSway 3.2s ease-in-out infinite; transform-box: fill-box; transform-origin: bottom center; }
  @keyframes gpSway { 0%,100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
  .gp-flutter { animation: gpFlutter 0.25s ease-in-out infinite alternate; transform-box: fill-box; transform-origin: center; }
  @keyframes gpFlutter { from { transform: scaleX(1); } to { transform: scaleX(0.35); } }
  .gp-flutter-path { animation: gpFlutterPath 9s ease-in-out infinite; }
  @keyframes gpFlutterPath { 0%,100% { transform: translate(0,0); } 25% { transform: translate(40px,-30px); } 50% { transform: translate(80px,-5px); } 75% { transform: translate(30px,-45px); } }
  .gp-fall-streak { animation: gpFall 0.7s linear infinite; }
  @keyframes gpFall { 0% { transform: translateY(-12px); opacity: 0.2; } 50% { opacity: 0.8; } 100% { transform: translateY(12px); opacity: 0.2; } }
  .gp-mist { animation: gpMist 2.4s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes gpMist { 0%,100% { transform: scaleX(1); opacity: 0.45; } 50% { transform: scaleX(1.15); opacity: 0.7; } }
  .gp-river-flow { animation: gpRiver 2.2s linear infinite; }
  @keyframes gpRiver { to { stroke-dashoffset: -64; } }
  .gp-ripple { animation: gpRipple 3s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  @keyframes gpRipple { 0%,100% { transform: scaleX(1); opacity: 0.3; } 50% { transform: scaleX(1.2); opacity: 0.55; } }
  .gp-duck { animation: gpDuck 12s ease-in-out infinite; }
  @keyframes gpDuck { 0%,100% { transform: translateX(0); } 50% { transform: translateX(55px); } }
`;
