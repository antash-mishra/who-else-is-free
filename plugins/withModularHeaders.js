const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      let podfileContent = fs.readFileSync(podfilePath, "utf8");

      // Required for FirebaseCoreInternal (Swift) which depends on
      // GoogleUtilities (ObjC) — static libraries need explicit module maps.
      if (!podfileContent.includes("use_modular_headers!")) {
        podfileContent = podfileContent.replace(
          /(prepare_react_native_project!)/,
          `use_modular_headers!\n\n$1`
        );
      }

      if (!podfileContent.includes("pod 'GoogleUtilities', :modular_headers => true")) {
        podfileContent = podfileContent.replace(
          /(use_expo_modules!.*\n)/,
          `$1  pod 'GoogleUtilities', :modular_headers => true\n`
        );
      }

      fs.writeFileSync(podfilePath, podfileContent);
      return config;
    },
  ]);
};
