import { Colors } from '@/constants/theme';
import React from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { ThemedView } from './themed-view';

const EmptyState = () => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

    return (
        <ThemedView style={[styles.emptyContainer, { backgroundColor: colors.background }]} />
    )
}

export default EmptyState

const styles = StyleSheet.create({
    emptyContainer: {
        flex: 1
    },
})