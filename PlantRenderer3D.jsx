// PlantRenderer3D.jsx — 3D plant viewer using react-native-filament.
// Full PBR textures work natively — no ArrayBuffer/Blob limitations.
// Requires a dev-client or EAS build (native module).

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
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

// Our own image-based light — the library's <EnvironmentalLight>/<DefaultLight>
// calls lightBuffer.release() itself right after setIndirectLight(). Under
// Fabric dev mode React double-invokes effects (mount → unmount → remount),
// so on remount the worklet runs again against the already-freed pointer and
// throws "Pointer FilamentBuffer has already been manually released!".
//
// Here we own the buffer: releaseOnUnmount:false means useBuffer never frees
// it, and we never call release() either. setIndirectLight only ever sees a
// live pointer, so there's no use-after-free. (Filament parses the KTX into
// its own IndirectLight, so the small buffer simply lives for the session.)
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

// Lights rendered once per scene. PlantIBL gives plants their soft ambient/PBR
// reflections; the directional light is the key/sun. Both live inside a child
// of <FilamentScene> so useFilamentContext() resolves.
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
function Placeholder({ width, height, downloading, error }) {
  return (
    <View style={[styles.placeholder, { width, height }]}>
      {downloading ? (
        <ActivityIndicator color="#2d6a4f" size="small" />
      ) : error ? (
        <Text style={styles.errText}>{error}</Text>
      ) : null}
    </View>
  );
}

// ── Card scene (non-interactive, auto-rotate) ─────────────────────────────────
// Must be a child of <FilamentScene> so useFilamentContext() can resolve.
function CardScene({ localUri, strainConfig }) {
  const { camera, view } = useFilamentContext();
  const angle   = useSharedValue(0);
  const prevAsp = useSharedValue(0);

  // Stable source object so useModel's buffer isn't recreated every render.
  const modelSource = useMemo(() => ({ uri: localUri }), [localUri]);

  const sXZ = (strainConfig.scaleXZ ?? 1.0) * 3.5;
  const sY  = (strainConfig.scaleY  ?? 1.0) * 3.5;

  const renderCallback = useCallback(
    (frameInfo) => {
      "worklet";
      const asp = view.getAspectRatio();
      if (prevAsp.value !== asp) {
        prevAsp.value = asp;
        camera.setLensProjection(28, asp, 0.1, 100);
      }
      angle.value = angle.value + frameInfo.timeSinceLastFrame * 0.5;
      const r = 4.5;
      camera.lookAt(
        [Math.sin(angle.value) * r, 0.5, Math.cos(angle.value) * r],
        [0, 0.5, 0],
        [0, 1, 0]
      );
    },
    [angle, camera, prevAsp, view]
  );

  return (
    <FilamentView style={{ flex: 1 }} renderCallback={renderCallback}>
      <PlantLights />
      <Model
        source={modelSource}
        transformToUnitCube
        scale={[sXZ, sY, sXZ]}
      />
    </FilamentView>
  );
}

// ── Fullscreen scene (interactive orbit + pinch zoom) ─────────────────────────
// Must be a child of <FilamentScene>.
function FullscreenScene({ localUri, strainConfig }) {
  const cameraManipulator = useCameraManipulator({
    orbitHomePosition: [0, 0.5, 4.5],
    targetPosition:    [0, 0.5, 0],
    upVector:          [0, 1, 0],
    zoomSpeed:         [0.02],          // ~12x faster pinch zoom than before
    orbitSpeed:        [0.004, 0.004],  // halved — less twitchy rotation
  });

  const prevPinchRef = useRef(0);
  // Current grab mode: 'none' | 'orbit' (1 finger) | 'pan' (2 fingers).
  // The manipulator has a single active grab, so we track which one is live to
  // transition cleanly when fingers are added/lifted.
  const modeRef = useRef("none");

  // Stable source object so useModel's buffer isn't recreated every render.
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
        // Two fingers: pan (strafe) + pinch zoom. End any 1-finger orbit first.
        if (modeRef.current === "orbit") cameraManipulator?.grabEnd();
        const cx = (t[0].pageX + t[1].pageX) / 2;
        const cy = (t[0].pageY + t[1].pageY) / 2;
        cameraManipulator?.grabBegin(cx, cy, true); // strafe = pan
        prevPinchRef.current = pinchDist(t);
        modeRef.current = "pan";
      } else if (t.length === 1) {
        cameraManipulator?.grabBegin(t[0].pageX, t[0].pageY, false); // orbit
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
        // Pinch zoom: negative scrolldelta = zoom in, positive = zoom out.
        if (prevPinchRef.current > 0) {
          cameraManipulator?.scroll(cx, cy, prevPinchRef.current - dist);
        }
        prevPinchRef.current = dist;
        // Drag both fingers to pan around the plant.
        cameraManipulator?.grabUpdate(cx, cy);
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
        cameraManipulator?.grabEnd();
        prevPinchRef.current = 0;
        modeRef.current = "none";
      } else if (remaining.length === 1) {
        // Dropped from two fingers to one: end the pan grab, resume orbit.
        cameraManipulator?.grabEnd();
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
        <Model
          source={modelSource}
          transformToUnitCube
          scale={[sXZ, sY, sXZ]}
        />
      </FilamentView>
    </View>
  );
}

// ── Full-screen modal ──────────────────────────────────────────────────────────
function PlantFullscreenModal({ visible, onClose, stage, localUri, strainConfig }) {
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
            <FullscreenScene localUri={localUri} strainConfig={strainConfig} />
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
  width  = 300,
  height = 350,
  stage  = "Seedling",
  strain = "",
}) {
  const strainConfig = getStrainConfig(strain);
  const { localUri, status } = useGLBAsset(stage, strain);
  const [fullscreen, setFullscreen] = useState(false);
  const tapStartRef = useRef({ x: 0, y: 0 });

  const downloading = status === "checking" || status === "downloading";

  return (
    <>
      <View style={{ width, height }}>
        {/* Unmount card FilamentScene while fullscreen to avoid two active engines */}
        {!localUri || fullscreen ? (
          <Placeholder
            width={width}
            height={height}
            downloading={downloading && !fullscreen}
          />
        ) : (
          <FilamentScene>
            <CardScene localUri={localUri} strainConfig={strainConfig} />
          </FilamentScene>
        )}

        {/* Transparent tap overlay — tap opens fullscreen */}
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
  errText: {
    color: "#2d6a4f",
    fontSize: 10,
    opacity: 0.6,
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
