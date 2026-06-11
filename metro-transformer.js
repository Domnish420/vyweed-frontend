// Intercepts Metro's Babel transformer for RN 0.85's broken virtualview files.
// The codegen Babel plugin crashes on their incomplete Flow event types —
// replacing their source with an empty stub before Babel runs prevents that.
const upstreamTransformer = require("@expo/metro-config/build/babel-transformer");

module.exports.transform = async function transform(props) {
  if (props.filename.includes("virtualview")) {
    return upstreamTransformer.transform({
      ...props,
      src: "module.exports = {};",
    });
  }
  return upstreamTransformer.transform(props);
};
