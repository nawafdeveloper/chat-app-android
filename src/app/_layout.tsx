import { CryptoProvider, useCryptoKeys } from '@/context/crypto';
import { TabletProvider } from '@/context/screen-checking-context';
import { setupNotificationCategories } from '@/helper/push-notification';
import { registerForPushNotificationsAsync } from '@/helper/request-for-push-notification';
import { getToken } from '@/helper/user-session';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import { authClient } from '@/lib/auth-client';
import { deleteMobilePushToken, hydrateLocalChatCache, registerMobilePushToken, syncMobileChatsAndMessages } from '@/lib/chat-sync';
import { retrieveSessionKeys } from '@/lib/crypto-storage';
import { useAuthStore } from '@/store/auth-store';
import { useNotificationStore } from '@/store/notification-store';
import { rightNavRef } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { setRefreshKeysHandler } from '@/types/keys.module';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { install } from 'react-native-quick-crypto';
import migrations from '../../drizzle/migrations';
import { db } from '../db/client';
install()

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

setupNotificationCategories();

SplashScreen.preventAutoHideAsync();

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
            <Stack.Protected guard={hasSession && hasPin && !hasName}>
                <Stack.Screen name="(complete-profile)" options={{ animation: 'none', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={hasSession && !isNewUser && hasPin && hasName}>
                <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
                <Stack.Screen name='chatId' options={{ headerShown: false }} />
                <Stack.Screen name='create-chat' options={{ headerShown: false }} />
            </Stack.Protected>
        </Stack>
    );
};

const RealtimeBootstrap = () => {
    useChatRealtime();
    return null;
};

const AppLayout = () => {
    const { success, error } = useMigrations(db, migrations);
    const colorScheme = useColorScheme();
    const [isReady, setIsReady] = useState(false);
    const [hasKeys, setHasKeys] = useState<boolean | null>(null);
    const [localCacheReady, setLocalCacheReady] = useState(false);
    const { hasSession, setHasSession } = useAuthStore();
    const { data: session } = authClient.useSession();
    const { expoPushToken, setExpoPushToken, setNotification } = useNotificationStore();
    const registeredPushTokenRef = useRef<string | null>(null);
    const hydratedLocalCacheRef = useRef<string | null>(null);
    const handledNotificationResponseRef = useRef<string | null>(null);

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
    }, [setHasSession]);

    useEffect(() => {
        const shouldWaitForLocalCache = hasSession && hasKeys === true;

        if (
            isReady &&
            success &&
            hasKeys !== null &&
            (!shouldWaitForLocalCache || localCacheReady)
        ) {
            SplashScreen.hideAsync();
        }
    }, [hasKeys, hasSession, isReady, localCacheReady, session?.user.id, success]);

    useEffect(() => {
        if (!hasSession) {
            hydratedLocalCacheRef.current = null;
            registeredPushTokenRef.current = null;
            setLocalCacheReady(false);
        }
    }, [hasSession]);

    useEffect(() => {
        if (!success || hasKeys !== true || !hasSession) {
            setLocalCacheReady(true);
            return;
        }

        if (!session?.user.id) {
            setLocalCacheReady(false);
            return;
        }

        if (hydratedLocalCacheRef.current === session.user.id) {
            setLocalCacheReady(true);
            return;
        }

        hydratedLocalCacheRef.current = session.user.id;
        setLocalCacheReady(false);

        void hydrateLocalChatCache({
            currentUserId: session.user.id,
            onChatsLoaded: (chats) => {
                useActiveChatStore.getState().setChats(chats);
            },
            onChatMessagesLoaded: (chatId, messages, hasOlderMessages) => {
                useActiveChatStore.getState().replaceMessages(chatId, messages);
                useActiveChatStore
                    .getState()
                    .setHasOlderMessages(chatId, Boolean(hasOlderMessages));
            },
        })
            .catch((error) => {
                console.log('Failed to hydrate local chat cache:', error);
            })
            .finally(() => {
                useActiveChatStore.getState().setChatsLoading(false);
                setLocalCacheReady(true);
            });
    }, [hasKeys, hasSession, session?.user.id, success]);

    const openChatFromNotification = useCallback((conversationId: string) => {
        useActiveChatStore.getState().setSelectedChatId(conversationId);

        if (rightNavRef.isReady()) {
            rightNavRef.navigate('chatId', { chatId: conversationId });
            return;
        }

        router.navigate({
            pathname: '/chatId',
            params: { chatId: conversationId },
        });
    }, []);

    const syncMobileCache = useCallback(async () => {
        if (!session?.user.id || hasKeys !== true) {
            return;
        }

        await syncMobileChatsAndMessages({
            currentUserId: session.user.id,
            cookies: authClient.getCookie(),
            onChatsLoaded: (chats) => {
                useActiveChatStore.getState().setChats(chats);
            },
            onChatMessagesLoaded: (chatId, messages, hasOlderMessages) => {
                useActiveChatStore.getState().replaceMessages(chatId, messages);
                useActiveChatStore
                    .getState()
                    .setHasOlderMessages(chatId, Boolean(hasOlderMessages));
            },
        });
    }, [hasKeys, session?.user.id]);

    const getNotificationConversationId = useCallback((
        notification: Notifications.Notification
    ) => {
        const data = notification.request.content.data as {
            conversationId?: unknown;
            roomId?: unknown;
        };

        const conversationId = data.conversationId ?? data.roomId;
        return typeof conversationId === 'string' ? conversationId : null;
    }, []);

    useEffect(() => {
        registerForPushNotificationsAsync()
            .then(token => {
                if (token) {
                    setExpoPushToken(token);
                }
            })
            .catch((error) => {
                console.log('Push registration failed:', error);
                if (
                    hasSession &&
                    error instanceof Error &&
                    error.message.includes('Permission not granted')
                ) {
                    void deleteMobilePushToken({
                        cookies: authClient.getCookie(),
                    }).catch((deleteError) => {
                        console.log('Failed to clear push token:', deleteError);
                    });
                }
            });
    }, [hasSession, setExpoPushToken]);

    // useEffect(() => {
    //     RequestContact()
    // }, [hasSession, hasKeys]);

    useEffect(() => {
        if (!hasSession || !session?.user.id || !expoPushToken) {
            return;
        }

        const registrationKey = `${session.user.id}:${expoPushToken}`;

        if (registeredPushTokenRef.current === registrationKey) {
            return;
        }

        void registerMobilePushToken({
            token: expoPushToken,
            cookies: authClient.getCookie(),
        })
            .then(() => {
                registeredPushTokenRef.current = registrationKey;
            })
            .catch((error) => {
                console.log('Failed to save push token:', error);
            });
    }, [expoPushToken, hasSession, session?.user.id]);

    useEffect(() => {
        const syncFromNotification = () => {
            void syncMobileCache().catch((error) => {
                console.log('Failed to sync mobile notification data:', error);
            });
        };

        const handleNotificationResponse = (
            response: Notifications.NotificationResponse
        ) => {
            const identifier = response.notification.request.identifier;
            if (handledNotificationResponseRef.current === identifier) {
                return;
            }

            handledNotificationResponseRef.current = identifier;

            const conversationId = getNotificationConversationId(response.notification);

            if (conversationId) {
                openChatFromNotification(conversationId);
            }

            syncFromNotification();
        };

        Notifications.getLastNotificationResponseAsync()
            .then((response) => {
                if (response) {
                    handleNotificationResponse(response);
                }
            })
            .catch((error) => {
                console.log('Failed to read last notification response:', error);
            });

        const subscription = Notifications.addNotificationReceivedListener(
            (notification) => {
                setNotification(notification);
                syncFromNotification();
            }
        );

        const responseSubscription = Notifications.addNotificationResponseReceivedListener(
            handleNotificationResponse
        );

        return () => {
            subscription.remove();
            responseSubscription.remove();
        };
    }, [getNotificationConversationId, openChatFromNotification, setNotification, syncMobileCache]);

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
                            {hasSession && !isNewUser && hasPin && hasName ? (
                                <RealtimeBootstrap />
                            ) : null}
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
