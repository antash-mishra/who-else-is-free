const fs = require('fs');
const path = require('path');

const { withDangerousMod } = require('expo/config-plugins');

const FLAG = '$RNFirebaseAnalyticsWithoutAdIdSupport = true';

// RNFBAnalytics.podspec reads this global, so it must be set before any pod is
// declared; the top of the Podfile is the safe place.
function addAnalyticsWithoutAdIdFlag(podfileContent) {
  if (podfileContent.includes(FLAG)) {
    return podfileContent;
  }
  return `${FLAG}\n\n${podfileContent}`;
}

// weif shows no ads and never asks for tracking permission, so link the
// Firebase Analytics build without advertising-identifier (IDFA) support.
function withAnalyticsWithoutAdId(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      const podfileContent = fs.readFileSync(podfilePath, 'utf8');
      fs.writeFileSync(podfilePath, addAnalyticsWithoutAdIdFlag(podfileContent));
      return config;
    },
  ]);
}

module.exports = withAnalyticsWithoutAdId;
module.exports.FLAG = FLAG;
module.exports.addAnalyticsWithoutAdIdFlag = addAnalyticsWithoutAdIdFlag;
