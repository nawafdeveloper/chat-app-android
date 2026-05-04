import { CryptoProvider, useCryptoKeys } from '@/context/crypto';
import { TabletProvider } from '@/context/screen-checking-context';
import { getToken } from '@/helper/user-session';
import { authClient } from '@/lib/auth-client';
import { retrieveSessionKeys } from '@/lib/crypto-storage';
import { useAuthStore } from '@/store/auth-store';
import { setRefreshKeysHandler } from '@/types/keys.module';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { StatusBar, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { install } from 'react-native-quick-crypto';
import migrations from '../../drizzle/migrations';
import { db } from '../db/client';
install()

SplashScreen.preventAutoHideAsync();

// ─── Outside AppLayout ───────────────────────────────────

type AppStackProps = {
    hasSession: boolean
    isNewUser: boolean
    hasPin: boolean
    hasNoPin: boolean
    hasName: boolean
}

const AppStack = ({ hasSession, isNewUser, hasPin, hasNoPin, hasName }: AppStackProps) => {
    const { isHydrated: cryptoHydrated } = useCryptoKeys();

    if (!cryptoHydrated) return null;

    return (
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
    );
};

// ─── AppLayout ───────────────────────────────────────────

const AppLayout = () => {
    const { success, error } = useMigrations(db, migrations);
    const colorScheme = useColorScheme();
    const [isReady, setIsReady] = useState(false);
    const [hasKeys, setHasKeys] = useState<boolean | null>(null);
    const { hasSession, setHasSession } = useAuthStore();
    const { data: session } = authClient.useSession();

    const refreshKeys = async () => {
        const keys = await retrieveSessionKeys();
        setHasKeys(!!keys);
    };

    useEffect(() => {
        setRefreshKeysHandler(refreshKeys);
    }, []);

    useEffect(() => {
        const bootstrap = async () => {
            const token = await getToken();
            setHasSession(!!token);
            if (token) {
                await refreshKeys();
            } else {
                setHasKeys(false);
            }
            setIsReady(true);
        };
        bootstrap();
    }, []);

    useEffect(() => {
        if (isReady && success && hasKeys !== null) {
            SplashScreen.hideAsync();
        }
    }, [isReady, success, hasKeys]);

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Text>DB Error: {error.message}</Text>
            </View>
        );
    }

    if (!isReady || !success || hasKeys === null) return null;

    const isNewUser = session?.user.isNewUser === true;
    const hasName = !!session?.user.name?.trim();
    const hasPin = hasKeys === true;
    const hasNoPin = hasKeys === false;

    return (
        <GestureHandlerRootView>
            <TabletProvider>
                <PaperProvider>
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                        <CryptoProvider>
                            <AppStack
                                hasSession={hasSession}
                                isNewUser={isNewUser}
                                hasPin={hasPin}
                                hasNoPin={hasNoPin}
                                hasName={hasName}
                            />
                        </CryptoProvider>
                        <StatusBar barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'} />
                    </ThemeProvider>
                </PaperProvider>
            </TabletProvider>
        </GestureHandlerRootView>
    );
};

export default AppLayout;