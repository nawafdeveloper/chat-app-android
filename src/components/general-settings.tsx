import { Colors } from '@/constants/theme'
import React from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { Icon, TouchableRipple } from 'react-native-paper'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

const GeneralSettings = () => {
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']

    return (
        <ThemedView style={styles.main}>
            <ThemedView style={styles.sectionContainer}>
                <ThemedText style={[styles.sectionHeading, { color: colors.textSecondary }]}>Language</ThemedText>
                <TouchableRipple>
                    <ThemedView style={[styles.dropDownContainer, { backgroundColor: colors.card, borderBottomColor: colors.indicator }]}>
                        <ThemedText>English</ThemedText>
                        <Icon
                            source="unfold-more-horizontal"
                            color={colors.text}
                            size={20}
                        />
                    </ThemedView>
                </TouchableRipple>
            </ThemedView>
            <ThemedView style={styles.sectionContainer}>
                <ThemedText style={[styles.sectionHeading, { color: colors.textSecondary }]}>Font scaling</ThemedText>
                <TouchableRipple>
                    <ThemedView style={[styles.dropDownContainer, { backgroundColor: colors.card, borderBottomColor: colors.indicator }]}>
                        <ThemedText>100%</ThemedText>
                        <Icon
                            source="unfold-more-horizontal"
                            color={colors.text}
                            size={20}
                        />
                    </ThemedView>
                </TouchableRipple>
            </ThemedView>
        </ThemedView>
    )
}

export default GeneralSettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24
    },
    sectionContainer: {
        flexDirection: 'column',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        gap: 8,
    },
    sectionHeading: {
        fontSize: 14,
        fontWeight: '400'
    },
    dropDownContainer: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderTopRightRadius: 4,
        borderTopLeftRadius: 4,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%'
    },
})