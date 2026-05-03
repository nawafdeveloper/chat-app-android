import { create } from 'zustand'

const PIN_LENGTH = 6

type PinState = {
    pin: string
    error: boolean
    canGoNext: boolean
    isProcessing: boolean

    setPin: (v: string) => void
    reset: () => void
    setError: (v: boolean) => void
    setProcessing: (v: boolean) => void
}

export const usePinOldUserStore = create<PinState>((set, get) => ({
    pin: '',
    error: false,
    canGoNext: false,
    isProcessing: false,

    setPin: (v) => {
        const clean = v.replace(/[^0-9]/g, '').slice(0, PIN_LENGTH)

        set({
            pin: clean,
            canGoNext: clean.length === PIN_LENGTH,
        })
    },

    reset: () =>
        set({
            pin: '',
            error: false,
            canGoNext: false,
            isProcessing: false,
        }),

    setError: (v) => set({ error: v }),
    setProcessing: (v) => set({ isProcessing: v }),
}))