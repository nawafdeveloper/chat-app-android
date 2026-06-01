/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    card: '#F6F5F3',
    indicator: '#e3e1df',
    avatarBg: '#139443',
    avatarIcon: '#C4FFDA',
    tabletBackground: '#F6F5F3'
  },
  dark: {
    text: '#ffffff',
    background: '#0C1013',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    card: '#12171b',
    indicator: '#2f363a',
    avatarBg: '#C4FFDA',
    avatarIcon: '#139443',
    tabletBackground: '#12171b'
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = {
  light: 'Noto-Light',
  regular: 'Noto-Regular',
  bold: 'Noto-Bold',
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
