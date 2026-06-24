// extractGLBTextures.js — Pulls embedded images out of a GLB binary.
//
// React Native's Blob constructor won't accept ArrayBuffer, so Three.js
// GLTFLoader can't load embedded textures the normal way.
// This module parses the GLB binary directly, writes each image to a local
// cache file, then reads it back as a base64 data URI.
// expo-gl's texImage2D processes data URIs synchronously; file:// URIs are
// loaded asynchronously which means the texture is black by the time Three.js
// marks it as uploaded and resets needsUpdate.

import * as FileSystem from 'expo-file-system/legacy';

// Bump when extraction logic changes to bust stale cached files.
const CACHE_VERSION = 'v2';

const TEXTURE_CACHE_DIR = FileSystem.cacheDirectory + 'vyweed_textures/';

function parseGLBJson(arrayBuffer) {
  const view    = new DataView(arrayBuffer);
  const jsonLen = view.getUint32(12, true);              // chunk 0 length field
  const bytes   = new Uint8Array(arrayBuffer, 20, jsonLen); // chunk 0 data starts at 20
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Convert Uint8Array → base64 string in chunks to avoid call-stack overflow on
// large textures. btoa requires a plain binary string, not a typed array.
function uint8ToBase64(bytes) {
  const CHUNK = 4096;
  let str = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    str += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(str);
}

// Returns { gltfJson, textureURIs: { imageIndex: localFilePath } }
// Extracted files are cached by cacheKey — re-runs skip writing if files exist.
export async function extractGLBTextures(arrayBuffer, cacheKey) {
  let gltfJson;
  try {
    gltfJson = parseGLBJson(arrayBuffer);
  } catch {
    return { gltfJson: {}, textureURIs: {} };
  }

  const images      = gltfJson.images      || [];
  const bufferViews = gltfJson.bufferViews || [];

  if (images.length === 0) return { gltfJson, textureURIs: {} };

  // BIN chunk starts immediately after the JSON chunk.
  // Layout: header(12) + jsonChunkLen(4) + jsonChunkType(4) + jsonData(jsonLen)
  //         + binChunkLen(4) + binChunkType(4) + binData
  const view           = new DataView(arrayBuffer);
  const jsonLen        = view.getUint32(12, true);
  const binHeaderOff   = 20 + jsonLen;                      // offset of BIN chunk header
  const hasBin         = binHeaderOff + 8 <= arrayBuffer.byteLength;
  const binDataOffset  = binHeaderOff + 8;                  // BIN data starts after 8-byte header

  await FileSystem.makeDirectoryAsync(TEXTURE_CACHE_DIR, { intermediates: true });

  // textureURIs: imageIndex → data: URI (base64 inline)
  // expo-gl texImage2D processes data: URIs synchronously; file:// URIs are
  // async and the texture stays black because Three.js resets needsUpdate
  // before expo-gl finishes loading.
  const textureURIs = {};

  for (let i = 0; i < images.length; i++) {
    const img  = images[i];
    const vKey = `${cacheKey}_${CACHE_VERSION}`;

    // Case 1: data: URI already inline in GLTF JSON — use directly
    if (img.uri && img.uri.startsWith('data:')) {
      textureURIs[i] = img.uri;
      continue;
    }

    // Case 2: bufferView reference → bytes live in the BIN chunk
    if (img.bufferView == null || !hasBin) continue;

    const bv       = bufferViews[img.bufferView];
    const byOffset = bv.byteOffset || 0;
    const byLength = bv.byteLength;
    const mime     = img.mimeType || 'image/jpeg';
    const ext      = mime.includes('png') ? 'png' : 'jpg';
    const filePath = TEXTURE_CACHE_DIR + `${vKey}_t${i}.${ext}`;

    // Use cached file if it exists and has content
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists && info.size > 64) {
      const b64 = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.Base64,
      });
      textureURIs[i] = `data:${mime};base64,${b64}`;
      continue;
    }

    // Extract bytes from BIN chunk → write to cache file → read back as data URI
    const imgBytes = new Uint8Array(arrayBuffer, binDataOffset + byOffset, byLength);
    const b64      = uint8ToBase64(imgBytes);

    await FileSystem.writeAsStringAsync(filePath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    textureURIs[i] = `data:${mime};base64,${b64}`;
    console.log('[extractGLBTextures] extracted tex', i, mime, byLength, 'bytes');
  }

  return { gltfJson, textureURIs };
}
