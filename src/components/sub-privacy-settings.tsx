import { Colors } from '@/constants/theme'
import { authClient } from '@/lib/auth-client'
import React, { useEffect, useState } from 'react'
import { StyleSheet, Text, useColorScheme, View } from 'react-native'
import { RadioButton, TouchableRipple } from 'react-native-paper'
import { ThemedText } from './themed-text'
import { ThemedView } from './themed-view'

type Props = {
    href: string | undefined;
}

type PrivacySetting = 'all' | 'nobody';
type PrivacyUserKey = 'whoCanSeeLastSeen' | 'whoCanSeeProfilePicture' | 'whoCanSeeAbout';

const getSettingMeta = (href: string): { title: string; userKey: PrivacyUserKey } => {
    if (href.includes('last-seen')) {
        return {
            title: 'Who can see my last seen',
            userKey: 'whoCanSeeLastSeen',
        };
    }

    if (href.includes('profile-seen')) {
        return {
            title: 'Who can see my profile picture',
            userKey: 'whoCanSeeProfilePicture',
        };
    }

    if (href.includes('about-seen')) {
        return {
            title: 'Who can see my about information',
            userKey: 'whoCanSeeAbout',
        };
    }

    return {
        title: 'Who can see my personal information',
        userKey: 'whoCanSeeLastSeen',
    };
};

const SubPrivacySettings = ({ href }: Props) => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];
    const { data: session } = authClient.useSession();
    const effectiveHref = href ?? '';
    const meta = React.useMemo(() => getSettingMeta(effectiveHref), [effectiveHref]);

    const currentSetting = (session?.user[meta.userKey] as PrivacySetting) || 'all';
    const [value, setValue] = useState<PrivacySetting>(currentSetting);
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        setValue(currentSetting);
    }, [currentSetting]);

    const handleValueChange = async (newValue: string) => {
        if (newValue === 'all' || newValue === 'nobody') {
            if (newValue === value || isUpdating) {
                return;
            }

            const previousValue = value;
            setValue(newValue);
            setIsUpdating(true);

            try {
                const { error } = await authClient.updateUser({
                    [meta.userKey]: newValue,
                });

                if (error) {
                    throw new Error(error.message || 'Failed to update privacy setting.');
                }
            } catch (error) {
                setValue(previousValue);
                console.log('Failed to update privacy setting:', error);
            } finally {
                setIsUpdating(false);
            }
        }
    };

    if (!href) {
        return null;
    }

    return (
        <ThemedView style={styles.main}>
            <ThemedText style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                {meta.title}
            </ThemedText>
            <RadioButton.Group onValueChange={handleValueChange} value={value}>
                <TouchableRipple
                    disabled={isUpdating}
                    onPress={() => handleValueChange('all')}
                >
                    <View style={styles.radioOption}>
                        <Text style={[styles.radioText, { color: colors.text }]}>Everybody</Text>
                        <RadioButton value="all" color='#25D366' disabled={isUpdating} />
                    </View>
                </TouchableRipple>
                <TouchableRipple
                    disabled={isUpdating}
                    onPress={() => handleValueChange('nobody')}
                >
                    <View style={styles.radioOption}>
                        <Text style={[styles.radioText, { color: colors.text }]}>Nobody</Text>
                        <RadioButton value="nobody" color='#25D366' disabled={isUpdating} />
                    </View>
                </TouchableRipple>
            </RadioButton.Group>
        </ThemedView>
    )
}

export default SubPrivacySettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 10
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '400'
    },
    radioOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8
    },
    radioText: {
        fontSize: 16
    }
})
