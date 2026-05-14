import { RequestContact } from "@/helper/request-contact";
import { decryptStoredContact } from "@/lib/contact-crypto";
import {
    reportMappedByteProgress,
    reportSyncProgress,
    requestJsonWithProgress,
    type SyncProgressCallback,
} from "@/lib/http-progress";
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
    onProgress?: SyncProgressCallback;
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
    onProgress,
    onContactsLoaded,
}: SyncMobileContactsParams) {
    onLoadingTitleChange?.("Loading your contacts");
    reportSyncProgress(onProgress, "Loading your contacts", 0);

    const deviceContacts = await RequestContact();
    reportSyncProgress(onProgress, "Loading your contacts", 15);

    const phoneNumbers = extractPhoneNumbers(deviceContacts);
    reportSyncProgress(onProgress, "Syncing your contacts", 20);

    if (deviceContacts.length === 0 && phoneNumbers.length === 0) {
        const contacts = await hydrateLocalContacts({ currentUserId, onContactsLoaded });
        reportSyncProgress(onProgress, "Loading your contacts", 100);
        return contacts;
    }

    try {
        const payload = await requestJsonWithProgress<MobileContactsResponse>(`${API_BASE_URL}/api/mobile/contacts`, {
            method: "POST",
            headers: getAuthHeaders(cookies),
            body: JSON.stringify({
                contacts: deviceContacts,
                phoneNumbers,
            }),
            onUploadProgress: (progress) =>
                reportMappedByteProgress({
                    onProgress,
                    title: "Syncing your contacts",
                    start: 20,
                    end: 45,
                    ...progress,
                }),
            onDownloadProgress: (progress) =>
                reportMappedByteProgress({
                    onProgress,
                    title: "Loading your contacts",
                    start: 45,
                    end: 75,
                    ...progress,
                }),
        });

        reportSyncProgress(onProgress, "Saving your contacts", 80);
        await upsertDbContacts(payload.contacts);
        reportSyncProgress(onProgress, "Saving your contacts", 90);
    } catch (error) {
        console.log("Failed to sync mobile contacts, using local cache:", error);
    }

    const contacts = await hydrateLocalContacts({ currentUserId, onContactsLoaded });
    reportSyncProgress(onProgress, "Loading your contacts", 100);
    return contacts;
}
