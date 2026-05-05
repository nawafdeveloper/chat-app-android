import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { Platform, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { useLogoutLoadingState } from '@/store/use-logout-loading-state';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
  const chats = useActiveChatStore((state) => state.chats);
  const { logoutLoading } = useLogoutLoadingState()

  const totalUnreadMessages = chats.reduce(
    (total, chat) => total + chat.unreaded_messages_length,
    0
  );

  // Only render on Android
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    <NativeTabs
      backgroundColor={colors.card}
      indicatorColor={colors.indicator}
      rippleColor={colors.indicator}
      labelStyle={{ selected: { color: colors.text } }}
      badgeBackgroundColor={'#25D366'}
      hidden={logoutLoading}
    >
      <NativeTabs.Trigger name="index" hidden />

      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/expo.icon/Assets/chats_icon.png')}
          renderingMode="template"
        />
        {totalUnreadMessages > 0 && (
          <NativeTabs.Trigger.Badge>
            {totalUnreadMessages.toString()}
          </NativeTabs.Trigger.Badge>
        )}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="archive">
        <NativeTabs.Trigger.Label>Archive</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="archive" sf="archivebox.fill" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="settings" sf="gear" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}