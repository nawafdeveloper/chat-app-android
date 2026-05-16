import { displayRemoteMessageNotification } from '@/lib/display-notifee-notification';
import { syncNotificationMessageToLocalDb } from '@/lib/background-notification-sync';
import notifee, { EventType } from '@notifee/react-native';
import { getMessaging, setBackgroundMessageHandler } from '@react-native-firebase/messaging';

const firebaseMessaging = getMessaging();

setBackgroundMessageHandler(firebaseMessaging, async (remoteMessage) => {
    await Promise.allSettled([
        syncNotificationMessageToLocalDb(remoteMessage.data ?? {}),
        displayRemoteMessageNotification(remoteMessage),
    ]);
});

notifee.onBackgroundEvent(async ({ type, detail }) => {
    if (type === EventType.PRESS) {
        console.log('[push] background notification pressed:', detail.notification?.data);
    }
});

// Register background handlers before loading the app entry.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry');
