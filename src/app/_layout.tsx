import { TabletProvider } from '@/context/screen-checking-context';
import { getToken } from '@/helper/user-session';
import { authClient } from '@/lib/auth-client';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';

SplashScreen.preventAutoHideAsync();

const AppLayout = () => {
    const colorScheme = useColorScheme();
    const [isReady, setIsReady] = useState(false);
    const { data: session } = authClient.useSession();

    const [hasSession, setHasSession] = useState(false);

    useEffect(() => {
        const bootstrap = async () => {
            const token = await getToken();
            if (token) {
                setHasSession(true);
            } else {
                setHasSession(false);
            }
            setIsReady(true);
            await SplashScreen.hideAsync();
        };

        bootstrap();
    }, []);

    const isNewUser = session?.user.isNewUser === true;
    const hasName = !!session?.user.name?.trim();
    const hasNoPin = false;
    const hasPin = true;

    if (!isReady) return null;

    return (
        <GestureHandlerRootView>
            <TabletProvider>
                <PaperProvider>
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                        <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Protected guard={!hasSession}>
                                <Stack.Screen name="(auth)" options={{ animation: 'none', gestureEnabled: false }} />
                            </Stack.Protected>
                            <Stack.Protected guard={hasSession && isNewUser}>
                                <Stack.Screen name="(newUser)" options={{ animation: 'none', gestureEnabled: false }} />
                            </Stack.Protected>
                            <Stack.Protected guard={hasSession && !isNewUser && hasNoPin}>
                                <Stack.Screen name="(oldUser)" options={{ animation: 'none', gestureEnabled: false }} />
                            </Stack.Protected>
                            <Stack.Protected guard={hasSession && !isNewUser && hasPin && !hasName}>
                                <Stack.Screen name="(complete-profile)" options={{ animation: 'none', gestureEnabled: false }} />
                            </Stack.Protected>
                            <Stack.Protected guard={hasSession && !isNewUser && hasPin && hasName}>
                                <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
                                <Stack.Screen name='chatId' options={{ headerShown: false }} />
                            </Stack.Protected>
                        </Stack>
                    </ThemeProvider>
                </PaperProvider>
            </TabletProvider>
        </GestureHandlerRootView>
    );
};

export default AppLayout;