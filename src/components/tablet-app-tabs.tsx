import ChatId from '@/app/chatId';
import AppTabs from '@/components/app-tabs';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { rightNavRef, type RightNavParamList } from '@/store/right-nav-ref';
import { NavigationContainer, NavigationIndependentTree } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Dimensions, StyleSheet, useColorScheme } from 'react-native';
import EmptyState from './empty-state';

const { width: screenWidth } = Dimensions.get('window');
const Stack = createNativeStackNavigator<RightNavParamList>();

export default function TabletAppTabs() {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

    return (
        <ThemedView style={styles.container}>
            <ThemedView style={[styles.tabsContainer, { width: screenWidth * 0.43, borderRightColor: colors.card + '44' }]}>
                <NavigationIndependentTree>
                    <AppTabs />
                </NavigationIndependentTree>
            </ThemedView>
            <ThemedView style={styles.stacksContainer}>
                <NavigationIndependentTree>
                    <NavigationContainer ref={rightNavRef}>
                        <Stack.Navigator screenOptions={{ headerShown: false }}>
                            <Stack.Screen
                                name='empty'
                                component={EmptyState}
                            />
                            <Stack.Screen
                                name='chatId'
                                component={ChatId}
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
    },
    tabsContainer: {
        height: '100%',
        borderRightWidth: 1
    },
    stacksContainer: {
        flex: 1
    },
    emptyContainer: {
        flex: 1
    },
});
