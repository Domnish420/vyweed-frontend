// PlantRenderer3D.jsx — 3D plant viewer using react-native-filament.
// Full PBR textures work natively — no ArrayBuffer/Blob limitations.
// Requires a dev-client or EAS build (native module).
//
// Growth strategy (no 20k models needed):
//   • 9 stage GLBs total, one per growth stage.
//   • Camera distance eases from CAM_FAR (seedling) → CAM_NEAR (mature) as days
//     advance, providing continuous size growth within and across stages.
//   • When the `stage` prop changes, we crossfade from the old stage model to the
//     new one using complementary Animated.View opacities (1.5 s dissolve).
//   • The NEXT stage's GLB is preloaded in the background so the crossfade starts
//     immediately when the boundary is hit (no loading flash).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Camera,
  FilamentScene,
  FilamentView,
  Light,
  Model,
  useBuffer,
  useFilamentContext,
  useWorkletEffect,
  useCameraManipulator,
} from "react-native-filament";
import { useSharedValue } from "react-native-worklets-core";
import { getStrainConfig } from "./STRAIN_CONFIG";
import useGLBAsset from "./useGLBAsset";

// Stable module-level source for the image-based light.
const IBL_SOURCE = { uri: "RNF_default_env_ibl.ktx" };

// Ordered list of growth stages — used to find the "next" stage for preloading.
const STAGE_ORDER = [
  "Seedling",
  "Vegetative",
  "Transition",
  "Early Flower",
  "Bud Swell",
  "Mid Flower",
  "Late Flower",
  "Final Days",
  "Harvest Ready",
];

function nextStageName(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i >= 0 && i < STAGE_ORDER.length - 1 ? STAGE_ORDER[i + 1] : null;
}

// ── Continuous growth ──────────────────────────────────────────────────────────
const CAM_FAR  = 9.0;   // seedling — camera pulled back, plant looks small
const CAM_NEAR = 3.6;   // mature   — camera close, plant fills the frame

function computeGrowth(day, totalDays) {
  if (!day || !totalDays) return 1;
  const stretchEnd = totalDays * 0.5;
  const hp    = Math.min(day / stretchEnd, 1);
  const eased = hp * hp * (3 - 2 * hp); // smoothstep
  return 0.16 + 0.84 * eased;           // 0.16 (seedling) .. 1.0 (mature)
}

function growthToRadius(growth) {
  const g = Math.max(0, Math.min(1, growth));
  return CAM_FAR - (CAM_FAR - CAM_NEAR) * g;
}

// ── Custom IBL ─────────────────────────────────────────────────────────────────
// The library's <EnvironmentalLight> calls lightBuffer.release() in its worklet.
// Under Fabric dev mode, effects double-invoke and the second run hits a dead
// pointer → "FilamentBuffer has already been manually released!". We own the
// buffer with releaseOnUnmount:false and never release it ourselves.
function PlantIBL({ intensity = 28000 }) {
  const { engine } = useFilamentContext();
  const buffer = useBuffer({ source: IBL_SOURCE, releaseOnUnmount: false });

  useWorkletEffect(() => {
    "worklet";
    if (buffer == null) return;
    engine.setIndirectLight(buffer, intensity, 3);
  });

  return null;
}

function PlantLights() {
  return (
    <>
      <PlantIBL intensity={28000} />
      <Light
        type="directional"
        intensity={12000}
        colorKelvin={6500}
        direction={[0.3, -1, -0.6]}
        castShadows={false}
      />
    </>
  );
}

// ── Placeholder ────────────────────────────────────────────────────────────────
function Placeholder({ width, height, downloading }) {
  return (
    <View style={[styles.placeholder, { width, height }]}>
      {downloading && <ActivityIndicator color="#2d6a4f" size="small" />}
    </View>
  );
}

// ── Card scene (non-interactive, auto-rotate) ─────────────────────────────────
function CardScene({ localUri, strainConfig, growth = 1 }) {
  const { camera, view } = useFilamentContext();
  const angle   = useSharedValue(0);
  const prevAsp = useSharedValue(0);
  const targetR = useSharedValue(growthToRadius(growth));
  const curR    = useSharedValue(growthToRadius(growth));

  const modelSource = useMemo(() => ({ uri: localUri }), [localUri]);

  const sXZ = (strainConfig.scaleXZ ?? 1.0) * 3.5;
  const sY  = (strainConfig.scaleY  ?? 1.0) * 3.5;

  useEffect(() => {
    targetR.value = growthToRadius(growth);
  }, [growth, targetR]);

  const renderCallback = useCallback(
    (frameInfo) => {
      "worklet";
      const asp = view.getAspectRatio();
      if (prevAsp.value !== asp) {
        prevAsp.value = asp;
        camera.setLensProjection(28, asp, 0.1, 100);
      }
      const k = Math.min(1, frameInfo.timeSinceLastFrame * 6);
      curR.value = curR.value + (targetR.value - curR.value) * k;
      angle.value = angle.value + frameInfo.timeSinceLastFrame * 0.5;
      const r = curR.value;
      camera.lookAt(
        [Math.sin(angle.value) * r, 0.5, Math.cos(angle.value) * r],
        [0, 0.5, 0],
        [0, 1, 0]
      );
    },
    [angle, camera, curR, prevAsp, targetR, view]
  );

  return (
    <FilamentView style={{ flex: 1 }} renderCallback={renderCallback}>
      <PlantLights />
      <Model source={modelSource} transformToUnitCube scale={[sXZ, sY, sXZ]} />
    </FilamentView>
  );
}

// ── Fullscreen scene (interactive orbit + pinch zoom) ─────────────────────────
function FullscreenScene({ localUri, strainConfig, growth = 1 }) {
  const homeR = growthToRadius(growth);
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0.5, homeR],
    targetPosition:    [0, 0.5, 0],
    upVector:          [0, 1, 0],
    zoomSpeed:         [0.02],
    orbitSpeed:        [0.004, 0.004],
  });

  const prevPinchRef = useRef(0);
  const prevCxRef    = useRef(0);
  const prevCyRef    = useRef(0);
  const modeRef      = useRef("none"); // 'none' | 'orbit' | 'two' | 'pan'

  const modelSource = useMemo(() => ({ uri: localUri }), [localUri]);

  const sXZ = (strainConfig.scaleXZ ?? 1.0) * 3.5;
  const sY  = (strainConfig.scaleY  ?? 1.0) * 3.5;

  const pinchDist = (t) => {
    const dx = t[0].pageX - t[1].pageX;
    const dy = t[0].pageY - t[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const onTouchStart = useCallback(
    (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        if (modeRef.current !== "none") cameraManipulator?.grabEnd();
        prevPinchRef.current = pinchDist(t);
        prevCxRef.current = (t[0].pageX + t[1].pageX) / 2;
        prevCyRef.current = (t[0].pageY + t[1].pageY) / 2;
        modeRef.current = "two";
      } else if (t.length === 1) {
        cameraManipulator?.grabBegin(t[0].pageX, t[0].pageY, false);
        prevPinchRef.current = 0;
        modeRef.current = "orbit";
      }
    },
    [cameraManipulator]
  );

  const onTouchMove = useCallback(
    (e) => {
      const t = e.nativeEvent.touches;
      if (t.length >= 2) {
        const cx   = (t[0].pageX + t[1].pageX) / 2;
        const cy   = (t[0].pageY + t[1].pageY) / 2;
        const dist = pinchDist(t);
        const dDist = prevPinchRef.current - dist;
        const dPan  = Math.hypot(cx - prevCxRef.current, cy - prevCyRef.current);

        if (Math.abs(dDist) >= dPan) {
          // Pinch dominates — zoom. End pan grab first so dolly isn't clobbered.
          if (modeRef.current === "pan") {
            cameraManipulator?.grabEnd();
            modeRef.current = "two";
          }
          cameraManipulator?.scroll(cx, cy, dDist);
        } else {
          // Drag dominates — strafe pan.
          if (modeRef.current !== "pan") {
            cameraManipulator?.grabBegin(prevCxRef.current, prevCyRef.current, true);
            modeRef.current = "pan";
          }
          cameraManipulator?.grabUpdate(cx, cy);
        }

        prevPinchRef.current = dist;
        prevCxRef.current = cx;
        prevCyRef.current = cy;
      } else if (t.length === 1) {
        prevPinchRef.current = 0;
        cameraManipulator?.grabUpdate(t[0].pageX, t[0].pageY);
      }
    },
    [cameraManipulator]
  );

  const onTouchEnd = useCallback(
    (e) => {
      const remaining = e.nativeEvent.touches;
      if (remaining.length === 0) {
        if (modeRef.current === "pan" || modeRef.current === "orbit") {
          cameraManipulator?.grabEnd();
        }
        prevPinchRef.current = 0;
        modeRef.current = "none";
      } else if (remaining.length === 1) {
        if (modeRef.current === "pan") cameraManipulator?.grabEnd();
        cameraManipulator?.grabBegin(remaining[0].pageX, remaining[0].pageY, false);
        prevPinchRef.current = 0;
        modeRef.current = "orbit";
      }
    },
    [cameraManipulator]
  );

  return (
    <View
      style={StyleSheet.absoluteFill}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <FilamentView style={StyleSheet.absoluteFill}>
        <Camera
          cameraManipulator={cameraManipulator}
          near={0.1}
          far={100}
          focalLengthInMillimeters={28}
        />
        <PlantLights />
        <Model source={modelSource} transformToUnitCube scale={[sXZ, sY, sXZ]} />
      </FilamentView>
    </View>
  );
}

// ── Full-screen modal ──────────────────────────────────────────────────────────
function PlantFullscreenModal({ visible, onClose, stage, localUri, strainConfig, growth }) {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (visible) {
      setShowHint(true);
      const t = setTimeout(() => setShowHint(false), 3500);
      return () => clearTimeout(t);
    }
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={styles.fsContainer}>
        {localUri ? (
          <FilamentScene>
            <FullscreenScene localUri={localUri} strainConfig={strainConfig} growth={growth} />
          </FilamentScene>
        ) : (
          <ActivityIndicator color="#2d6a4f" style={{ flex: 1 }} />
        )}

        <View style={styles.fsLabelWrap} pointerEvents="none">
          <Text style={styles.fsLabel}>{stage}</Text>
        </View>

        {showHint && (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hintText}>Drag to rotate  •  Pinch to zoom</Text>
          </View>
        )}

        <TouchableOpacity style={styles.fsClose} onPress={onClose} activeOpacity={0.7}>
          <Text style={styles.fsCloseText}>✕</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── Public component ───────────────────────────────────────────────────────────
export default function PlantRenderer3D({
  width     = 300,
  height    = 350,
  stage     = "Seedling",
  strain    = "",
  day       = 0,
  totalDays = 0,
}) {
  const strainConfig = getStrainConfig(strain);
  const { localUri, status } = useGLBAsset(stage, strain);

  // Preload the next stage's GLB now so the crossfade fires instantly at the
  // boundary. If we're at the last stage, fall back to current (already cached).
  const upcomingStage = nextStageName(stage) ?? stage;
  useGLBAsset(upcomingStage, strain);

  const [fullscreen, setFullscreen] = useState(false);
  const tapStartRef = useRef({ x: 0, y: 0 });
  const growth = computeGrowth(day, totalDays);
  const downloading = status === "checking" || status === "downloading";

  // ── Stage crossfade ──────────────────────────────────────────────────────────
  // crossfadeAnim: 0 = showing old stage, 1 = showing new stage (initial state).
  // fromUri: the old stage's localUri kept alive during the dissolve, then nulled.
  const [fromUri, setFromUri] = useState(null);
  const crossfadeAnim = useRef(new Animated.Value(1)).current;
  const fromOpacity   = useMemo(
    () => crossfadeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    [crossfadeAnim]
  );

  // Track the last successfully loaded (stage, uri) pair so we know what to
  // dissolve FROM when the stage next changes.
  const lastReadyRef = useRef({ stage: null, uri: null });

  useEffect(() => {
    if (!localUri) return;
    const prev = lastReadyRef.current;
    if (prev.stage !== null && prev.stage !== stage && prev.uri) {
      // New stage loaded — kick off the dissolve from the previous model.
      crossfadeAnim.stopAnimation();
      setFromUri(prev.uri);
      crossfadeAnim.setValue(0);
      Animated.timing(crossfadeAnim, {
        toValue:        1,
        duration:       1500,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setFromUri(null);
      });
    }
    lastReadyRef.current = { stage, uri: localUri };
  }, [stage, localUri]); // crossfadeAnim is a stable ref — safe to omit

  // When the user opens fullscreen, snap to the current stage (avoids running
  // 3 Filament engines simultaneously: card-from + card-to + fullscreen).
  useEffect(() => {
    if (fullscreen) {
      crossfadeAnim.stopAnimation();
      crossfadeAnim.setValue(1);
      setFromUri(null);
    }
  }, [fullscreen]); // same reason

  return (
    <>
      <View style={{ width, height, overflow: "hidden" }}>
        {fullscreen ? (
          // Card unmounted while fullscreen to avoid two active engines.
          <Placeholder width={width} height={height} downloading={false} />
        ) : (
          <>
            {/* Old stage: fades from opacity 1 → 0 during crossfade */}
            {fromUri && (
              <Animated.View
                style={[StyleSheet.absoluteFill, { opacity: fromOpacity }]}
                pointerEvents="none"
              >
                <FilamentScene>
                  <CardScene localUri={fromUri} strainConfig={strainConfig} growth={growth} />
                </FilamentScene>
              </Animated.View>
            )}

            {/* Current stage: fades from 0 → 1 during crossfade, fully visible otherwise */}
            {localUri ? (
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  fromUri ? { opacity: crossfadeAnim } : undefined,
                ]}
              >
                <FilamentScene>
                  <CardScene localUri={localUri} strainConfig={strainConfig} growth={growth} />
                </FilamentScene>
              </Animated.View>
            ) : (
              <Placeholder width={width} height={height} downloading={downloading} />
            )}
          </>
        )}

        {/* Tap-to-fullscreen overlay */}
        {localUri && !fullscreen && (
          <View
            style={StyleSheet.absoluteFill}
            onTouchStart={(e) => {
              tapStartRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
            }}
            onTouchEnd={(e) => {
              const dx = e.nativeEvent.pageX - tapStartRef.current.x;
              const dy = e.nativeEvent.pageY - tapStartRef.current.y;
              if (Math.sqrt(dx * dx + dy * dy) < 12) setFullscreen(true);
            }}
          />
        )}
      </View>

      <PlantFullscreenModal
        visible={fullscreen}
        onClose={() => setFullscreen(false)}
        stage={stage}
        localUri={localUri}
        strainConfig={strainConfig}
        growth={growth}
      />
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#0d1f12",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  fsContainer:  { flex: 1, backgroundColor: "#0d1f12" },
  fsLabelWrap:  { position: "absolute", top: 52, left: 0, right: 0, alignItems: "center" },
  fsLabel:      { color: "#fff", fontSize: 18, opacity: 0.85, letterSpacing: 1 },
  hintWrap:     { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center" },
  hintText:     { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  fsClose: {
    position: "absolute",
    top: 44,
    right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20,
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  fsCloseText: { color: "#fff", fontSize: 16, lineHeight: 20 },
});
