import { createNavigationContainerRef } from '@react-navigation/native';

export type RightNavParamList = {
    empty: undefined
    chatId: { chatId: string }
}

export const rightNavRef = createNavigationContainerRef<RightNavParamList>();
