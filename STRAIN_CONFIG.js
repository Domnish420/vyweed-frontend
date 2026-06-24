// STRAIN_CONFIG.js — Visual and structural parameters per strain.
//
// These are applied at render time over the 9 shared stage GLBs, so no
// extra model downloads are needed. When strain-specific GLBs are added
// later, modelType ('sativa' | 'indica' | 'ruderalis' | 'hybrid') drives
// which file variant to load.

export const STRAIN_CONFIG = {
  // ── Baseline (all unrecognised strains fall through to this) ────────────────
  _default: {
    leafColor:  0x2d7a27,   // forest green
    stemColor:  0x4a7c40,   // muted green-grey
    budColor:   0x8fbc45,   // lime green
    trichColor: 0xf0f8e8,   // near-white frost
    modelType:  'hybrid',
    scaleY:     1.0,
    scaleXZ:    1.0,
  },

  // ── Sativa-dominant — tall, narrow, lighter-green ────────────────────────
  "2024 HAZE": {
    leafColor:  0x38912e,
    stemColor:  0x527048,
    budColor:   0xb4d44a,
    trichColor: 0xeefacc,
    modelType:  'sativa',
    scaleY:     1.18,
    scaleXZ:    0.92,
  },
  "AMNESIA HAZE": {
    leafColor:  0x40982a,
    stemColor:  0x557548,
    budColor:   0xbedc4e,
    modelType:  'sativa',
    scaleY:     1.22,
    scaleXZ:    0.90,
  },
  "SUPER SILVER HAZE": {
    leafColor:  0x459030,
    stemColor:  0x4e7845,
    budColor:   0xc0e060,
    trichColor: 0xfafff0,
    modelType:  'sativa',
    scaleY:     1.25,
    scaleXZ:    0.88,
  },

  // ── Indica-dominant — shorter, bushier, darker ───────────────────────────
  "OG KUSH": {
    leafColor:  0x2a6e22,
    stemColor:  0x3e6a38,
    budColor:   0x7fad35,
    trichColor: 0xe8f4d0,
    modelType:  'indica',
    scaleY:     0.88,
    scaleXZ:    1.12,
  },
  "NORTHERN LIGHTS": {
    leafColor:  0x205820,
    stemColor:  0x305030,
    budColor:   0x6a9a28,
    modelType:  'indica',
    scaleY:     0.82,
    scaleXZ:    1.18,
  },
  "GRANDDADDY PURPLE": {
    leafColor:  0x3a2a6a,   // deep purple
    stemColor:  0x4a3860,
    budColor:   0x7a50c8,
    trichColor: 0xf0e8ff,
    modelType:  'indica',
    scaleY:     0.85,
    scaleXZ:    1.15,
  },

  // ── Hybrids ───────────────────────────────────────────────────────────────
  "BLUE DREAM": {
    leafColor:  0x3a8060,   // blue-green
    stemColor:  0x48706a,
    budColor:   0x6ab0a0,
    trichColor: 0xe8f8f4,
    modelType:  'hybrid',
  },
  "GIRL SCOUT COOKIES": {
    leafColor:  0x2e7530,
    stemColor:  0x456040,
    budColor:   0x90c840,
    trichColor: 0xfdfce0,
    modelType:  'hybrid',
  },
  "WHITE WIDOW": {
    leafColor:  0x45902a,
    stemColor:  0x5a7a4a,
    budColor:   0xddeebb,   // very frosty, near-white buds
    trichColor: 0xffffff,
    modelType:  'hybrid',
  },
  "PURPLE HAZE": {
    leafColor:  0x4a3a7a,
    stemColor:  0x5a4a5a,
    budColor:   0x9370db,
    trichColor: 0xf4eeff,
    modelType:  'hybrid',
  },

  // ── Autoflower (ruderalis crosses) ───────────────────────────────────────
  "AUTO BLUEBERRY": {
    leafColor:  0x3a6080,   // slight blue tinge
    stemColor:  0x507070,
    budColor:   0x7090c0,
    trichColor: 0xe8f0ff,
    modelType:  'ruderalis',
    scaleY:     0.75,
    scaleXZ:    0.95,
  },
};

export function getStrainConfig(strainName) {
  const override = strainName ? (STRAIN_CONFIG[strainName] || {}) : {};
  return { ...STRAIN_CONFIG._default, ...override };
}
