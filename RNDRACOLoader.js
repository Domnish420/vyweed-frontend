// RNDRACOLoader.js — Synchronous Draco decoder for React Native (no Web Workers).
// Loads draco_decoder.js (pure-JS asm) directly from three's bundled copy.
import { BufferAttribute, BufferGeometry, LinearSRGBColorSpace } from "three";

let _dracoModulePromise = null;

function getDracoModule() {
  if (_dracoModulePromise) return _dracoModulePromise;
  _dracoModulePromise = new Promise((resolve, reject) => {
    try {
      const raw = require("three/examples/jsm/libs/draco/draco_decoder.js");

      if (typeof raw === "function") {
        // React Native / Hermes: draco_decoder.js exports a factory function
        // (ENVIRONMENT_IS_NODE is false, so the IIFE returns the inner function)
        raw({ onModuleLoaded: resolve });
      } else if (raw && typeof raw === "object") {
        // Node.js test env or already-initialized module path:
        // module was auto-executed and exported the result object
        if (typeof raw.Decoder === "function") {
          // Fully initialized synchronously — use it directly
          resolve(raw);
        } else if (raw.ready && typeof raw.ready.then === "function") {
          // Module is initializing asynchronously, wait for .ready Promise
          raw.ready.then(() => resolve(raw)).catch(reject);
        } else {
          // Unknown object shape — try the onModuleLoaded hook anyway
          raw.onModuleLoaded = resolve;
        }
      } else {
        reject(new Error("draco_decoder.js did not export a usable value"));
      }
    } catch (err) {
      reject(new Error("Draco init failed: " + (err?.message || err)));
    }
  });
  return _dracoModulePromise;
}

// ── Typed-array lookup identical to DRACOWorker's `self[name]` ───────────────
const TYPED_ARRAYS = {
  Float32Array, Int8Array, Int16Array, Int32Array,
  Uint8Array, Uint16Array, Uint32Array,
};

function getDracoDataType(draco, TypedArray) {
  if (TypedArray === Float32Array) return draco.DT_FLOAT32;
  if (TypedArray === Int8Array)    return draco.DT_INT8;
  if (TypedArray === Int16Array)   return draco.DT_INT16;
  if (TypedArray === Int32Array)   return draco.DT_INT32;
  if (TypedArray === Uint8Array)   return draco.DT_UINT8;
  if (TypedArray === Uint16Array)  return draco.DT_UINT16;
  if (TypedArray === Uint32Array)  return draco.DT_UINT32;
}

function decodeIndex(draco, decoder, dracoGeometry) {
  const numFaces   = dracoGeometry.num_faces();
  const numIndices = numFaces * 3;
  const byteLen    = numIndices * 4;
  const ptr        = draco._malloc(byteLen);
  decoder.GetTrianglesUInt32Array(dracoGeometry, byteLen, ptr);
  const index = new Uint32Array(draco.HEAPF32.buffer, ptr, numIndices).slice();
  draco._free(ptr);
  return { array: index, itemSize: 1 };
}

function decodeAttribute(draco, decoder, dracoGeometry, name, TypedArray, attribute) {
  const numComponents = attribute.num_components();
  const numPoints     = dracoGeometry.num_points();
  const numValues     = numPoints * numComponents;
  const byteLen       = numValues * TypedArray.BYTES_PER_ELEMENT;
  const dataType      = getDracoDataType(draco, TypedArray);
  const ptr           = draco._malloc(byteLen);
  decoder.GetAttributeDataArrayForAllPoints(dracoGeometry, attribute, dataType, byteLen, ptr);
  const array = new TypedArray(draco.HEAPF32.buffer, ptr, numValues).slice();
  draco._free(ptr);
  return { name, array, itemSize: numComponents };
}

function decodeGeometrySync(draco, decoder, int8Array, taskConfig) {
  const { attributeIDs, attributeTypes, useUniqueIDs, vertexColorSpace } = taskConfig;

  let dracoGeometry, decodingStatus;
  const geometryType = decoder.GetEncodedGeometryType(int8Array);

  if (geometryType === draco.TRIANGULAR_MESH) {
    dracoGeometry   = new draco.Mesh();
    decodingStatus  = decoder.DecodeArrayToMesh(int8Array, int8Array.byteLength, dracoGeometry);
  } else if (geometryType === draco.POINT_CLOUD) {
    dracoGeometry   = new draco.PointCloud();
    decodingStatus  = decoder.DecodeArrayToPointCloud(int8Array, int8Array.byteLength, dracoGeometry);
  } else {
    throw new Error("RNDRACOLoader: unexpected geometry type");
  }

  if (!decodingStatus.ok() || dracoGeometry.ptr === 0) {
    throw new Error("RNDRACOLoader: decode failed — " + decodingStatus.error_msg());
  }

  const result = { index: null, attributes: [] };

  for (const attrName in attributeIDs) {
    const TypedArray = TYPED_ARRAYS[attributeTypes[attrName]];
    if (!TypedArray) continue;

    let attribute, attributeID;
    if (useUniqueIDs) {
      attributeID = attributeIDs[attrName];
      attribute   = decoder.GetAttributeByUniqueId(dracoGeometry, attributeID);
    } else {
      attributeID = decoder.GetAttributeId(dracoGeometry, draco[attributeIDs[attrName]]);
      if (attributeID === -1) continue;
      attribute   = decoder.GetAttribute(dracoGeometry, attributeID);
    }

    const decoded = decodeAttribute(draco, decoder, dracoGeometry, attrName, TypedArray, attribute);
    if (attrName === "color") decoded.vertexColorSpace = vertexColorSpace;
    result.attributes.push(decoded);
  }

  if (geometryType === draco.TRIANGULAR_MESH) {
    result.index = decodeIndex(draco, decoder, dracoGeometry);
  }

  draco.destroy(dracoGeometry);
  return result;
}

function buildBufferGeometry(decoded) {
  const geo = new BufferGeometry();
  for (const attr of decoded.attributes) {
    geo.setAttribute(attr.name, new BufferAttribute(attr.array, attr.itemSize));
  }
  if (decoded.index) {
    geo.setIndex(new BufferAttribute(decoded.index.array, 1));
  }
  return geo;
}

// ── Public loader — implements the DRACOLoader interface GLTFLoader expects ───
export class RNDRACOLoader {
  // GLTFLoader calls preload() in the constructor; we kick off module init here.
  preload() {
    getDracoModule().catch(() => {});
    return this;
  }

  decodeDracoFile(
    bufferView,
    onLoad,
    attributeIDs   = null,
    attributeTypes = null,
    vertexColorSpace = LinearSRGBColorSpace,
    onError = () => {},
  ) {
    const defaultAttributeIDs   = { position: "POSITION", normal: "NORMAL", color: "COLOR", uv: "TEX_COORD" };
    const defaultAttributeTypes = { position: "Float32Array", normal: "Float32Array", color: "Float32Array", uv: "Float32Array" };

    const taskConfig = {
      attributeIDs:   attributeIDs   || defaultAttributeIDs,
      attributeTypes: attributeTypes || defaultAttributeTypes,
      useUniqueIDs:   !!attributeIDs,
      vertexColorSpace,
    };

    getDracoModule()
      .then((draco) => {
        const decoder = new draco.Decoder();
        try {
          const decoded  = decodeGeometrySync(draco, decoder, new Int8Array(bufferView), taskConfig);
          const geometry = buildBufferGeometry(decoded);
          onLoad(geometry);
        } catch (err) {
          onError(err);
        } finally {
          draco.destroy(decoder);
        }
      })
      .catch(onError);
  }

  dispose() {}
}
