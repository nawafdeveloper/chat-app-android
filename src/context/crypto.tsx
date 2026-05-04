import { CryptoState, useCrypto as useCryptoHook } from "@/hooks/use-crypto";
import { createContext, ReactNode, useContext } from "react";

interface CryptoContextType {
    state: CryptoState;
    publicKey: CryptoKey | null;
    privateKey: CryptoKey | null;
    isReady: boolean;
    isHydrated: boolean;
    register: (pin: string) => Promise<void>;
    unlock: (pin: string) => Promise<boolean>;
    changePin: (currentPin: string, newPin: string) => Promise<boolean>;
    lock: () => void;
}

const CryptoContext = createContext<CryptoContextType | undefined>(undefined);

export function CryptoProvider({ children }: { children: ReactNode }) {
    const { state, isHydrated, register, unlock, changePin, lock } =
        useCryptoHook();

    const isReady = state.status === "unlocked" && state.session !== null;
    const publicKey = state.status === "unlocked" ? state.session.publicKey : null;
    const privateKey = state.status === "unlocked" ? state.session.privateKey : null;

    return (
        <CryptoContext.Provider
            value={{
                state,
                publicKey,
                privateKey,
                isReady,
                isHydrated,
                register,
                unlock,
                changePin,
                lock,
            }}
        >
            {children}
        </CryptoContext.Provider>
    );
}

export function useCrypto() {
    const context = useContext(CryptoContext);
    if (context === undefined) {
        throw new Error("useCrypto must be used within a CryptoProvider");
    }
    return context;
}

export const useCryptoKeys = useCrypto;