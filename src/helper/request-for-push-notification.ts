import notifee, { AndroidImportance } from "@notifee/react-native";
import {
    AuthorizationStatus,
    getMessaging,
    getToken,
    isDeviceRegisteredForRemoteMessages,
    registerDeviceForRemoteMessages,
    requestPermission,
} from "@react-native-firebase/messaging";
import { PermissionsAndroid, Platform } from "react-native";

const MESSAGES_CHANNEL_ID = "messages";
const firebaseMessaging = getMessaging();

async function ensureAndroidNotificationPermission() {
    if (Platform.OS !== "android") {
        return true;
    }

    if (Platform.Version < 33) {
        return true;
    }

    const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
    const alreadyGranted = await PermissionsAndroid.check(permission);

    if (alreadyGranted) {
        return true;
    }

    const result = await PermissionsAndroid.request(permission);
    return result === PermissionsAndroid.RESULTS.GRANTED;
}

async function ensureIosNotificationPermission() {
    if (Platform.OS !== "ios") {
        return true;
    }

    const authStatus = await requestPermission(firebaseMessaging);
    return (
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL
    );
}

async function ensureMessagesChannel() {
    if (Platform.OS !== "android") {
        return;
    }

    await notifee.createChannel({
        id: MESSAGES_CHANNEL_ID,
        name: "Messages",
        importance: AndroidImportance.HIGH,
        sound: "default",
        vibration: true,
    });

}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
    const enabled =
        (await ensureAndroidNotificationPermission()) &&
        (await ensureIosNotificationPermission());

    if (!enabled) {
        console.log("[push-client] Permission not granted");
        throw new Error("Permission not granted");
    }

    await ensureMessagesChannel();

    if (Platform.OS === "ios" && !isDeviceRegisteredForRemoteMessages(firebaseMessaging)) {
        await registerDeviceForRemoteMessages(firebaseMessaging);
    }

    const fcmToken = await getToken(firebaseMessaging);

    if (!fcmToken) {
        console.log("[push-client] FCM token unavailable");
        return null;
    }

    console.log("[push-client] FCM token:", fcmToken);
    return fcmToken;
}
