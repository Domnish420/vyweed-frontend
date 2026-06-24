// PlantRenderer3D.jsx — Loads textured .glb from GitHub Releases via useGLBAsset.
// Requires a dev-client or EAS build (expo-gl is a native module).

import React, { useCallback, useRef, useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { GLView } from "expo-gl";
import * as THREE from "three";
import * as FileSystem from "expo-file-system/legacy";
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
  console.log("[3D] loadGLBIntoScene start, GLTFLoader=", !!GLTFLoader);
  if (!GLTFLoader) throw new Error("GLTFLoader unavailable");
  const b64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  console.log("[3D] b64 length=", b64.length);
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  const arrayBuffer = bytes.buffer;
  console.log("[3D] arrayBuffer byteLength=", arrayBuffer.byteLength);
  await new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(_dracoLoader);
    console.log("[3D] calling loader.parse...");
    loader.parse(arrayBuffer, "", (gltf) => {
      console.log("[3D] parse success, scene children=", gltf.scene.children.length);
      const model = gltf.scene;
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      console.log("[3D] model size=", size.x, size.y, size.z, "maxDim=", maxDim);
      if (maxDim > 0) {
        const scale = targetHeight / maxDim;
        model.scale.setScalar(scale);
        model.position.x = -center.x * scale;
        model.position.y = (-center.y + size.y * 0.5) * scale + 0.1;
        model.position.z = -center.z * scale;
      }
      scene.add(model);
      resolve();
    }, (err) => {
      console.error("[3D] parse error:", err?.message || String(err));
      reject(err);
    });
  });
}

// ── Placeholder while downloading or if GL fails ──────────────────────────────
function Placeholder({ width, height, downloading, error }) {
  return (
    <View style={[styles.placeholder, { width, height }]}>
      {downloading
        ? <ActivityIndicator color="#2d6a4f" size="small" />
        : error
          ? <Text style={{ color: "#2d6a4f", fontSize: 10, fontFamily: "SpaceGrotesk_400Regular", opacity: 0.6 }}>{error}</Text>
          : null}
    </View>
  );
}

// ── GL viewer — only mounted when localUri is ready ───────────────────────────
function GLBViewer({ width, height, localUri }) {
  const mountedRef = useRef(true);
  const cancelRef  = useRef(null);
  const [failed, setFailed] = useState(false);
  const [glErr, setGlErr]   = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelRef.current?.();
    };
  }, []);

  const onContextCreate = useCallback(async (gl) => {
    try {
      const W = gl.drawingBufferWidth;
      const H = gl.drawingBufferHeight;
      if (!W || !H) return;

      // three r152 ships WebGL1Renderer which accepts expo-gl's OpenGL ES context
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

      const scene  = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(52, W / H, 0.01, 100);
      camera.position.set(0, 1.85, 5.0);
      camera.lookAt(0, 1.85, 0);

      scene.add(new THREE.AmbientLight(0xffffff, 0.65));
      const key = new THREE.DirectionalLight(0xfff5e8, 1.2);
      key.position.set(-2.5, 4, 3);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xc8e8ff, 0.40);
      fill.position.set(3, 1, 2);
      scene.add(fill);
      const rim = new THREE.DirectionalLight(0x88ffcc, 0.25);
      rim.position.set(0, -1, -3);
      scene.add(rim);

      await loadGLBIntoScene(localUri, scene);
      if (!mountedRef.current) { try { renderer.dispose(); } catch (_) {} return; }

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
  }, [localUri]);

  if (failed) return <Placeholder width={width} height={height} downloading={false} error={glErr} />;

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <GLView style={{ width, height }} onContextCreate={onContextCreate} />
    </View>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export default function PlantRenderer3D({
  width      = 300,
  height     = 350,
  stage      = "Seedling",
  // strainType, tier, strainSeed, day, totalDays accepted for prop compat — not used by GLB
}) {
  const { localUri, status } = useGLBAsset(stage);
  console.log("[3D] stage=", stage, "status=", status, "localUri=", localUri);

  const downloading = status === "checking" || status === "downloading";

  if (!localUri) {
    return <Placeholder width={width} height={height} downloading={downloading} />;
  }

  return <GLBViewer key={localUri} width={width} height={height} localUri={localUri} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: "#0d1f12",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
