import { useCryptoKeys } from "@/context/crypto";
import { authClient } from "@/lib/auth-client";
import { hydrateLocalContacts } from "@/lib/contact-sync";
import { useContactDirectoryStore } from "@/store/use-contact-directory-store";
import { useEffect } from "react";

let contactsLoadRequestId = 0;
let contactsLoadingForUserId: string | null = null;

export function useDecryptedContacts() {
    const { isReady } = useCryptoKeys();
    const { data: session } = authClient.useSession();
    const contacts = useContactDirectoryStore((state) => state.contacts);
    const isLoading = useContactDirectoryStore((state) => state.isLoading);
    const error = useContactDirectoryStore((state) => state.error);
    const setLoading = useContactDirectoryStore((state) => state.setLoading);
    const setError = useContactDirectoryStore((state) => state.setError);
    const reset = useContactDirectoryStore((state) => state.reset);

    const currentUserId = session?.user.id ?? null;

    useEffect(() => {
        if (!currentUserId) {
            contactsLoadRequestId += 1;
            contactsLoadingForUserId = null;
            reset();
            return;
        }

        if (!isReady) {
            return;
        }

        const loadContacts = async (force = false) => {
            const directoryState = useContactDirectoryStore.getState();

            if (
                directoryState.isLoading &&
                contactsLoadingForUserId === currentUserId
            ) {
                return;
            }

            if (!force && directoryState.loadedForUserId === currentUserId) {
                return;
            }

            const requestId = (contactsLoadRequestId += 1);
            contactsLoadingForUserId = currentUserId;

            try {
                setLoading(true);
                setError(null);

                await hydrateLocalContacts({ currentUserId });
            } catch (nextError) {
                if (contactsLoadRequestId !== requestId) {
                    return;
                }

                setError(
                    nextError instanceof Error
                        ? nextError.message
                        : "Failed to load contacts."
                );
            } finally {
                if (contactsLoadRequestId === requestId) {
                    contactsLoadingForUserId = null;
                    setLoading(false);
                }
            }
        };

        void loadContacts();

        return () => {
            contactsLoadRequestId += 1;
        };
    }, [
        currentUserId,
        isReady,
        reset,
        setError,
        setLoading,
    ]);

    return {
        contacts,
        isLoading,
        error,
    };
}
