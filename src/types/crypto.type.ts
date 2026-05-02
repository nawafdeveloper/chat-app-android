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