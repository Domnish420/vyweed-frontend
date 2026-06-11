/**
 * Postinstall: stub out RN 0.85's broken virtualview components.
 *
 * react-native 0.85 ships VirtualView*NativeComponent files whose Flow event
 * type annotations (@BubblingEventHandler<null>) crash @react-native/babel-
 * plugin-codegen with "Unable to determine event arguments for onModeChange".
 * These are unreleased internal experiments not imported by any app code.
 * Replacing them with empty stubs before Metro runs is the safest fix.
 */

const fs   = require("fs");
const path = require("path");

const VIRTUALVIEW_DIR = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native",
  "src",
  "private",
  "components",
  "virtualview"
);

const STUB = "// stubbed by postinstall — see scripts/patch-rn.js\nmodule.exports = {};\n";

if (!fs.existsSync(VIRTUALVIEW_DIR)) {
  console.log("[patch-rn] virtualview dir not found — skipping");
  process.exit(0);
}

const files = fs.readdirSync(VIRTUALVIEW_DIR).filter(f => f.endsWith(".js"));

if (files.length === 0) {
  console.log("[patch-rn] no .js files found in virtualview — skipping");
  process.exit(0);
}

for (const file of files) {
  const filePath = path.join(VIRTUALVIEW_DIR, file);
  fs.writeFileSync(filePath, STUB, "utf8");
  console.log(`[patch-rn] stubbed ${file}`);
}

console.log(`[patch-rn] done — stubbed ${files.length} file(s)`);
