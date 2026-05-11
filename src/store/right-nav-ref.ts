import { createNavigationContainerRef } from '@react-navigation/native';

export type RightNavParamList = {
    empty: undefined
    chatId: { chatId: string }
    subSetting: { href: string }
    targetUserProfile: { chatId: string | null }
}

export const rightNavRef = createNavigationContainerRef<RightNavParamList>();
