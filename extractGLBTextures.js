// extractGLBTextures.js — Pulls embedded images out of a GLB binary.
//
// React Native's Blob constructor won't accept ArrayBuffer, so Three.js
// GLTFLoader can't load embedded textures the normal way.
// This module parses the GLB binary directly, writes each image to a local
// temp file, and returns { gltfJson, textureURIs } so the caller can build
// THREE.Texture objects from file:// URIs (which expo-gl handles natively).

import * as FileSystem from 'expo-file-system/legacy';

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

  const textureURIs = {};

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    // Case 1: data: URI (base64-encoded image inline in the JSON)
    if (img.uri && img.uri.startsWith('data:')) {
      const comma  = img.uri.indexOf(',');
      const header = img.uri.slice(0, comma);
      const b64    = img.uri.slice(comma + 1);
      const ext    = header.includes('png') ? 'png' : 'jpg';
      const path   = TEXTURE_CACHE_DIR + `${cacheKey}_t${i}.${ext}`;
      const info   = await FileSystem.getInfoAsync(path);
      if (!info.exists) {
        await FileSystem.writeAsStringAsync(path, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
      textureURIs[i] = path;
      continue;
    }

    // Case 2: bufferView reference → image data lives in the BIN chunk
    if (img.bufferView == null || !hasBin) continue;

    const bv         = bufferViews[img.bufferView];
    const byteOffset = bv.byteOffset || 0;
    const byteLength = bv.byteLength;
    const ext        = (img.mimeType || '').includes('png') ? 'png' : 'jpg';
    const path       = TEXTURE_CACHE_DIR + `${cacheKey}_t${i}.${ext}`;

    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && info.size > 64) {
      textureURIs[i] = path;
      continue;
    }

    const imgBytes = new Uint8Array(arrayBuffer, binDataOffset + byteOffset, byteLength);
    const b64      = uint8ToBase64(imgBytes);

    await FileSystem.writeAsStringAsync(path, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    textureURIs[i] = path;
  }

  return { gltfJson, textureURIs };
}
