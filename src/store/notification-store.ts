import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import { create } from 'zustand';

interface NotificationState {
    expoPushToken: string;
    notification: FirebaseMessagingTypes.RemoteMessage | undefined;
    setExpoPushToken: (token: string) => void;
    setNotification: (notification: FirebaseMessagingTypes.RemoteMessage | undefined) => void;
    resetNotification: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
    expoPushToken: '',
    notification: undefined,

    setExpoPushToken: (token: string) => set({ expoPushToken: token }),

    setNotification: (notification: FirebaseMessagingTypes.RemoteMessage | undefined) =>
        set({ notification }),

    resetNotification: () => set({ notification: undefined }),
}));
