import { CryptoProvider, useCryptoKeys } from '@/context/crypto';
import { TabletProvider } from '@/context/screen-checking-context';
import { registerForPushNotificationsAsync } from '@/helper/request-for-push-notification';
import { getToken } from '@/helper/user-session';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import { authClient } from '@/lib/auth-client';
import { deleteMobilePushToken, hydrateLocalChatCache, registerMobilePushToken, syncMobileChatsAndMessages } from '@/lib/chat-sync';
import { syncMobileContacts } from '@/lib/contact-sync';
import { retrieveSessionKeys } from '@/lib/crypto-storage';
import { displayRemoteMessageNotification } from '@/lib/display-notifee-notification';
import { syncNotificationMessageToLocalDb } from '@/lib/background-notification-sync';
import { useAuthStore } from '@/store/auth-store';
import { useNotificationStore } from '@/store/notification-store';
import { rightNavRef } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { setRefreshKeysHandler } from '@/types/keys.module';
import notifee, { EventType } from '@notifee/react-native';
import { getMessaging, onMessage } from '@react-native-firebase/messaging';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StatusBar, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { install } from 'react-native-quick-crypto';
import migrations from '../../drizzle/migrations';
import { ThemedText } from '../components/themed-text';
import { db } from '../db/client';

install();
const firebaseMessaging = getMessaging();

SplashScreen.preventAutoHideAsync();

type AppStackProps = {
    hasSession: boolean
    hasSessionUser: boolean
    isNewUser: boolean
    hasPin: boolean
    hasNoPin: boolean
    hasName: boolean
}

function optionalString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getNotificationChatId(data: Record<string, any>) {
    return (
        optionalString(data?.conversationId) ??
        optionalString(data?.chatId) ??
        optionalString(data?.chat_room_id) ??
        optionalString(data?.chatRoomId) ??
        optionalString(data?.roomId)
    );
}

function getChatIdFromUrl(url: string) {
    try {
        const parsed = new URL(url);
        const chatIdParam =
            parsed.searchParams.get('chatId') ??
            parsed.searchParams.get('conversationId') ??
            parsed.searchParams.get('chat_room_id');

        if (chatIdParam) {
            return chatIdParam;
        }

        const host = parsed.hostname;
        const pathParts = parsed.pathname.split('/').filter(Boolean);

        if (host === 'conversation' && pathParts[0]) {
            return decodeURIComponent(pathParts[0]);
        }

        if (host === 'chatId' && pathParts[0]) {
            return decodeURIComponent(pathParts[0]);
        }

        if (pathParts[0] === 'conversation' && pathParts[1]) {
            return decodeURIComponent(pathParts[1]);
        }

        if (pathParts[0] === 'chatId' && pathParts[1]) {
            return decodeURIComponent(pathParts[1]);
        }
    } catch (error) {
        console.log('Failed to parse notification link:', error);
    }

    return null;
}

const AppStack = ({ hasSession, hasSessionUser, isNewUser, hasPin, hasNoPin, hasName }: AppStackProps) => {
    const { isHydrated: cryptoHydrated } = useCryptoKeys();

    if (!cryptoHydrated) return null;

    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Protected guard={!hasSession}>
                <Stack.Screen name="(auth)" options={{ animation: 'none', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={hasSession && hasSessionUser && isNewUser}>
                <Stack.Screen name="(newUser)" options={{ animation: 'none', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={hasSession && hasSessionUser && !isNewUser && hasNoPin}>
                <Stack.Screen name="(oldUser)" options={{ animation: 'none', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={hasSession && hasSessionUser && hasPin && !hasName}>
                <Stack.Screen name="(complete-profile)" options={{ animation: 'none', gestureEnabled: false }} />
            </Stack.Protected>
            <Stack.Protected guard={hasSession && hasSessionUser && !isNewUser && hasPin && hasName}>
                <Stack.Screen name='(tabs)' options={{ headerShown: false }} />
                <Stack.Screen name='chatId' options={{ headerShown: false }} />
                <Stack.Screen name='create-chat' options={{ headerShown: false }} />
                <Stack.Screen name='video-player' options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name='image-preview' options={{ headerShown: false, animation: 'fade' }} />
                <Stack.Screen name='targetUserProfile' options={{ headerShown: false }} />
                <Stack.Screen name='create-group-select-members' options={{ headerShown: false }} />
                <Stack.Screen name='create-new-group' options={{ headerShown: false }} />
                <Stack.Screen name='create-new-contact' options={{ headerShown: false }} />
                <Stack.Screen name='create-contact-select-country' options={{ headerShown: false, animation: 'fade_from_bottom', animationDuration: 100 }} />
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
    const syncedContactsRef = useRef<string | null>(null);
    const handledNotificationResponseRef = useRef<string | null>(null);

    const [fontsLoaded, fontError] = useFonts({
        'Noto-Light': require('../../assets/fonts/NotoSansArabic-Light.ttf'),
        'Noto-Regular': require('../../assets/fonts/NotoSansArabic-Regular.ttf'),
        'Noto-Bold': require('../../assets/fonts/NotoSansArabic-Bold.ttf'),
    });

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
            (fontsLoaded || fontError) &&
            (!shouldWaitForLocalCache || localCacheReady)
        ) {
            SplashScreen.hideAsync();
        }
    }, [hasKeys, hasSession, isReady, localCacheReady, session?.user.id, success, fontsLoaded, fontError]);

    useEffect(() => {
        if (!hasSession) {
            hydratedLocalCacheRef.current = null;
            registeredPushTokenRef.current = null;
            syncedContactsRef.current = null;
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

    // ─── Push token registration ──────────────────────────────────────────────
    useEffect(() => {
        registerForPushNotificationsAsync()
            .then(token => {
                if (token) {
                    setExpoPushToken(token); // now stores FCM token
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

    // ─── Contacts sync ────────────────────────────────────────────────────────
    useEffect(() => {
        if (!hasSession || hasKeys !== true || !session?.user.id) {
            syncedContactsRef.current = null;
            return;
        }

        if (syncedContactsRef.current === session.user.id) {
            return;
        }

        syncedContactsRef.current = session.user.id;

        void syncMobileContacts({
            currentUserId: session.user.id,
            cookies: authClient.getCookie(),
        }).catch((error) => {
            syncedContactsRef.current = null;
            console.log('Failed to sync device contacts:', error);
        });
    }, [hasKeys, hasSession, session?.user.id]);

    // ─── Token registration with server ──────────────────────────────────────
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

    // ─── Notification listeners (notifee + FCM) ───────────────────────────────
    useEffect(() => {
        const syncFromNotification = () => {
            void syncMobileCache().catch((error) => {
                console.log('Failed to sync mobile notification data:', error);
            });
        };

        const handleNotificationPress = (data: Record<string, any>) => {
            const identifier =
                optionalString(data?.messageId) ??
                optionalString(data?.message_id) ??
                getNotificationChatId(data);

            if (identifier && handledNotificationResponseRef.current === identifier) {
                return;
            }

            if (identifier) {
                handledNotificationResponseRef.current = identifier;
            }

            const conversationId = getNotificationChatId(data);
            if (conversationId) {
                openChatFromNotification(conversationId);
            }

            syncFromNotification();
        };

        const handleNotificationUrl = (url: string | null) => {
            if (!url) {
                return;
            }

            const conversationId = getChatIdFromUrl(url);
            if (!conversationId) {
                return;
            }

            if (handledNotificationResponseRef.current === url) {
                return;
            }

            handledNotificationResponseRef.current = url;
            openChatFromNotification(conversationId);
            syncFromNotification();
        };

        // 1️⃣ App opened from a killed state via notification tap
        notifee.getInitialNotification().then((initialNotification) => {
            if (initialNotification) {
                const data = initialNotification.notification.data ?? {};
                handleNotificationPress(data);
            }
        });

        Linking.getInitialURL().then(handleNotificationUrl);

        // 2️⃣ Foreground FCM message → display via notifee
        const unsubscribeFCM = onMessage(firebaseMessaging, async (remoteMessage) => {
            console.log('[push] foreground FCM message received');
            setNotification(remoteMessage); // keep store updated
            await Promise.allSettled([
                syncNotificationMessageToLocalDb(remoteMessage.data ?? {}),
                displayRemoteMessageNotification(remoteMessage),
            ]);
            syncFromNotification();
        });

        // 3️⃣ Foreground notification tap
        const unsubscribeNotifee = notifee.onForegroundEvent(({ type, detail }) => {
            if (type === EventType.PRESS) {
                const data = detail.notification?.data ?? {};
                handleNotificationPress(data);
            }
        });

        const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
            handleNotificationUrl(url);
        });

        return () => {
            unsubscribeFCM();
            unsubscribeNotifee();
            linkingSubscription.remove();
        };
    }, [openChatFromNotification, setNotification, syncMobileCache]);

    if (error) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ThemedText>DB Error: {error.message}</ThemedText>
            </View>
        );
    }

    if (!isReady || !success || hasKeys === null || (!fontsLoaded && !fontError)) return null;

    const isNewUser = session?.user.isNewUser === true;
    const hasSessionUser = !!session?.user.id;
    const hasName = !!session?.user.name?.trim();
    const hasPin = hasKeys === true;
    const hasNoPin = hasKeys === false;

    return (
        <GestureHandlerRootView>
            <TabletProvider>
                <PaperProvider>
                    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
                        <CryptoProvider>
                            {hasSession ? (
                                <RealtimeBootstrap />
                            ) : null}
                            <AppStack
                                hasSession={hasSession}
                                hasSessionUser={hasSessionUser}
                                isNewUser={isNewUser}
                                hasPin={hasPin}
                                hasNoPin={hasNoPin}
                                hasName={hasName}
                            />
                        </CryptoProvider>
                        <StatusBar
                            barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
                        />
                    </ThemeProvider>
                </PaperProvider>
            </TabletProvider>
        </GestureHandlerRootView>
    );
};

export default AppLayout;
