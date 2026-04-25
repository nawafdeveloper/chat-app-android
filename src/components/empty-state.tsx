import { Colors } from '@/constants/theme';
import { ImageBackground } from 'expo-image';
import React from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

const EmptyState = () => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];
    const isDark = scheme === 'dark';

    return (
        <ImageBackground
            source={
                isDark
                    ? require('../../assets/bg-pattern-dark.png')
                    : require('../../assets/bg-pattern-light.png')
            }
            contentFit="cover"
            style={[styles.emptyContainer, { backgroundColor: colors.card + '44' }]}>

        </ImageBackground>
    )
}

export default EmptyState

const styles = StyleSheet.create({
    emptyContainer: {
        flex: 1
    },
})