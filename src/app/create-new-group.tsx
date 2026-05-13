import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { useCreateGroupChat } from '@/hooks/use-create-group-chat'
import { createUploadFileFromLocalUri } from '@/lib/local-upload-file'
import { toContactDisplayName } from '@/lib/contact-utils'
import { useNewGroupStore } from '@/store/use-new-group-store'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React from 'react'
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    useColorScheme,
    View,
} from 'react-native'
import { Appbar, Button, HelperText, Icon, TextInput } from 'react-native-paper'

const CreateNewGroup = () => {
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]
    const selectedContacts = useNewGroupStore((state) => state.selectedContacts)
    const groupName = useNewGroupStore((state) => state.groupName)
    const groupAvatarUri = useNewGroupStore((state) => state.groupAvatarUri)
    const setGroupName = useNewGroupStore((state) => state.setGroupName)
    const setGroupAvatar = useNewGroupStore((state) => state.setGroupAvatar)
    const removeContact = useNewGroupStore((state) => state.removeContact)
    const storeError = useNewGroupStore((state) => state.error)
    const { createGroupChat, isCreating, error } = useCreateGroupChat()
    const canCreate =
        selectedContacts.length > 0 &&
        groupName.trim().length > 0 &&
        !isCreating

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to your photo library.')
            return
        }

        const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        })

        if (picked.canceled || !picked.assets[0]) {
            return
        }

        const asset = picked.assets[0]
        const file = await createUploadFileFromLocalUri({
            uri: asset.uri,
            fallbackName: asset.fileName ?? `group-avatar-${Date.now()}.jpg`,
            mimeType: asset.mimeType ?? 'image/jpeg',
            size: asset.fileSize ?? null,
        })

        setGroupAvatar(asset.uri, file)
    }

    const handleCreate = async () => {
        const created = await createGroupChat()
        if (created) {
            router.replace('/chatId')
        }
    }

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header style={{ backgroundColor: colors.background, borderBottomColor: colors.indicator + '33', borderBottomWidth: 1 }}>
                <Appbar.BackAction onPress={() => router.back()} disabled={isCreating} />
                <Appbar.Content title='Create new group' subtitle={`${selectedContacts.length} members`} />
            </Appbar.Header>
            <ScrollView
                automaticallyAdjustKeyboardInsets
                contentContainerStyle={styles.contentContainer}
                keyboardShouldPersistTaps='handled'
            >
                <ThemedView style={styles.avatarContainer}>
                    <Pressable
                        style={[styles.avatarButton, { backgroundColor: colors.avatarBg }]}
                        onPress={pickImage}
                        disabled={isCreating}
                    >
                        {groupAvatarUri ? (
                            <Image
                                source={{ uri: groupAvatarUri }}
                                contentFit='cover'
                                style={styles.groupAvatar}
                            />
                        ) : (
                            <Icon
                                source='account-group-outline'
                                color={colors.avatarIcon}
                                size={62}
                            />
                        )}
                        {isCreating ? (
                            <View style={styles.avatarOverlay}>
                                <ActivityIndicator color='#fff' size='small' />
                            </View>
                        ) : (
                            <ThemedView style={[styles.cameraIcon, { backgroundColor: Colors.dark.card }]}>
                                <Icon
                                    source='camera-plus-outline'
                                    color={Colors.dark.text}
                                    size={22}
                                />
                            </ThemedView>
                        )}
                    </Pressable>
                </ThemedView>

                <TextInput
                    label='Group name'
                    value={groupName}
                    onChangeText={setGroupName}
                    disabled={isCreating}
                    mode='flat'
                    cursorColor='#25D366'
                    underlineColor={colors.indicator}
                    activeUnderlineColor='#25D366'
                    style={{
                        backgroundColor: colors.background,
                        borderRadius: 0,
                    }}
                />

                <ThemedView style={styles.membersSection}>
                    <ThemedText style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                        MEMBERS
                    </ThemedText>
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.membersRow}
                    >
                        {selectedContacts.map((contact) => {
                            const displayName = toContactDisplayName(contact)

                            return (
                                <View key={contact.contact_id} style={styles.memberAvatarWrap}>
                                    <ChatAvatar
                                        userId={contact.contact_id}
                                        imageUrl={contact.contact_avatar}
                                        displayName={displayName}
                                        style={styles.memberAvatar}
                                        chatType={undefined}
                                    />
                                    <Pressable
                                        style={[styles.removeMemberButton, { backgroundColor: colors.backgroundElement }]}
                                        onPress={() => removeContact(contact.contact_id)}
                                        disabled={isCreating}
                                    >
                                        <Icon source='close' color={colors.text} size={14} />
                                    </Pressable>
                                </View>
                            )
                        })}
                    </ScrollView>
                </ThemedView>

                <HelperText
                    type='error'
                    visible={Boolean(error || storeError)}
                    style={styles.helperText}
                >
                    {error || storeError}
                </HelperText>

                <Button
                    mode='contained'
                    buttonColor='#25D366'
                    textColor='#1C1E21'
                    disabled={!canCreate}
                    loading={isCreating}
                    onPress={handleCreate}
                    style={styles.createButton}
                >
                    Create group
                </Button>
            </ScrollView>
        </ThemedView>
    )
}

export default CreateNewGroup

const styles = StyleSheet.create({
    main: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 16,
        paddingTop: 22,
        paddingBottom: 36,
        gap: 24,
        maxWidth: 430,
        width: '100%',
        marginHorizontal: 'auto',
    },
    avatarContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
    },
    avatarButton: {
        position: 'relative',
        width: 112,
        height: 112,
        borderRadius: 56,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'visible',
    },
    groupAvatar: {
        width: 112,
        height: 112,
        borderRadius: 56,
    },
    avatarOverlay: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 56,
        backgroundColor: 'rgba(0,0,0,0.45)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cameraIcon: {
        position: 'absolute',
        right: 2,
        bottom: 2,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
    },
    membersSection: {
        gap: 12,
    },
    sectionHeading: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
    },
    membersRow: {
        gap: 14,
        paddingRight: 16,
        paddingVertical: 4,
    },
    memberAvatarWrap: {
        width: 58,
        height: 58,
    },
    memberAvatar: {
        width: 54,
        height: 54,
        borderRadius: 27,
    },
    removeMemberButton: {
        position: 'absolute',
        right: 0,
        top: -2,
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 2,
    },
    helperText: {
        marginTop: -14,
        marginBottom: -10,
    },
    createButton: {
        borderRadius: 99,
        marginTop: 2,
    },
})
