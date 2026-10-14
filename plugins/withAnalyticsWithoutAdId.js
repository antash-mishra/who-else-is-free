const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const FLAG = "$RNFirebaseAnalyticsWithoutAdIdSupport = true";

// weif shows no ads and never asks for tracking permission, so link the
// Firebase Analytics build without advertising-identifier (IDFA) support.
// RNFBAnalytics.podspec reads this global, so it must be set before any pod is
// declared; the top of the Podfile is the safe place.
module.exports = function withAnalyticsWithoutAdId(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      const podfileContent = fs.readFileSync(podfilePath, "utf8");
      if (!podfileContent.includes(FLAG)) {
        fs.writeFileSync(podfilePath, `${FLAG}\n\n${podfileContent}`);
      }
      return config;
    },
  ]);
};
