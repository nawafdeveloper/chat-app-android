import * as Crypto from 'expo-crypto'
import { base64ToBuffer, bufferToBase64 } from './crypto-pin'

export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(
        {
            name: 'RSA-OAEP',
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt']
    )
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const spki = await crypto.subtle.exportKey('spki', key)
    return bufferToBase64(spki)
}

export async function importPublicKey(b64: string): Promise<CryptoKey> {
    const spki = base64ToBuffer(b64)
    return crypto.subtle.importKey(
        'spki',
        spki.buffer.slice(spki.byteOffset, spki.byteOffset + spki.byteLength) as ArrayBuffer,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['encrypt']
    )
}

export async function importPrivateKey(
    pkcs8: ArrayBuffer,
    extractable = false
): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'pkcs8',
        pkcs8,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        extractable,
        ['decrypt']
    )
}

export async function encryptPrivateKey(
    privateKey: CryptoKey,
    pinKey: CryptoKey
): Promise<{ encryptedPrivateKey: string; iv: string }> {
    const pkcs8 = await crypto.subtle.exportKey('pkcs8', privateKey)
    const iv = Crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        pinKey,
        pkcs8
    )

    return {
        encryptedPrivateKey: bufferToBase64(encrypted),
        iv: bufferToBase64(iv),
    }
}

export async function decryptPrivateKey(
    encryptedPrivateKeyB64: string,
    ivB64: string,
    pinKey: CryptoKey,
    extractable = false
): Promise<CryptoKey> {
    const encrypted = base64ToBuffer(encryptedPrivateKeyB64)
    const iv = base64ToBuffer(ivB64)

    const pkcs8 = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
        },
        pinKey,
        encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength) as ArrayBuffer
    )

    return importPrivateKey(pkcs8, extractable)
}