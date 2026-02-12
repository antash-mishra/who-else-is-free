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
    if (!cfg.modResults.manifest.$["xmlns:tools"]) {
      cfg.modResults.manifest.$["xmlns:tools"] =
        "http://schemas.android.com/tools";
    }

    const app = cfg.modResults.manifest.application[0];
    const meta = app["meta-data"] || [];

    const upsertMetaData = (name, resource, extraAttributes = {}) => {
      const existing = meta.find((m) => m.$["android:name"] === name);
      if (existing) {
        existing.$ = {
          ...existing.$,
          "android:resource": resource,
          ...extraAttributes,
        };
        return;
      }

      meta.push({
        $: {
          "android:name": name,
          "android:resource": resource,
          ...extraAttributes,
        },
      });
    };

    upsertMetaData(
      "com.google.firebase.messaging.default_notification_icon",
      "@drawable/ic_notification"
    );
    upsertMetaData(
      "com.google.firebase.messaging.default_notification_color",
      "@color/colorPrimary",
      { "tools:replace": "android:resource" }
    );

    app["meta-data"] = meta;
    return cfg;
  });

  return config;
}

module.exports = withNotificationIcon;
