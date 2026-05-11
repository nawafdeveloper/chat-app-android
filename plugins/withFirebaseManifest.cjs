const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = (config) => {
    return withAndroidManifest(config, (config) => {
        const manifest = config.modResults;
        const app = manifest.manifest.application[0];

        manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";

        if (!app["meta-data"]) app["meta-data"] = [];

        app["meta-data"] = app["meta-data"].filter(
            (item) =>
                item.$?.["android:name"] !==
                "com.google.firebase.messaging.default_notification_channel_id" &&
                item.$?.["android:name"] !==
                "com.google.firebase.messaging.default_notification_color"
        );

        app["meta-data"].push(
            {
                $: {
                    "android:name":
                        "com.google.firebase.messaging.default_notification_channel_id",
                    "android:value": "messages",
                    "tools:replace": "android:value",
                },
            },
            {
                $: {
                    "android:name":
                        "com.google.firebase.messaging.default_notification_color",
                    "android:resource": "@color/notification_icon_color",
                    "tools:replace": "android:resource",
                },
            }
        );

        return config;
    });
};