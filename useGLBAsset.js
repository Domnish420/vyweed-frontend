// useGLBAsset.js — Download and cache .glb models from GitHub Releases
import { useState, useEffect, useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";

const RELEASE_BASE =
  "https://github.com/Domnish420/vyweed-frontend/releases/download/v0.1-assets";

// File names match the assets uploaded to the GitHub Release.
const STAGE_FILES = {
  Seedling:        "seedling.glb",
  Vegetative:      "vegetative.glb",
  Transition:      "transition.glb",
  "Early Flower":  "early_flower.glb",
  "Bud Swell":     "bud_swell.glb",
  "Mid Flower":    "mid_flower.glb",
  "Late Flower":   "late_flower.glb",
  "Final Days":    "late_flower.glb",
  "Harvest Ready": "harvest_ready.glb",
};

const CACHE_DIR = FileSystem.cacheDirectory + "vyweed_models/";

// GLB files start with the ASCII bytes "glTF" (0x67 0x6C 0x54 0x46).
// Base64 of those 4 bytes is "Z2xURg==", so the b64 string always starts with "Z2xU".
async function isValidGlb(filePath) {
  try {
    const header = await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
      position: 0,
      length: 4,
    });
    return header.startsWith("Z2xU");
  } catch (_) {
    return false;
  }
}

export default function useGLBAsset(stage) {
  const [localUri, setLocalUri]   = useState(null);
  const [status,   setStatus]     = useState("idle");
  const cancelledRef              = useRef(false);

  useEffect(() => {
    const fileName = STAGE_FILES[stage];
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
          // Bad cached file (HTML redirect page, etc.) — delete and re-download
          console.warn("[useGLBAsset] Cached file invalid, re-downloading", fileName);
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
          throw new Error("Downloaded file is not a valid GLB");
        }

        if (!cancelledRef.current) { setLocalUri(localPath); setStatus("ready"); }
      } catch (err) {
        console.warn("[useGLBAsset] error:", err?.message || String(err));
        if (!cancelledRef.current) { setLocalUri(null); setStatus("error"); }
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [stage]);

  return { localUri, status };
}
