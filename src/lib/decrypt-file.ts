import crypto, { Buffer } from 'react-native-quick-crypto'

const toBuffer = (input: Uint8Array | ArrayBuffer): Buffer => {
    if (input instanceof Uint8Array) {
        return Buffer.from(
            input.buffer as ArrayBuffer,
            input.byteOffset,
            input.byteLength
        )
    }

    return Buffer.from(input as ArrayBuffer)
}

const fromBase64 = (str: string) => {
    return Buffer.from(str, 'base64')
}

export async function decryptFileWithAes(
    encryptedData: Uint8Array | ArrayBuffer,
    aesKeyBase64: string,
    ivBase64: string
): Promise<Uint8Array> {

    const aesKey = fromBase64(aesKeyBase64)
    const iv = fromBase64(ivBase64)

    const buffer = toBuffer(encryptedData)

    const authTag = buffer.slice(buffer.length - 16)
    const data = buffer.slice(0, buffer.length - 16)

    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        aesKey,
        iv
    )

    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
        decipher.update(data),
        decipher.final(),
    ])

    return new Uint8Array(decrypted)
}