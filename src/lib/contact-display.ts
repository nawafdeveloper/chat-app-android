import { resolveDirectChatPartner } from "@/lib/chat-utils";
import { phoneValuesMatch } from "@/lib/contact-utils";
import type { ChatItemType } from "@/types/chats.type";
import type { Contact } from "@/types/contacts.type";

export function getContactDisplayName(contact: Contact): string {
    return (
        `${contact.contact_first_name ?? ""} ${contact.contact_second_name ?? ""}`.trim() ||
        contact.contact_number
    );
}

export function findContactByUserId(
    contacts: Contact[],
    linkedUserId?: string | null
): Contact | null {
    if (!linkedUserId) {
        return null;
    }

    return (
        contacts.find((contact) => contact.linked_user_id === linkedUserId) ?? null
    );
}

export function findContactByPhone(
    contacts: Contact[],
    phone?: string | null
): Contact | null {
    if (!phone) {
        return null;
    }

    return (
        contacts.find((contact) => phoneValuesMatch(contact.contact_number, phone)) ??
        null
    );
}

export function resolveDirectChatContact(
    chat: ChatItemType,
    contacts: Contact[],
    currentPhone?: string | null
): Contact | null {
    if (chat.chat_type !== "single") {
        return null;
    }

    return (
        findContactByUserId(contacts, chat.recipient_user_id) ??
        findContactByPhone(
            contacts,
            chat.contact_phone ?? resolveDirectChatPartner(chat.chat_id, currentPhone)
        )
    );
}
