import { ChatAvatar } from '@/components/decrypted-chat-avatar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useIsTablet } from '@/context/screen-checking-context';
import { authClient } from '@/lib/auth-client';
import { useContactDirectoryStore } from '@/store/use-contact-directory-store';
import { rightNavRef } from '@/store/right-nav-ref';
import { useActiveChatStore } from '@/store/use-active-chat-store';
import { useNewGroupStore } from '@/store/use-new-group-store';
import { Contact } from '@/types/contacts.type';
import { router } from 'expo-router';
import React, { memo, useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useColorScheme } from 'react-native';
import { Appbar, Icon, Searchbar } from 'react-native-paper';

const ContactItem = memo(({ c, onPress }: { c: Contact; onPress: () => void }) => (
    <Pressable onPress={onPress} style={[styles.listItem, { paddingHorizontal: 24 }]}>
        <ChatAvatar
            userId={c.contact_id}
            imageUrl={c.contact_avatar}
            displayName={`${c.contact_first_name} ${c.contact_second_name}`}
            style={styles.avatar}
            chatType={undefined}
        />
        <ThemedText>
            {`${c.contact_first_name} ${c.contact_second_name}`.trim() || c.contact_number}
        </ThemedText>
    </Pressable>
));
ContactItem.displayName = 'ContactItem';

const CreateChat = () => {
    const { data: session } = authClient.useSession()
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]
    const isTablet = useIsTablet()
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const openDirectContactChat = useActiveChatStore((state) => state.openDirectContactChat);
    const resetGroupStore = useNewGroupStore((state) => state.resetStore);

    const [isSearchFocus, setIsSearchFocus] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const currentUserId = session?.user.id ?? null
    const currentPhone = (session?.user as { phoneNumber?: string | null } | undefined)
        ?.phoneNumber ?? null

    const handleContactPress = useCallback((contact: Contact) => {
        if (!currentPhone || !currentUserId) {
            return
        }

        const chatId = openDirectContactChat({
            contact,
            currentPhone,
            currentUserId,
        })

        if (isTablet && rightNavRef.isReady()) {
            rightNavRef.navigate('chatId', { chatId })
            return
        }

        router.navigate({
            pathname: '/chatId',
            params: { chatId },
        })
    }, [currentPhone, currentUserId, isTablet, openDirectContactChat])

    const renderContact = useCallback(({ item }: { item: Contact }) => (
        <ContactItem c={item} onPress={() => handleContactPress(item)} />
    ), [handleContactPress]);

    const renderHeader = useCallback(() => (
        <ThemedView>
            <ThemedView style={styles.headerButtons}>
                <Pressable
                    onPress={() => {
                        resetGroupStore();
                        router.push('/create-group-select-members');
                    }}
                    style={[styles.listItem, { paddingRight: 16, paddingLeft: 8 }]}
                >
                    <ThemedView style={[styles.avatar, { backgroundColor: '#25D366' }]}>
                        <Icon source="account-multiple-plus" color={colors.background} size={28} />
                    </ThemedView>
                    <ThemedText>New group</ThemedText>
                </Pressable>
                <Pressable onPress={() => router.push('/create-new-contact')} style={[styles.listItem, { paddingRight: 16, paddingLeft: 8 }]}>
                    <ThemedView style={[styles.avatar, { backgroundColor: '#25D366' }]}>
                        <Icon source="account-plus" color={colors.background} size={28} />
                    </ThemedView>
                    <ThemedText>New contact</ThemedText>
                </Pressable>
            </ThemedView>
            <ThemedText style={[styles.sectionHeader, { color: colors.textSecondary }]}>
                CONTACTS
            </ThemedText>
        </ThemedView>
    ), [colors.background, colors.textSecondary, resetGroupStore]);

    const filteredContacts = searchQuery.trim()
        ? contacts.filter((c) =>
            `${c.contact_first_name} ${c.contact_second_name}`
                .toLowerCase()
                .includes(searchQuery.toLowerCase()) ||
            c.contact_number.includes(searchQuery)
        )
        : contacts;

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header
                style={{ backgroundColor: colors.background, borderBottomColor: colors.indicator + '33', borderBottomWidth: 1 }}
            >
                {isSearchFocus ? (
                    <Searchbar
                        placeholder="Search"
                        onChangeText={setSearchQuery}
                        value={searchQuery}
                        onIconPress={() => {
                            setIsSearchFocus(false)
                            setSearchQuery('')
                        }}
                        icon="arrow-left"
                        autoFocus
                        style={{ backgroundColor: colors.card, flex: 1 }}
                        cursorColor={'#25D366'}
                    />
                ) : (
                    <>
                        <Appbar.BackAction onPress={() => router.back()} />
                        <Appbar.Content
                            title={'Select contact'}
                            subtitle={`${contacts.length} contacts`}
                        />
                        <Appbar.Action icon="magnify" onPress={() => setIsSearchFocus(true)} />
                    </>
                )}
            </Appbar.Header>
            <FlatList
                data={filteredContacts}
                keyExtractor={(c) => c.contact_id}
                renderItem={renderContact}
                ListHeaderComponent={renderHeader}
                contentContainerStyle={styles.listContent}
            />
        </ThemedView>
    )
}

export default CreateChat

const styles = StyleSheet.create({
    main: {
        flex: 1
    },
    headerButtons: {
        flexDirection: 'column',
        gap: 10,
        padding: 16
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: '600',
        letterSpacing: 0.5,
        paddingHorizontal: 24,
        paddingVertical: 8,
    },
    listContent: {
        paddingBottom: 80,
        gap: 6
    },
})
