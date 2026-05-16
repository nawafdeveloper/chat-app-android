import { countryCodes } from "@/constants/country-code";
import { authClient } from "@/lib/auth-client";
import { encryptContactPayload, sha256Hex } from "@/lib/contact-crypto";
import { hydrateLocalContacts } from "@/lib/contact-sync";
import { buildFullPhoneNumber } from "@/lib/contact-utils";
import { upsertDbContacts } from "@/lib/upsert-db-contacts";
import type {
    ContactCheckResponse,
    StoredContactRecord,
} from "@/types/contacts.type";
import { create } from "zustand";

const API_BASE_URL = "https://web.yahla.org";
const DEFAULT_MAX_LENGTH = 10;
const DEFAULT_COUNTRY: CountryCode =
    countryCodes.find((c) => c.key === "sa") ?? countryCodes[0];

let contactCheckRequestId = 0;

export type CountryCode = (typeof countryCodes)[number];

export type AccountStatus =
    | "idle"
    | "checking"
    | "exists"
    | "missing"
    | "duplicate"
    | "error";

type ContactCreateResponse = {
    contact?: StoredContactRecord;
    contacts?: StoredContactRecord[];
    error?: string;
};

type CreateContactState = {
    selectedCountry: CountryCode;
    setSelectedCountry: (country: CountryCode) => void;

    phoneNumber: string;
    setPhoneNumber: (phone: string) => void;
    fullPhoneNumber: string;
    phoneMaxLength: number;
    isPhoneValid: boolean;

    firstName: string;
    setFirstName: (name: string) => void;
    lastName: string;
    setLastName: (name: string) => void;
    fullName: string;
    isNameValid: boolean;

    linkedUserId: string | null;
    accountStatus: AccountStatus;
    isContactExist: boolean | null;
    setIsContactExist: (exists: boolean | null) => void;

    isLoading: boolean;
    isVerifying: boolean;
    isCreating: boolean;
    error: string | null;

    resetContactCheck: () => void;
    verifyContact: () => Promise<void>;
    createContact: () => Promise<boolean>;
    reset: () => void;
};

function getPhoneMaxLength(country: CountryCode) {
    return country.maxLength || DEFAULT_MAX_LENGTH;
}

function getAuthHeaders() {
    return {
        Cookie: authClient.getCookie() ?? "",
        "Content-Type": "application/json",
    };
}

function extractCreatedContacts(payload: ContactCreateResponse | null) {
    if (!payload) {
        return [];
    }

    if (Array.isArray(payload.contacts)) {
        return payload.contacts;
    }

    return payload.contact ? [payload.contact] : [];
}

function toFullName(firstName: string, lastName: string) {
    return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export const useCreateContactStore = create<CreateContactState>((set, get) => ({
    selectedCountry: DEFAULT_COUNTRY,
    phoneNumber: "",
    fullPhoneNumber: "",
    phoneMaxLength: getPhoneMaxLength(DEFAULT_COUNTRY),
    isPhoneValid: false,

    firstName: "",
    lastName: "",
    fullName: "",
    isNameValid: false,

    linkedUserId: null,
    accountStatus: "idle",
    isContactExist: null,

    isLoading: false,
    isVerifying: false,
    isCreating: false,
    error: null,

    setSelectedCountry: (country) => {
        const maxLength = getPhoneMaxLength(country);
        const phoneNumber = get().phoneNumber.slice(0, maxLength);
        const fullPhoneNumber = buildFullPhoneNumber(country.code, phoneNumber);

        contactCheckRequestId += 1;
        set({
            selectedCountry: country,
            phoneNumber,
            phoneMaxLength: maxLength,
            fullPhoneNumber,
            isPhoneValid: phoneNumber.length === maxLength,
            linkedUserId: null,
            accountStatus: "idle",
            isContactExist: null,
            error: null,
        });
    },

    setPhoneNumber: (phone) => {
        const { selectedCountry, phoneMaxLength } = get();
        const phoneNumber = phone.replace(/\D/g, "").slice(0, phoneMaxLength);
        const fullPhoneNumber = buildFullPhoneNumber(
            selectedCountry.code,
            phoneNumber
        );

        contactCheckRequestId += 1;
        set({
            phoneNumber,
            fullPhoneNumber,
            isPhoneValid: phoneNumber.length === phoneMaxLength,
            linkedUserId: null,
            accountStatus: "idle",
            isContactExist: null,
            error: null,
        });
    },

    setFirstName: (firstName) => {
        const nextFirstName = firstName.slice(0, 50);
        const { lastName } = get();

        set({
            firstName: nextFirstName,
            fullName: toFullName(nextFirstName, lastName),
            isNameValid: nextFirstName.trim().length > 0,
            error: null,
        });
    },

    setLastName: (lastName) => {
        const nextLastName = lastName.slice(0, 50);
        const { firstName } = get();

        set({
            lastName: nextLastName,
            fullName: toFullName(firstName, nextLastName),
            isNameValid: firstName.trim().length > 0,
            error: null,
        });
    },

    setIsContactExist: (exists) => set({ isContactExist: exists }),

    resetContactCheck: () => {
        contactCheckRequestId += 1;
        set({
            linkedUserId: null,
            accountStatus: "idle",
            isContactExist: null,
            isVerifying: false,
            isLoading: get().isCreating,
            error: null,
        });
    },

    verifyContact: async () => {
        const { fullPhoneNumber, phoneNumber } = get();

        if (!fullPhoneNumber || phoneNumber.length < 5) {
            get().resetContactCheck();
            return;
        }

        const requestId = (contactCheckRequestId += 1);
        set({
            accountStatus: "checking",
            isVerifying: true,
            isLoading: true,
            linkedUserId: null,
            isContactExist: null,
            error: null,
        });

        try {
            const response = await fetch(
                `${API_BASE_URL}/api/contacts/check?phone=${encodeURIComponent(
                    fullPhoneNumber
                )}`,
                {
                    headers: getAuthHeaders(),
                    credentials: "omit",
                }
            );

            if (!response.ok) {
                throw new Error("Failed to verify this phone number.");
            }

            const result = (await response.json()) as ContactCheckResponse;

            if (contactCheckRequestId !== requestId) {
                return;
            }

            if (!result.exists || !result.linkedUserId) {
                set({
                    linkedUserId: null,
                    accountStatus: "missing",
                    isContactExist: false,
                });
                return;
            }

            set({
                linkedUserId: result.linkedUserId,
                accountStatus: result.alreadyExists ? "duplicate" : "exists",
                isContactExist: true,
            });
        } catch (error) {
            if (contactCheckRequestId !== requestId) {
                return;
            }

            set({
                linkedUserId: null,
                accountStatus: "error",
                isContactExist: null,
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to verify this phone number.",
            });
        } finally {
            if (contactCheckRequestId === requestId) {
                set({
                    isVerifying: false,
                    isLoading: get().isCreating,
                });
            }
        }
    },

    createContact: async () => {
        const {
            firstName,
            lastName,
            fullPhoneNumber,
            linkedUserId,
            accountStatus,
        } = get();

        if (!firstName.trim()) {
            set({ error: "Please enter the first name." });
            return false;
        }

        if (!linkedUserId || accountStatus !== "exists") {
            set({ error: "Please verify the phone number first." });
            return false;
        }

        const session = await authClient.getSession();
        const currentUserId = session.data?.user.id;

        if (!currentUserId) {
            set({ error: "No user session found." });
            return false;
        }

        set({
            isCreating: true,
            isLoading: true,
            error: null,
        });

        try {
            const encryptedContact = await encryptContactPayload(
                {
                    contact_first_name: firstName.trim(),
                    contact_second_name: lastName.trim() || undefined,
                    contact_number: fullPhoneNumber,
                },
                currentUserId
            );
            const phoneHash = await sha256Hex(fullPhoneNumber);

            const response = await fetch(`${API_BASE_URL}/api/contacts`, {
                method: "POST",
                headers: getAuthHeaders(),
                credentials: "omit",
                body: JSON.stringify({
                    linkedUserId,
                    phoneHash,
                    encryptedContact,
                }),
            });

            const payload = (await response.json().catch(() => null)) as
                | ContactCreateResponse
                | null;

            if (!response.ok) {
                throw new Error(payload?.error || "Failed to create contact.");
            }

            const createdContacts = extractCreatedContacts(payload);

            if (createdContacts.length > 0) {
                await upsertDbContacts(createdContacts);
                await hydrateLocalContacts({ currentUserId });
            }

            get().reset();
            return true;
        } catch (error) {
            set({
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to create contact.",
            });
            return false;
        } finally {
            set({
                isCreating: false,
                isLoading: get().isVerifying,
            });
        }
    },

    reset: () =>
        set({
            selectedCountry: DEFAULT_COUNTRY,
            phoneNumber: "",
            fullPhoneNumber: "",
            phoneMaxLength: getPhoneMaxLength(DEFAULT_COUNTRY),
            isPhoneValid: false,
            firstName: "",
            lastName: "",
            fullName: "",
            isNameValid: false,
            linkedUserId: null,
            accountStatus: "idle",
            isContactExist: null,
            isLoading: false,
            isVerifying: false,
            isCreating: false,
            error: null,
        }),
}));
