const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// RN 0.85 ships an incomplete experimental component whose Flow types crash
// @react-native/babel-plugin-codegen with "Unable to determine event arguments
// for onModeChange". Match by filename so the absolute path prefix doesn't matter.
const existing = config.resolver.blockList;
const extraBlock = /VirtualViewExperimentalNativeComponent/;

config.resolver.blockList = existing
  ? Array.isArray(existing)
    ? [...existing, extraBlock]
    : [existing, extraBlock]
  : [extraBlock];

module.exports = config;
