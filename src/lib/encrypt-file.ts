import crypto, { Buffer } from 'react-native-quick-crypto'

const toUint8Array = async (file: any): Promise<Uint8Array> => {
    if (file instanceof Uint8Array) return file

    if (file instanceof ArrayBuffer) return new Uint8Array(file)

    // React Native ArrayBuffer workaround (instanceof can fail cross-realm)
    if (file?.constructor?.name === 'ArrayBuffer' || ArrayBuffer.isView(file)) {
        return new Uint8Array(file.buffer ?? file)
    }

    if (typeof file?.arrayBuffer === 'function') {
        return new Uint8Array(await file.arrayBuffer())
    }

    throw new Error(`Unsupported file type: ${file?.constructor?.name ?? typeof file}`)
}

const toBase64 = (buffer: Buffer | Uint8Array) => {
    return Buffer.from(buffer).toString('base64')
}

export async function encryptFileWithAes(file: any): Promise<{
    encryptedData: Uint8Array
    aesKey: string
    iv: string
}> {
    const aesKey = crypto.randomBytes(32)

    const iv = crypto.randomBytes(12)

    const dataBytes = await toUint8Array(file)

    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv)

    const encrypted = Buffer.concat([
        cipher.update(dataBytes),
        cipher.final(),
    ])

    const authTag = cipher.getAuthTag()

    const encryptedData = Buffer.concat([encrypted, authTag])

    return {
        encryptedData: new Uint8Array(encryptedData),
        aesKey: toBase64(aesKey),
        iv: toBase64(iv),
    }
}