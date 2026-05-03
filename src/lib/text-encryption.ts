import { importPublicKey } from './crypto-keys'
import { base64ToBuffer, bufferToBase64 } from './crypto-pin'
import { retrieveSessionKeys } from './crypto-storage'

export const TEXT_ENCRYPTION_ALGORITHM = 'aes-256-gcm+rsa-oaep-sha256'

export interface EncryptedTextPayload {
    ciphertext: string
    encryptedAesKey: string
    iv: string
    algorithm: typeof TEXT_ENCRYPTION_ALGORITHM
}

export type TextRecipientPublicKeyInput = {
    recipientUserId: string
    publicKey: string | CryptoKey
}

type RecipientTextKeyMap = {
    version: 1
    keys: Record<string, string>
}

// ─── Helpers ────────────────────────────────────────────

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
}

function parseRecipientTextKeyMap(storedValue: string): RecipientTextKeyMap | null {
    if (!storedValue) return null
    try {
        const parsed = JSON.parse(storedValue) as Partial<RecipientTextKeyMap>
        if (parsed.version === 1 && parsed.keys && typeof parsed.keys === 'object') {
            return { version: 1, keys: parsed.keys }
        }
    } catch {
        return null
    }
    return null
}

function serializeRecipientTextKeys(keys: Record<string, string>): string {
    return JSON.stringify({ version: 1, keys } satisfies RecipientTextKeyMap)
}

async function normalizeRecipientPublicKeys(recipients: TextRecipientPublicKeyInput[]) {
    const uniqueRecipients = [
        ...new Map(
            recipients
                .filter((r) => r.recipientUserId && r.publicKey)
                .map((r) => [r.recipientUserId, r])
        ).values(),
    ]

    return Promise.all(
        uniqueRecipients.map(async (r) => ({
            recipientUserId: r.recipientUserId,
            publicKey:
                typeof r.publicKey === 'string'
                    ? await importPublicKey(r.publicKey)
                    : r.publicKey,
        }))
    )
}

async function encryptAesKeyWithPublicKey(
    aesKeyBase64: string,
    publicKey: CryptoKey
): Promise<string> {
    const aesKeyBytes = base64ToBuffer(aesKeyBase64)
    const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        toArrayBuffer(aesKeyBytes)
    )
    return bufferToBase64(encrypted)
}

async function decryptAesKeyWithPrivateKey(
    encryptedAesKeyBase64: string,
    privateKey: CryptoKey
): Promise<string> {
    const encryptedBytes = base64ToBuffer(encryptedAesKeyBase64)
    const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        toArrayBuffer(encryptedBytes)
    )
    return bufferToBase64(decrypted)
}

async function decryptStoredAesKeyWithPrivateKey(
    encryptedAesKey: string,
    privateKey: CryptoKey
): Promise<string> {
    const keyMap = parseRecipientTextKeyMap(encryptedAesKey)
    const candidateKeys = keyMap ? Object.values(keyMap.keys) : [encryptedAesKey]
    let lastError: unknown = null

    for (const candidateKey of candidateKeys) {
        try {
            return await decryptAesKeyWithPrivateKey(candidateKey, privateKey)
        } catch (error) {
            lastError = error
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error('Failed to decrypt text key.')
}

// ─── Public API ─────────────────────────────────────────

export async function encryptTextForRecipients(
    plaintext: string,
    ownerUserId: string,
    recipients: TextRecipientPublicKeyInput[] = []
): Promise<EncryptedTextPayload> {
    const sessionKeys = await retrieveSessionKeys()
    if (!sessionKeys?.publicKey) {
        throw new Error('No public key found in session. Please unlock your keys again.')
    }

    const aesKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    )
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const plaintextBytes = new TextEncoder().encode(plaintext)

    const encryptedText = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        toArrayBuffer(plaintextBytes)
    )

    const rawAesKey = await crypto.subtle.exportKey('raw', aesKey)
    const aesKeyBase64 = bufferToBase64(rawAesKey)

    const ownerEncryptedAesKey = await encryptAesKeyWithPublicKey(
        aesKeyBase64,
        sessionKeys.publicKey
    )

    const normalizedRecipients = await normalizeRecipientPublicKeys(recipients)
    const recipientKeys = await Promise.all(
        normalizedRecipients
            .filter((r) => r.recipientUserId !== ownerUserId)
            .map(async (r) => ({
                recipientUserId: r.recipientUserId,
                encryptedAesKey: await encryptAesKeyWithPublicKey(aesKeyBase64, r.publicKey),
            }))
    )

    const keyMap = Object.fromEntries(
        recipientKeys.map((r) => [r.recipientUserId, r.encryptedAesKey])
    )
    keyMap[ownerUserId] = ownerEncryptedAesKey

    return {
        ciphertext: bufferToBase64(encryptedText),
        encryptedAesKey: serializeRecipientTextKeys(keyMap),
        iv: bufferToBase64(iv),
        algorithm: TEXT_ENCRYPTION_ALGORITHM,
    }
}

export async function decryptText(
    payload: Pick<EncryptedTextPayload, 'ciphertext' | 'encryptedAesKey' | 'iv'>
): Promise<string> {
    const sessionKeys = await retrieveSessionKeys()
    if (!sessionKeys?.privateKey) {
        throw new Error('No private key found in session. Please unlock your keys again.')
    }

    const aesKeyBase64 = await decryptStoredAesKeyWithPrivateKey(
        payload.encryptedAesKey,
        sessionKeys.privateKey
    )

    const aesKeyBytes = base64ToBuffer(aesKeyBase64)
    const ciphertextBytes = base64ToBuffer(payload.ciphertext)
    const ivBytes = base64ToBuffer(payload.iv)

    const aesKey = await crypto.subtle.importKey(
        'raw',
        toArrayBuffer(aesKeyBytes),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    )

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(ivBytes) },
        aesKey,
        toArrayBuffer(ciphertextBytes)
    )

    return new TextDecoder().decode(decrypted)
}