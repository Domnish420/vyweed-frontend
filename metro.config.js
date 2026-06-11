const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Stub out RN 0.85's broken virtualview components before Babel's codegen
// plugin can crash on their incomplete Flow event type annotations.
// blockList only prevents resolution — we need transformer-level interception.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: path.resolve(__dirname, "metro-transformer.js"),
};

module.exports = config;
