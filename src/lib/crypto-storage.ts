import { SessionKeys, UserKeyBundle } from '@/types/crypto.type'
import * as SecureStore from 'expo-secure-store'
import { authClient } from './auth-client'
import { importPrivateKey, importPublicKey } from './crypto-keys'
import { base64ToBuffer, bufferToBase64 } from './crypto-pin'

const SESSION_KEYS_STORAGE_KEY = 'yhla_session_keys'

async function exportKeyToSpki(key: CryptoKey): Promise<string> {
    const spki = await crypto.subtle.exportKey('spki', key)
    return bufferToBase64(spki)
}

async function exportKeyToPkcs8(key: CryptoKey): Promise<string> {
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', key)
    return bufferToBase64(pkcs8)
}

export async function storeSessionKeys(session: SessionKeys): Promise<void> {
    const publicKeySpki = await exportKeyToSpki(session.publicKey)
    const privateKeyPkcs8 = await exportKeyToPkcs8(session.privateKey)

    const data = JSON.stringify({ publicKey: publicKeySpki, privateKey: privateKeyPkcs8 })
    await SecureStore.setItemAsync(SESSION_KEYS_STORAGE_KEY, data)
}

export async function retrieveSessionKeys(): Promise<SessionKeys | null> {
    const stored = await SecureStore.getItemAsync(SESSION_KEYS_STORAGE_KEY)
    if (!stored) return null

    try {
        const data = JSON.parse(stored)
        const publicKey = await importPublicKey(data.publicKey)
        const privateKeyBytes = base64ToBuffer(data.privateKey)
        const privateKey = await importPrivateKey(
            privateKeyBytes.buffer.slice(
                privateKeyBytes.byteOffset,
                privateKeyBytes.byteOffset + privateKeyBytes.byteLength
            ) as ArrayBuffer,
            true
        )
        return { publicKey, privateKey }
    } catch {
        return null
    }
}

export async function clearSessionKeys(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEYS_STORAGE_KEY)
}

export async function uploadKeyBundle(bundle: UserKeyBundle): Promise<void> {
    await authClient.updateUser({
        yhlaPublicKey: bundle.publicKey,
        yhlaEncryptedPrivateKey: bundle.encryptedPrivateKey,
        yhlaPrivateKeyIv: bundle.privateKeyIv,
        yhlaPinSalt: bundle.pinSalt,
        yhlaPinVerificationTag: bundle.pinVerificationTag,
        yhlaPinVerificationIv: bundle.pinVerificationIv,
        isNewUser: bundle.isNewUser
    });
}

export async function fetchKeyBundle(): Promise<UserKeyBundle> {
    const { data } = await authClient.getSession();

    if (!data?.user) {
        throw new Error("No user session found");
    }

    const user = data.user;

    return {
        publicKey: user.yhlaPublicKey,
        encryptedPrivateKey: user.yhlaEncryptedPrivateKey,
        privateKeyIv: user.yhlaPrivateKeyIv,
        pinSalt: user.yhlaPinSalt,
        pinVerificationTag: user.yhlaPinVerificationTag,
        pinVerificationIv: user.yhlaPinVerificationIv,
        isNewUser: user.isNewUser
    };
}

export async function updateKeyBundle(
    bundle: Partial<UserKeyBundle>
): Promise<void> {
    const updateData: Record<string, string> = {};
    if (bundle.encryptedPrivateKey !== undefined) {
        updateData.yhlaEncryptedPrivateKey = bundle.encryptedPrivateKey;
    }
    if (bundle.privateKeyIv !== undefined) {
        updateData.yhlaPrivateKeyIv = bundle.privateKeyIv;
    }
    if (bundle.pinSalt !== undefined) {
        updateData.yhlaPinSalt = bundle.pinSalt;
    }
    if (bundle.pinVerificationTag !== undefined) {
        updateData.yhlaPinVerificationTag = bundle.pinVerificationTag;
    }
    if (bundle.pinVerificationIv !== undefined) {
        updateData.yhlaPinVerificationIv = bundle.pinVerificationIv;
    }
    if (bundle.publicKey !== undefined) {
        updateData.yhlaPublicKey = bundle.publicKey;
    }
    await authClient.updateUser(updateData);
}

export async function clearAllSensitiveData(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(SESSION_KEYS_STORAGE_KEY)
    } catch (error) {
        console.error('Error clearing sensitive data:', error)
    }
}