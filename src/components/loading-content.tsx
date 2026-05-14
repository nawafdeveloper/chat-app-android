import { Colors } from '@/constants/theme'
import React from 'react'
import { StyleSheet, useColorScheme, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'
import YaHlaLogo from './ui/yahla-logo'

type LoadingContentProps = {
    title: string;
    percentage: number;
};

const LoadingContent = ({ title, percentage }: LoadingContentProps) => {
    const scheme = useColorScheme();
    const insets = useSafeAreaInsets();
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light';
    const colors = Colors[resolvedScheme];
    const clampedPercentage = Math.max(0, Math.min(100, Math.round(percentage)));

    return (
        <ThemedView style={[styles.main, { paddingTop: insets.top, paddingBottom: insets.bottom * 3 }]}>
            <ThemedView style={styles.topContainer}>
                <YaHlaLogo color={colors.textSecondary + '33'} size={44} />
                <ThemedText>
                    {`${title} [${clampedPercentage}%]`}
                </ThemedText>
                <ThemedView style={[styles.barContainer, { backgroundColor: colors.card }]}>
                    <View style={[styles.bar, { width: `${clampedPercentage}%` }]} />
                </ThemedView>
            </ThemedView>
            <ThemedText style={[styles.bottomDescription, { color: colors.textSecondary + '60' }]}>
                {`Don't close the app, your messages are downloading`}
            </ThemedText>
        </ThemedView>
    )
}

export default LoadingContent

const styles = StyleSheet.create({
    main: {
        flex: 1,
        justifyContent: 'space-between',
        alignItems: 'center',
        flexDirection: 'column',
    },
    topContainer: {
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12
    },
    bottomDescription: {
        fontSize: 14,
        fontWeight: '400',
        maxWidth: '70%',
        textAlign: 'center'
    },
    barContainer: {
        width: 300,
        height: 3,
        borderRadius: 99,
        overflow: 'hidden',
    },
    bar: {
        height: '100%',
        borderRadius: 99,
        backgroundColor: '#25D366',
    }
})
