// The living background scenes, one per theme. Static markup only: no state, no effects and
// no client JavaScript. CSS shows the scene matching html[data-theme] and animates it only when
// data-ambient-motion is enabled and the user has not asked for reduced motion.
//
// Every moving part is an HTML box (a painted layer, or one holding its own small SVG), because
// Chrome composites transforms on HTML elements but repaints the whole <svg> when a shape inside
// it moves. Nested boxes inherit their parent's motion, so a lantern hangs from its swaying vine.

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (n) => Math.round(n * 10) / 10;

// A swaying part: amplitude in degrees, cycle in seconds, start offset in seconds and one of
// three keyframe shapes, so neighbouring parts never move in step.
function sway(amplitude, seconds, offset, shape = 1) {
  return {
    '--sway': `${amplitude}deg`,
    '--sway-time': `${seconds}s`,
    '--sway-delay': `${-offset}s`,
    '--sway-name': `sc-sway-${shape}`
  };
}

// A free-standing piece placed by its class in theme-scenery.css, optionally holding an SVG.
function Piece({ className, viewBox, ratio = 'xMidYMid meet', style, children }) {
  return (
    <div className={`sc-piece ${className}`} style={style}>
      {viewBox ? <svg className="sc-art" viewBox={viewBox} preserveAspectRatio={ratio} focusable="false">{children}</svg> : children}
    </div>
  );
}

// Motion variables for the shared drift / twinkle / turn / breathe animations.
function motion(seconds, offset = 0, extra = {}) {
  return { '--time': `${seconds}s`, '--delay': `${-offset}s`, ...extra };
}

// Glowing points that drift and pulse, shown only in dark mode while motion is on.
function Fireflies({ className, points }) {
  return (
    <div className={`sc-fireflies ${className}`}>
      {points.map(([x, y], index) => (
        <div
          key={index}
          className="sc-firefly"
          style={{ left: `${r1(x)}%`, top: `${r1(y)}%`, '--drift-time': `${11 + ((index * 7) % 11)}s`, '--pulse-time': `${3.8 + ((index * 1.3) % 3)}s`, '--drift-delay': `${-index * 3.1}s` }}
        ><div /></div>
      ))}
    </div>
  );
}

// Scattered points for star fields and dust, deterministic so every render is identical.
function scatter(seed, count, w, h, rMin, rMax, avoid) {
  const next = rng(seed);
  const out = [];
  while (out.length < count) {
    const x = next() * w;
    const y = next() * h;
    if (avoid && avoid(x, y)) continue;
    out.push([r1(x), r1(y), r1(rMin + next() * (rMax - rMin)), next()]);
  }
  return out;
}

// A painted layer from public/themes. The image is handed to CSS as custom properties and drawn as
// a background (.sc-img), so the browser fetches only the active tone's art and nothing for a
// scene that is display: none. Size and position come from the layer's class in theme-scenery.css.
function Art({ className, light, dark, style, children }) {
  const images = { '--img-light': `url('/themes/${light}.webp')` };
  if (dark) images['--img-dark'] = `url('/themes/${dark}.webp')`;
  return <div className={`sc-img ${className}`} style={{ ...images, ...style }}>{children}</div>;
}

/* ─── Garden ──────────────────────────────────────────────────────────────────────────────── */
// The painted tree from public/themes/garden, rooted in the bottom right corner. The images are
// CSS backgrounds chosen by tone in theme-scenery.css, so the browser fetches only the active
// tone's art and nothing at all while another theme (display: none) is showing. The trunk never
// moves; the two canopy branches sit behind the crown and turn a fraction of a degree about their
// hidden bases, the blossom twigs they carry a little more, each on its own clock.

function GardenScene() {
  return (
    <div className="scene scene-garden" data-scene="garden">
      <div className="gd-atmosphere" />
      <div className="sc-stage gd-stage">
        <div className="sc-sway gd-branch gd-branch-high" style={sway(0.5, 17, 6, 1)}>
          <div className="sc-sway gd-twig gd-twig-a" style={sway(2.2, 9.5, 2, 3)} />
        </div>
        <div className="sc-sway gd-branch gd-branch-low" style={sway(0.7, 13, 3, 2)}>
          <div className="sc-sway gd-twig gd-twig-b" style={sway(2.8, 7.8, 5, 1)} />
        </div>
        <div className="gd-tree" />
        <div className="sc-sway gd-twig gd-twig-c" style={sway(1.6, 11.5, 4, 2)} />
        <div className="gd-fall gd-fall-leaf"><div /></div>
        <div className="gd-fall gd-fall-petal"><div /></div>
        <Fireflies className="gd-fireflies" points={[[46, 84], [22, 90], [64, 66], [34, 72], [58, 94]]} />
      </div>
    </div>
  );
}

/* ─── Liquid Glass ────────────────────────────────────────────────────────────────────────── */
// Clear glass orbs at three depths floating on slow, unrelated clocks, two refractive glass
// arcs and pools of caustic light breathing beneath them. Kept quiet so the panels themselves
// stay the strongest glass on screen.

function GlassScene() {
  return (
    <div className="scene scene-glass" data-scene="glass">
      <div className="gl-atmosphere" />
      <Art className="gl-caustic gl-caustic-a sc-breathe" light="liquid-glass/caustics-light-cool" dark="liquid-glass/caustics-dark-cool" style={motion(19, 4, { '--low': 0.45 })} />
      <Art className="gl-caustic gl-caustic-b sc-breathe" light="liquid-glass/caustics-light-warm" dark="liquid-glass/caustics-dark-warm" style={motion(23, 11, { '--low': 0.4 })} />
      <Art className="gl-arc gl-arc-a sc-drift" light="liquid-glass/swoosh-light-01" dark="liquid-glass/swoosh-dark-01" style={motion(70, 12, { '--dx': '1.2vw', '--dy': '-1vh', '--rot': '-2deg' })} />
      <Art className="gl-arc gl-arc-b sc-drift" light="liquid-glass/wave-light-01" dark="liquid-glass/wave-dark-01" style={motion(84, 40, { '--dx': '-1vw', '--dy': '1.2vh', '--rot': '2deg' })} />
      <Art className="gl-orb gl-orb-a sc-drift" light="liquid-glass/bubble-large-light" dark="liquid-glass/bubble-large-dark" style={motion(90, 20, { '--dx': '-1.4vw', '--dy': '2vh' })} />
      <Art className="gl-orb gl-orb-b sc-drift" light="liquid-glass/bubble-large-light" dark="liquid-glass/bubble-large-dark" style={motion(64, 8, { '--dx': '1.6vw', '--dy': '-3vh' })} />
      <div className="sc-group sc-detail">
        <Art className="gl-orb gl-orb-c sc-drift" light="liquid-glass/bubble-large-light" dark="liquid-glass/bubble-large-dark" style={motion(52, 30, { '--dx': '-1vw', '--dy': '-4vh' })} />
        <Art className="gl-drop gl-drop-a sc-drift" light="liquid-glass/bubble-light-02" dark="liquid-glass/bubble-dark-02" style={motion(47, 5, { '--dx': '1vw', '--dy': '-5vh' })} />
        <Art className="gl-drop gl-drop-b sc-drift" light="liquid-glass/bubble-light-01" dark="liquid-glass/bubble-dark-01" style={motion(58, 22, { '--dx': '-1vw', '--dy': '-4vh' })} />
      </div>
    </div>
  );
}

/* ─── OLED Black ──────────────────────────────────────────────────────────────────────────── */
// Almost nothing: a sparse field of points, a handful that glint now and then, and a hairline
// horizon that brightens very slowly. Quieter than every other theme on purpose.

function OledScene() {
  const stars = scatter(101, 34, 1600, 900, 0.6, 1.5, (x, y) => y > 820);
  return (
    <div className="scene scene-oled" data-scene="oled">
      <Piece className="ol-stars" viewBox="0 0 1600 900" ratio="xMidYMid slice">
        {stars.map(([x, y, r], index) => <circle key={index} className="ol-star" cx={x} cy={y} r={r} />)}
      </Piece>
      {[[12, 18], [78, 9], [64, 31], [91, 57], [23, 64], [45, 11]].map(([x, y], index) => (
        <div key={index} className="sc-piece ol-glint sc-twinkle" style={{ left: `${x}%`, top: `${y}%`, ...motion(9 + index * 4.3, index * 2.7, { '--low': 0.15 }) }} />
      ))}
      <div className="sc-piece ol-horizon">
        <div className="ol-horizon-glow sc-breathe" style={motion(46, 6, { '--low': 0.45 })} />
        <div className="ol-horizon-line" />
      </div>
    </div>
  );
}

/* ─── Matte Neon ──────────────────────────────────────────────────────────────────────────── */
// Circuit traces in two corners with nodes that pulse out of step, short pulses of light that
// run along the straight traces, waveforms along the bottom and a rare sweep of energy.

const NEON_TRACES_LOW = ['M0 330H140L180 290H330L370 250H470', 'M0 362H220L250 330H420', 'M60 400V340L90 310H200', 'M0 262H80L120 222H260L290 192', 'M300 400V370L330 340H560'];
const NEON_NODES_LOW = [[470, 250], [420, 330], [200, 310], [290, 192], [560, 340], [140, 330], [330, 290]];
const NEON_TRACES_HIGH = ['M600 70H460L420 110H270L230 150H130', 'M600 38H380L350 70H180', 'M540 0V60L510 90H400', 'M600 140H520L480 180H340L310 210'];
const NEON_NODES_HIGH = [[130, 150], [180, 70], [400, 90], [310, 210], [270, 110], [460, 70]];

function neonCircuit(traces, nodes, tone) {
  return (
    <>
      {traces.map((d, index) => <path key={index} className={`ne-trace ne-${tone}`} d={d} />)}
      {nodes.map(([x, y], index) => <circle key={index} className={`ne-node ne-${tone}`} cx={x} cy={y} r="5" />)}
    </>
  );
}

function neonWave(amplitude, period, y) {
  let d = `M0 ${y}`;
  for (let x = 0, half = 0; x < 3200; x += period / 2, half += 1) {
    d += `Q${x + period / 4} ${y + (half % 2 === 0 ? -amplitude : amplitude)} ${x + period / 2} ${y}`;
  }
  return d;
}

function NeonScene() {
  return (
    <div className="scene scene-neon" data-scene="neon">
      <Piece className="ne-circuit ne-circuit-low" viewBox="0 0 600 400" ratio="none">
        {neonCircuit(NEON_TRACES_LOW, NEON_NODES_LOW, 'cyan')}
      </Piece>
      <Piece className="ne-circuit ne-circuit-high" viewBox="0 0 600 400" ratio="none">
        {neonCircuit(NEON_TRACES_HIGH, NEON_NODES_HIGH, 'violet')}
      </Piece>
      <div className="sc-piece ne-circuit ne-circuit-low">
        {NEON_NODES_LOW.slice(0, 5).map(([x, y], index) => (
          <div key={index} className="ne-glow ne-glow-cyan sc-twinkle" style={{ left: `${r1((x / 600) * 100)}%`, top: `${r1((y / 400) * 100)}%`, ...motion(3.4 + index * 1.7, index * 1.3, { '--low': 0.2 }) }} />
        ))}
        <div className="ne-track" style={{ left: '30%', top: '72.5%', width: '25%' }}><div className="ne-pulse ne-pulse-cyan" style={motion(9, 2)} /></div>
        <div className="ne-track" style={{ left: '41.7%', top: '82.5%', width: '28.3%' }}><div className="ne-pulse ne-pulse-lime" style={motion(13, 7)} /></div>
      </div>
      <div className="sc-piece ne-circuit ne-circuit-high">
        {NEON_NODES_HIGH.slice(0, 4).map(([x, y], index) => (
          <div key={index} className="ne-glow ne-glow-violet sc-twinkle" style={{ left: `${r1((x / 600) * 100)}%`, top: `${r1((y / 400) * 100)}%`, ...motion(4.1 + index * 1.9, index * 2.1, { '--low': 0.2 }) }} />
        ))}
        <div className="ne-track ne-track-reverse" style={{ left: '38.3%', top: '27.5%', width: '31.7%' }}><div className="ne-pulse ne-pulse-magenta" style={motion(11, 4)} /></div>
        <div className="ne-track ne-track-reverse" style={{ left: '30%', top: '9.5%', width: '33.3%' }}><div className="ne-pulse ne-pulse-cyan" style={motion(15, 10)} /></div>
      </div>
      <div className="sc-piece ne-waves">
        <div className="ne-wave ne-wave-a" style={motion(52, 0)}>
          <svg className="sc-art" viewBox="0 0 3200 100" preserveAspectRatio="none" focusable="false"><path className="ne-wave-line ne-cyan" d={neonWave(18, 400, 50)} /></svg>
        </div>
        <div className="ne-wave ne-wave-b" style={motion(76, 20)}>
          <svg className="sc-art" viewBox="0 0 3200 100" preserveAspectRatio="none" focusable="false"><path className="ne-wave-line ne-magenta" d={neonWave(11, 800, 56)} /></svg>
        </div>
      </div>
      <div className="sc-piece ne-sweep" style={motion(27, 9)} />
    </div>
  );
}

/* ─── Minimal ─────────────────────────────────────────────────────────────────────────────── */
// One large circle, a small dot grid and a lot of empty space. The circle shifts a few pixels
// over more than a minute and the grid barely breathes; nothing else happens.

function MinimalScene() {
  const dots = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 7; col += 1) dots.push([8 + col * 17, 8 + row * 16]);
  }
  return (
    <div className="scene scene-minimal" data-scene="minimal">
      <Piece className="mn-circle sc-drift" style={motion(86, 20, { '--dx': '3px', '--dy': '-3px' })} viewBox="0 0 200 200">
        <circle className="mn-line" cx="100" cy="100" r="99" vectorEffect="non-scaling-stroke" />
        <circle className="mn-line mn-faint" cx="100" cy="100" r="72" vectorEffect="non-scaling-stroke" />
      </Piece>
      <Piece className="mn-dots sc-breathe" style={motion(64, 10, { '--low': 0.7 })} viewBox="0 0 118 80">
        {dots.map(([x, y], index) => <circle key={index} className="mn-dot" cx={x} cy={y} r="1.6" />)}
      </Piece>
      <div className="sc-piece mn-rule" />
    </div>
  );
}

/* ─── Neomorphic ──────────────────────────────────────────────────────────────────────────── */
// Soft objects pressed out of the page material and lit from the top left, as the controls are.
// Only their position drifts; their shadows are painted once and never animated.

function NeumorphicScene() {
  return (
    <div className="scene scene-neumorphic" data-scene="neumorphic">
      <div className="sc-piece nm-object nm-dial sc-drift" style={motion(92, 10, { '--dx': '-8px', '--dy': '6px' })}><div className="nm-dial-well"><div className="nm-dial-knob" /></div></div>
      <div className="sc-piece nm-object nm-ring sc-drift" style={motion(104, 40, { '--dx': '6px', '--dy': '8px' })}><div className="nm-ring-hole" /></div>
      <div className="sc-piece nm-object nm-pill sc-drift" style={motion(78, 25, { '--dx': '10px', '--dy': '-4px' })}><div className="nm-pill-slot" /></div>
      <div className="sc-piece nm-object nm-dot sc-drift" style={motion(70, 5, { '--dx': '-5px', '--dy': '-7px' })} />
      <div className="sc-piece nm-object nm-dot nm-dot-small sc-drift" style={motion(88, 33, { '--dx': '4px', '--dy': '5px' })} />
    </div>
  );
}

/* ─── Pastel ──────────────────────────────────────────────────────────────────────────────── */
// A soft sky of painted clouds at three depths drifting at different speeds, a rainbow resting on
// the mid layer, iridescent bubbles rising slowly, sparkles blinking out of step, a moon at night
// and, once in a long while, a shooting star.

function PastelScene() {
  return (
    <div className="scene scene-pastel" data-scene="pastel">
      <div className="pa-atmosphere" />
      <Art className="pa-cloud pa-far pa-cloud-a sc-drift" light="pastel/cloud-light-03" dark="pastel/cloud-dark-03" style={motion(150, 10, { '--dx': '4vw', '--dy': '0px' })} />
      <Art className="pa-cloud pa-far pa-cloud-b sc-drift" light="pastel/cloud-light-04" dark="pastel/cloud-dark-04" style={motion(170, 70, { '--dx': '-4vw', '--dy': '0px' })} />
      <Art className="pa-moon sc-drift" light="pastel/moon" style={motion(90, 20, { '--dx': '-0.6vw', '--dy': '1vh', '--rot': '4deg' })} />
      <Art className="pa-cloud pa-mid pa-cloud-c sc-drift" light="pastel/cloud-light-01" dark="pastel/cloud-dark-01" style={motion(118, 40, { '--dx': '3vw', '--dy': '0px' })} />
      <Art className="pa-rainbow sc-drift" light="pastel/rainbow-light-01" dark="pastel/rainbow-dark-01" style={motion(96, 30, { '--dx': '-1.5vw', '--dy': '0.6vh' })} />
      <Art className="pa-cloud pa-near pa-blob-a sc-drift" light="pastel/bubble-cloud-light-01" dark="pastel/bubble-cloud-dark-01" style={motion(104, 15, { '--dx': '2vw', '--dy': '0px' })} />
      <Art className="pa-cloud pa-near pa-cloud-d sc-drift" light="pastel/cloud-light-02" dark="pastel/cloud-dark-02" style={motion(92, 55, { '--dx': '-2.5vw', '--dy': '0px' })} />
      <Art className="pa-cloud pa-near pa-blob-b sc-drift" light="pastel/bubble-cloud-light-03" dark="pastel/bubble-cloud-dark-03" style={motion(110, 5, { '--dx': '-2vw', '--dy': '0px' })} />
      <div className="sc-group sc-detail">
        <Art className="pa-bubble pa-bubble-a sc-drift" light="pastel/bubble-01" style={motion(46, 6, { '--dx': '1vw', '--dy': '-7vh' })} />
        <Art className="pa-bubble pa-bubble-b sc-drift" light="pastel/bubble-03" style={motion(58, 24, { '--dx': '-1vw', '--dy': '-9vh' })} />
        <Art className="pa-bubble pa-bubble-c sc-drift" light="pastel/bubble-05" style={motion(39, 14, { '--dx': '0.8vw', '--dy': '-6vh' })} />
        <Art className="pa-sparkle pa-sparkle-a sc-twinkle" light="pastel/sparkle-01" style={motion(4.6, 1, { '--low': 0.15 })} />
        <Art className="pa-sparkle pa-sparkle-b sc-twinkle" light="pastel/sparkle-02" style={motion(6.1, 3.2, { '--low': 0.15 })} />
        <Art className="pa-sparkle pa-sparkle-c sc-twinkle" light="pastel/sparkle-03" style={motion(5.3, 2.1, { '--low': 0.15 })} />
        <Art className="pa-sparkle pa-sparkle-d sc-twinkle" light="pastel/sparkle-04" style={motion(7.2, 4.4, { '--low': 0.15 })} />
        <Art className="pa-star sc-drift" light="pastel/star-butter" style={motion(66, 18, { '--dx': '-1vw', '--dy': '2vh', '--rot': '14deg' })} />
        <Art className="pa-shooting" light="pastel/shooting-star-light" dark="pastel/shooting-star-dark" style={motion(53, 9)} />
      </div>
    </div>
  );
}

/* ─── Cyberpunk ───────────────────────────────────────────────────────────────────────────── */
// A synthwave horizon: the striped sun sinking behind the painted skyline, a CSS perspective
// grid rolling towards the viewer, and two rare events — a hovercraft crossing the sky and a
// short glitch of the sun. Nothing flickers continuously.

function CyberpunkScene() {
  return (
    <div className="scene scene-cyberpunk" data-scene="cyberpunk">
      <div className="cp-atmosphere" />
      <Art className="cp-sun" light="cyberpunk/sun-light" dark="cyberpunk/sun-dark" />
      <Art className="cp-skyline" light="cyberpunk/skyline-light" dark="cyberpunk/skyline-dark" />
      <div className="sc-piece cp-horizon" />
      <div className="sc-piece cp-floor"><div className="cp-plane" /></div>
      <div className="sc-group sc-detail">
        <Art className="cp-craft" light="cyberpunk/hovercraft-light-01" dark="cyberpunk/hovercraft-dark-01" />
      </div>
    </div>
  );
}

/* ─── Cottagecore ─────────────────────────────────────────────────────────────────────────── */
// A countryside view rather than a forest: soft hills in the distance, the painted cottage in the
// bottom right with smoke rising from its chimney, a stone wall and a fence with its robin along
// the bottom, wildflowers that sway, and a rose vine with a lantern hanging from the top left.
// At night a crescent moon, a few stars and fireflies over the meadow.

const COTTAGE_STARS = scatter(57, 26, 100, 42, 0.06, 0.16, (x, y) => x > 62 && y < 12);

function CottagecoreScene() {
  return (
    <div className="scene scene-cottagecore" data-scene="cottagecore">
      <div className="cc-atmosphere" />
      <svg className="sc-art cc-stars" viewBox="0 0 100 42" preserveAspectRatio="none" focusable="false">
        {COTTAGE_STARS.map(([x, y, r], index) => <circle key={index} cx={x} cy={y} r={r} />)}
      </svg>
      <div className="sc-piece cc-moon" />
      <svg className="sc-art cc-hills" viewBox="0 0 1600 300" preserveAspectRatio="none" focusable="false">
        <path className="cc-hill-far" d="M0 170C160 120 300 112 460 140C620 168 760 104 940 98C1120 92 1280 150 1420 132C1500 122 1560 112 1600 118V300H0Z" />
        <path className="cc-hill-near" d="M0 232C180 196 360 190 560 214C760 238 940 196 1140 188C1320 182 1480 214 1600 204V300H0Z" />
      </svg>
      <Art className="cc-cottage" light="cottagecore/cottage-light" dark="cottagecore/cottage-dark">
        <div className="cc-chimney">
          <Art className="cc-puff cc-puff-a" light="cottagecore/smoke-01" />
          <Art className="cc-puff cc-puff-b" light="cottagecore/smoke-02" />
        </div>
      </Art>
      <Art className="cc-stone-wall" light="cottagecore/stone-wall" />
      <Art className="cc-fence" light="cottagecore/fence-robin" />
      <Art className="cc-flowers cc-flowers-a sc-sway" light="cottagecore/wildflowers-01" style={sway(1.4, 9, 2, 2)} />
      <Art className="cc-flowers cc-flowers-b sc-sway" light="cottagecore/wildflowers-lavender" style={sway(1.8, 7.6, 5, 1)} />
      <div className="sc-group sc-detail">
        <Art className="cc-vine sc-sway" light="cottagecore/vine-roses" style={sway(1.6, 12.5, 3, 3)}>
          <Art className="cc-lantern sc-sway" light="cottagecore/lantern-ivy" style={sway(2.2, 8.4, 1, 2)}>
            <div className="cc-lantern-glow sc-breathe" style={motion(5.5, 2, { '--low': 0.55 })} />
          </Art>
        </Art>
        <Fireflies className="cc-fireflies" points={[[12, 78], [30, 70], [46, 84], [60, 74], [22, 88], [70, 66]]} />
      </div>
    </div>
  );
}

/* ─── Space ───────────────────────────────────────────────────────────────────────────────── */
// Layered deep space: a star field drifting very slowly with a few stars twinkling out of step,
// the painted spiral galaxy turning a few degrees over minutes, a nebula and two small planets at
// mid depth, the ringed planet close by in the bottom left, and a rare shooting star.

function SpaceScene() {
  const field = scatter(131, 110, 1600, 900, 0.5, 1.6);
  return (
    <div className="scene scene-space" data-scene="space">
      <div className="sp-nebula" />
      <div className="sc-piece sp-field sc-drift" style={motion(220, 30, { '--dx': '-2vw', '--dy': '1.4vh' })}>
        <svg className="sc-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
          {field.map(([x, y, r, tone], index) => <circle key={index} className={tone > 0.8 ? 'sp-star sp-star-warm' : 'sp-star'} cx={x} cy={y} r={r} />)}
        </svg>
      </div>
      {[[7, 14], [21, 38], [58, 47], [44, 8], [66, 22], [55, 92], [4, 58], [36, 6], [64, 70], [83, 90]].map(([x, y], index) => (
        <div key={index} className="sc-piece sp-twinkle sc-twinkle" style={{ left: `${x}%`, top: `${y}%`, ...motion(4 + (index % 4) * 1.6, index * 1.4, { '--low': 0.25 }) }} />
      ))}
      <Art className="sp-galaxy sc-sway" light="space/galaxy-light" dark="space/galaxy-dark" style={sway(4, 240, 60, 1)} />
      <Art className="sp-cloud sc-drift" light="space/nebula-light-01" dark="space/nebula-dark-01" style={motion(140, 30, { '--dx': '-2vw', '--dy': '-1vh' })} />
      <div className="sc-group sc-detail">
        <Art className="sp-small sp-small-a sc-drift" light="space/planet-light-06" dark="space/planet-dark-01" style={motion(130, 50, { '--dx': '-1.2vw', '--dy': '1.6vh' })} />
        <Art className="sp-small sp-small-b sc-drift" light="space/planet-light-04" dark="space/planet-dark-04" style={motion(100, 10, { '--dx': '1vw', '--dy': '-1.2vh' })} />
        <Art className="sp-spark sp-spark-a sc-twinkle" light="space/star-light-01" dark="space/star-dark-01" style={motion(6.4, 2, { '--low': 0.3 })} />
        <Art className="sp-spark sp-spark-b sc-twinkle" light="space/star-light-02" dark="space/star-dark-01" style={motion(8.2, 5, { '--low': 0.25 })} />
        <Art className="sp-shooting" light="space/shooting-star-02" style={motion(47, 12)} />
      </div>
      <Art className="sp-ringed sc-drift" light="space/planet-ringed-light" dark="space/planet-ringed-dark" style={motion(120, 20, { '--dx': '0.6vw', '--dy': '-0.8vh' })} />
    </div>
  );
}

/* ─── Dracula ─────────────────────────────────────────────────────────────────────────────── */
// Moonlight over a castle on a distant hill: a crescent moon, faint stars that twinkle out of
// step, four small bats crossing the sky over minutes, low mist and one lit window. At dusk
// (light mode) the same picture in lavender and parchment.

const DRACULA_BAT = 'M30 10C27 6 24 4 20 6C16 2 9 2 2 6C7 8 9 11 10 15C13 12 17 12 19 15C22 12 26 13 30 18C34 13 38 12 41 15C43 12 47 12 50 15C51 11 53 8 58 6C51 2 44 2 40 6C36 4 33 6 30 10Z';
const DRACULA_BATS = [
  { left: 18, top: 22, size: 34, time: 150, offset: 20, dx: '22vw', dy: '-5vh', flap: 1.9 },
  { left: 30, top: 14, size: 22, time: 190, offset: 75, dx: '16vw', dy: '3vh', flap: 1.5 },
  { left: 56, top: 9, size: 18, time: 210, offset: 40, dx: '-14vw', dy: '4vh', flap: 1.3 },
  { left: 8, top: 36, size: 26, time: 170, offset: 110, dx: '18vw', dy: '-8vh', flap: 1.7 }
];

function DraculaScene() {
  const stars = scatter(313, 46, 1600, 900, 0.5, 1.4, (x, y) => y > 620 || (x > 1260 && y < 260));
  return (
    <div className="scene scene-dracula" data-scene="dracula">
      <Piece className="dr-stars" viewBox="0 0 1600 900" ratio="xMidYMid slice">
        {stars.map(([x, y, r], index) => <circle key={index} className="dr-star" cx={x} cy={y} r={r} />)}
      </Piece>
      <div className="sc-group sc-detail">
        {[[14, 12], [42, 6], [68, 21], [24, 44], [52, 30]].map(([x, y], index) => (
          <div key={index} className="sc-piece dr-glint sc-twinkle" style={{ left: `${x}%`, top: `${y}%`, ...motion(7 + index * 3.7, index * 2.3, { '--low': 0.12 }) }} />
        ))}
      </div>
      <div className="sc-piece dr-moon">
        <div className="dr-moon-glow sc-breathe" style={motion(38, 4, { '--low': 0.55 })} />
        <svg className="sc-art" viewBox="0 0 200 200" focusable="false">
          <path className="dr-moon-shape" d="M100 20A80 80 0 0 0 100 180A100 100 0 0 1 100 20Z" />
        </svg>
      </div>
      <div className="sc-group sc-detail">
        {DRACULA_BATS.map((bat, index) => (
          <div key={index} className="sc-piece dr-bat sc-drift" style={{ left: `${bat.left}%`, top: `${bat.top}%`, width: `${bat.size}px`, ...motion(bat.time, bat.offset, { '--dx': bat.dx, '--dy': bat.dy }) }}>
            <div className="dr-flap" style={{ '--flap': `${bat.flap}s`, '--flap-delay': `${-index * 0.6}s` }}>
              <svg className="sc-art" viewBox="0 0 60 24" focusable="false"><path className="dr-bat-shape" d={DRACULA_BAT} /></svg>
            </div>
          </div>
        ))}
      </div>
      <div className="sc-piece dr-mist sc-breathe" style={motion(44, 12, { '--low': 0.6 })} />
      <Piece className="dr-castle" viewBox="0 0 600 220" ratio="xMinYMax meet">
        <path className="dr-silhouette" d="M0 220V156Q90 122 170 128Q240 118 300 130Q430 142 520 186Q566 210 600 220Z" />
        <path className="dr-silhouette" d="M158 132V82H154L170 52L186 82H182V104H190V60H186L215 18L244 60H240V104H250V74H246L261 40L276 74H272V104H282V96H279L288 78L297 96H294V132Z" />
        <path className="dr-silhouette" d="M182 104V98H188V104ZM244 104V98H250V104ZM274 104V98H280V104Z" />
        <path className="dr-rim" d="M0 156Q90 122 170 128Q240 118 300 130Q430 142 520 186Q566 210 600 220" />
        <rect className="dr-window sc-breathe" x="212" y="78" width="6" height="11" rx="3" style={motion(9, 3, { '--low': 0.35 })} />
      </Piece>
    </div>
  );
}

export default function ThemeScenery() {
  return (
    <>
      <GlassScene />
      <OledScene />
      <NeonScene />
      <MinimalScene />
      <NeumorphicScene />
      <PastelScene />
      <CyberpunkScene />
      <CottagecoreScene />
      <GardenScene />
      <SpaceScene />
      <DraculaScene />
    </>
  );
}
