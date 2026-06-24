// useGLBAsset.js — Download and cache .glb models from GitHub Releases.
// Also exports prefetchGLBAsset() for imperative pre-loading
// (e.g. trigger while an ad plays before a seed is dispensed).

import { useState, useEffect, useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";

const RELEASE_BASE =
  "https://github.com/Domnish420/vyweed-frontend/releases/download/v0.1-assets";

// File names match the assets uploaded to the GitHub Release.
// When strain-specific GLBs are added they can be injected here via
// getFileName(stage, strain) below.
const STAGE_FILES = {
  Seedling:        "seedling.glb",
  Vegetative:      "vegetative.glb",
  Transition:      "transition.glb",
  "Early Flower":  "early_flower.glb",
  "Bud Swell":     "bud_swell.glb",
  "Mid Flower":    "mid_flower.glb",
  "Late Flower":   "late_flower.glb",
  "Final Days":    "late_flower.glb",   // reuses late_flower until final-days GLB is added
  "Harvest Ready": "harvest_ready.glb",
};

const CACHE_DIR = FileSystem.cacheDirectory + "vyweed_models/";

// GLB files start with ASCII "glTF" (0x67 0x6C 0x54 0x46).
// Base64 of those 4 bytes starts with "Z2xU".
async function isValidGlb(filePath) {
  try {
    const header = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    return header.startsWith("Z2xU");
  } catch {
    return false;
  }
}

// Resolve which filename to use for a given stage (and eventually strain).
// When per-strain GLBs are added, insert the lookup here so callers don't
// need to change.
function getFileName(stage, _strain) {
  // Future: if STRAIN_STAGE_FILES[strain]?.[stage] exists, return that.
  return STAGE_FILES[stage] || null;
}

// ── Imperative prefetch ───────────────────────────────────────────────────────
// Call this as soon as you know which seed will be dispensed so the model
// is ready by the time the player opens their new plant.
// Safe to call multiple times — returns immediately if already cached.
export async function prefetchGLBAsset(stage, strain) {
  const fileName = getFileName(stage, strain);
  if (!fileName) return;

  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  const localPath = CACHE_DIR + fileName;

  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists && info.size > 1000) {
    const valid = await isValidGlb(localPath);
    if (valid) return; // already good
    await FileSystem.deleteAsync(localPath, { idempotent: true });
  }

  const dl = await FileSystem.downloadAsync(
    `${RELEASE_BASE}/${fileName}`,
    localPath,
  );

  if (dl.status !== 200) {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    throw new Error(`prefetchGLBAsset: HTTP ${dl.status} for ${fileName}`);
  }

  const valid = await isValidGlb(localPath);
  if (!valid) {
    await FileSystem.deleteAsync(localPath, { idempotent: true });
    throw new Error(`prefetchGLBAsset: invalid GLB for ${fileName}`);
  }
}

// ── React hook ────────────────────────────────────────────────────────────────
export default function useGLBAsset(stage, strain) {
  const [localUri, setLocalUri] = useState(null);
  const [status,   setStatus]   = useState("idle");
  const cancelledRef            = useRef(false);

  useEffect(() => {
    const fileName = getFileName(stage, strain);
    if (!fileName) {
      setLocalUri(null);
      setStatus("error");
      return;
    }

    cancelledRef.current = false;
    const localPath = CACHE_DIR + fileName;

    (async () => {
      setLocalUri(null);
      setStatus("checking");

      try {
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });

        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && info.size > 1000) {
          const valid = await isValidGlb(localPath);
          if (valid) {
            if (!cancelledRef.current) { setLocalUri(localPath); setStatus("ready"); }
            return;
          }
          console.warn("[useGLBAsset] cached file invalid, re-downloading", fileName);
          await FileSystem.deleteAsync(localPath, { idempotent: true });
        }

        if (!cancelledRef.current) setStatus("downloading");

        const dl = await FileSystem.downloadAsync(
          `${RELEASE_BASE}/${fileName}`,
          localPath,
        );

        if (dl.status !== 200) {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
          throw new Error(`HTTP ${dl.status}`);
        }

        const valid = await isValidGlb(localPath);
        if (!valid) {
          await FileSystem.deleteAsync(localPath, { idempotent: true });
          throw new Error("downloaded file is not a valid GLB");
        }

        if (!cancelledRef.current) { setLocalUri(localPath); setStatus("ready"); }
      } catch (err) {
        console.warn("[useGLBAsset]", err?.message || String(err));
        if (!cancelledRef.current) { setLocalUri(null); setStatus("error"); }
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [stage, strain]);

  return { localUri, status };
}
