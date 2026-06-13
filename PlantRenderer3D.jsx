// PlantRenderer3D.jsx — Three.js cannabis plant via expo-gl
// Requires EAS build (expo-gl is a native module).

import React, { useCallback, useMemo, useRef, useEffect } from "react";
import { View } from "react-native";
import { GLView } from "expo-gl";
import * as THREE from "three";

// ── Seeded RNG ────────────────────────────────────────────────────────────────
function makeRng(seed) {
  let s = (seed | 0) || 42;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 15), 0xac4e4b97);
    s ^= s >>> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

const cbez = (a, b, c, d, t) => {
  const u = 1 - t;
  return u*u*u*a + 3*u*u*t*b + 3*u*t*t*c + t*t*t*d;
};

function lerpTColor(hex1, hex2, t) {
  const c1 = new THREE.Color(hex1);
  const c2 = new THREE.Color(hex2);
  return new THREE.Color(
    c1.r + (c2.r - c1.r) * t,
    c1.g + (c2.g - c1.g) * t,
    c1.b + (c2.b - c1.b) * t,
  );
}

// ── Stage presets ─────────────────────────────────────────────────────────────
const STAGE_PRESET = {
  "Seedling":      { hPct: 0.12, bud: 0.00, trich: 0.00, fade: 0.00, pist: 0.00 },
  "Vegetative":    { hPct: 0.55, bud: 0.00, trich: 0.00, fade: 0.00, pist: 0.00 },
  "Transition":    { hPct: 0.82, bud: 0.07, trich: 0.00, fade: 0.00, pist: 0.28 },
  "Early Flower":  { hPct: 0.90, bud: 0.30, trich: 0.14, fade: 0.00, pist: 0.90 },
  "Mid Flower":    { hPct: 0.92, bud: 0.65, trich: 0.44, fade: 0.10, pist: 0.65 },
  "Late Flower":   { hPct: 0.94, bud: 0.88, trich: 0.80, fade: 0.40, pist: 0.38 },
  "Final Days":    { hPct: 0.95, bud: 0.97, trich: 0.94, fade: 0.65, pist: 0.18 },
  "Harvest Ready": { hPct: 0.95, bud: 1.00, trich: 1.00, fade: 0.88, pist: 0.10 },
};

const STAGE_KEYFRAMES = [
  { t: 0.00, ...STAGE_PRESET["Seedling"] },
  { t: 0.10, ...STAGE_PRESET["Vegetative"] },
  { t: 0.32, ...STAGE_PRESET["Transition"] },
  { t: 0.46, ...STAGE_PRESET["Early Flower"] },
  { t: 0.62, ...STAGE_PRESET["Mid Flower"] },
  { t: 0.78, ...STAGE_PRESET["Late Flower"] },
  { t: 0.95, ...STAGE_PRESET["Final Days"] },
  { t: 1.00, ...STAGE_PRESET["Harvest Ready"] },
];

function growProgress(day, totalDays) {
  const d  = Math.max(1, Math.min(day, totalDays));
  const fl = Math.max(1, totalDays - 42);
  if (d <= 7)  return (d / 7) * 0.10;
  if (d <= 28) return 0.10 + ((d - 7)  / 21) * 0.22;
  if (d <= 42) return 0.32 + ((d - 28) / 14) * 0.14;
  return 0.46 + (Math.min((d - 42) / fl, 1)) * 0.54;
}

function lerpPreset(t) {
  const kf = STAGE_KEYFRAMES;
  for (let i = 0; i < kf.length - 1; i++) {
    if (t >= kf[i].t && t <= kf[i + 1].t) {
      const a  = kf[i + 1].t === kf[i].t ? 1 : (t - kf[i].t) / (kf[i + 1].t - kf[i].t);
      const lp = k => kf[i][k] + a * (kf[i + 1][k] - kf[i][k]);
      return { hPct: lp("hPct"), bud: lp("bud"), trich: lp("trich"), fade: lp("fade"), pist: lp("pist") };
    }
  }
  return kf[kf.length - 1];
}

const STRAIN_SHAPE = {
  I: { hMult: 0.74, wMult: 1.28, deg: 52, nodes: 7 },
  S: { hMult: 1.28, wMult: 0.62, deg: 26, nodes: 5 },
  H: { hMult: 1.00, wMult: 1.00, deg: 38, nodes: 6 },
};

const STAGE_DAY_EST = {
  Seedling: 4, Vegetative: 18, Transition: 35,
  "Early Flower": 52, "Mid Flower": 62, "Late Flower": 77,
  "Final Days": 88, "Harvest Ready": 91,
};

const TIER_FROST = { T1: 1.00, T2: 0.78, T3: 0.56, T4: 0.36 };

// ── Leaf shape ────────────────────────────────────────────────────────────────
function makeLeafShape(len, width) {
  const shape = new THREE.Shape();
  const w = width * 0.5;
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-w * 0.9, -len * 0.10, -w, -len * 0.60, 0, -len);
  shape.bezierCurveTo( w * 0.9, -len * 0.10,  w, -len * 0.60, 0, -len);
  shape.closePath();
  return shape;
}

const LEAF_ANGLES = [0, -22, 22, -40, 40];
const LEAF_LR     = [1.0, 0.82, 0.82, 0.62, 0.62];
const LEAF_WR     = [0.22, 0.18, 0.18, 0.14, 0.14];

function buildLeafCluster(pos, rot, size, leafMat, veinMat) {
  const group = new THREE.Group();
  group.position.copy(pos);
  group.rotation.z = rot;
  LEAF_ANGLES.forEach((ang, i) => {
    const llen = size * LEAF_LR[i];
    const lw   = llen * LEAF_WR[i];
    const shape = makeLeafShape(llen, lw);
    const geo   = new THREE.ShapeGeometry(shape, 6);
    const mesh  = new THREE.Mesh(geo, leafMat);
    mesh.rotation.z = ang * Math.PI / 180;
    mesh.position.z = (i - 2) * 0.01;
    group.add(mesh);
    const pts     = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -llen * 0.88, 0)];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const line    = new THREE.Line(lineGeo, veinMat);
    line.rotation.z  = ang * Math.PI / 180;
    line.position.z  = (i - 2) * 0.01 + 0.002;
    group.add(line);
  });
  return group;
}

// ── Build plant scene ─────────────────────────────────────────────────────────
function buildPlant(scene, params, rng) {
  const { sp, sh, frost, lean, plantH, spread } = params;

  const leafCol    = lerpTColor("#3d8f4a", "#b8a020", sp.fade);
  const leafDkCol  = lerpTColor("#2a6535", "#8a7010", sp.fade);
  const leafHiCol  = lerpTColor("#3d8f4a", "#c8e8a0", 0.32 * (1 - sp.fade * 0.5));
  const stemCol    = lerpTColor("#2d6535", "#7a4a22", Math.min(sp.fade * 1.6, 1));
  const budCol     = lerpTColor("#3a7848", "#523a70", sp.bud * 0.55);
  const budHiCol   = lerpTColor("#52a85e", "#9268c0", sp.bud * 0.82);
  const pistilCol  = sp.bud > 0.55 ? new THREE.Color("#c87828") : new THREE.Color("#f0e8d0");
  const potCol     = new THREE.Color("#4a2e0a");

  const stemMat  = new THREE.MeshPhongMaterial({ color: stemCol,   shininess: 30, side: THREE.DoubleSide });
  const leafMat  = new THREE.MeshPhongMaterial({ color: leafCol,   shininess: 20, side: THREE.DoubleSide });
  const leafDkMat= new THREE.MeshPhongMaterial({ color: leafDkCol, shininess: 15, side: THREE.DoubleSide });
  const veinMat  = new THREE.LineBasicMaterial({ color: leafHiCol, opacity: 0.45, transparent: true });
  const budMat   = new THREE.MeshPhongMaterial({ color: budCol,    shininess: 60, side: THREE.DoubleSide });
  const budHiMat = new THREE.MeshPhongMaterial({ color: budHiCol,  shininess: 80, side: THREE.DoubleSide });
  const pistMat  = new THREE.LineBasicMaterial({ color: pistilCol, opacity: 0.85, transparent: true });
  const potMat   = new THREE.MeshPhongMaterial({ color: potCol,    shininess: 10 });
  const soilMat  = new THREE.MeshPhongMaterial({ color: new THREE.Color("#2a1a06"), shininess: 5 });

  const potGeo   = new THREE.CylinderGeometry(0.38, 0.46, 0.42, 8);
  scene.add(new THREE.Mesh(potGeo, potMat)).position.set(0, 0.21, 0);
  const soilGeo  = new THREE.CylinderGeometry(0.37, 0.37, 0.04, 8);
  const soilMesh = new THREE.Mesh(soilGeo, soilMat);
  soilMesh.position.set(0, 0.42, 0);
  scene.add(soilMesh);

  const lnRad = lean * Math.PI / 180;
  const p0 = new THREE.Vector3(0, 0.42, 0);
  const p1 = new THREE.Vector3( Math.sin(lnRad) * 0.3,  0.42 + plantH * 0.36, 0);
  const p2 = new THREE.Vector3(-Math.sin(lnRad) * 0.22, 0.42 + plantH * 0.70, 0);
  const p3 = new THREE.Vector3( Math.sin(lnRad) * 0.08, 0.42 + plantH,        0);

  const stemCurve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
  const stemPts   = stemCurve.getPoints(16);

  for (let i = 0; i < stemPts.length - 1; i++) {
    const frac   = i / (stemPts.length - 1);
    const r      = 0.055 - frac * 0.032;
    const segDir = new THREE.Vector3().subVectors(stemPts[i + 1], stemPts[i]);
    const segLen = segDir.length();
    const mid    = new THREE.Vector3().addVectors(stemPts[i], stemPts[i + 1]).multiplyScalar(0.5);
    const cylGeo = new THREE.CylinderGeometry(r * 0.82, r, segLen, 6, 1);
    const cyl    = new THREE.Mesh(cylGeo, stemMat);
    cyl.position.copy(mid);
    cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), segDir.normalize());
    scene.add(cyl);
  }

  const stemAt = t => new THREE.Vector3(
    cbez(p0.x, p1.x, p2.x, p3.x, t),
    cbez(p0.y, p1.y, p2.y, p3.y, t),
    0,
  );

  const nodeCount = sp.hPct < 0.15 ? 0 : Math.max(1, Math.floor(sh.nodes * Math.min(sp.hPct * 2, 1)));

  for (let i = 0; i < nodeCount; i++) {
    const t       = 0.09 + (i / Math.max(nodeCount, 1)) * 0.80;
    const pos     = stemAt(t);
    const fromTop = 1 - t;
    const bLen    = spread * (0.44 + fromTop * 0.56);
    const ang     = sh.deg + (rng() - 0.5) * 10;
    const aRad    = ang * Math.PI / 180;
    const leafSz  = 0.09 + fromTop * 0.13;

    const tipL = new THREE.Vector3(pos.x - Math.cos(aRad) * bLen, pos.y - Math.sin(aRad) * bLen * 0.40, 0);
    const tipR = new THREE.Vector3(pos.x + Math.cos(aRad) * bLen, tipL.y, 0);

    for (const [tipV, side] of [[tipL, -1], [tipR, 1]]) {
      const bDir  = new THREE.Vector3().subVectors(tipV, pos);
      const bLen3 = bDir.length();
      const bMid  = new THREE.Vector3().addVectors(pos, tipV).multiplyScalar(0.5);
      const bR    = 0.025 + fromTop * 0.015;
      const bCyl  = new THREE.CylinderGeometry(bR * 0.65, bR, bLen3, 5, 1);
      const bMesh = new THREE.Mesh(bCyl, stemMat);
      bMesh.position.copy(bMid);
      bMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bDir.normalize());
      bMesh.position.z = side * 0.02 * (i % 2 === 0 ? 1 : -1);
      scene.add(bMesh);

      const clusterRot = side < 0 ? (-108 * Math.PI / 180) : (-72 * Math.PI / 180);
      const clusterPos = tipV.clone();
      clusterPos.z = side * 0.04 * (i % 2 === 0 ? 1 : -1);
      scene.add(buildLeafCluster(clusterPos, clusterRot, leafSz, leafMat, veinMat));
    }

    if (i < nodeCount - 2) {
      const nodeRot     = (-90 + (i % 2 === 0 ? 14 : -14)) * Math.PI / 180;
      const nodeCluster = buildLeafCluster(pos.clone(), nodeRot, leafSz * 1.1, leafDkMat, veinMat);
      nodeCluster.position.z = (i % 2 === 0 ? 0.05 : -0.05);
      scene.add(nodeCluster);
    }

    if (sp.bud > 0.12) {
      for (const tipV of [tipL, tipR]) {
        const budR = 0.04 + sp.bud * 0.10;
        const brng = makeRng((params.strainSeed | 0) * 31 + i * 7);
        const nDots = Math.max(2, Math.floor(sp.bud * 4));
        for (let b = 0; b < nDots; b++) {
          const off  = b === 0 ? new THREE.Vector3(0,0,0)
            : new THREE.Vector3((brng()-0.5)*budR*1.4, (brng()-0.5)*budR*1.4, (brng()-0.5)*budR*0.8);
          const sr   = budR * (0.6 + brng() * 0.45);
          const sMesh= new THREE.Mesh(new THREE.SphereGeometry(sr, 7, 5), b === 0 ? budHiMat : budMat);
          sMesh.position.copy(tipV).add(off);
          scene.add(sMesh);
          const hlMesh = new THREE.Mesh(
            new THREE.SphereGeometry(sr * 0.25, 4, 3),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }),
          );
          hlMesh.position.copy(tipV).add(off).add(new THREE.Vector3(-sr * 0.28, sr * 0.32, sr * 0.2));
          scene.add(hlMesh);
        }
        if (sp.pist > 0.05) {
          const prng  = makeRng((params.strainSeed | 0) * 503 + i * 23);
          const count = Math.floor(sp.pist * 6);
          for (let k = 0; k < count; k++) {
            const a   = prng() * Math.PI * 2;
            const d   = prng() * budR * 1.2;
            const len = 0.04 + prng() * 0.09;
            const pA  = tipV.clone().add(new THREE.Vector3(Math.cos(a)*d, Math.sin(a)*d*0.8, (prng()-0.5)*0.05));
            const pB  = pA.clone().add(new THREE.Vector3(Math.cos(a+0.32)*len, Math.sin(a+0.32)*len*0.8, 0));
            scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pA, pB]), pistMat));
          }
        }
      }
    }
  }

  if (sp.bud > 0.05) {
    const colaR   = 0.08 + sp.bud * 0.28;
    const colaPos = p3.clone();
    const colaRng = makeRng((params.strainSeed | 0) * 97);
    const nColaDots = Math.max(5, Math.floor(sp.bud * 11));
    for (let b = 0; b < nColaDots; b++) {
      const off  = b === 0 ? new THREE.Vector3(0,0,0)
        : new THREE.Vector3((colaRng()-0.5)*colaR*1.6, (colaRng()-0.5)*colaR*1.2, (colaRng()-0.5)*colaR*0.9);
      const sr   = colaR * (b === 0 ? 0.65 : 0.38 + colaRng() * 0.28);
      const sMesh= new THREE.Mesh(new THREE.SphereGeometry(sr, 9, 7), b === 0 ? budHiMat : budMat);
      sMesh.position.copy(colaPos).add(off);
      scene.add(sMesh);
      const hlMesh = new THREE.Mesh(
        new THREE.SphereGeometry(sr * 0.28, 5, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
      );
      hlMesh.position.copy(colaPos).add(off).add(new THREE.Vector3(-sr * 0.30, sr * 0.36, sr * 0.22));
      scene.add(hlMesh);
    }
    if (sp.pist > 0.05) {
      const prng  = makeRng((params.strainSeed | 0) * 1303);
      const count = Math.floor(sp.pist * 14);
      for (let k = 0; k < count; k++) {
        const a   = prng() * Math.PI * 2;
        const d   = prng() * colaR * 1.4;
        const len = 0.05 + prng() * 0.12;
        const pA  = colaPos.clone().add(new THREE.Vector3(Math.cos(a)*d, Math.sin(a)*d*0.7, (prng()-0.5)*0.08));
        const pB  = pA.clone().add(new THREE.Vector3(Math.cos(a+0.35)*len, Math.sin(a+0.35)*len*0.8, 0));
        scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pA, pB]), pistMat));
      }
    }
  }

  if (sp.trich > 0.30) {
    const triMat    = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 * frost });
    const triDotGeo = new THREE.SphereGeometry(0.012, 3, 2);
    const triRng    = makeRng((params.strainSeed | 0) * 1009);
    const count     = Math.floor(sp.trich * frost * 60);
    for (let k = 0; k < count; k++) {
      const a   = triRng() * Math.PI * 2;
      const d   = triRng() * (0.35 + sp.bud * 0.30);
      const yOff = triRng() * plantH * 0.55;
      const tri  = new THREE.Mesh(triDotGeo, triMat);
      tri.position.set(Math.cos(a)*d, p3.y - yOff * 0.6, Math.sin(a)*d);
      scene.add(tri);
    }
  }

  if (sp.hPct < 0.15) {
    const cotyMat  = new THREE.MeshPhongMaterial({ color: new THREE.Color("#b8d880"), side: THREE.DoubleSide });
    const cotyVMat = new THREE.LineBasicMaterial({ color: new THREE.Color("#d0f5b0"), opacity: 0.4, transparent: true });
    for (const side of [-1, 1]) {
      const cp = new THREE.Vector3(side * 0.07, 0.42 + plantH * 0.85, 0);
      const cr = side < 0 ? (-130 * Math.PI / 180) : (-50 * Math.PI / 180);
      scene.add(buildLeafCluster(cp, cr, 0.07, cotyMat, cotyVMat));
    }
  }
}

// ── Canvas polyfill for Three.js r150+ ───────────────────────────────────────
// Three.js accesses several DOM properties on the canvas — provide safe stubs
// so it doesn't throw when they don't exist in the React Native environment.
function makeCanvasPolyfill(W, H) {
  return {
    width: W, height: H,
    clientWidth: W, clientHeight: H,
    style: {},
    ownerDocument: null,
    addEventListener:      () => {},
    removeEventListener:   () => {},
    setPointerCapture:     () => {},
    releasePointerCapture: () => {},
    getContext:            () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PlantRenderer3D({
  width      = 300,
  height     = 350,
  stage      = "Seedling",
  strainType = "H",
  tier       = "T4",
  strainSeed = 1,
  day        = null,
  totalDays  = null,
}) {
  const params = useMemo(() => {
    const rng   = makeRng(strainSeed | 0);
    const sh    = STRAIN_SHAPE[strainType] || STRAIN_SHAPE.H;
    const frost = TIER_FROST[tier] ?? 0.36;
    const sp    = (day != null && totalDays != null && totalDays > 0)
      ? lerpPreset(growProgress(day, totalDays))
      : (STAGE_PRESET[stage] || STAGE_PRESET["Vegetative"]);
    const maxH   = 3.6;
    const plantH = maxH * sp.hPct * sh.hMult;
    const spread = 1.4 * sh.wMult;
    const lean   = (rng() - 0.5) * 18;
    return { sp, sh, frost, lean, plantH, spread, strainSeed };
  }, [stage, strainType, tier, strainSeed, day, totalDays]);

  // Track whether component is still mounted + hold animation canceller
  const mountedRef = useRef(true);
  const cancelRef  = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (cancelRef.current) {
        cancelRef.current();
        cancelRef.current = null;
      }
    };
  }, []);

  const onContextCreate = useCallback((gl) => {
    // Entire GL initialisation wrapped — any Three.js error is caught here.
    // GLView's onContextCreate is not part of the React render cycle so the
    // Plant3DGuard error boundary cannot intercept errors from this callback.
    try {
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;

      if (!W || !H) return;

      const renderer = new THREE.WebGLRenderer({
        canvas:    makeCanvasPolyfill(W, H),
        context:   gl,
        antialias: false,   // expo-gl context is already created — don't re-request
        alpha:     true,
        powerPreference: "default",
      });
      renderer.setSize(W, H);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);

      const scene  = new THREE.Scene();
      const aspect = W / H;
      const camera = new THREE.PerspectiveCamera(52, aspect, 0.01, 100);
      camera.position.set(0, 0.42 + params.plantH * 0.5, 4.2);
      camera.lookAt(0, 0.42 + params.plantH * 0.48, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      const key = new THREE.DirectionalLight(0xfff5e8, 1.1);
      key.position.set(-2.5, 4, 3);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xc8e8ff, 0.35);
      fill.position.set(3, 1, 2);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0x88ffcc, 0.25);
      rim.position.set(0, -1, -3);
      scene.add(rim);

      const discMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 0.55, 0.01, 16),
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.30 }),
      );
      discMesh.position.set(0, 0.01, 0);
      scene.add(discMesh);

      const rng = makeRng(params.strainSeed | 0);
      buildPlant(scene, params, rng);

      const plantGroup = new THREE.Group();
      while (scene.children.length) plantGroup.add(scene.children[0]);
      scene.add(plantGroup);

      let frameId;
      let running = true;

      const animate = () => {
        if (!running || !mountedRef.current) return;
        frameId = requestAnimationFrame(animate);
        plantGroup.rotation.y += 0.007;
        renderer.render(scene, camera);
        gl.endFrameEXP();
      };
      animate();

      // Store canceller — called by useEffect cleanup on unmount
      cancelRef.current = () => {
        running = false;
        if (frameId != null) cancelAnimationFrame(frameId);
        try { renderer.dispose(); } catch (_) {}
      };
    } catch (err) {
      console.warn("[PlantRenderer3D] GL init failed:", err?.message || err);
    }
  }, [params]);

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <GLView style={{ width, height }} onContextCreate={onContextCreate} />
    </View>
  );
}
