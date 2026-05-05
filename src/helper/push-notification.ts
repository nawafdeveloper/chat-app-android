import * as Notifications from 'expo-notifications';

export async function setupNotificationCategories() {
    await Notifications.setNotificationCategoryAsync('chat_message', [
        {
            identifier: 'REPLY',
            buttonTitle: 'Reply',
            textInput: {
                submitButtonTitle: 'Send',
                placeholder: 'Type a reply...',
            },
            options: {
                opensAppToForeground: false,
            },
        },
        {
            identifier: 'MARK_READ',
            buttonTitle: 'Mark as Read',
            options: {
                opensAppToForeground: false,
            },
        },
    ]);
}

export async function showMessageNotification(
    title: string,
    body: string,
    roomId: string,
    senderId: string,
) {
    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            categoryIdentifier: 'chat_message',
            data: {
                roomId,
                senderId
            }
        },
        trigger: null
    });
}