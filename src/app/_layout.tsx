import { TabletProvider } from '@/context/screen-checking-context';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';

const AppLayout = () => {
    const colorScheme = useColorScheme();

    return (
        <GestureHandlerRootView>
            <TabletProvider>
                <PaperProvider>
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                        <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="(auth)" options={{ animation: 'none', gestureEnabled: false }} />
                            <Stack.Screen name="(complete-profile)" options={{ animation: 'none', gestureEnabled: false }} />
                            <Stack.Screen name="(newUser)" options={{ animation: 'none', gestureEnabled: false }} />
                            <Stack.Screen name="(oldUser)" options={{ animation: 'none', gestureEnabled: false }} />
                            <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
                            <Stack.Screen name='chatId' options={{ headerShown: false }} />
                        </Stack>
                    </ThemeProvider>
                </PaperProvider>
            </TabletProvider>
        </GestureHandlerRootView>
    )
}

export default AppLayout