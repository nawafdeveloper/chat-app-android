import { ChatAvatar } from '@/components/decrypted-chat-avatar'
import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { Colors } from '@/constants/theme'
import { toContactDisplayName } from '@/lib/contact-utils'
import { useContactDirectoryStore } from '@/store/use-contact-directory-store'
import { useNewGroupStore } from '@/store/use-new-group-store'
import type { Contact } from '@/types/contacts.type'
import { router } from 'expo-router'
import React, { memo, useCallback, useMemo, useState } from 'react'
import { FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native'
import { Appbar, Icon, Searchbar } from 'react-native-paper'

type ThemeColors = (typeof Colors)[keyof typeof Colors]

const SelectableContactItem = memo(({
    contact,
    isSelected,
    onPress,
    colors,
}: {
    contact: Contact
    isSelected: boolean
    onPress: () => void
    colors: ThemeColors
}) => {
    const displayName = toContactDisplayName(contact)

    return (
        <Pressable
            style={({ pressed }) => [
                styles.listItem,
                { backgroundColor: pressed ? colors.backgroundElement : colors.background },
            ]}
            onPress={onPress}
        >
            <View style={styles.checkbox}>
                <Icon
                    source={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                    color={isSelected ? '#25D366' : colors.textSecondary}
                    size={26}
                />
            </View>
            <ChatAvatar
                userId={contact.contact_id}
                imageUrl={contact.contact_avatar}
                displayName={displayName}
                style={styles.avatar}
                chatType={undefined}
            />
            <View style={styles.contactText}>
                <ThemedText numberOfLines={1} style={styles.contactName}>
                    {displayName}
                </ThemedText>
                <ThemedText numberOfLines={1} style={[styles.contactPhone, { color: colors.textSecondary }]}>
                    {contact.contact_number}
                </ThemedText>
            </View>
        </Pressable>
    )
})

SelectableContactItem.displayName = 'SelectableContactItem'

const CreateGroupSelectMembers = () => {
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]
    const contacts = useContactDirectoryStore((state) => state.contacts)
    const selectedContacts = useNewGroupStore((state) => state.selectedContacts)
    const toggleContact = useNewGroupStore((state) => state.toggleContact)
    const isSelected = useNewGroupStore((state) => state.isSelected)
    const [isSearchFocus, setIsSearchFocus] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')

    const filteredContacts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase()

        if (!query) {
            return contacts
        }

        return contacts.filter((contact) =>
            toContactDisplayName(contact).toLowerCase().includes(query) ||
            contact.contact_number.includes(query)
        )
    }, [contacts, searchQuery])

    const renderContact = useCallback(({ item }: { item: Contact }) => (
        <SelectableContactItem
            contact={item}
            isSelected={isSelected(item.contact_id)}
            onPress={() => toggleContact(item)}
            colors={colors}
        />
    ), [colors, isSelected, toggleContact])

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
                        cursorColor='#25D366'
                    />
                ) : (
                    <>
                        <Appbar.BackAction onPress={() => router.back()} />
                        <Appbar.Content
                            title='Add group members'
                            subtitle={`${selectedContacts.length} selected`}
                        />
                        <Appbar.Action icon='magnify' onPress={() => setIsSearchFocus(true)} />
                    </>
                )}
            </Appbar.Header>
            <FlatList
                data={filteredContacts}
                keyExtractor={(contact) => contact.contact_id}
                renderItem={renderContact}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={() => (
                    <ThemedView style={styles.emptyContainer}>
                        <ThemedText style={{ color: colors.textSecondary }}>
                            No contacts found
                        </ThemedText>
                    </ThemedView>
                )}
            />
            <Pressable
                disabled={selectedContacts.length === 0}
                onPress={() => router.push('/create-new-group')}
                style={({ pressed }) => [
                    styles.nextButton,
                    {
                        backgroundColor:
                            selectedContacts.length === 0 ? '#25D36666' : '#25D366',
                        opacity: pressed ? 0.85 : 1,
                    },
                ]}
            >
                <Icon source='arrow-right' color='#1C1E21' size={28} />
            </Pressable>
        </ThemedView>
    )
}

export default CreateGroupSelectMembers

const styles = StyleSheet.create({
    main: {
        flex: 1,
    },
    listContent: {
        paddingVertical: 8,
        paddingBottom: 112,
    },
    listItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 24,
        paddingVertical: 9,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        marginRight: 12,
    },
    checkbox: {
        width: 32,
        marginRight: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    contactText: {
        flex: 1,
        justifyContent: 'center',
    },
    contactName: {
        fontSize: 16,
        fontWeight: '500',
    },
    contactPhone: {
        fontSize: 13,
        marginTop: 3,
    },
    emptyContainer: {
        paddingTop: 60,
        alignItems: 'center',
    },
    nextButton: {
        position: 'absolute',
        right: 22,
        bottom: 24,
        width: 58,
        height: 58,
        borderRadius: 29,
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 4,
    },
})
