import { create } from 'zustand'

const PIN_LENGTH = 6

type PinState = {
    pin: string
    confirmPin: string
    isLoading: boolean
    error: string | null

    setPin: (pin: string) => void
    setConfirmPin: (pin: string) => void
    clearPinComplete: () => void
    isPinComplete: boolean
    isConfirmMatch: boolean
    reset: () => void
}

export const usePinStore = create<PinState>((set, get) => ({
    pin: '',
    confirmPin: '',
    isLoading: false,
    error: null,
    isPinComplete: false,
    isConfirmMatch: false,

    setPin: (raw) => {
        const pin = raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH)
        set({ pin, isPinComplete: pin.length === PIN_LENGTH })
    },

    setConfirmPin: (raw) => {
        const confirmPin = raw.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH)
        const { pin } = get()
        set({
            confirmPin,
            isConfirmMatch: confirmPin.length === PIN_LENGTH && confirmPin === pin,
        })
    },

    clearPinComplete: () => set({ isPinComplete: false }),

    reset: () =>
        set({
            pin: '',
            confirmPin: '',
            isLoading: false,
            error: null,
            isPinComplete: false,
            isConfirmMatch: false,
        }),
}))