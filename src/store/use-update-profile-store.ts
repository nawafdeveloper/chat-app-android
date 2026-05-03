import { create } from 'zustand'

interface ProfileState {

    firstName: string
    lastName: string
    about: string
    profileImage: string | null
    originalFirstName: string
    originalLastName: string
    originalAbout: string;

    setFirstName: (v: string) => void
    setLastName: (v: string) => void
    setAbout: (v: string) => void
    setProfileImage: (v: string | null) => void
    setOriginals: (firstName: string, lastName: string, about: string) => void

    canSave: () => boolean
    resetToOriginals: () => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
    firstName: '',
    lastName: '',
    about: '',
    profileImage: null,
    originalFirstName: '',
    originalLastName: '',
    originalAbout: '',

    setFirstName: (v) => set({ firstName: v }),
    setLastName: (v) => set({ lastName: v }),
    setAbout: (v) => set({ about: v }),
    setProfileImage: (v) => set({ profileImage: v }),
    setOriginals: (firstName, lastName, about = '') => set({
        originalFirstName: firstName,
        originalLastName: lastName,
        originalAbout: about,
        firstName,
        lastName,
        about,
    }),

    canSave: () => {
        const { firstName, lastName, about, originalFirstName, originalLastName, originalAbout } = get()
        return (
            firstName.trim() !== originalFirstName.trim() ||
            lastName.trim() !== originalLastName.trim() ||
            about.trim() !== originalAbout.trim()
        )
    },

    resetToOriginals: () => {
        const { originalFirstName, originalLastName } = get()
        set({ firstName: originalFirstName, lastName: originalLastName })
    },
}))