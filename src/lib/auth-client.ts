import { expoClient } from "@better-auth/expo/client";
import { inferAdditionalFields, phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
    baseURL: "https://halabakk-web.nawaf-alhasosah.workers.dev",
    plugins: [
        expoClient({
            scheme: "chatappandroid",
            storagePrefix: "chatappandroid",
            storage: SecureStore,
        }),
        phoneNumberClient(),
        inferAdditionalFields({
            user: {
                lastSeen: {
                    type: "date",
                    input: true,
                    defaultValue: () => new Date(),
                },
                whoCanSeeLastSeen: {
                    type: "string",
                    input: true,
                    defaultValue: "all",
                },
                whoCanSeeProfilePicture: {
                    type: "string",
                    input: true,
                    defaultValue: "all",
                },
                whoCanSeeAbout: {
                    type: "string",
                    input: true,
                    defaultValue: "all",
                },
                whoCanSeeStatus: {
                    type: "string",
                    input: true,
                    defaultValue: "all",
                },
                enableReadReceipts: {
                    type: "boolean",
                    input: true,
                    defaultValue: true,
                },
                defaultMessageTimer: {
                    type: "string",
                    input: true,
                    defaultValue: "24h",
                },
                totalBlockedContact: {
                    type: "number",
                    input: true,
                    defaultValue: 0,
                },
                enableAppLock: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                blockUnknownAccount: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                disableLinkPreview: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                chatWallpaper: {
                    type: "string",
                    input: true,
                    defaultValue: "wallpaper-1",
                },
                mediaUploadQuality: {
                    type: "string",
                    input: true,
                    defaultValue: "std",
                },
                imageMediaAutoDownload: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                videoMediaAutoDownload: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                voiceMediaAutoDownload: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                fileMediaAutoDownload: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                disableMessagesNotifications: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                disableGroupsNotifications: {
                    type: "boolean",
                    input: true,
                    defaultValue: false,
                },
                yhlaPushToken: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                yhlaPublicKey: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                yhlaEncryptedPrivateKey: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                yhlaPrivateKeyIv: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                yhlaPinSalt: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                yhlaPinVerificationTag: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                yhlaPinVerificationIv: {
                    type: "string",
                    input: true,
                    defaultValue: ""
                },
                isNewUser: {
                    type: "boolean",
                    input: true,
                    defaultValue: true
                }
            },
        }),
    ]
});