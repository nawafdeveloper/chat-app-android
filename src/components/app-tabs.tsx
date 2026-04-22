import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { Platform, useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  // Only render on Android
  if (Platform.OS !== 'android') {
    return null;
  }

  return (
    <NativeTabs
      backgroundColor={colors.card}
      indicatorColor={colors.indicator}
      rippleColor={colors.indicator}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index" hidden />

      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon md="chat" sf="message.fill" />
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