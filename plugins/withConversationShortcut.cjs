const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PACKAGE_NAME = "com.nawafhq.chatappandroid";

const KOTLIN_MODULE = fs.readFileSync(
    path.join(__dirname, "ConversationShortcutModule.kt"),
    "utf8"
);

const PACKAGE_MODULE = [
    `package ${PACKAGE_NAME}`,
    "",
    "import com.facebook.react.ReactPackage",
    "import com.facebook.react.bridge.NativeModule",
    "import com.facebook.react.bridge.ReactApplicationContext",
    "import com.facebook.react.uimanager.ViewManager",
    "",
    "class ConversationShortcutPackage : ReactPackage {",
    "    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {",
    "        return listOf(ConversationShortcutModule(reactContext))",
    "    }",
    "",
    "    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {",
    "        return emptyList()",
    "    }",
    "}",
].join("\n");

function registerConversationPackage(mainApplicationPath) {
    if (!fs.existsSync(mainApplicationPath)) {
        return;
    }

    const packageLine = "add(ConversationShortcutPackage())";
    let content = fs.readFileSync(mainApplicationPath, "utf8");

    if (content.includes(packageLine)) {
        return;
    }

    if (content.includes("// add(MyReactNativePackage())")) {
        content = content.replace(
            "// add(MyReactNativePackage())",
            `// add(MyReactNativePackage())\n          ${packageLine}`
        );
    } else if (content.includes("PackageList(this).packages.apply {")) {
        content = content.replace(
            "PackageList(this).packages.apply {",
            `PackageList(this).packages.apply {\n          ${packageLine}`
        );
    } else {
        throw new Error("Unable to register ConversationShortcutPackage in MainApplication.kt");
    }

    fs.writeFileSync(mainApplicationPath, content);
}

module.exports = (config) => {
    return withDangerousMod(config, [
        "android",
        async (config) => {
            const packageDir = path.join(
                config.modRequest.platformProjectRoot,
                "app/src/main/java/com/nawafhq/chatappandroid"
            );

            fs.mkdirSync(packageDir, { recursive: true });

            fs.writeFileSync(
                path.join(packageDir, "ConversationShortcutModule.kt"),
                KOTLIN_MODULE
            );

            fs.writeFileSync(
                path.join(packageDir, "ConversationShortcutPackage.kt"),
                PACKAGE_MODULE
            );

            registerConversationPackage(path.join(packageDir, "MainApplication.kt"));

            return config;
        },
    ]);
};
