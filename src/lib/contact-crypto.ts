import {
    createContactSearchValue,
    deriveContactLetterGroup,
} from "@/lib/contact-utils";
import { isManagedProfileImageUrl } from "@/lib/profile-image";
import { decryptText, encryptTextForRecipients, TextRecipientPublicKeyInput } from "@/lib/text-encryption";
import type {
    Contact,
    ContactPayload,
    StoredContactRecord,
} from "@/types/contacts.type";

export async function encryptContactPayload(
    contact: ContactPayload,
    ownerUserId: string,
    recipients: TextRecipientPublicKeyInput[] = []
) {
    return encryptTextForRecipients(JSON.stringify(contact), ownerUserId, recipients);
}

export async function decryptStoredContact(
    record: StoredContactRecord
): Promise<Contact> {
    const decryptedPayload = await decryptText({
        ciphertext: record.contact_ciphertext,
        encryptedAesKey: record.contact_encrypted_aes_key,
        iv: record.contact_iv,
    });
    const parsed = JSON.parse(decryptedPayload) as ContactPayload;

    return {
        contact_id: record.contact_id,
        linked_user_id: record.linked_user_id,
        linked_user_public_key: record.linked_user_public_key || undefined,
        contact_first_name: parsed.contact_first_name?.trim() || undefined,
        contact_second_name: parsed.contact_second_name?.trim() || undefined,
        contact_number:
            record.linked_user_phone_number || parsed.contact_number,
        contact_avatar:
            record.linked_user_image &&
                !isManagedProfileImageUrl(record.linked_user_image)
                ? record.linked_user_image
                : parsed.contact_avatar,
        contact_bio: parsed.contact_bio?.trim() || undefined,
        contact_letter_group: deriveContactLetterGroup(parsed),
    };
}

export async function sha256Hex(input: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(input)
    );

    return Array.from(new Uint8Array(digest))
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}

export function matchesContactSearch(contact: Contact, query: string): boolean {
    return createContactSearchValue(contact).includes(query.trim().toLowerCase());
}
