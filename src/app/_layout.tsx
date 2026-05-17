import { Colors } from '@/constants/theme';
import { CryptoProvider, useCryptoKeys } from '@/context/crypto';
import { TabletProvider } from '@/context/screen-checking-context';
import { registerForPushNotificationsAsync } from '@/helper/request-for-push-notification';
import { getToken } from '@/helper/user-session';
import { useChatRealtime } from '@/hooks/use-chat-realtime';
import { authClient } from '@/lib/auth-client';
import { syncNotificationMessageToLocalDb } from '@/lib/background-notification-sync';
import {
    getDecryptedDbMessagePage,
    hydrateLocalChatCache,
    MESSAGE_PAGE_SIZE,
    registerMobilePushToken,
    syncMobileChatsAndMessages,
} from '@/lib/chat-sync';
import { syncMobileContacts } from '@/lib/contact-sync';
import { retrieveSessionKeys } from '@/lib/crypto-storage';
import { displayRemoteMessageNotification } from '@/lib/display-notifee-notification';
import { getDbChat } from '@/lib/upsert-db-chats';
import { useNotificationNavigationStore } from '@/store/notification-navigation-store';
import { useAuthStore } from '@/store/auth-store';
import { useNotificationStore } from '@/store/notification-store';
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
import { AppState, InteractionManager, Linking, StatusBar, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { install } from 'react-native-quick-crypto';
import migrations from '../../drizzle/migrations';
import { ThemedText } from '../components/themed-text';
import { db, ensureLocalDbSchema } from '../db/client';

install();
const firebaseMessaging = getMessaging();
const MAIN_CHATS_TAB_ROUTE = '/(tabs)/chats';

SplashScreen.preventAutoHideAsync();

type AppStackProps = {
    hasSession: boolean
    hasSessionUser: boolean
    isNewUser: boolean
    hasPin: boolean
    hasNoPin: boolean
    hasName: boolean
    onMainAppReadyChange: (ready: boolean) => void
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
            parsed.searchParams.get('notificationChatId') ??
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

const AppStack = ({
    hasSession,
    hasSessionUser,
    isNewUser,
    hasPin,
    hasNoPin,
    hasName,
    onMainAppReadyChange,
}: AppStackProps) => {
    const { isHydrated: cryptoHydrated } = useCryptoKeys();
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];
    const mainAppReady =
        cryptoHydrated &&
        hasSession &&
        hasSessionUser &&
        !isNewUser &&
        hasPin &&
        hasName;

    useEffect(() => {
        onMainAppReadyChange(mainAppReady);

        return () => {
            onMainAppReadyChange(false);
        };
    }, [mainAppReady, onMainAppReadyChange]);

    if (!cryptoHydrated) return null;

    return (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
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
    const [mainAppStackReady, setMainAppStackReady] = useState(false);
    const { hasSession, setHasSession } = useAuthStore();
    const { data: session } = authClient.useSession();
    const { expoPushToken, setExpoPushToken, setNotification } = useNotificationStore();
    const pendingNotificationChatId = useNotificationNavigationStore((state) => state.pendingChatId);
    const registeredPushTokenRef = useRef<string | null>(null);
    const hydratedLocalCacheRef = useRef<string | null>(null);
    const syncedContactsRef = useRef<string | null>(null);
    const handledNotificationResponseRef = useRef<Map<string, number>>(new Map());
    const catchUpSyncInFlightRef = useRef(false);
    const lastCatchUpSyncAtRef = useRef(0);

    const [fontsLoaded, fontError] = useFonts({
        'Noto-Light': require('../../assets/fonts/NotoSansArabic-Light.ttf'),
        'Noto-Regular': require('../../assets/fonts/NotoSansArabic-Regular.ttf'),
        'Noto-Bold': require('../../assets/fonts/NotoSansArabic-Bold.ttf'),
    });

    const refreshKeys = async () => {
        const keys = await retrieveSessionKeys();
        setHasKeys(!!keys);
    };

    const handleMainAppReadyChange = useCallback((ready: boolean) => {
        setMainAppStackReady(ready);
    }, []);

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
            useNotificationNavigationStore.getState().clearPendingChatId();
            setMainAppStackReady(false);
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
        ensureLocalDbSchema();

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
        useNotificationNavigationStore.getState().setPendingChatId(conversationId);
    }, []);

    useEffect(() => {
        if (!pendingNotificationChatId || !mainAppStackReady) {
            return;
        }

        let isCancelled = false;
        const interaction = InteractionManager.runAfterInteractions(() => {
            requestAnimationFrame(() => {
                if (isCancelled) {
                    return;
                }

                router.replace(MAIN_CHATS_TAB_ROUTE);
            });
        });

        return () => {
            isCancelled = true;
            interaction.cancel?.();
        };
    }, [mainAppStackReady, pendingNotificationChatId]);

    const hydrateNotificationConversation = useCallback(async (conversationId: string) => {
        if (!session?.user.id || hasKeys !== true) {
            return;
        }

        const [chat, messages] = await Promise.all([
            getDbChat(conversationId),
            getDecryptedDbMessagePage({
                chatId: conversationId,
                currentUserId: session.user.id,
            }),
        ]);

        if (chat) {
            useActiveChatStore.getState().upsertChat(chat);
        }

        if (messages.length > 0) {
            useActiveChatStore.getState().replaceMessages(conversationId, messages);
            useActiveChatStore
                .getState()
                .setHasOlderMessages(
                    conversationId,
                    messages.length === MESSAGE_PAGE_SIZE
                );
        }
    }, [hasKeys, session?.user.id]);

    const hydrateLocalCacheIntoStore = useCallback(async () => {
        if (!session?.user.id || hasKeys !== true) {
            return;
        }

        await hydrateLocalChatCache({
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
        });
    }, [hasKeys, session?.user.id]);

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

    // Message catch-up
    const runCatchUpSync = useCallback((reason: "startup" | "active") => {
        if (
            !hasSession ||
            hasKeys !== true ||
            !session?.user.id ||
            !localCacheReady
        ) {
            return;
        }

        const now = Date.now();
        if (
            catchUpSyncInFlightRef.current ||
            now - lastCatchUpSyncAtRef.current < 4_000
        ) {
            return;
        }

        catchUpSyncInFlightRef.current = true;
        lastCatchUpSyncAtRef.current = now;

        void (async () => {
            await hydrateLocalCacheIntoStore();
            await syncMobileCache();
        })()
            .catch((error) => {
                console.log(`Failed to run ${reason} message catch-up:`, error);
            })
            .finally(() => {
                catchUpSyncInFlightRef.current = false;
            });
    }, [
        hasKeys,
        hasSession,
        hydrateLocalCacheIntoStore,
        localCacheReady,
        session?.user.id,
        syncMobileCache,
    ]);

    // Startup/resume catch-up
    useEffect(() => {
        runCatchUpSync("startup");
    }, [runCatchUpSync]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (nextAppState) => {
            if (nextAppState === "active") {
                runCatchUpSync("active");
            }
        });

        return () => {
            subscription.remove();
        };
    }, [runCatchUpSync]);

    // Push token registration
    useEffect(() => {
        if (!hasSession) {
            return;
        }

        registerForPushNotificationsAsync()
            .then(token => {
                if (token) {
                    setExpoPushToken(token); // now stores FCM token
                }
            })
            .catch((error) => {
                console.log('Push registration failed:', error);
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

        const wasRecentlyHandled = (keys: string[]) => {
            const now = Date.now();
            const handled = handledNotificationResponseRef.current;

            for (const [key, handledAt] of handled) {
                if (now - handledAt > 5_000) {
                    handled.delete(key);
                }
            }

            if (keys.some((key) => handled.has(key))) {
                return true;
            }

            keys.forEach((key) => handled.set(key, now));
            return false;
        };

        const handleNotificationPress = (data: Record<string, any>) => {
            const conversationId = getNotificationChatId(data);
            const messageId =
                optionalString(data?.messageId) ??
                optionalString(data?.message_id);
            const handledKeys = [
                messageId ? `message:${messageId}` : null,
                conversationId ? `conversation:${conversationId}` : null,
            ].filter((key): key is string => Boolean(key));

            if (handledKeys.length > 0 && wasRecentlyHandled(handledKeys)) {
                return;
            }

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

            const handledKeys = [
                `url:${url}`,
                `conversation:${conversationId}`,
            ];

            if (wasRecentlyHandled(handledKeys)) {
                return;
            }

            openChatFromNotification(conversationId);
            syncFromNotification();
        };

        // 1️⃣ App opened from a killed state via notification tap
        notifee.getInitialNotification()
            .then((initialNotification) => {
                if (initialNotification) {
                    const data = initialNotification.notification.data ?? {};
                    handleNotificationPress(data);
                }
            })
            .catch((error) => {
                console.log('Failed to read initial notification:', error);
            });

        Linking.getInitialURL()
            .then(handleNotificationUrl)
            .catch((error) => {
                console.log('Failed to read initial notification URL:', error);
            });

        // 2️⃣ Foreground FCM message → display via notifee
        const unsubscribeFCM = onMessage(firebaseMessaging, async (remoteMessage) => {
            console.log('[push] foreground FCM message received');
            const data = remoteMessage.data ?? {};
            const conversationId = getNotificationChatId(data);
            setNotification(remoteMessage); // keep store updated
            const [syncResult] = await Promise.allSettled([
                syncNotificationMessageToLocalDb(data),
                displayRemoteMessageNotification(remoteMessage),
            ]);

            if (
                conversationId &&
                syncResult.status === 'fulfilled' &&
                syncResult.value
            ) {
                await hydrateNotificationConversation(conversationId);
            }

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
    }, [hydrateNotificationConversation, openChatFromNotification, setNotification, syncMobileCache]);

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
                                onMainAppReadyChange={handleMainAppReadyChange}
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
