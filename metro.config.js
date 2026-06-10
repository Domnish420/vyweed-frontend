const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// RN 0.85 has an incomplete Flow annotation in VirtualViewExperimentalNativeComponent.js
// that crashes the codegen Babel plugin. Exclude the whole virtualview folder — it's
// an unreleased internal experiment and not referenced by any app code.
config.resolver.blockList = [
  /node_modules\/react-native\/src\/private\/components\/virtualview\/.*/,
];

module.exports = config;
