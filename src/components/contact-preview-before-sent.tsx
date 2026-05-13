import { ChatAvatar } from "@/components/decrypted-chat-avatar";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Colors } from "@/constants/theme";
import { useSendChatMessage } from "@/hooks/use-send-chat-message";
import { useContactPreviewBeforeSentStore } from "@/store/contact-preview-before-sent";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import type { Contact } from "@/types/contacts.type";
import React, { memo, useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    useColorScheme,
} from "react-native";
import { Appbar, Checkbox, Searchbar } from "react-native-paper";

type ContactRowProps = {
    contact: Contact;
    selected: boolean;
    colors: typeof Colors.light | typeof Colors.dark;
    disabled: boolean;
    onToggle: (contact: Contact) => void;
};

const ContactRow = memo(({ contact, selected, colors, disabled, onToggle }: ContactRowProps) => {
    const displayName =
        `${contact.contact_first_name ?? ""} ${contact.contact_second_name ?? ""}`.trim() ||
        contact.contact_number;

    return (
        <Pressable
            disabled={disabled}
            style={({ pressed }) => [
                styles.listItem,
                {
                    backgroundColor: selected
                        ? colors.card
                        : pressed
                            ? colors.indicator + "22"
                            : "transparent",
                },
            ]}
            onPress={() => onToggle(contact)}
        >
            <ChatAvatar
                userId={contact.linked_user_id ?? contact.contact_id}
                imageUrl={contact.contact_avatar}
                displayName={displayName}
                style={styles.avatar}
                chatType={undefined}
            />
            <ThemedView style={styles.contactText}>
                <ThemedText numberOfLines={1} style={styles.contactName}>
                    {displayName}
                </ThemedText>
                <ThemedText numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 13 }}>
                    {contact.contact_number}
                </ThemedText>
            </ThemedView>
            <Checkbox.Android
                status={selected ? "checked" : "unchecked"}
                color="#25D366"
                uncheckedColor={colors.textSecondary}
            />
        </Pressable>
    );
});
ContactRow.displayName = "ContactRow";

const ContactPreviewBeforeSent = () => {
    const scheme = useColorScheme();
    const resolvedScheme = scheme === "unspecified" ? "light" : scheme ?? "light";
    const colors = Colors[resolvedScheme];
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const { sendContact } = useSendChatMessage();
    const {
        selectedContactIds,
        toggleContact,
        hide,
    } = useContactPreviewBeforeSentStore();

    const [isSearchFocus, setIsSearchFocus] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [isSending, setIsSending] = useState(false);

    const selectedContacts = useMemo(
        () => contacts.filter((contact) => selectedContactIds.includes(contact.contact_id)),
        [contacts, selectedContactIds]
    );
    const filteredContacts = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        if (!query) {
            return contacts;
        }

        return contacts.filter((contact) =>
            `${contact.contact_first_name ?? ""} ${contact.contact_second_name ?? ""}`
                .toLowerCase()
                .includes(query) ||
            contact.contact_number.includes(searchQuery)
        );
    }, [contacts, searchQuery]);

    const handleSend = async () => {
        if (selectedContacts.length === 0 || isSending) {
            return;
        }

        setIsSending(true);
        try {
            let allSent = true;
            for (const contact of selectedContacts) {
                const sent = await sendContact({ contact });
                allSent = allSent && sent;
            }

            if (allSent) {
                hide();
            }
        } finally {
            setIsSending(false);
        }
    };

    const renderContact = useCallback(
        ({ item }: { item: Contact }) => (
            <ContactRow
                contact={item}
                selected={selectedContactIds.includes(item.contact_id)}
                colors={colors}
                disabled={isSending}
                onToggle={toggleContact}
            />
        ),
        [colors, isSending, selectedContactIds, toggleContact]
    );

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header
                style={{
                    backgroundColor: colors.background,
                    borderBottomColor: colors.indicator + "33",
                    borderBottomWidth: 1,
                }}
            >
                {isSearchFocus ? (
                    <Searchbar
                        placeholder="Search"
                        onChangeText={setSearchQuery}
                        value={searchQuery}
                        onIconPress={() => {
                            setIsSearchFocus(false);
                            setSearchQuery("");
                        }}
                        icon="arrow-left"
                        autoFocus
                        style={{ backgroundColor: colors.card, flex: 1 }}
                        cursorColor="#25D366"
                    />
                ) : (
                    <>
                        <Appbar.BackAction disabled={isSending} onPress={hide} />
                        <Appbar.Content
                            title="Select contact"
                            subtitle={`${selectedContactIds.length || contacts.length} ${selectedContactIds.length ? "selected" : "contacts"}`}
                        />
                        <Appbar.Action icon="magnify" onPress={() => setIsSearchFocus(true)} />
                    </>
                )}
            </Appbar.Header>

            <FlatList
                data={filteredContacts}
                keyExtractor={(contact) => contact.contact_id}
                renderItem={renderContact}
                ListHeaderComponent={
                    <ThemedText style={[styles.sectionHeader, { color: colors.textSecondary }]}>
                        CONTACTS
                    </ThemedText>
                }
                contentContainerStyle={styles.listContent}
            />

            {selectedContactIds.length > 0 && (
                <Pressable
                    disabled={isSending}
                    style={styles.sendFab}
                    onPress={handleSend}
                >
                    {isSending ? (
                        <ActivityIndicator size="small" color={colors.background} />
                    ) : (
                        <ThemedText style={[styles.sendText, { color: colors.background }]}>
                            Send
                        </ThemedText>
                    )}
                </Pressable>
            )}
        </ThemedView>
    );
};

export default ContactPreviewBeforeSent;

const styles = StyleSheet.create({
    main: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 96,
        gap: 6,
    },
    sectionHeader: {
        fontSize: 12,
        fontWeight: "600",
        letterSpacing: 0.5,
        paddingHorizontal: 24,
        paddingVertical: 10,
    },
    listItem: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 24,
        paddingVertical: 8,
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    contactText: {
        flex: 1,
        minWidth: 0,
        backgroundColor: "transparent",
    },
    contactName: {
        fontSize: 16,
        fontWeight: "500",
        lineHeight: 19,
    },
    sendFab: {
        position: "absolute",
        right: 16,
        bottom: 16,
        minWidth: 76,
        height: 52,
        borderRadius: 26,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#25D366",
        paddingHorizontal: 18,
    },
    sendText: {
        fontSize: 16,
        fontWeight: "700",
    },
});
