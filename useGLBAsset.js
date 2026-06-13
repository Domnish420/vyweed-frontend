// useGLBAsset.js — Download and cache .glb models from GitHub Releases
import { useState, useEffect, useRef } from "react";
import * as FileSystem from "expo-file-system/legacy";

const RELEASE_BASE =
  "https://github.com/domnish420/vyweed-frontend/releases/download/v0.1-assets";

// File names must match exactly what you uploaded to the GitHub Release.
const STAGE_FILES = {
  Seedling:        "seedling.glb",
  Vegetative:      "early_veg.glb",
  Transition:      "late_veg.glb",
  "Early Flower":  "pre_flower.glb",
  "Bud Swell":     "early_flower.glb",
  "Mid Flower":    "bud_swell.glb",
  "Late Flower":   "mid_flower.glb",
  "Final Days":    "late_flower.glb",
  "Harvest Ready": "harvest_ready.glb",
};

const CACHE_DIR = FileSystem.cacheDirectory + "vyweed_models/";

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
          if (!cancelledRef.current) { setLocalUri(localPath); setStatus("ready"); }
          return;
        }

        if (!cancelledRef.current) setStatus("downloading");

        const dl = await FileSystem.downloadAsync(
          `${RELEASE_BASE}/${fileName}`,
          localPath,
        );

        if (dl.status !== 200) throw new Error(`HTTP ${dl.status}`);

        if (!cancelledRef.current) { setLocalUri(localPath); setStatus("ready"); }
      } catch (_) {
        if (!cancelledRef.current) { setLocalUri(null); setStatus("error"); }
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [stage]);

  return { localUri, status };
}
