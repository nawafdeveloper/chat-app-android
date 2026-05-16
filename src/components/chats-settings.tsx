import { Colors } from '@/constants/theme'
import { authClient } from '@/lib/auth-client'
import React, { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'
import { List, RadioButton, TouchableRipple } from 'react-native-paper'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

type MediaUploadQuality = 'std' | 'high'

const getSessionQuality = (value: unknown): MediaUploadQuality =>
    value === 'high' ? 'high' : 'std'

const ChatsSettings = () => {
    const { data: session } = authClient.useSession()
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const [quality, setQuality] = useState<MediaUploadQuality>(
        getSessionQuality(session?.user.mediaUploadQuality)
    )
    const [isUpdating, setIsUpdating] = useState(false)

    useEffect(() => {
        setQuality(getSessionQuality(session?.user.mediaUploadQuality))
    }, [session?.user.mediaUploadQuality])

    const handleQualityChange = async (nextQuality: string) => {
        if ((nextQuality !== 'std' && nextQuality !== 'high') || isUpdating) {
            return
        }

        if (nextQuality === quality) {
            return
        }

        const previousQuality = quality
        setQuality(nextQuality)
        setIsUpdating(true)

        try {
            const { error } = await authClient.updateUser({
                mediaUploadQuality: nextQuality,
            })

            if (error) {
                throw new Error(error.message || 'Failed to update media upload quality.')
            }
        } catch (error) {
            setQuality(previousQuality)
            console.log('Failed to update media upload quality:', error)
        } finally {
            setIsUpdating(false)
        }
    }

    return (
        <ScrollView style={{ flex: 1 }}>
            <ThemedView style={styles.main}>
                <ThemedView style={styles.sectionContainer}>
                    <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                        Media
                    </ThemedText>
                    <List.Item
                        title="Media upload quality"
                        description={quality === 'high' ? 'High quality' : 'Standard quality'}
                        descriptionStyle={{ color: colors.textSecondary }}
                        left={props => <List.Icon {...props} icon="image-size-select-large" color={colors.textSecondary} />}
                        style={{ borderBottomWidth: 1, borderBottomColor: colors.indicator + '33' }}
                    />
                    <RadioButton.Group onValueChange={handleQualityChange} value={quality}>
                        <TouchableRipple disabled={isUpdating} onPress={() => handleQualityChange('std')}>
                            <View style={styles.radioOption}>
                                <Text style={[styles.radioText, { color: colors.text }]}>Standard</Text>
                                <RadioButton value="std" color="#25D366" disabled={isUpdating} />
                            </View>
                        </TouchableRipple>
                        <TouchableRipple disabled={isUpdating} onPress={() => handleQualityChange('high')}>
                            <View style={styles.radioOption}>
                                <Text style={[styles.radioText, { color: colors.text }]}>High</Text>
                                <RadioButton value="high" color="#25D366" disabled={isUpdating} />
                            </View>
                        </TouchableRipple>
                    </RadioButton.Group>
                </ThemedView>
            </ThemedView>
        </ScrollView>
    )
}

export default ChatsSettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24,
    },
    sectionContainer: {
        flex: 1,
        gap: 10,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '400',
    },
    radioOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    radioText: {
        fontSize: 16,
    },
})
