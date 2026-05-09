import { RequestContact } from "@/helper/request-contact";
import { decryptStoredContact } from "@/lib/contact-crypto";
import { getDbContacts, upsertDbContacts } from "@/lib/upsert-db-contacts";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import type { Contact, StoredContactRecord } from "@/types/contacts.type";
import type * as ExpoContacts from "expo-contacts";

const API_BASE_URL = "https://halabakk-web.nawaf-alhasosah.workers.dev";

type MobileContactsResponse = {
    contacts: StoredContactRecord[];
    imported?: number;
};

type SyncMobileContactsParams = {
    currentUserId: string;
    cookies: string | null;
    onLoadingTitleChange?: (title: string) => void;
    onContactsLoaded?: (contacts: Contact[]) => void;
};

function getAuthHeaders(cookies: string | null) {
    return {
        Cookie: cookies || "",
        "Content-Type": "application/json",
    };
}

function extractPhoneNumbers(contacts: ExpoContacts.Contact[]) {
    return [
        ...new Set(
            contacts
                .flatMap((contact) =>
                    contact.phoneNumbers?.map((phoneNumber) =>
                        phoneNumber.number ?? phoneNumber.digits ?? ""
                    ) ?? []
                )
                .map((phoneNumber) => phoneNumber.trim())
                .filter(Boolean)
        ),
    ];
}

async function decryptContactsForStore(records: StoredContactRecord[]) {
    const decrypted = await Promise.all(
        records.map(async (contactRecord) => {
            try {
                return await decryptStoredContact(contactRecord);
            } catch {
                return null;
            }
        })
    );

    return decrypted.filter((contact): contact is Contact => contact !== null);
}

export async function hydrateLocalContacts({
    currentUserId,
    onContactsLoaded,
}: Pick<SyncMobileContactsParams, "currentUserId" | "onContactsLoaded">) {
    const cachedRecords = await getDbContacts();
    const cachedContacts = await decryptContactsForStore(cachedRecords);

    useContactDirectoryStore
        .getState()
        .setContacts(currentUserId, cachedContacts);
    onContactsLoaded?.(cachedContacts);

    return cachedContacts;
}

export async function syncMobileContacts({
    currentUserId,
    cookies,
    onLoadingTitleChange,
    onContactsLoaded,
}: SyncMobileContactsParams) {
    onLoadingTitleChange?.("Loading your contacts");

    const deviceContacts = await RequestContact();
    const phoneNumbers = extractPhoneNumbers(deviceContacts);

    if (deviceContacts.length === 0 && phoneNumbers.length === 0) {
        return hydrateLocalContacts({ currentUserId, onContactsLoaded });
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/mobile/contacts`, {
            method: "POST",
            headers: getAuthHeaders(cookies),
            credentials: "omit",
            body: JSON.stringify({
                contacts: deviceContacts,
                phoneNumbers,
            }),
        });

        if (!response.ok) {
            throw new Error("Failed to sync contacts");
        }

        const payload = (await response.json()) as MobileContactsResponse;
        await upsertDbContacts(payload.contacts);
    } catch (error) {
        console.log("Failed to sync mobile contacts, using local cache:", error);
    }

    return hydrateLocalContacts({ currentUserId, onContactsLoaded });
}
