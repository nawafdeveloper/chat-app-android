import { decryptPrivateKey, encryptPrivateKey, exportPublicKey, generateKeyPair, importPublicKey } from '@/lib/crypto-keys'
import { base64ToBuffer, bufferToBase64, createPinVerificationTag, derivePinKey, generateSalt, verifyPin } from '@/lib/crypto-pin'
import { clearSessionKeys, fetchKeyBundle, retrieveSessionKeys, storeSessionKeys, updateKeyBundle, uploadKeyBundle } from '@/lib/crypto-storage'
import { SessionKeys } from '@/types/crypto.type'
import { useCallback, useEffect, useState } from 'react'

export type CryptoState =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'unlocked'; session: SessionKeys }
    | { status: 'error'; message: string }

export function useCrypto() {
    const [state, setState] = useState<CryptoState>({ status: 'idle' })
    const [isHydrated, setIsHydrated] = useState(false)

    useEffect(() => {
        const loadSessionKeys = async () => {
            const session = await retrieveSessionKeys()
            if (session) {
                setState({ status: 'unlocked', session })
            }
            setIsHydrated(true)
        }
        loadSessionKeys()
    }, [])

    const register = useCallback(async (pin: string) => {
        setState({ status: 'loading' })
        try {
            const keyPair = await generateKeyPair()

            const salt = generateSalt()
            const pinKey = await derivePinKey(pin, salt)

            const { encryptedPrivateKey, iv: privateKeyIv } =
                await encryptPrivateKey(keyPair.privateKey, pinKey)

            const { tag: pinVerificationTag, iv: pinVerificationIv } =
                await createPinVerificationTag(pinKey)

            const publicKey = await exportPublicKey(keyPair.publicKey)

            await uploadKeyBundle({
                publicKey,
                encryptedPrivateKey,
                privateKeyIv,
                pinSalt: bufferToBase64(salt),
                pinVerificationTag,
                pinVerificationIv,
                isNewUser: false
            })

            const session: SessionKeys = {
                privateKey: keyPair.privateKey,
                publicKey: keyPair.publicKey,
            }
            await storeSessionKeys(session)

            setState({ status: 'unlocked', session })
        } catch (err) {
            setState({ status: 'error', message: 'Registration failed' })
            throw err
        }
    }, [])

    const unlock = useCallback(async (pin: string) => {
        setState({ status: 'loading' })
        try {
            const bundle = await fetchKeyBundle()

            const pinCorrect = await verifyPin(
                pin,
                bundle.pinSalt,
                bundle.pinVerificationTag,
                bundle.pinVerificationIv
            )

            if (!pinCorrect) {
                setState({ status: 'error', message: 'Incorrect PIN' })
                return false
            }

            const pinKey = await derivePinKey(
                pin,
                base64ToBuffer(bundle.pinSalt)
            )

            const privateKey = await decryptPrivateKey(
                bundle.encryptedPrivateKey,
                bundle.privateKeyIv,
                pinKey,
                true
            )

            const publicKey = await importPublicKey(bundle.publicKey)

            const session: SessionKeys = { privateKey, publicKey }
            await storeSessionKeys(session)

            setState({ status: 'unlocked', session })
            return true
        } catch {
            setState({ status: 'error', message: 'Unlock failed' })
            return false
        }
    }, [])

    const changePin = useCallback(
        async (currentPin: string, newPin: string) => {
            if (state.status !== 'unlocked') throw new Error('Not unlocked')
            setState({ status: 'loading' })

            try {
                const bundle = await fetchKeyBundle()
                const pinCorrect = await verifyPin(
                    currentPin,
                    bundle.pinSalt,
                    bundle.pinVerificationTag,
                    bundle.pinVerificationIv
                )

                if (!pinCorrect) {
                    setState({ status: 'unlocked', session: state.session })
                    return false
                }

                const newSalt = generateSalt()
                const newPinKey = await derivePinKey(newPin, newSalt)

                const { encryptedPrivateKey, iv: privateKeyIv } =
                    await encryptPrivateKey(state.session.privateKey, newPinKey)

                const { tag: pinVerificationTag, iv: pinVerificationIv } =
                    await createPinVerificationTag(newPinKey)

                await updateKeyBundle({
                    encryptedPrivateKey,
                    privateKeyIv,
                    pinSalt: bufferToBase64(newSalt),
                    pinVerificationTag,
                    pinVerificationIv,
                })

                setState({ status: 'unlocked', session: state.session })
                return true
            } catch {
                setState({ status: 'error', message: 'PIN change failed' })
                return false
            }
        },
        [state]
    )

    const lock = useCallback(async () => {
        await clearSessionKeys()
        setState({ status: 'idle' })
    }, [])

    return { state, isHydrated, register, unlock, changePin, lock }
}