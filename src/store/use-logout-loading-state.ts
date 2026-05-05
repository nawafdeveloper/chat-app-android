import { create } from 'zustand'

type LogoutLoadingState = {
    logoutLoading: boolean
    setLogoutLoading: (val: boolean) => void
}

export const useLogoutLoadingState = create<LogoutLoadingState>((set) => ({
    logoutLoading: false,
    setLogoutLoading: (val) => set({ logoutLoading: val }),
}))