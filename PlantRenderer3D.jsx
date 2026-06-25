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
import { extractGLBTextures } from "./extractGLBTextures";
import { getStrainConfig } from "./STRAIN_CONFIG";

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

// Build a Three.js Texture from a local file URI.
// expo-gl's texImage2D understands { uri } objects natively.
// Mipmaps are disabled — expo-gl + mobile = linear filtering is fine.
// No colorSpace set: expo-gl WebGL1 lacks EXT_sRGB framebuffer support so
// the full sRGB pipeline doesn't round-trip correctly. Keeping everything
// in the default linear pass-through gives correct visible results.
function makeTexture(uri) {
  const tex = new THREE.Texture();
  tex.image           = { uri };
  tex.flipY           = false;          // GLTF spec: V=0 is bottom of image
  tex.generateMipmaps = false;
  tex.minFilter       = THREE.LinearFilter;
  tex.needsUpdate     = true;
  return tex;
}

// Apply PBR textures from a GLTF material JSON onto an existing Three.js material.
// textureURIs maps image index → local file path.
function applyGLTFTextures(threeMat, jsonMat, gltfTextures, textureURIs) {
  function getURI(texIndex) {
    if (texIndex == null) return null;
    const tex = gltfTextures[texIndex];
    return tex != null ? textureURIs[tex.source] : null;
  }

  const pbr = jsonMat.pbrMetallicRoughness || {};

  const baseUri = getURI(pbr.baseColorTexture?.index);
  if (baseUri) {
    threeMat.map = makeTexture(baseUri);
    const f = pbr.baseColorFactor;
    threeMat.color.setRGB(f ? f[0] : 1, f ? f[1] : 1, f ? f[2] : 1);
  }

  const normalUri = getURI(jsonMat.normalTexture?.index);
  if (normalUri) threeMat.normalMap = makeTexture(normalUri); // linear

  // Plants are 100% dielectric — zero out metalness entirely.
  // We still use the green channel of the MR texture for roughness detail.
  const mrUri = getURI(pbr.metallicRoughnessTexture?.index);
  threeMat.metalness    = 0;
  threeMat.metalnessMap = null;
  if (mrUri) {
    threeMat.roughnessMap = makeTexture(mrUri); // linear; green channel = roughness
    threeMat.roughness    = 1.0;               // roughness = 1.0 × texture
  } else {
    threeMat.roughness = pbr.roughnessFactor ?? 0.85;
  }

  const occUri = getURI(jsonMat.occlusionTexture?.index);
  if (occUri) threeMat.aoMap = makeTexture(occUri); // linear

  const emissUri = getURI(jsonMat.emissiveTexture?.index);
  if (emissUri) {
    threeMat.emissiveMap = makeTexture(emissUri);
    threeMat.emissive    = new THREE.Color(1, 1, 1);
  }

  threeMat.side        = THREE.DoubleSide;
  threeMat.needsUpdate = true;
}

async function loadGLBIntoScene(localUri, scene, strainConfig, targetHeight = 3.5) {
  if (!GLTFLoader) throw new Error("GLTFLoader unavailable");

  const response    = await fetch(localUri);
  const arrayBuffer = await response.arrayBuffer();

  // Extract embedded textures to local files (RN Blob can't handle ArrayBuffer).
  // Results are cached by filename — fast on repeat visits.
  const cacheKey = localUri.split("/").pop().replace(/\.glb$/i, "");
  const { gltfJson, textureURIs } = await extractGLBTextures(arrayBuffer, cacheKey);
  const hasTextures = Object.keys(textureURIs).length > 0;

  await new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setDRACOLoader(_dracoLoader);
    loader.parse(arrayBuffer, "", (gltf) => {
      const model = gltf.scene;

      // Scale to target height, apply strain-specific aspect ratio
      const box    = new THREE.Box3().setFromObject(model);
      const size   = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      if (maxDim > 0) {
        const base   = targetHeight / maxDim;
        const scaleY = base * (strainConfig.scaleY   ?? 1.0);
        const scaleH = base * (strainConfig.scaleXZ  ?? 1.0);
        model.scale.set(scaleH, scaleY, scaleH);
        model.position.x = -center.x * scaleH;
        model.position.y = (-center.y + size.y * 0.5) * scaleY + 0.1;
        model.position.z = -center.z * scaleH;
      }

      if (hasTextures) {
        // ── Textured path: map GLTF JSON materials → Three.js materials by name ──
        const gltfMats = gltfJson.materials || [];
        const matsByName = {};
        gltfMats.forEach((m) => { matsByName[m.name || ""] = m; });
        const gltfTextures = gltfJson.textures || [];

        model.traverse((node) => {
          if (!node.isMesh) return;
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach((mat) => {
            const jsonMat = matsByName[mat.name];
            if (jsonMat) {
              applyGLTFTextures(mat, jsonMat, gltfTextures, textureURIs);
            } else {
              // No name match — tint with strain leaf color as a safe fallback
              mat.color.setHex(strainConfig.leafColor);
              mat.side = THREE.DoubleSide;
              mat.needsUpdate = true;
            }
          });
        });
      } else {
        // ── Solid-color path: heuristic by mesh name ──────────────────────────
        const leafMat = new THREE.MeshStandardMaterial({ color: strainConfig.leafColor, roughness: 0.85, metalness: 0.0,  side: THREE.DoubleSide });
        const stemMat = new THREE.MeshStandardMaterial({ color: strainConfig.stemColor, roughness: 0.9,  metalness: 0.0,  side: THREE.DoubleSide });
        const budMat  = new THREE.MeshStandardMaterial({ color: strainConfig.budColor,  roughness: 0.7,  metalness: 0.05, side: THREE.DoubleSide });

        model.traverse((node) => {
          if (!node.isMesh) return;
          const n = (node.name || "").toLowerCase();
          if (n.includes("bud") || n.includes("flower") || n.includes("calyx")) node.material = budMat;
          else if (n.includes("stem") || n.includes("branch") || n.includes("trunk")) node.material = stemMat;
          else node.material = leafMat;
        });
      }

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
function GLBViewer({ width, height, localUri, strainConfig, interactive = false }) {
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

  // Raw touch handlers — see all fingers; PanResponder misses multi-touch pinch
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
      // outputColorSpace=SRGBColorSpace crashes Three.js r152 shader compilation
      // on expo-gl WebGL1 ('trim' of undefined). Leave default linear output.
      renderer.toneMapping         = THREE.ReinhardToneMapping;
      renderer.toneMappingExposure = 1.2;

      const scene  = new THREE.Scene();
      const lookAt = new THREE.Vector3(0, 1.85, 0);
      const camera = new THREE.PerspectiveCamera(52, W / H, 0.01, 100);
      camera.position.set(0, 1.85, cameraZRef.current);
      camera.lookAt(lookAt);

      const hemi = new THREE.HemisphereLight(0x9fd8ff, 0x4a7c40, 2.0);
      scene.add(hemi);
      const key = new THREE.DirectionalLight(0xfffaf0, 5.0);
      key.position.set(-2.5, 4, 3); scene.add(key);
      const fill = new THREE.DirectionalLight(0xd0e8ff, 1.5);
      fill.position.set(3, 1, 2); scene.add(fill);
      const rim = new THREE.DirectionalLight(0x88ffcc, 0.6);
      rim.position.set(0, -1, -3); scene.add(rim);

      await loadGLBIntoScene(localUri, scene, strainConfig);
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
  }, [localUri, interactive, strainConfig]);

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
function PlantFullscreenModal({ visible, onClose, stage, localUri, strainConfig }) {
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
          ? <GLBViewer
              width={width}
              height={height}
              localUri={localUri}
              strainConfig={strainConfig}
              interactive
            />
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
        {/* Unmount card GL context while fullscreen to avoid dual GL contexts */}
        {!localUri || fullscreen
          ? <Placeholder width={width} height={height} downloading={downloading && !fullscreen} />
          : (
            <GLBViewer
              key={localUri}
              width={width}
              height={height}
              localUri={localUri}
              strainConfig={strainConfig}
            />
          )}

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
