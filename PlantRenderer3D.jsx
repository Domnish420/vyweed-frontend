// PlantRenderer3D.jsx — Loads .glb from GitHub Releases via useGLBAsset.
// Requires a dev-client or EAS build (expo-gl is a native module).

import React, { useCallback, useRef, useEffect, useState } from "react";
import {
  View, ActivityIndicator, StyleSheet, Text,
  Modal, TouchableOpacity, Dimensions, StatusBar,
} from "react-native";
import { GLView } from "expo-gl";
import * as THREE from "three";
import useGLBAsset from "./useGLBAsset";
import { RNDRACOLoader } from "./RNDRACOLoader";

let GLTFLoader = null;
try {
  ({ GLTFLoader } = require("three/examples/jsm/loaders/GLTFLoader.js"));
} catch (_) {}

const _dracoLoader = new RNDRACOLoader();

function makeCanvasPolyfill(W, H) {
  return {
    width: W, height: H, clientWidth: W, clientHeight: H,
    style: {}, ownerDocument: null,
    addEventListener: () => {}, removeEventListener: () => {},
    setPointerCapture: () => {}, releasePointerCapture: () => {},
    getContext: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
}

async function loadGLBIntoScene(localUri, scene, targetHeight = 3.5) {
  if (!GLTFLoader) throw new Error("GLTFLoader unavailable");
  const response = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();
  await new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(_dracoLoader);
    loader.parse(arrayBuffer, "", (gltf) => {
      const model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const scale = targetHeight / maxDim;
        model.scale.setScalar(scale);
        model.position.x = -center.x * scale;
        model.position.y = (-center.y + size.y * 0.5) * scale + 0.1;
        model.position.z = -center.z * scale;
      }
      // React Native Blob can't load GLB-embedded textures — solid plant materials.
      const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d7a27, roughness: 0.85, metalness: 0.0,  side: THREE.DoubleSide });
      const stemMat = new THREE.MeshStandardMaterial({ color: 0x4a7c40, roughness: 0.9,  metalness: 0.0,  side: THREE.DoubleSide });
      const budMat  = new THREE.MeshStandardMaterial({ color: 0x8fbc45, roughness: 0.7,  metalness: 0.05, side: THREE.DoubleSide });
      model.traverse((node) => {
        if (!node.isMesh) return;
        const n = (node.name || '').toLowerCase();
        if (n.includes('bud') || n.includes('flower') || n.includes('calyx')) node.material = budMat;
        else if (n.includes('stem') || n.includes('branch') || n.includes('trunk')) node.material = stemMat;
        else node.material = leafMat;
      });
      scene.add(model);
      resolve();
    }, reject);
  });
}

// ── Placeholder ───────────────────────────────────────────────────────────────
function Placeholder({ width, height, downloading, error }) {
  return (
    <View style={[styles.placeholder, { width, height }]}>
      {downloading
        ? <ActivityIndicator color="#2d6a4f" size="small" />
        : error
          ? <Text style={styles.errText}>{error}</Text>
          : null}
    </View>
  );
}

// ── Core GL viewer ────────────────────────────────────────────────────────────
// interactive=false → auto-rotate only (card view)
// interactive=true  → transparent overlay captures all touches:
//                      1 finger = free rotation, 2 fingers = pinch zoom
function GLBViewer({ width, height, localUri, interactive = false }) {
  const mountedRef   = useRef(true);
  const cancelRef    = useRef(null);
  const rotYRef      = useRef(0);
  const rotXRef      = useRef(0);
  const cameraZRef   = useRef(5.0);
  const prevTouchRef = useRef({ x: 0, y: 0 });
  const prevPinchRef = useRef(0);
  const autoRef      = useRef(true);
  const resumeRef    = useRef(null);

  const [failed, setFailed] = useState(false);
  const [glErr, setGlErr]   = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current?.();
      if (resumeRef.current) clearTimeout(resumeRef.current);
    };
  }, []);

  // Raw touch handlers — see all fingers, works where PanResponder misses pinch
  const onTouchStart = useCallback((e) => {
    const t = e.nativeEvent.touches;
    autoRef.current = false;
    if (resumeRef.current) clearTimeout(resumeRef.current);
    if (t.length === 1) {
      prevTouchRef.current = { x: t[0].pageX, y: t[0].pageY };
      prevPinchRef.current = 0;
    } else if (t.length >= 2) {
      const dx = t[0].pageX - t[1].pageX;
      const dy = t[0].pageY - t[1].pageY;
      prevPinchRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const onTouchMove = useCallback((e) => {
    const t = e.nativeEvent.touches;
    if (t.length >= 2) {
      const dx   = t[0].pageX - t[1].pageX;
      const dy   = t[0].pageY - t[1].pageY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (prevPinchRef.current > 0) {
        const delta = prevPinchRef.current - dist;
        cameraZRef.current = Math.max(1.5, Math.min(12, cameraZRef.current + delta * 0.025));
      }
      prevPinchRef.current = dist;
    } else if (t.length === 1) {
      const dx = t[0].pageX - prevTouchRef.current.x;
      const dy = t[0].pageY - prevTouchRef.current.y;
      rotYRef.current += dx * 0.008;
      rotXRef.current  = Math.max(-1.2, Math.min(1.2, rotXRef.current + dy * 0.008));
      prevTouchRef.current = { x: t[0].pageX, y: t[0].pageY };
      prevPinchRef.current = 0;
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    const t = e.nativeEvent.touches;
    if (t.length === 1) {
      // One finger lifted — reset tracking for remaining finger
      prevTouchRef.current = { x: t[0].pageX, y: t[0].pageY };
      prevPinchRef.current = 0;
    } else if (t.length === 0) {
      prevPinchRef.current = 0;
      resumeRef.current = setTimeout(() => { autoRef.current = true; }, 3000);
    }
  }, []);

  const onContextCreate = useCallback(async (gl) => {
    try {
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      if (!W || !H) return;

      const RendererClass = THREE.WebGL1Renderer || THREE.WebGLRenderer;
      const renderer = new RendererClass({
        canvas: makeCanvasPolyfill(W, H),
        context: gl,
        antialias: false,
        alpha: true,
        powerPreference: "default",
      });
      renderer.setSize(W, H);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);

      const scene   = new THREE.Scene();
      const lookAt  = new THREE.Vector3(0, 1.85, 0);
      const camera  = new THREE.PerspectiveCamera(52, W / H, 0.01, 100);
      camera.position.set(0, 1.85, cameraZRef.current);
      camera.lookAt(lookAt);

      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const key = new THREE.DirectionalLight(0xfff5e8, 1.2);
      key.position.set(-2.5, 4, 3); scene.add(key);
      const fill = new THREE.DirectionalLight(0xc8e8ff, 0.40);
      fill.position.set(3, 1, 2); scene.add(fill);
      const rim = new THREE.DirectionalLight(0x88ffcc, 0.25);
      rim.position.set(0, -1, -3); scene.add(rim);

      await loadGLBIntoScene(localUri, scene);
      if (!mountedRef.current) { try { renderer.dispose(); } catch (_) {} return; }

      const plantGroup = new THREE.Group();
      while (scene.children.length) plantGroup.add(scene.children[0]);
      scene.add(plantGroup);

      let frameId, running = true;
      const animate = () => {
        if (!running || !mountedRef.current) return;
        frameId = requestAnimationFrame(animate);
        try {
          if (interactive) {
            if (autoRef.current) rotYRef.current += 0.007;
            plantGroup.rotation.x = rotXRef.current;
            plantGroup.rotation.y = rotYRef.current;
            camera.position.z     = cameraZRef.current;
            camera.lookAt(lookAt);
          } else {
            plantGroup.rotation.y += 0.007;
          }
          renderer.render(scene, camera);
          gl.endFrameEXP();
        } catch (renderErr) {
          running = false;
          console.error("[3D] render error:", renderErr?.message);
          if (frameId != null) cancelAnimationFrame(frameId);
          try { renderer.dispose(); } catch (_) {}
          if (mountedRef.current) {
            setFailed(true);
            setGlErr((renderErr?.message || String(renderErr)).slice(0, 60));
          }
        }
      };
      animate();

      cancelRef.current = () => {
        running = false;
        if (frameId != null) cancelAnimationFrame(frameId);
        try { renderer.dispose(); } catch (_) {}
      };
    } catch (err) {
      const msg = err?.message || String(err);
      console.warn("[PlantRenderer3D]", msg);
      if (mountedRef.current) { setFailed(true); setGlErr(msg.slice(0, 40)); }
    }
  }, [localUri, interactive]);

  if (failed) return <Placeholder width={width} height={height} error={glErr} />;

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <GLView style={{ width, height }} onContextCreate={onContextCreate} />
      {interactive && (
        <View
          style={StyleSheet.absoluteFill}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        />
      )}
    </View>
  );
}

// ── Full-screen modal ─────────────────────────────────────────────────────────
function PlantFullscreenModal({ visible, onClose, stage, localUri }) {
  const { width, height } = Dimensions.get("window");
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
        {localUri
          ? <GLBViewer width={width} height={height} localUri={localUri} interactive />
          : <ActivityIndicator color="#2d6a4f" style={{ flex: 1 }} />}

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

// ── Public component ──────────────────────────────────────────────────────────
export default function PlantRenderer3D({
  width  = 300,
  height = 350,
  stage  = "Seedling",
}) {
  const { localUri, status } = useGLBAsset(stage);
  const [fullscreen, setFullscreen] = useState(false);
  const tapStartRef = useRef({ x: 0, y: 0 });

  const downloading = status === "checking" || status === "downloading";

  return (
    <>
      <View style={{ width, height }}>
        {/* Unmount card GL context while fullscreen to avoid dual GL contexts */}
        {!localUri || fullscreen
          ? <Placeholder width={width} height={height} downloading={downloading && !fullscreen} />
          : <GLBViewer key={localUri} width={width} height={height} localUri={localUri} />}

        {/* Transparent tap overlay — tapping the model opens fullscreen */}
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
    color: "#2d6a4f", fontSize: 10, opacity: 0.6,
  },
  fsContainer:  { flex: 1, backgroundColor: "#0d1f12" },
  fsLabelWrap:  { position: "absolute", top: 52, left: 0, right: 0, alignItems: "center" },
  fsLabel:      { color: "#fff", fontSize: 18, opacity: 0.85, letterSpacing: 1 },
  hintWrap:     { position: "absolute", bottom: 48, left: 0, right: 0, alignItems: "center" },
  hintText:     { color: "rgba(255,255,255,0.5)", fontSize: 13 },
  fsClose: {
    position: "absolute", top: 44, right: 20,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 20, width: 36, height: 36,
    alignItems: "center", justifyContent: "center",
  },
  fsCloseText:  { color: "#fff", fontSize: 16, lineHeight: 20 },
});
