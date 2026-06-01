import ArchivePage from '@/app/(tabs)/archive';
import ChatsPage from '@/app/(tabs)/chats';
import SettingsPage from '@/app/(tabs)/settings';
import SubSettingPage from '@/app/(tabs)/settings/sub-setting';
import ChatId from '@/app/chatId';
import TargetUserProfile from '@/app/targetUserProfile';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { rightNavRef, type RightNavParamList } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from './empty-state';
import { ThemedText } from './themed-text';
import { ChatFillIcon } from './ui/chat-icon';

const Stack = createNativeStackNavigator<RightNavParamList>();
const Tab = createBottomTabNavigator();

export default function TabletAppTabs() {
    const scheme = useColorScheme();
    const { width: screenWidth } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
    const chats = useActiveChatStore((state) => state.chats);
    const tabsPaneWidth = screenWidth * 0.5;

    const totalUnreadMessages = chats.reduce(
        (total, chat) => total + chat.unreaded_messages_length,
        0
    );

    return (
        <ThemedView style={[styles.container, { backgroundColor: colors.tabletBackground, paddingBottom: insets.bottom, paddingTop: insets.top }]}>
            <View style={[styles.tabsContainer, { width: tabsPaneWidth, backgroundColor: colors.tabletBackground }]}>
                <NavigationIndependentTree>
                    <Tab.Navigator
                        tabBar={({ state, descriptors, navigation }) => (
                            <ThemedView
                                style={{
                                    width: 88,
                                    height: '100%',
                                    backgroundColor: colors.tabletBackground,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                }}
                            >
                                {state.routes.map((route, index) => {
                                    const { options } = descriptors[route.key];
                                    const focused = state.index === index;
                                    const color = focused ? colors.text : colors.text + '60';

                                    const onPress = () => {
                                        const event = navigation.emit({
                                            type: 'tabPress',
                                            target: route.key,
                                            canPreventDefault: true,
                                        });

                                        if (!focused && !event.defaultPrevented) {
                                            navigation.navigate(route.name);
                                        }
                                    };

                                    return (
                                        <View
                                            key={route.key}
                                            style={{
                                                width: 88,
                                                height: 72,
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                backgroundColor: 'transparent'
                                            }}
                                        >
                                            <TouchableRipple
                                                onPress={onPress}
                                                rippleColor={colors.indicator}
                                                borderless={false}
                                                style={{
                                                    width: 56,
                                                    height: 32,
                                                    borderRadius: 16,
                                                    overflow: 'hidden',
                                                    backgroundColor: 'transparent',
                                                }}
                                            >
                                                <View
                                                    style={{
                                                        flex: 1,
                                                        borderRadius: 16,
                                                        justifyContent: 'center',
                                                        alignItems: 'center',
                                                        overflow: 'hidden',
                                                        backgroundColor: focused ? colors.indicator : 'transparent',
                                                    }}
                                                >
                                                    {options.tabBarIcon?.({
                                                        focused,
                                                        color,
                                                        size: 24,
                                                    })}
                                                </View>
                                            </TouchableRipple>

                                            <ThemedText
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: 11,
                                                    fontWeight: '800',
                                                    color,
                                                }}
                                            >
                                                {route.name}
                                            </ThemedText>
                                        </View>
                                    );
                                })}
                            </ThemedView>
                        )}
                        screenOptions={{
                            headerShown: false,
                            tabBarPosition: 'left',
                            tabBarStyle: {
                                position: 'absolute',
                                top: '50%',
                                width: 88,
                                backgroundColor: colors.tabletBackground,
                                borderRightWidth: 0,
                                elevation: 0,
                                shadowOpacity: 0,
                            },
                            tabBarItemStyle: {
                                height: 72,
                                justifyContent: 'center',
                                alignItems: 'center',
                            },
                            tabBarLabelStyle: {
                                fontSize: 11,
                                marginTop: 4,
                            },
                            tabBarActiveTintColor: colors.text,
                            tabBarInactiveTintColor: colors.text + '60',
                            sceneStyle: {
                                overflow: 'hidden',
                                borderRadius: 16,
                            },
                        }}
                    >
                        <Tab.Screen
                            name="Chats"
                            component={ChatsPage}
                            options={{
                                tabBarBadge: totalUnreadMessages ? totalUnreadMessages : undefined,
                                tabBarBadgeStyle: { backgroundColor: '#25D366', color: colors.background },
                                tabBarIcon: ({ color }) => (
                                    <ChatFillIcon size={24} color={color} />
                                )
                            }}
                        />
                        <Tab.Screen
                            name="Archive"
                            component={ArchivePage}
                            options={{
                                tabBarIcon: ({ color }) => (
                                    <MaterialIcons name="archive" size={24} color={color} />
                                )
                            }}
                        />
                        <Tab.Screen
                            name="Settings"
                            component={SettingsPage}
                            options={{
                                tabBarIcon: ({ color }) => (
                                    <MaterialIcons name="settings" size={24} color={color} />
                                )
                            }}
                        />
                    </Tab.Navigator>
                </NavigationIndependentTree>
            </View>
            <ThemedView style={[styles.stacksContainer, { backgroundColor: colors.tabletBackground }]}>
                <NavigationIndependentTree>
                    <NavigationContainer ref={rightNavRef}>
                        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.tabletBackground } }}>
                            <Stack.Screen
                                name='empty'
                                component={EmptyState}
                            />
                            <Stack.Screen
                                name='chatId'
                                component={ChatId}
                            />
                            <Stack.Screen
                                name='subSetting'
                                component={SubSettingPage}
                            />
                            <Stack.Screen
                                name='targetUserProfile'
                                component={TargetUserProfile}
                            />
                        </Stack.Navigator>
                    </NavigationContainer>
                </NavigationIndependentTree>
            </ThemedView>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        flexDirection: 'row',
        paddingRight: 16,
        gap: 8
    },
    tabsContainer: {
        height: '100%',
        borderRadius: 16,
        overflow: 'hidden',
    },
    stacksContainer: {
        flex: 1,
        borderRadius: 16,
        overflow: 'hidden'
    },
    emptyContainer: {
        flex: 1
    },
});
