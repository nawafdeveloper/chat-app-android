import { db } from "@/db/client";
import {
    contacts as dbContacts,
    type DbContact,
    type DbContactInsert,
} from "@/db/schema";
import type { StoredContactRecord } from "@/types/contacts.type";
import { asc, eq, or } from "drizzle-orm";

function toDbContactInsert(contact: StoredContactRecord): DbContactInsert {
    return {
        contact_id: contact.contact_id,
        linked_user_id: contact.linked_user_id,
        linked_user_image: contact.linked_user_image ?? null,
        linked_user_public_key: contact.linked_user_public_key ?? null,
        linked_user_phone_number: contact.linked_user_phone_number ?? null,
        contact_ciphertext: contact.contact_ciphertext,
        contact_encrypted_aes_key: contact.contact_encrypted_aes_key,
        contact_iv: contact.contact_iv,
        contact_algorithm: contact.contact_algorithm,
        display_name: null,
        avatar: contact.linked_user_image ?? null,
        phone_number: contact.linked_user_phone_number ?? null,
        normalized_phone_hash: contact.normalized_phone_hash,
        is_blocked: false,
        created_at:
            contact.created_at instanceof Date
                ? contact.created_at.toISOString()
                : String(contact.created_at),
        updated_at:
            contact.updated_at instanceof Date
                ? contact.updated_at.toISOString()
                : String(contact.updated_at),
    };
}

function dbRowToStoredContact(row: DbContact): StoredContactRecord {
    return {
        contact_id: row.contact_id,
        owner_user_id: "",
        linked_user_id: row.linked_user_id,
        linked_user_image: row.linked_user_image ?? row.avatar ?? null,
        linked_user_public_key: row.linked_user_public_key ?? null,
        linked_user_phone_number: row.linked_user_phone_number ?? row.phone_number ?? null,
        contact_ciphertext: row.contact_ciphertext,
        contact_encrypted_aes_key: row.contact_encrypted_aes_key,
        contact_iv: row.contact_iv,
        contact_algorithm: row.contact_algorithm as StoredContactRecord["contact_algorithm"],
        normalized_phone_hash: row.normalized_phone_hash,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

export async function getDbContacts(): Promise<StoredContactRecord[]> {
    const rows = await db
        .select()
        .from(dbContacts)
        .orderBy(asc(dbContacts.display_name), asc(dbContacts.phone_number));

    return rows.map(dbRowToStoredContact);
}

export async function upsertDbContacts(contacts: StoredContactRecord[]) {
    for (const contact of contacts) {
        const values = toDbContactInsert(contact);
        const existing = await db
            .select({ contact_id: dbContacts.contact_id })
            .from(dbContacts)
            .where(
                or(
                    eq(dbContacts.contact_id, values.contact_id),
                    eq(dbContacts.linked_user_id, values.linked_user_id)
                )
            )
            .limit(1);

        if (existing.length > 0) {
            await db
                .update(dbContacts)
                .set(values)
                .where(eq(dbContacts.contact_id, existing[0].contact_id));
        } else {
            await db.insert(dbContacts).values(values);
        }
    }
}
