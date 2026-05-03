import GeneralSettings from '@/components/general-settings'
import PrivacySettings from '@/components/privacy-settings'
import ProfileSettings from '@/components/profile-settings'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { db } from '@/db/client'
import { currentUser } from '@/db/schema'
import { authClient } from '@/lib/auth-client'
import { encryptTextForRecipients } from '@/lib/text-encryption'
import { rightNavRef } from '@/store/right-nav-ref'
import { useProfileStore } from '@/store/use-update-profile-store'
import { RouteProp } from '@react-navigation/native'
import { eq } from 'drizzle-orm'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useState } from 'react'
import { Alert, StyleSheet, useColorScheme } from 'react-native'
import { ActivityIndicator, Appbar } from 'react-native-paper'

type SubSettingPageProps = {
    route?: RouteProp<{ subSetting: { href: string } }, 'subSetting'>
}

const SubSettingPage = ({ route }: SubSettingPageProps) => {
    const { data: session } = authClient.useSession()
    const localParams = useLocalSearchParams<{ href?: string }>();
    const href = route?.params?.href ?? localParams.href;
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]
    const {
        firstName, lastName,
        setOriginals, canSave, about,
        originalFirstName, originalLastName,
    } = useProfileStore()

    const [saving, setSaving] = useState(false)

    const handleBack = () => {
        if (rightNavRef.isReady()) {
            rightNavRef.goBack()
            return
        }

        router.back()
    }

    const handleUpdateProfile = async () => {
        if (!canSave()) return
        setSaving(true)
        try {
            const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()

            const payload: {
                name?: string
                aboutCiphertext?: string
                aboutEncryptedAesKey?: string
                aboutIv?: string
            } = {}

            const { originalAbout } = useProfileStore.getState()
            const hasNameChanged = fullName !== `${originalFirstName.trim()} ${originalLastName.trim()}`.trim()
            const hasAboutChanged = about.trim() !== originalAbout.trim()

            if (hasNameChanged) {
                payload.name = fullName
            }

            if (hasAboutChanged) {
                if (about.trim()) {
                    const encrypted = await encryptTextForRecipients(
                        about.trim(),
                        session!.user.id,
                        [] // pass recipients array here if you have contacts
                    )
                    payload.aboutCiphertext = encrypted.ciphertext
                    payload.aboutEncryptedAesKey = encrypted.encryptedAesKey
                    payload.aboutIv = encrypted.iv
                } else {
                    payload.aboutCiphertext = ''
                    payload.aboutEncryptedAesKey = ''
                    payload.aboutIv = ''
                }
            }

            if (!hasNameChanged && !hasAboutChanged) {
                setSaving(false)
                return
            }

            const { error } = await authClient.updateUser(payload)
            if (error) throw new Error(error.message || 'Failed to update profile')

            if (session?.user.id) {
                await db.update(currentUser)
                    .set({
                        ...(hasNameChanged && { name: fullName }),
                        ...(hasAboutChanged && {
                            about_ciphertext: payload.aboutCiphertext ?? '',
                            about_iv: payload.aboutIv ?? '',
                        }),
                    })
                    .where(eq(currentUser.id, session.user.id))
            }

            setOriginals(firstName.trim(), lastName.trim(), about.trim())

        } catch (e: any) {
            Alert.alert('Save failed', e.message || 'Something went wrong. Please try again.')
        } finally {
            setSaving(false)
        }
    }

    const getTitle = () => {
        switch (href) {
            case 'general-settings':
                return 'General';
            case 'profile-settings':
                return 'Profile';
            case 'account-settings':
                return 'Account';
            case 'privacy-settings':
                return 'Privacy';
            case 'chats-settings':
                return 'Chats';
            case 'notifications-settings':
                return 'Notifications';
            case 'help-settings':
                return 'Help Center';
            default: return null;
        };
    };

    const getContent = () => {
        switch (href) {
            case 'general-settings':
                return <GeneralSettings />;
            case 'profile-settings':
                return <ProfileSettings />;
            case 'account-settings':
                return null;
            case 'privacy-settings':
                return <PrivacySettings />;
            case 'chats-settings':
                return null;
            case 'notifications-settings':
                return null;
            case 'help-settings':
                return null;
            default: return null;
        }
    };

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header
                style={{
                    backgroundColor: colors.background,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.indicator + '33'
                }}
            >
                <Appbar.BackAction onPress={handleBack} />
                <Appbar.Content title={getTitle()} />
                {href === 'profile-settings' && (
                    <Appbar.Action
                        icon={saving ? () => <ActivityIndicator size={20} color={colors.text} /> : 'check'}
                        onPress={handleUpdateProfile}
                        disabled={saving || !canSave}
                    />
                )}
            </Appbar.Header>
            {getContent()}
        </ThemedView>
    )
}

export default SubSettingPage

const styles = StyleSheet.create({
    main: {
        flex: 1
    }
})
