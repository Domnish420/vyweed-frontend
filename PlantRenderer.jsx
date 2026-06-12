// PlantRenderer.jsx — Procedural cannabis plant generator
// Uses react-native-svg (already in project — no new native build needed)
// All geometry is deterministic: same strainSeed + stage → same plant, stable across renders
//
// Parameters:
//   width / height  — canvas size
//   stage           — current grow stage name (drives height, buds, trichomes, colour)
//   strainType      — "I" / "S" / "H" (Indica / Sativa / Hybrid shape archetype)
//   tier            — "T1"–"T4" (controls trichome density / frostiness)
//   strainSeed      — strain ID (integer) — gives each strain its own unique shape

import React, { useMemo } from "react";
import Svg, { Path, G, Circle, Line } from "react-native-svg";

// ── Seeded deterministic RNG ──────────────────────────────────────────────────
// Same seed always produces the same sequence — stable across re-renders
function makeRng(seed) {
  let s = (seed | 0) || 42;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 15), 0xac4e4b97);
    s ^= s >>> 16;
    return (s >>> 0) / 0xFFFFFFFF;
  };
}

// Cubic bezier scalar interpolation
const cbez = (a, b, c, d, t) => {
  const u = 1 - t;
  return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
};

// Lerp between two hex colours
function lerpColor(hex1, hex2, t) {
  const p = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = p(hex1), [r2,g2,b2] = p(hex2);
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r1+(r2-r1)*t)},${clamp(g1+(g2-g1)*t)},${clamp(b1+(b2-b1)*t)})`;
}

// ── Single leaflet SVG path ───────────────────────────────────────────────────
// Base at (0,0), tip at (0,-len). Width w controls how fat the leaf is.
function leafletD(len, w) {
  const l = len, wr = w * 0.62;
  const mc = -l * 0.70, bc = -l * 0.09;
  return `M 0 0 C ${-wr} ${bc} ${-wr} ${mc} 0 ${-l} C ${wr} ${mc} ${wr} ${bc} 0 0 Z`;
}

// 5-leaflet compound cannabis leaf rendered as a <G> of <Path>s
const LEAF_CONFIGS = [
  { a: 0,   lr: 1.00, wr: 0.22 },  // centre leaflet
  { a: -22, lr: 0.82, wr: 0.18 },  // inner pair
  { a:  22, lr: 0.82, wr: 0.18 },
  { a: -40, lr: 0.62, wr: 0.14 },  // outer pair
  { a:  40, lr: 0.62, wr: 0.14 },
];

function leafCluster(x, y, rot, size, fill, opacity = 0.88) {
  return (
    <G transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})`}>
      {LEAF_CONFIGS.map((lc, i) => (
        <G key={i} transform={`rotate(${lc.a})`}>
          <Path
            d={leafletD(size * lc.lr, size * lc.lr * lc.wr)}
            fill={fill} opacity={opacity}
          />
        </G>
      ))}
    </G>
  );
}

// ── Stage → visual parameter presets ─────────────────────────────────────────
// hPct:  plant height as fraction of max canvas height
// bud:   bud formation 0→1
// trich: trichome/frost coverage 0→1
// fade:  leaf-yellowing and colour shift 0→1
// pist:  pistil hair density 0→1
const STAGE_PRESET = {
  "Seedling":     { hPct: 0.12, bud: 0.00, trich: 0.00, fade: 0.00, pist: 0.00 },
  "Vegetative":   { hPct: 0.55, bud: 0.00, trich: 0.00, fade: 0.00, pist: 0.00 },
  "Transition":   { hPct: 0.82, bud: 0.07, trich: 0.00, fade: 0.00, pist: 0.28 },
  "Early Flower": { hPct: 0.90, bud: 0.30, trich: 0.14, fade: 0.00, pist: 0.90 },
  "Mid Flower":   { hPct: 0.92, bud: 0.65, trich: 0.44, fade: 0.10, pist: 0.65 },
  "Late Flower":  { hPct: 0.94, bud: 0.88, trich: 0.80, fade: 0.40, pist: 0.38 },
  "Final Days":   { hPct: 0.95, bud: 0.97, trich: 0.94, fade: 0.65, pist: 0.18 },
  "Harvest Ready":{ hPct: 0.95, bud: 1.00, trich: 1.00, fade: 0.88, pist: 0.10 },
};

// ── Strain shape archetypes ───────────────────────────────────────────────────
// hMult: height multiplier  wMult: spread multiplier
// deg:   branch angle from horizontal  nodes: max node count
const STRAIN_SHAPE = {
  I: { hMult: 0.74, wMult: 1.28, deg: 52, nodes: 7 },  // short + wide
  S: { hMult: 1.28, wMult: 0.62, deg: 26, nodes: 5 },  // tall + narrow
  H: { hMult: 1.00, wMult: 1.00, deg: 38, nodes: 6 },  // balanced
};

// Tier controls trichome density
const TIER_FROST = { T1: 1.00, T2: 0.78, T3: 0.56, T4: 0.36 };

// ── Main component ────────────────────────────────────────────────────────────
export default function PlantRenderer({
  width      = 260,
  height     = 290,
  stage      = "Seedling",
  strainType = "H",
  tier       = "T4",
  strainSeed = 1,
}) {
  const geo = useMemo(() => {
    const rng   = makeRng(strainSeed | 0);           // structural identity RNG
    const sp    = STAGE_PRESET[stage] || STAGE_PRESET["Vegetative"];
    const sh    = STRAIN_SHAPE[strainType] || STRAIN_SHAPE.H;
    const frost = TIER_FROST[tier] ?? 0.36;

    // ── Canvas layout ──
    const cx     = width  / 2;
    const baseY  = height - 22;
    const maxH   = height - 55;
    const plantH = maxH * sp.hPct * sh.hMult;
    const spread = width * sh.wMult * 0.34;

    // ── Stem bezier — slight natural lean unique to each strain ──
    const lean = (rng() - 0.5) * 16;
    const p0   = { x: cx,               y: baseY             };
    const p1   = { x: cx + lean,        y: baseY - plantH * 0.36 };
    const p2   = { x: cx - lean * 0.55, y: baseY - plantH * 0.70 };
    const p3   = { x: cx + lean * 0.20, y: baseY - plantH        };

    const stemAt = t => ({
      x: cbez(p0.x, p1.x, p2.x, p3.x, t),
      y: cbez(p0.y, p1.y, p2.y, p3.y, t),
    });

    // ── Colour palette — driven by fade (leaf yellowing) and bud density ──
    const leafCol   = lerpColor("#3d8f4a", "#b8a020", sp.fade);
    const leafDkCol = lerpColor("#2a6535", "#8a7010", sp.fade);
    const stemCol   = lerpColor("#2d6535", "#7a4a22", Math.min(sp.fade * 1.6, 1));
    const budCol    = lerpColor("#3a7848", "#523a70", sp.bud * 0.55);
    const budHiCol  = lerpColor("#52a85e", "#9268c0", sp.bud * 0.82);
    const pistilCol = sp.bud > 0.55 ? "#c87828" : "#f0e8d0";

    // ── Node + branch geometry ──
    const isSeedling = stage === "Seedling";
    const nodeCount  = isSeedling
      ? 0
      : Math.max(1, Math.floor(sh.nodes * Math.min(sp.hPct * 2.0, 1)));

    const nodes = [];
    for (let i = 0; i < nodeCount; i++) {
      const t         = 0.09 + (i / Math.max(nodeCount, 1)) * 0.80;
      const pos       = stemAt(t);
      const fromTop   = 1 - t;                       // 0 = top, 1 = base
      const bLen      = spread * (0.44 + fromTop * 0.56);
      const ang       = sh.deg + (rng() - 0.5) * 10;
      const angRad    = ang * Math.PI / 180;
      const leafSz    = 9 + fromTop * 13;
      const curve     = plantH * 0.055;

      const tipLX = pos.x - Math.cos(angRad) * bLen;
      const tipLY = pos.y - Math.sin(angRad) * bLen * 0.40;
      const tipRX = pos.x + Math.cos(angRad) * bLen;
      const tipRY = tipLY;

      // Branch bezier paths as strings
      const pathL = [
        `M ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`,
        `C ${(pos.x - bLen*0.38).toFixed(1)} ${(pos.y - curve).toFixed(1)}`,
        `  ${(tipLX + bLen*0.22).toFixed(1)} ${(tipLY + curve*0.5).toFixed(1)}`,
        `  ${tipLX.toFixed(1)} ${tipLY.toFixed(1)}`,
      ].join(" ");
      const pathR = [
        `M ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`,
        `C ${(pos.x + bLen*0.38).toFixed(1)} ${(pos.y - curve).toFixed(1)}`,
        `  ${(tipRX - bLen*0.22).toFixed(1)} ${(tipRY + curve*0.5).toFixed(1)}`,
        `  ${tipRX.toFixed(1)} ${tipRY.toFixed(1)}`,
      ].join(" ");

      nodes.push({
        pos, pathL, pathR, leafSz,
        tipL: { x: tipLX, y: tipLY },
        tipR: { x: tipRX, y: tipRY },
        fromTop,
      });
    }

    // ── Bud sites ──
    const buds = [];
    if (sp.bud > 0.05) {
      buds.push({ x: p3.x, y: p3.y, r: 10 + sp.bud * 24, cola: true });
      if (sp.bud > 0.12) {
        nodes.forEach(n => {
          buds.push({ x: n.tipL.x, y: n.tipL.y, r: 6 + sp.bud * 14, cola: false });
          buds.push({ x: n.tipR.x, y: n.tipR.y, r: 6 + sp.bud * 14, cola: false });
        });
      }
    }

    // ── Bud dot positions (precomputed, stable) ──
    const budDots = buds.flatMap((bud, bi) => {
      const brng = makeRng((strainSeed | 0) * 7 + bi * 13);
      const n    = bud.cola ? 7 : 4;
      return Array.from({ length: n }, (_, j) => {
        const a  = (j / n) * Math.PI * 2;
        const d  = j === 0 ? 0 : bud.r * (0.42 + brng() * 0.30);
        const r  = bud.r * (j === 0 ? 0.55 : 0.35 + brng() * 0.24);
        return {
          cx: bud.x + Math.cos(a) * d,
          cy: bud.y + Math.sin(a) * d * 0.72,
          r,
          hi: j === 0,
        };
      });
    });

    // ── Trichome dots (seeded per bud site, stable) ──
    const triches = [];
    const triDensity = sp.trich * frost;
    if (triDensity > 0.08) {
      buds.forEach((bud, bi) => {
        const trng  = makeRng((strainSeed | 0) * 1009 + bi * 17);
        const count = Math.floor(triDensity * (bud.cola ? 60 : 22));
        for (let k = 0; k < count; k++) {
          const a = trng() * Math.PI * 2;
          const d = trng() * bud.r * 2.2;
          triches.push({
            cx: bud.x + Math.cos(a) * d,
            cy: bud.y + Math.sin(a) * d * 0.85,
            r:  1.2 + trng() * 1.5,
            o:  (0.42 + trng() * 0.58) * frost,
          });
        }
      });
    }

    // ── Pistil hairs ──
    const pistils = [];
    if (sp.pist > 0.05) {
      buds.forEach((bud, bi) => {
        const prng  = makeRng((strainSeed | 0) * 503 + bi * 23);
        const count = Math.floor(sp.pist * (bud.cola ? 16 : 6));
        for (let k = 0; k < count; k++) {
          const a   = prng() * Math.PI * 2;
          const d   = prng() * bud.r * 1.3;
          const len = 5 + prng() * 9;
          pistils.push({
            x1: bud.x + Math.cos(a) * d,
            y1: bud.y + Math.sin(a) * d * 0.8,
            x2: bud.x + Math.cos(a + 0.32) * (d + len),
            y2: bud.y + Math.sin(a + 0.32) * (d + len) * 0.8,
          });
        }
      });
    }

    // ── Seedling cotyledon positions ──
    const cotyPos = isSeedling ? stemAt(0.85) : null;

    // ── Stem path string ──
    const stemPath = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${p3.x} ${p3.y}`;

    return {
      stemPath, stemCol,
      nodes, buds, budDots, triches, pistils,
      leafCol, leafDkCol, budCol, budHiCol, pistilCol,
      isSeedling, cotyPos,
    };
  }, [stage, strainType, tier, strainSeed, width, height]);

  const {
    stemPath, stemCol,
    nodes, budDots, triches, pistils,
    leafCol, leafDkCol, budCol, budHiCol, pistilCol,
    isSeedling, cotyPos,
  } = geo;

  return (
    <Svg width={width} height={height}>

      {/* ── Substrate / pot hint ── */}
      <Path
        d={`M ${(width*0.24).toFixed(0)} ${(height-15).toFixed(0)} Q ${(width/2).toFixed(0)} ${(height-7).toFixed(0)} ${(width*0.76).toFixed(0)} ${(height-15).toFixed(0)} L ${(width*0.78).toFixed(0)} ${height} L ${(width*0.22).toFixed(0)} ${height} Z`}
        fill="rgba(65,38,14,0.50)"
      />
      <Path
        d={`M ${(width*0.23).toFixed(0)} ${(height-11).toFixed(0)} Q ${(width/2).toFixed(0)} ${(height-4).toFixed(0)} ${(width*0.77).toFixed(0)} ${(height-11).toFixed(0)}`}
        stroke="rgba(100,65,28,0.55)" strokeWidth="2" fill="none"
      />

      {/* ── Branches (under leaves) ── */}
      {nodes.map((n, i) => (
        <G key={`br${i}`}>
          <Path d={n.pathL} stroke={stemCol} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <Path d={n.pathR} stroke={stemCol} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </G>
      ))}

      {/* ── Main stem ── */}
      <Path d={stemPath} stroke={stemCol} strokeWidth={2.8} fill="none" strokeLinecap="round" />

      {/* ── Seedling: two simple cotyledon leaves ── */}
      {isSeedling && cotyPos && <>
        {leafCluster(cotyPos.x - 7, cotyPos.y, -130, 9, "#b8d880")}
        {leafCluster(cotyPos.x + 7, cotyPos.y, -50,  9, "#b8d880")}
      </>}

      {/* ── Compound fan leaves at each node ── */}
      {!isSeedling && nodes.map((n, i) => (
        <G key={`lv${i}`}>
          {leafCluster(n.tipL.x, n.tipL.y, -108, n.leafSz, leafCol)}
          {leafCluster(n.tipR.x, n.tipR.y,  -72, n.leafSz, leafCol)}
          {/* Node leaf on the stem itself */}
          {i < nodes.length - 2 && leafCluster(
            n.pos.x, n.pos.y,
            -90 + (i % 2 === 0 ? 14 : -14),
            n.leafSz * 1.1,
            leafDkCol,
          )}
        </G>
      ))}

      {/* ── Pistil hairs (early–mid flower white/amber hairs) ── */}
      {pistils.map((p, i) => (
        <Line
          key={`pi${i}`}
          x1={p.x1.toFixed(1)} y1={p.y1.toFixed(1)}
          x2={p.x2.toFixed(1)} y2={p.y2.toFixed(1)}
          stroke={pistilCol} strokeWidth={1.1} strokeLinecap="round" opacity={0.82}
        />
      ))}

      {/* ── Bud clusters ── */}
      {budDots.map((dot, i) => (
        <Circle
          key={`bd${i}`}
          cx={dot.cx.toFixed(1)} cy={dot.cy.toFixed(1)} r={dot.r.toFixed(1)}
          fill={dot.hi ? budHiCol : budCol} opacity={0.90}
        />
      ))}

      {/* ── Trichome frost (late flower) ── */}
      {triches.map((t, i) => (
        <Circle
          key={`tr${i}`}
          cx={t.cx.toFixed(1)} cy={t.cy.toFixed(1)} r={t.r.toFixed(1)}
          fill="white" opacity={t.o}
        />
      ))}

    </Svg>
  );
}
