import { TextEncryptionAlgorithm } from "./crypto.type";

export type Contact = {
    contact_id: string;
    linked_user_id?: string;
    linked_user_public_key?: string;
    contact_first_name?: string;
    contact_second_name?: string;
    contact_number: string;
    contact_avatar?: string;
    contact_bio?: string;
    contact_letter_group: string;
};

export type ContactPayload = {
    contact_first_name?: string;
    contact_second_name?: string;
    contact_number: string;
    contact_avatar?: string;
    contact_bio?: string;
};

export type StoredContactRecord = {
    contact_id: string;
    owner_user_id: string;
    linked_user_id: string;
    linked_user_image: string | null;
    linked_user_public_key: string | null;
    linked_user_phone_number: string | null;
    contact_ciphertext: string;
    contact_encrypted_aes_key: string;
    contact_iv: string;
    contact_algorithm: TextEncryptionAlgorithm;
    normalized_phone_hash: string;
    created_at: string | Date;
    updated_at: string | Date;
};

export type ContactCheckResponse = {
    exists: boolean;
    linkedUserId: string | null;
    alreadyExists: boolean;
};