export interface UserKeyBundle {
    publicKey: string;
    encryptedPrivateKey: string;
    privateKeyIv: string;
    pinSalt: string;
    pinVerificationTag: string;
    pinVerificationIv: string;
    isNewUser: boolean;
}

export interface SessionKeys {
    privateKey: CryptoKey;
    publicKey: CryptoKey;
}

export type TextEncryptionAlgorithm = "aes-256-gcm+rsa-oaep-sha256";

export interface EncryptedContentEnvelope {
    ciphertext: string;
    iv: string;
    algorithm: TextEncryptionAlgorithm;
}

export interface RecipientEncryptedAesKey {
    recipient_user_id: string;
    encrypted_aes_key: string;
    algorithm: TextEncryptionAlgorithm;
}

export interface RecipientEncryptedAesKeyInput {
    recipientUserId: string;
    encryptedAesKey: string;
    algorithm?: TextEncryptionAlgorithm;
}