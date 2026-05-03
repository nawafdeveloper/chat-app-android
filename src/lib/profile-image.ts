import { Buffer } from '@craftzdog/react-native-buffer'
import {
    cacheDirectory,
    deleteAsync,
    EncodingType,
    writeAsStringAsync,
} from 'expo-file-system/legacy'
import { authClient } from './auth-client'
import { retrieveSessionKeys } from './crypto-storage'
import { decryptFileWithAes } from './decrypt-file'
import { encryptFileWithAes } from './encrypt-file'

const API_BASE = 'https://halabakk-web.nawaf-alhasosah.workers.dev'

// ─── Encrypt AES key with RSA public key ────────────────────────────────────

async function encryptAesKeyWithPublicKey(
    aesKeyBase64: string,
    publicKey: CryptoKey
): Promise<string> {
    const aesKeyBytes = Uint8Array.from(atob(aesKeyBase64), c => c.charCodeAt(0))

    const encrypted = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        aesKeyBytes
    )

    return btoa(String.fromCharCode(...new Uint8Array(encrypted)))
}

function getMimeTypeFromUri(uri: string): string {
    const ext = uri.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
        avif: 'image/avif',
    }
    return map[ext ?? ''] ?? 'image/jpeg'
}

// ─── Decrypt AES key with RSA private key ───────────────────────────────────

async function decryptAesKeyWithPrivateKey(
    encryptedAesKeyBase64: string,
    privateKey: CryptoKey
): Promise<string> {
    const encryptedBytes = Uint8Array.from(
        atob(encryptedAesKeyBase64),
        c => c.charCodeAt(0)
    )

    const decrypted = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        encryptedBytes
    )

    return btoa(String.fromCharCode(...new Uint8Array(decrypted)))
}

export interface ProfileImageUploadResult {
    imageUrl: string
    mediaId: string
}

export async function uploadEncryptedProfileImage(
    fileUri: string
): Promise<ProfileImageUploadResult> {
    const sessionKeys = await retrieveSessionKeys()
    if (!sessionKeys?.publicKey) {
        throw new Error('No public key found in session. Please log in again.')
    }

    const response = await fetch(fileUri)
    if (!response.ok) throw new Error('Failed to read image file')

    const buffer = await response.arrayBuffer()
    const fileBytes = new Uint8Array(buffer)

    const { encryptedData, aesKey, iv } = await encryptFileWithAes(fileBytes)
    const encryptedBuffer =
        encryptedData instanceof Uint8Array
            ? encryptedData
            : new Uint8Array(encryptedData as ArrayBuffer)

    const encryptedAesKey = await encryptAesKeyWithPublicKey(aesKey, sessionKeys.publicKey)

    const originalMimeType = getMimeTypeFromUri(fileUri)
    const ext = fileUri.split('.').pop()?.toLowerCase() ?? 'jpg'

    const tempUri = cacheDirectory + `encrypted_profile.${ext}`
    await writeAsStringAsync(
        tempUri,
        Buffer.from(encryptedBuffer).toString('base64'),
        { encoding: EncodingType.Base64 }
    )

    const formData = new FormData()
    formData.append('file', {
        uri: tempUri,
        name: `profile.${ext}`,
        type: originalMimeType,
    } as any)
    formData.append('aesKey', encryptedAesKey)
    formData.append('iv', iv)

    const cookies = authClient.getCookie();
    const headers = {
        "Cookie": cookies,
    };

    const uploadResponse = await fetch(`${API_BASE}/api/profile-image`, {
        method: 'POST',
        body: formData,
        headers,
        credentials: "omit"
    })

    await deleteAsync(tempUri, { idempotent: true })

    const text = await uploadResponse.text()
    if (!uploadResponse.ok) {
        throw new Error(`Upload failed: ${text}`)
    }

    return JSON.parse(text)
}

// ─── Fetch & Decrypt ─────────────────────────────────────────────────────────

const aesKeyCache = new Map<string, { key: string; iv: string }>()
const imageFileCache = new Map<string, string>()

export async function fetchAndDecryptProfileImage(objectKey: string): Promise<string> {
    const cached = imageFileCache.get(objectKey)
    if (cached) return cached

    const sessionKeys = await retrieveSessionKeys()
    if (!sessionKeys?.privateKey) {
        throw new Error('No private key found in session. Please log in again.')
    }

    const cookies = authClient.getCookie()
    const headers = { Cookie: cookies }

    let cachedKey = aesKeyCache.get(objectKey)
    if (!cachedKey) {
        const keyResponse = await fetch(
            `${API_BASE}/api/profile-image/key/${objectKey}`,
            { headers, credentials: 'omit' }
        )
        if (!keyResponse.ok) throw new Error('Failed to fetch encryption key')

        const { aesKey: encryptedAesKeyBase64, iv } = await keyResponse.json()
        const key = await decryptAesKeyWithPrivateKey(encryptedAesKeyBase64, sessionKeys.privateKey)
        cachedKey = { key, iv }
        aesKeyCache.set(objectKey, cachedKey)
    }

    const imageResponse = await fetch(
        `${API_BASE}/api/profile-image/${objectKey}`,
        { headers, credentials: 'omit' }
    )
    if (!imageResponse.ok) throw new Error('Failed to fetch encrypted image')

    const encryptedData = await imageResponse.arrayBuffer()
    const decryptedBytes = await decryptFileWithAes(encryptedData, cachedKey.key, cachedKey.iv)

    const tempUri = cacheDirectory + `profile_${objectKey.replace(/\//g, '_')}.jpg`
    await writeAsStringAsync(
        tempUri,
        Buffer.from(decryptedBytes).toString('base64'),
        { encoding: EncodingType.Base64 }
    )

    imageFileCache.set(objectKey, tempUri)
    return tempUri
}