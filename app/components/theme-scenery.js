// The living background scenes, one per theme. Static markup only: no state, no effects and
// no client JavaScript. CSS shows the scene matching html[data-theme] and animates it only when
// data-ambient-motion is enabled and the user has not asked for reduced motion.
//
// Every moving part is an HTML box holding its own small SVG, because Chrome composites
// transforms on HTML elements but repaints the whole <svg> when a shape inside it moves. A scene
// is drawn in one design space (a stage); each part's viewBox is its window into that space, so
// the art is authored in shared coordinates and nested parts inherit their parent's motion.

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

// Catmull-Rom through the points, so a handful of control points gives a smooth limb.
function smooth(points, perSegment = 8) {
  const out = [];
  const p = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < p.length - 2; i += 1) {
    for (let s = 0; s < perSegment; s += 1) {
      const t = s / perSegment;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p[i - 1][0], p[i][0], p[i + 1][0], p[i + 2][0]), f(p[i - 1][1], p[i][1], p[i + 1][1], p[i + 2][1])]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

// A filled limb that narrows from w0 to w1 along its centreline (branches, roots, vines).
function tapered(points, w0, w1, perSegment = 8) {
  const pts = smooth(points, perSegment);
  const left = [];
  const right = [];
  pts.forEach((pt, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (pts.length - 1))) / 2;
    left.push([pt[0] - (dy / len) * w, pt[1] + (dx / len) * w]);
    right.push([pt[0] + (dy / len) * w, pt[1] - (dx / len) * w]);
  });
  const tip = pts[pts.length - 1];
  const fmt = (q) => `${r1(q[0])} ${r1(q[1])}`;
  return `M${fmt(left[0])}L${left.slice(1).map(fmt).join('L')}Q${fmt(tip)} ${fmt(right[right.length - 1])}L${right.slice(0, -1).reverse().map(fmt).join('L')}Z`;
}

function line(points, perSegment = 6) {
  return `M${smooth(points, perSegment).map((q) => `${r1(q[0])} ${r1(q[1])}`).join('L')}`;
}

// A leaf from its base along `angle` (degrees): two quadratic curves, base to tip and back.
function leaf(x, y, angle, length, width = length * 0.36) {
  const a = (angle * Math.PI) / 180;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const tx = x + ux * length;
  const ty = y + uy * length;
  const mx = x + ux * length * 0.5;
  const my = y + uy * length * 0.5;
  return `M${r1(x)} ${r1(y)}Q${r1(mx - uy * width)} ${r1(my + ux * width)} ${r1(tx)} ${r1(ty)}Q${r1(mx + uy * width)} ${r1(my - ux * width)} ${r1(x)} ${r1(y)}Z`;
}

function petals(x, y, r, count = 5, turn = 0) {
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const a = turn + (i * 360) / count;
    d += leaf(x, y, a, r, r * 0.42);
  }
  return d;
}

// One part of a scene: a box in stage coordinates, an optional pivot, its art and its children.
// Boxes are converted to percentages of the parent box, so the whole stage scales as one.
function Part({ part, parent }) {
  const [x, y, w, h] = part.box;
  const [px, py, pw, ph] = parent;
  const style = {
    left: `${r1(((x - px) / pw) * 100)}%`,
    top: `${r1(((y - py) / ph) * 100)}%`,
    width: `${r1((w / pw) * 100)}%`,
    height: `${r1((h / ph) * 100)}%`,
    ...(part.origin ? { transformOrigin: `${r1(((part.origin[0] - x) / w) * 100)}% ${r1(((part.origin[1] - y) / h) * 100)}%` } : {}),
    ...(part.vars || {})
  };
  return (
    <div className={`sc-part ${part.className || ''}`} style={style}>
      {part.art ? (
        <svg className="sc-art" viewBox={`${x} ${y} ${w} ${h}`} preserveAspectRatio="none" focusable="false">
          {part.art}
        </svg>
      ) : null}
      {(part.children || []).map((child, index) => <Part key={index} part={child} parent={part.box} />)}
    </div>
  );
}

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

/* ─── Garden ──────────────────────────────────────────────────────────────────────────────── */
// A storybook tree rooted in the bottom right corner. The trunk and roots never move; major
// branches sway under a degree from where they leave the trunk, twigs a little more, and leaf
// clusters most, each on its own cycle.

const GARDEN = { w: 1100, h: 1000 };

// A canopy lobe: overlapping discs make a soft cloud of foliage in the deep shade, the mid shade
// is offset towards the light (top left) so the lower right keeps a shadow rim, a few highlight
// discs catch the light, and single leaves break the silhouette all round the edge.
function canopyLobe(seed, cx, cy, radius, leafLength) {
  const next = rng(seed);
  const discs = [[0, 0, 0.62]];
  const lobes = 7;
  for (let i = 0; i < lobes; i += 1) {
    const a = (i / lobes) * Math.PI * 2 + next() * 0.5;
    discs.push([Math.cos(a) * radius * 0.5, Math.sin(a) * radius * 0.42, 0.42 + next() * 0.16]);
  }
  const circles = (dx, dy, scale, className) => discs.map(([x, y, r], index) => (
    <circle key={`${className}-${index}`} className={className} cx={r1(cx + x * scale + dx)} cy={r1(cy + y * scale + dy)} r={r1(radius * r * scale)} />
  ));
  const rim = { deep: '', mid: '', light: '' };
  const edgeLeaves = Math.round(10 + radius / 5);
  for (let i = 0; i < edgeLeaves; i += 1) {
    const a = (i / edgeLeaves) * Math.PI * 2 + next() * 0.4;
    const x = cx + Math.cos(a) * radius * (0.78 + next() * 0.12);
    const y = cy + Math.sin(a) * radius * (0.66 + next() * 0.1);
    const angle = (a * 180) / Math.PI + (next() - 0.5) * 40;
    const lit = Math.cos(a) * 0.6 + Math.sin(a) < -0.35;
    const shadow = Math.cos(a) * 0.6 + Math.sin(a) > 0.45;
    rim[lit ? 'light' : shadow ? 'deep' : 'mid'] += leaf(x, y, angle, leafLength * (0.75 + next() * 0.5));
  }
  let texture = '';
  for (let i = 0; i < Math.round(radius / 9); i += 1) {
    const a = next() * Math.PI * 2;
    const d = radius * 0.55 * Math.sqrt(next());
    texture += leaf(cx - radius * 0.16 + Math.cos(a) * d, cy - radius * 0.16 + Math.sin(a) * d * 0.8, (a * 180) / Math.PI - 30, leafLength * 0.7);
  }
  return (
    <>
      <path className="gd-leaf-deep" d={rim.deep} />
      {circles(0, 0, 1, 'gd-leaf-deep')}
      <path className="gd-leaf-mid" d={rim.mid} />
      {circles(-radius * 0.1, -radius * 0.13, 0.84, 'gd-leaf-mid')}
      {[discs[0], discs[1 + Math.floor(next() * 3)], discs[4 + Math.floor(next() * 3)]].map(([x, y, r], index) => (
        <circle key={`hi-${index}`} className="gd-leaf-light" cx={r1(cx - radius * 0.24 + x * 0.55)} cy={r1(cy - radius * 0.3 + y * 0.5)} r={r1(radius * r * 0.36)} />
      ))}
      <path className="gd-leaf-light" d={rim.light} />
      <path className="gd-leaf-vein" d={texture} />
    </>
  );
}

function gardenCluster(seed, cx, cy, radius, leafLength, blooms = []) {
  const flowers = blooms.map(([bx, by, br], index) => (
    <g key={index}>
      <path className="gd-bloom" d={petals(bx, by, br * 1.3, 5, (seed * 37) % 72)} />
      <circle className="gd-bloom-eye" cx={r1(bx)} cy={r1(by)} r={r1(br * 0.44)} />
    </g>
  ));
  return (
    <>
      {canopyLobe(seed, cx, cy, radius, leafLength)}
      {flowers}
    </>
  );
}

function boxAround(points, pad) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return [x, y, Math.max(...xs) + pad - x, Math.max(...ys) + pad - y];
}

function lobe(seed, cx, cy, radius, stem, motion, blooms) {
  const pad = radius * 0.35;
  return {
    className: 'sc-sway gd-cluster',
    box: [cx - radius - pad, cy - radius - pad, (radius + pad) * 2, (radius + pad) * 2],
    origin: stem,
    vars: motion,
    art: gardenCluster(seed, cx, cy, radius, Math.max(18, radius * 0.32), blooms)
  };
}

// A limb and the foliage mass it carries: the mass joins its lobes into one canopy and hides
// where the wood disappears into the leaves.
function limb(className, points, w0, w1, origin, motion, children, highlight, mass = []) {
  return {
    className: `sc-sway ${className}`,
    box: boxAround(points, w0),
    origin,
    vars: motion,
    art: (
      <>
        <path className="gd-wood" d={tapered(points, w0, w1)} />
        {highlight ? <path className="gd-wood-light" d={tapered(highlight, w0 * 0.22, 1)} /> : null}
        {mass.map(([x, y, r], index) => <circle key={index} className="gd-mass" cx={x} cy={y} r={r} />)}
      </>
    ),
    children
  };
}

// Branch bases start inside the trunk, so a branch turning by a fraction of a degree about the
// point where it leaves the trunk never opens a gap at the joint.
const gardenBranches = [
  // The long limb reaching left along the top of the screen.
  limb('gd-branch', [[938, 420], [908, 336], [830, 258], [700, 194], [560, 152], [420, 124], [280, 106], [150, 98]], 60, 7, [918, 352], sway(0.6, 23, 4, 1), [
    limb('gd-twig', [[700, 194], [668, 236], [626, 264]], 14, 3, [700, 194], sway(1.4, 13, 2, 2), [
      lobe(11, 612, 268, 62, [626, 264], sway(2.6, 7.5, 1, 3), [[592, 282, 8], [636, 296, 7]])
    ]),
    limb('gd-twig', [[560, 152], [546, 104], [520, 64]], 12, 3, [560, 152], sway(1.6, 11, 5, 1), [
      lobe(12, 518, 44, 74, [520, 64], sway(2.2, 8.3, 3, 2))
    ]),
    limb('gd-twig', [[420, 124], [386, 164], [344, 194]], 11, 2.5, [420, 124], sway(1.8, 14.5, 7, 3), [
      lobe(13, 330, 206, 56, [344, 194], sway(2.8, 6.8, 2, 1), [[312, 220, 7]])
    ]),
    lobe(14, 836, 188, 84, [830, 240], sway(1.6, 10.2, 6, 2)),
    lobe(15, 690, 142, 96, [700, 190], sway(1.8, 9.4, 1, 1), [[660, 118, 9], [728, 172, 8]]),
    lobe(16, 400, 82, 82, [420, 120], sway(2.2, 8.8, 8, 3)),
    lobe(17, 262, 70, 78, [280, 104], sway(2.4, 9.9, 3, 2), [[236, 92, 8]]),
    lobe(18, 134, 96, 70, [156, 100], sway(3, 7.9, 5, 1), [[114, 114, 8], [150, 70, 7]])
  ], [[900, 330], [830, 262], [700, 198], [560, 156]], [[846, 214, 60], [760, 176, 64], [690, 160, 78], [610, 124, 70], [540, 104, 70], [460, 96, 66], [380, 92, 68], [300, 84, 64], [220, 84, 62], [150, 104, 54], [626, 230, 46]]),
  // The crown above the trunk, cropped by the top edge.
  limb('gd-branch', [[962, 420], [964, 320], [962, 230], [942, 146], [904, 64], [872, -10]], 56, 9, [960, 344], sway(0.5, 29, 11, 2), [
    limb('gd-twig', [[958, 214], [1008, 160], [1064, 128]], 14, 3, [958, 214], sway(1.2, 15, 6, 3), [
      lobe(21, 1056, 116, 88, [1064, 128], sway(2, 9.6, 2, 1), [[1036, 96, 9], [1078, 150, 7]])
    ]),
    lobe(22, 904, 16, 108, [904, 60], sway(1.5, 11.3, 5, 3), [[862, 30, 9], [930, -12, 8]]),
    lobe(23, 990, 238, 66, [962, 246], sway(2.2, 7.7, 3, 2))
  ], null, [[920, 40, 90], [1000, 110, 80], [1060, 150, 70], [980, 210, 60]]),
  // A lower limb reaching towards the workspace.
  limb('gd-branch', [[952, 612], [904, 576], [842, 544], [770, 522], [694, 518]], 36, 6, [920, 588], sway(0.7, 19, 2, 3), [
    lobe(31, 690, 504, 62, [698, 518], sway(2.6, 8.6, 5, 1), [[668, 520, 7]]),
    lobe(32, 794, 490, 50, [792, 520], sway(2.2, 7.4, 2, 2))
  ], [[930, 596], [842, 540], [770, 518]], [[720, 506, 46], [770, 500, 44]]),
  // A short limb leaving the right edge.
  limb('gd-branch', [[996, 488], [1040, 420], [1112, 380]], 32, 10, [1004, 470], sway(0.6, 25, 14, 1), [
    lobe(41, 1088, 352, 64, [1090, 380], sway(2.4, 8.9, 7, 3))
  ])
];

function GardenTrunk() {
  const trunk = 'M770 1004C850 990 900 962 916 900C930 820 928 720 922 620C916 520 908 440 898 360C904 320 930 296 962 294C994 296 1008 322 1006 370C1006 450 1010 540 1016 640C1022 740 1030 830 1046 892C1062 948 1090 976 1110 984L1110 1004Z';
  return (
    <svg className="sc-art gd-trunk" viewBox={`0 0 ${GARDEN.w} ${GARDEN.h}`} preserveAspectRatio="none" focusable="false">
      <path className="gd-ground" d="M420 1004C600 972 780 956 900 954C1000 952 1060 942 1110 934L1110 1004Z" />
      <ellipse className="gd-ground-shadow" cx="960" cy="968" rx="170" ry="20" />
      <path className="gd-wood" d={trunk} />
      <path className="gd-wood" d={tapered([[936, 846], [900, 910], [830, 946], [730, 962], [600, 972]], 66, 5)} />
      <path className="gd-wood" d={tapered([[948, 890], [912, 944], [862, 982], [820, 1006]], 44, 8)} />
      <path className="gd-wood" d={tapered([[972, 900], [966, 950], [948, 1006]], 40, 12)} />
      <path className="gd-wood" d={tapered([[1024, 850], [1052, 908], [1112, 944]], 60, 26)} />
      <path className="gd-wood-dark" d={tapered([[904, 930], [850, 962], [780, 986]], 18, 3)} />
      <path className="gd-wood-light" d={tapered([[908, 380], [916, 500], [922, 640], [920, 780], [906, 870], [870, 914]], 16, 4)} />
      <path className="gd-wood-light" d={tapered([[880, 904], [820, 932], [730, 950], [640, 962]], 12, 2)} />
      <path className="gd-wood-light" d={tapered([[1036, 864], [1064, 904], [1104, 928]], 10, 3)} />
      <path className="gd-bark" d={line([[968, 380], [976, 500], [982, 620]])} />
      <path className="gd-bark" d={line([[950, 660], [962, 780], [972, 890]])} />
      <path className="gd-bark" d={line([[994, 560], [1000, 660], [1012, 770]])} />
      <path className="gd-bark" d={line([[936, 440], [942, 540]])} />
      <path className="gd-bark" d={line([[1030, 880], [1056, 930]])} />
      <ellipse className="gd-knot" cx="966" cy="730" rx="10" ry="16" />
      <ellipse className="gd-knot-ring" cx="966" cy="730" rx="16" ry="23" />
    </svg>
  );
}


function gardenGrass(seed, x0, x1, base, count) {
  const next = rng(seed);
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const x = x0 + (x1 - x0) * next();
    const h = 18 + next() * 34;
    const lean = (next() - 0.5) * 22;
    d += tapered([[x, base], [x + lean * 0.4, base - h * 0.55], [x + lean, base - h]], 5, 0.5, 4);
  }
  return d;
}

function GardenScene() {
  const grass = [
    { box: [560, 900, 330, 110], origin: [720, 1000], vars: sway(1.2, 9.5, 3, 2), d: gardenGrass(51, 580, 880, 1000, 38) },
    { box: [1000, 880, 110, 120], origin: [1060, 990], vars: sway(1.4, 8.2, 6, 1), d: gardenGrass(52, 1010, 1104, 994, 16) }
  ];
  return (
    <div className="scene scene-garden" data-scene="garden">
      <div className="gd-atmosphere" />
      <div className="sc-stage gd-stage">
        <GardenTrunk />
        {gardenBranches.map((branch, index) => <Part key={index} part={branch} parent={[0, 0, GARDEN.w, GARDEN.h]} />)}
        {grass.map((tuft, index) => (
          <Part
            key={`grass-${index}`}
            part={{ className: 'sc-sway gd-grass', box: tuft.box, origin: tuft.origin, vars: tuft.vars, art: <path className="gd-blade" d={tuft.d} /> }}
            parent={[0, 0, GARDEN.w, GARDEN.h]}
          />
        ))}
        <div className="gd-fall gd-fall-a"><div><svg viewBox="-10 -6 26 12" focusable="false"><path className="gd-leaf-light" d={leaf(-8, 0, 0, 22, 7)} /></svg></div></div>
        <div className="gd-fall gd-fall-b"><div><svg viewBox="-10 -6 26 12" focusable="false"><path className="gd-bloom" d={leaf(-8, 0, 0, 18, 6)} /></svg></div></div>
        <Fireflies className="gd-fireflies" points={[[820, 820], [700, 900], [960, 760], [600, 760], [1040, 860], [760, 680]].map(([x, y]) => [(x / GARDEN.w) * 100, (y / GARDEN.h) * 100])} />
      </div>
    </div>
  );
}

/* ─── Liquid Glass ────────────────────────────────────────────────────────────────────────── */
// Glass bubbles at three depths drifting at different speeds, two slow liquid forms in opposite
// corners, and soft caustic light that travels across them.

const GLASS_BUBBLES = [
  ['near', -5, 66, 30, 'a', '2vw', '-3vh', 74, 10],
  ['near', 85, 3, 20, 'b', '-2vw', '3vh', 66, 22],
  ['mid', 9, 16, 9, 'a', '3vw', '-4vh', 52, 5],
  ['mid', 79, 60, 12, 'a', '-3vw', '-5vh', 58, 30],
  ['mid', 93, 42, 7, 'b', '-2vw', '4vh', 47, 12],
  ['mid', 24, 82, 6, 'b', '2vw', '-6vh', 44, 3],
  ['far', 15, 50, 3.2, 'a', '1vw', '-3vh', 38, 7],
  ['far', 70, 13, 2.6, 'b', '-1vw', '2vh', 41, 16],
  ['far', 96, 78, 3.4, 'a', '-1vw', '-3vh', 36, 21],
  ['far', 4, 34, 2.2, 'b', '1vw', '2vh', 33, 9],
  ['far', 58, 92, 2.8, 'a', '1vw', '-2vh', 39, 4]
];

function glassBubble(tone) {
  return (
    <>
      <circle cx="50" cy="50" r="48" fill={`url(#gl-fill-${tone})`} />
      <circle className="gl-rim" cx="50" cy="50" r="48" />
      <path className="gl-shine" d="M20 40A31 31 0 0 1 44 17" />
      <circle className="gl-spark" cx="30" cy="27" r="3.4" />
      <path className="gl-under" d="M69 82A37 37 0 0 0 85 57" />
    </>
  );
}

function GlassScene() {
  return (
    <div className="scene scene-glass" data-scene="glass">
      <svg className="sc-defs" focusable="false">
        <defs>
          {[['a', 'var(--accent)'], ['b', 'var(--accent-2)']].map(([tone, color]) => (
            <radialGradient key={tone} id={`gl-fill-${tone}`} cx="38%" cy="32%" r="72%">
              <stop offset="0%" style={{ stopColor: 'var(--gl-core)', stopOpacity: 0.32 }} />
              <stop offset="55%" style={{ stopColor: color, stopOpacity: 0.07 }} />
              <stop offset="90%" style={{ stopColor: color, stopOpacity: 0.3 }} />
              <stop offset="100%" style={{ stopColor: color, stopOpacity: 0.55 }} />
            </radialGradient>
          ))}
          <linearGradient id="gl-liquid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.42 }} />
            <stop offset="60%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.14 }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0.26 }} />
          </linearGradient>
          <linearGradient id="gl-ribbon" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0.05 }} />
            <stop offset="50%" style={{ stopColor: 'var(--accent-2)', stopOpacity: 0.3 }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.35 }} />
          </linearGradient>
        </defs>
      </svg>
      <Piece className="gl-liquid gl-liquid-a sc-morph" style={motion(84, 12)} viewBox="0 0 400 300">
        <path fill="url(#gl-liquid)" d="M40 220C10 170 30 100 90 80C140 64 170 20 230 30C300 42 330 100 360 150C390 200 360 260 300 270C240 280 200 250 150 262C100 274 60 260 40 220Z" />
        <path className="gl-shine" d="M66 128C96 94 140 84 170 62" />
        <path className="gl-under" d="M300 252C334 240 352 214 356 186" />
      </Piece>
      <Piece className="gl-liquid gl-liquid-b sc-morph" style={motion(97, 40)} viewBox="0 0 500 300">
        <path fill="url(#gl-ribbon)" d="M20 84C120 18 260 30 340 110C400 170 440 230 490 250L490 290C430 270 380 210 320 150C250 84 130 70 20 84Z" />
        <path className="gl-shine" d="M60 66C140 26 250 38 330 108" />
      </Piece>
      {GLASS_BUBBLES.map(([depth, x, y, size, tone, dx, dy, seconds, offset], index) => (
        <Piece
          key={index}
          className={`gl-bubble gl-${depth} sc-drift`}
          style={{ left: `${x}vw`, top: `${y}vh`, width: `${size}vmin`, ...motion(seconds, offset, { '--dx': dx, '--dy': dy }) }}
          viewBox="0 0 100 100"
        >
          {glassBubble(tone)}
        </Piece>
      ))}
      <div className="sc-piece gl-caustic gl-caustic-a sc-drift" style={motion(66, 8, { '--dx': '9vw', '--dy': '-5vh' })} />
      <div className="sc-piece gl-caustic gl-caustic-b sc-drift" style={motion(78, 31, { '--dx': '-8vw', '--dy': '6vh' })} />
      <div className="sc-piece gl-caustic gl-caustic-c sc-drift" style={motion(59, 17, { '--dx': '-5vw', '--dy': '-7vh' })} />
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
// Layered clouds drifting at three speeds for a gentle parallax, small bubbles rising, sparkles
// blinking on their own clocks and a few playful shapes floating by.

const PASTEL_CLOUDS = [
  ['far', 8, 9, 13, '5vw', 150, 10], ['far', 60, 5, 10, '-4vw', 136, 60], ['far', 36, 92, 11, '4vw', 160, 30],
  ['mid', 74, 18, 19, '-5vw', 108, 20], ['mid', 2, 40, 15, '4vw', 118, 70],
  ['near', -7, 76, 34, '3vw', 92, 15], ['near', 68, 82, 31, '-3vw', 98, 45]
];
const PASTEL_SPARKLES = [[6, 24, 'pink'], [18, 8, 'butter'], [88, 30, 'sky'], [94, 12, 'lavender'], [80, 66, 'pink'], [12, 60, 'mint'], [50, 4, 'lavender'], [96, 88, 'butter'], [30, 94, 'sky'], [70, 44, 'mint']];
const PASTEL_BUBBLES = [[10, 70, 4, 'sky'], [22, 50, 2.6, 'pink'], [86, 52, 3.4, 'mint'], [92, 70, 2.2, 'lavender'], [4, 20, 2.8, 'butter'], [78, 26, 2, 'pink']];

function PastelScene() {
  const cloud = 'M30 90C8 90 4 62 26 56C22 30 52 18 72 32C82 10 120 6 134 30C150 16 182 22 184 48C206 48 214 78 196 90Z';
  return (
    <div className="scene scene-pastel" data-scene="pastel">
      {PASTEL_CLOUDS.map(([depth, x, y, size, dx, seconds, offset], index) => (
        <Piece key={index} className={`pa-cloud pa-${depth} sc-drift`} style={{ left: `${x}vw`, top: `${y}vh`, width: `${size}vw`, ...motion(seconds, offset, { '--dx': dx, '--dy': '0px' }) }} viewBox="0 0 220 100">
          <path className="pa-cloud-body" d={cloud} />
        </Piece>
      ))}
      {PASTEL_BUBBLES.map(([x, y, size, tint], index) => (
        <div key={index} className={`sc-piece pa-bubble pa-${tint} sc-drift`} style={{ left: `${x}vw`, top: `${y}vh`, width: `${size}vmin`, ...motion(38 + index * 7, index * 5, { '--dx': `${index % 2 ? 1 : -1}vw`, '--dy': '-9vh' }) }} />
      ))}
      {PASTEL_SPARKLES.map(([x, y, tint], index) => (
        <Piece key={index} className={`pa-sparkle pa-${tint} sc-twinkle`} style={{ left: `${x}vw`, top: `${y}vh`, ...motion(3.2 + (index % 5) * 1.1, index * 0.9, { '--low': 0.1 }) }} viewBox="-10 -10 20 20">
          <path d="M0 -10C1.6 -1.6 1.6 -1.6 10 0C1.6 1.6 1.6 1.6 0 10C-1.6 1.6 -1.6 1.6 -10 0C-1.6 -1.6 -1.6 -1.6 0 -10Z" />
        </Piece>
      ))}
      <Piece className="pa-shape pa-moon sc-drift" style={motion(64, 10, { '--dx': '-1vw', '--dy': '2vh', '--rot': '8deg' })} viewBox="0 0 100 100">
        <path d="M62 8A44 44 0 1 0 92 70A36 36 0 1 1 62 8Z" />
      </Piece>
      <Piece className="pa-shape pa-heart sc-drift" style={motion(57, 20, { '--dx': '1.5vw', '--dy': '-3vh', '--rot': '-10deg' })} viewBox="0 0 100 90">
        <path d="M50 86C20 62 4 46 4 28C4 14 15 4 28 4C38 4 46 10 50 18C54 10 62 4 72 4C85 4 96 14 96 28C96 46 80 62 50 86Z" />
      </Piece>
      <Piece className="pa-shape pa-star sc-drift" style={motion(71, 35, { '--dx': '1vw', '--dy': '3vh', '--rot': '18deg' })} viewBox="0 0 100 100">
        <path d="M50 6L61 38L95 39L68 59L78 92L50 72L22 92L32 59L5 39L39 38Z" />
      </Piece>
    </div>
  );
}

/* ─── Cyberpunk ───────────────────────────────────────────────────────────────────────────── */
// A synthwave night: a striped sun sinking behind a city skyline, a perspective grid rolling
// towards the viewer, a scanline, signs that flicker and a rare, short glitch.

function cyberSkyline() {
  const next = rng(77);
  const buildings = [];
  const windows = [];
  const antennas = [];
  let x = -10;
  while (x < 1610) {
    const w = 34 + next() * 56;
    const edge = Math.min(x, 1600 - x) / 800;
    const h = 40 + next() * 70 + (1 - edge) * 46;
    buildings.push(`M${r1(x)} 150V${r1(150 - h)}H${r1(x + w)}V150Z`);
    for (let wy = 150 - h + 10; wy < 140; wy += 12) {
      for (let wx = x + 6; wx < x + w - 8; wx += 10) {
        if (next() < 0.16) windows.push(`M${r1(wx)} ${r1(wy)}h4v5h-4Z`);
      }
    }
    if (next() < 0.22) antennas.push(`M${r1(x + w / 2)} ${r1(150 - h)}v${-r1(10 + next() * 18)}`);
    x += w + 2 + next() * 6;
  }
  return { buildings: buildings.join(''), windows: windows.join(''), antennas: antennas.join('') };
}

function CyberpunkScene() {
  const city = cyberSkyline();
  return (
    <div className="scene scene-cyberpunk" data-scene="cyberpunk">
      <svg className="sc-defs" focusable="false">
        <defs>
          <linearGradient id="cp-sun-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: 'var(--cp-sun-top)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--cp-sun-bottom)' }} />
          </linearGradient>
          <clipPath id="cp-sun-bands">
            <rect x="0" y="0" width="200" height="104" />
            {[110, 124, 136, 147, 157, 166, 174, 181, 188, 194].map((y, index) => <rect key={index} x="0" y={y} width="200" height={r1(9 - index * 0.7)} />)}
          </clipPath>
        </defs>
      </svg>
      <div className="sc-piece cp-sun">
        <div className="cp-sun-glow sc-breathe" style={motion(7.5, 2, { '--low': 0.7 })} />
        <div className="cp-sun-disc">
          <svg className="sc-art" viewBox="0 0 200 200" focusable="false"><circle cx="100" cy="100" r="98" fill="url(#cp-sun-fill)" clipPath="url(#cp-sun-bands)" /></svg>
        </div>
      </div>
      <div className="sc-piece cp-city">
        <svg className="sc-art" viewBox="0 0 1600 150" preserveAspectRatio="none" focusable="false">
          <path className="cp-building" d={city.buildings} />
          <path className="cp-antenna" d={city.antennas} />
          <path className="cp-window" d={city.windows} />
        </svg>
        <div className="cp-sign cp-sign-a" style={motion(13, 3)} />
        <div className="cp-sign cp-sign-b" style={motion(21, 11)} />
        <div className="cp-sign cp-sign-c" style={motion(17, 6)} />
      </div>
      <div className="sc-piece cp-horizon" />
      <div className="sc-piece cp-floor"><div className="cp-plane" /></div>
      <div className="sc-piece cp-scan" />
    </div>
  );
}

/* ─── Cottagecore ─────────────────────────────────────────────────────────────────────────── */
// A small countryside vignette: rolling hills with a cottage whose chimney smokes, wildflowers
// and grass that sway in the near corner, vines hanging from the top, mushrooms by the right
// edge, and fireflies once it is dark.

const MEADOW = { w: 600, h: 300 };
const VINES = { w: 420, h: 460 };

function meadowTuft(seed, x0, x1, base, count, heightMax) {
  const next = rng(seed);
  let d = '';
  for (let i = 0; i < count; i += 1) {
    const x = x0 + (x1 - x0) * next();
    const h = heightMax * (0.4 + next() * 0.6);
    const lean = (next() - 0.4) * 30;
    d += tapered([[x, base], [x + lean * 0.4, base - h * 0.55], [x + lean, base - h]], 4.5, 0.4, 4);
  }
  return d;
}

function wildflower(x, base, height, lean, r, tone, leafSide = 1) {
  const top = [x + lean, base - height];
  return (
    <>
      <path className="cc-stem" d={tapered([[x, base], [x + lean * 0.5, base - height * 0.55], top], 3.4, 1.6, 5)} />
      <path className="cc-leaf" d={leaf(x + lean * 0.25, base - height * 0.32, leafSide > 0 ? -30 : 210, height * 0.28)} />
      <path className={`cc-petal cc-${tone}`} d={petals(top[0], top[1], r, 5, 18)} />
      <circle className="cc-eye" cx={r1(top[0])} cy={r1(top[1])} r={r1(r * 0.38)} />
    </>
  );
}

function vineStrand(x, length, seed) {
  const next = rng(seed);
  const pts = [[x, -10], [x + 8, length * 0.35], [x - 6, length * 0.7], [x + 4, length]];
  let leaves = '';
  smooth(pts, 6).forEach(([lx, ly], index) => {
    if (index % 2 === 1 && ly > 20) leaves += leaf(lx, ly, index % 4 === 1 ? 20 + next() * 30 : 130 + next() * 30, 16 + next() * 8);
  });
  const end = pts[pts.length - 1];
  return (
    <>
      <path className="cc-vine" d={tapered(pts, 4, 1.2, 6)} />
      <path className="cc-leaf" d={leaves} />
      <path className="cc-petal cc-rose" d={petals(end[0], end[1] + 6, 7, 5, 30)} />
    </>
  );
}

function CottagecoreScene() {
  const meadow = [
    { box: [0, 120, 300, 190], origin: [140, 300], vars: sway(1.6, 9.4, 2, 2), art: <path className="cc-grass" d={meadowTuft(61, 0, 290, 300, 46, 110)} /> },
    { box: [250, 170, 260, 140], origin: [380, 300], vars: sway(1.4, 11.2, 6, 1), art: <path className="cc-grass" d={meadowTuft(62, 260, 500, 300, 30, 70)} /> },
    { box: [20, 60, 110, 250], origin: [70, 300], vars: sway(2.4, 8.1, 1, 3), art: <>{wildflower(60, 300, 190, 14, 13, 'rose')}{wildflower(96, 300, 150, -10, 11, 'butter', -1)}</> },
    { box: [130, 90, 120, 220], origin: [180, 300], vars: sway(2, 10.6, 4, 1), art: <>{wildflower(160, 300, 170, -12, 12, 'lavender', -1)}{wildflower(204, 300, 128, 10, 10, 'rose')}</> },
    { box: [240, 140, 110, 170], origin: [290, 300], vars: sway(2.6, 7.6, 7, 2), art: <>{wildflower(270, 300, 120, 8, 10, 'butter')}{wildflower(318, 300, 92, -6, 9, 'lavender', -1)}</> }
  ];
  const vines = [
    { box: [10, -20, 90, 380], origin: [50, 0], vars: sway(1.6, 12.4, 3, 1), art: vineStrand(50, 340, 71) },
    { box: [100, -20, 80, 300], origin: [140, 0], vars: sway(2, 10.2, 8, 3), art: vineStrand(140, 250, 72) },
    { box: [190, -20, 70, 210], origin: [226, 0], vars: sway(2.4, 8.8, 5, 2), art: vineStrand(226, 170, 73) }
  ];
  return (
    <div className="scene scene-cottagecore" data-scene="cottagecore">
      <Piece className="cc-hills" viewBox="0 0 1600 300" ratio="none">
        <path className="cc-hill-far" d="M0 170C220 110 420 120 640 160C860 200 1080 120 1300 110C1440 104 1540 130 1600 150V300H0Z" />
        <path className="cc-hill-near" d="M0 230C260 190 520 214 780 236C1040 258 1300 206 1600 196V300H0Z" />
      </Piece>
      <div className="sc-piece cc-cottage">
        <svg className="sc-art" viewBox="0 0 100 90" focusable="false">
          <path className="cc-chimney" d="M66 14h9v22h-9z" />
          <path className="cc-roof" d="M8 44L50 12L92 44Z" />
          <path className="cc-wall" d="M16 42h68v46H16z" />
          <path className="cc-door" d="M44 60h12v28H44z" />
          <path className="cc-window" d="M24 54h13v12H24zM63 54h13v12H63z" />
        </svg>
        {[0, 1, 2].map((index) => <div key={index} className="cc-puff" style={motion(10.5, index * 3.5)} />)}
      </div>
      <div className="sc-stage cc-vines">
        {vines.map((strand, index) => <Part key={index} part={{ className: 'sc-sway', ...strand }} parent={[0, 0, VINES.w, VINES.h]} />)}
      </div>
      <div className="sc-stage cc-meadow">
        {meadow.map((tuft, index) => <Part key={index} part={{ className: 'sc-sway', ...tuft }} parent={[0, 0, MEADOW.w, MEADOW.h]} />)}
      </div>
      <div className="sc-stage cc-shrooms">
        <svg className="sc-art" viewBox="0 0 300 200" focusable="false">
          <path className="cc-stalk" d="M126 200C128 168 130 140 128 118h28c-2 22 0 50 4 82Z" />
          <path className="cc-stalk" d="M214 200c1-20 2-36 0-50h18c-2 14 0 30 2 50Z" />
          <path className="cc-stalk" d="M62 200c1-14 2-24 0-34h14c-2 10 0 20 2 34Z" />
          <path className="cc-moss" d="M20 200C60 186 120 184 170 188C220 192 260 186 300 180V200Z" />
        </svg>
        <div className="sc-part cc-cap cc-cap-a sc-breathe-scale" style={motion(13, 4)}>
          <svg className="sc-art" viewBox="88 66 108 60" preserveAspectRatio="none" focusable="false">
            <path className="cc-cap-fill" d="M92 124C92 90 116 70 142 70C168 70 192 90 192 124Z" />
            <path className="cc-cap-dot" d="M118 96a6 6 0 1 0 0.1 0ZM150 86a5 5 0 1 0 0.1 0ZM168 104a6 6 0 1 0 0.1 0ZM136 110a4 4 0 1 0 0.1 0Z" />
          </svg>
        </div>
        <div className="sc-part cc-cap cc-cap-b sc-breathe-scale" style={motion(11, 8)}>
          <svg className="sc-art" viewBox="196 120 58 34" preserveAspectRatio="none" focusable="false">
            <path className="cc-cap-fill" d="M198 152C198 134 210 122 224 122C238 122 252 134 252 152Z" />
            <path className="cc-cap-dot" d="M214 136a3.5 3.5 0 1 0 0.1 0ZM234 140a3 3 0 1 0 0.1 0Z" />
          </svg>
        </div>
        <div className="sc-part cc-cap cc-cap-c sc-breathe-scale" style={motion(9.5, 2)}>
          <svg className="sc-art" viewBox="50 150 42 22" preserveAspectRatio="none" focusable="false">
            <path className="cc-cap-fill" d="M52 170C52 158 60 152 70 152C80 152 90 158 90 170Z" />
          </svg>
        </div>
      </div>
      <Fireflies className="cc-fireflies" points={[[8, 70], [16, 82], [24, 64], [30, 88], [88, 76], [93, 86], [80, 70], [12, 52]]} />
    </div>
  );
}

/* ─── Space ───────────────────────────────────────────────────────────────────────────────── */
// Layered deep space: a star field that drifts very slowly, stars twinkling out of step, a
// ringed planet whose bands turn and whose moon orbits, a spiral galaxy turning almost
// imperceptibly, and once in a long while a shooting star.

function galaxyArms() {
  const next = rng(91);
  const dots = { bright: '', dim: '', glow: '' };
  for (let arm = 0; arm < 2; arm += 1) {
    const spine = [];
    for (let i = 0; i <= 24; i += 1) {
      const t = i / 24;
      const angle = arm * Math.PI + t * Math.PI * 2.6;
      spine.push([100 + Math.cos(angle) * (8 + t * 92), 100 + Math.sin(angle) * (8 + t * 92)]);
    }
    dots.glow += line(spine, 3);
    for (let i = 0; i < 90; i += 1) {
      const t = i / 90;
      const angle = arm * Math.PI + t * Math.PI * 2.6;
      const radius = 8 + t * 92;
      const spread = 3 + t * 10;
      const x = 100 + Math.cos(angle) * radius + (next() - 0.5) * spread;
      const y = 100 + Math.sin(angle) * radius + (next() - 0.5) * spread;
      const r = (1 - t) * 1.4 + 0.4 + next() * 0.5;
      dots[next() < 0.35 ? 'bright' : 'dim'] += `M${r1(x - r)} ${r1(y)}a${r1(r)} ${r1(r)} 0 1 0 ${r1(r * 2)} 0a${r1(r)} ${r1(r)} 0 1 0 ${r1(-r * 2)} 0`;
    }
  }
  return dots;
}

function SpaceScene() {
  const field = scatter(131, 110, 1600, 900, 0.5, 1.6);
  const arms = galaxyArms();
  return (
    <div className="scene scene-space" data-scene="space">
      <div className="sp-nebula" />
      <div className="sc-piece sp-field sc-drift" style={motion(220, 30, { '--dx': '-2vw', '--dy': '1.4vh' })}>
        <svg className="sc-art" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" focusable="false">
          {field.map(([x, y, r, tone], index) => <circle key={index} className={tone > 0.8 ? 'sp-star sp-star-warm' : 'sp-star'} cx={x} cy={y} r={r} />)}
        </svg>
      </div>
      {[[7, 14], [21, 38], [88, 47], [72, 8], [95, 22], [55, 92], [4, 58], [36, 6], [64, 70], [83, 90]].map(([x, y], index) => (
        <div key={index} className="sc-piece sp-twinkle sc-twinkle" style={{ left: `${x}%`, top: `${y}%`, ...motion(4 + (index % 4) * 1.6, index * 1.4, { '--low': 0.25 }) }} />
      ))}
      <div className="sc-piece sp-galaxy">
        <div className="sp-galaxy-core" />
        <div className="sp-galaxy-spin sc-turn" style={motion(600, 100)}>
          <svg className="sc-art" viewBox="0 0 200 200" focusable="false">
            <path className="sp-arm-glow" d={arms.glow} />
            <path className="sp-arm-glow sp-arm-glow-core" d={arms.glow} />
            <path className="sp-arm-dim" d={arms.dim} />
            <path className="sp-arm-bright" d={arms.bright} />
          </svg>
        </div>
      </div>
      <div className="sc-piece sp-planet">
        <svg className="sc-art" viewBox="0 0 200 200" focusable="false">
          <g transform="rotate(-18 100 100)">
            <ellipse className="sp-ring" cx="100" cy="100" rx="96" ry="22" />
            <ellipse className="sp-ring sp-ring-inner" cx="100" cy="100" rx="80" ry="17" />
          </g>
        </svg>
        <div className="sp-globe">
          <div className="sp-bands sc-pan" style={motion(140, 20)} />
          <div className="sp-terminator" />
        </div>
        <svg className="sc-art" viewBox="0 0 200 200" focusable="false">
          <g transform="rotate(-18 100 100)">
            <path className="sp-ring" d="M4 100A96 22 0 0 0 196 100" />
            <path className="sp-ring sp-ring-inner" d="M20 100A80 17 0 0 0 180 100" />
          </g>
        </svg>
        <div className="sp-orbit sc-turn" style={motion(160, 40)}><div className="sp-moon" /></div>
      </div>
      <div className="sc-piece sp-shooting" style={motion(43, 12)} />
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
    </>
  );
}
