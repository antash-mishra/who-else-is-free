const {
  withDangerousMod,
  withAndroidManifest,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

function withNotificationIcon(config) {
  // Copy drawable
  config = withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, "assets", "ic_notification.xml");
      const destDir = path.join(
        projectRoot,
        "android",
        "app",
        "src",
        "main",
        "res",
        "drawable"
      );
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, path.join(destDir, "ic_notification.xml"));
      return cfg;
    },
  ]);

  // Add manifest meta-data
  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    const meta = app["meta-data"] || [];

    const addIfMissing = (name, resource) => {
      if (!meta.some((m) => m.$["android:name"] === name)) {
        meta.push({
          $: { "android:name": name, "android:resource": resource },
        });
      }
    };

    addIfMissing(
      "com.google.firebase.messaging.default_notification_icon",
      "@drawable/ic_notification"
    );
    addIfMissing(
      "com.google.firebase.messaging.default_notification_color",
      "@color/colorPrimary"
    );

    app["meta-data"] = meta;
    return cfg;
  });

  return config;
}

module.exports = withNotificationIcon;
