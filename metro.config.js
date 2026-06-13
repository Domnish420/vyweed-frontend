const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Shim Node.js core modules that Draco decoder references but never executes
// in React Native (the code is inside ENVIRONMENT_IS_NODE guard which is false).
config.resolver = config.resolver || {};
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  fs:   path.resolve(__dirname, "shims/empty.js"),
  path: path.resolve(__dirname, "shims/empty.js"),
};

module.exports = config;
