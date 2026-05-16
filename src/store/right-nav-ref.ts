import { createNavigationContainerRef } from '@react-navigation/native';

export type RightNavParamList = {
    empty: undefined
    chatId: { chatId: string }
    subSetting: { href: string }
    targetUserProfile: {
        chatId?: string | null
        targetUserId?: string | null
        contactNumber?: string | null
        displayName?: string | null
        avatar?: string | null
        publicKey?: string | null
    }
}

export const rightNavRef = createNavigationContainerRef<RightNavParamList>();
