import { Buffer } from 'buffer'
import * as Crypto from 'expo-crypto'

const PBKDF2_ITERATIONS = 310_000
const PIN_VERIFICATION_PLAINTEXT = 'E2EE_PIN_VERIFY_V1'

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
    return Buffer.from(bytes).toString('base64')
}

export function base64ToBuffer(b64: string): Uint8Array {
    return new Uint8Array(Buffer.from(b64, 'base64'))
}

export function generateSalt(): Uint8Array {
    return Crypto.getRandomValues(new Uint8Array(16))
}

export async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const pinBytes = new TextEncoder().encode(pin)

    const baseKey = await crypto.subtle.importKey(
        'raw',
        pinBytes,
        'PBKDF2',
        false,
        ['deriveKey']
    )

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

export async function createPinVerificationTag(
    pinKey: CryptoKey
): Promise<{ tag: string; iv: string }> {
    const iv = Crypto.getRandomValues(new Uint8Array(12))
    const plaintext = new TextEncoder().encode(PIN_VERIFICATION_PLAINTEXT)

    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        pinKey,
        plaintext
    )

    return {
        tag: bufferToBase64(encrypted),
        iv: bufferToBase64(iv),
    }
}

export async function verifyPin(
    pin: string,
    salt: string,
    verificationTag: string,
    verificationIv: string
): Promise<boolean> {
    try {
        const saltBytes = base64ToBuffer(salt)
        const pinKey = await derivePinKey(pin, saltBytes)

        const tagBytes = base64ToBuffer(verificationTag)
        const ivBytes = base64ToBuffer(verificationIv)

        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: ivBytes.buffer.slice(ivBytes.byteOffset, ivBytes.byteOffset + ivBytes.byteLength) as ArrayBuffer,
            },
            pinKey,
            tagBytes.buffer.slice(tagBytes.byteOffset, tagBytes.byteOffset + tagBytes.byteLength) as ArrayBuffer
        )

        const text = new TextDecoder().decode(decrypted)
        return text === PIN_VERIFICATION_PLAINTEXT
    } catch {
        return false
    }
}