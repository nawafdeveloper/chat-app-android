import * as Notifications from 'expo-notifications';
import { create } from 'zustand';

interface NotificationState {
    expoPushToken: string;
    notification: Notifications.Notification | undefined;
    setExpoPushToken: (token: string) => void;
    setNotification: (notification: Notifications.Notification | undefined) => void;
    resetNotification: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
    expoPushToken: '',
    notification: undefined,

    setExpoPushToken: (token: string) => set({ expoPushToken: token }),

    setNotification: (notification: Notifications.Notification | undefined) =>
        set({ notification }),

    resetNotification: () => set({ notification: undefined }),
}));