import { countryCodes } from "@/constants/country-code";
import { db } from "@/db/client";
import { currentUser } from "@/db/schema";
import { saveToken } from "@/helper/user-session";
import { authClient } from "@/lib/auth-client";
import { router } from "expo-router";
import { create } from "zustand";
import { useAuthStore } from "./auth-store";

export type CountryCode = (typeof countryCodes)[number];

export type LoginStep = "phone" | "otp";

const PHONE_MAX_LENGTHS: Record<string, number> = {
    "+1": 10,
    "+7": 10,
    "+20": 10,
    "+27": 9,
    "+30": 10,
    "+31": 9,
    "+32": 9,
    "+33": 9,
    "+34": 9,
    "+36": 9,
    "+39": 10,
    "+40": 9,
    "+41": 9,
    "+43": 10,
    "+44": 10,
    "+45": 8,
    "+46": 9,
    "+47": 8,
    "+48": 9,
    "+49": 11,
    "+51": 9,
    "+52": 10,
    "+53": 8,
    "+54": 10,
    "+55": 11,
    "+56": 9,
    "+57": 10,
    "+58": 10,
    "+60": 9,
    "+61": 9,
    "+62": 11,
    "+63": 10,
    "+64": 9,
    "+65": 8,
    "+66": 9,
    "+81": 10,
    "+82": 10,
    "+84": 10,
    "+86": 11,
    "+90": 10,
    "+91": 10,
    "+92": 10,
    "+93": 9,
    "+94": 9,
    "+95": 9,
    "+98": 10,
    "+211": 9,
    "+212": 9,
    "+213": 9,
    "+216": 8,
    "+218": 9,
    "+220": 7,
    "+221": 9,
    "+222": 8,
    "+223": 8,
    "+224": 8,
    "+225": 8,
    "+226": 8,
    "+227": 8,
    "+228": 8,
    "+229": 8,
    "+230": 7,
    "+231": 8,
    "+232": 8,
    "+233": 9,
    "+234": 10,
    "+235": 8,
    "+236": 8,
    "+237": 9,
    "+238": 7,
    "+239": 7,
    "+240": 9,
    "+241": 8,
    "+242": 9,
    "+243": 9,
    "+244": 9,
    "+245": 7,
    "+246": 7,
    "+248": 7,
    "+249": 9,
    "+250": 9,
    "+251": 9,
    "+252": 8,
    "+253": 8,
    "+254": 9,
    "+255": 9,
    "+256": 9,
    "+257": 8,
    "+258": 9,
    "+260": 9,
    "+261": 9,
    "+262": 9,
    "+263": 9,
    "+264": 9,
    "+265": 8,
    "+266": 8,
    "+267": 7,
    "+268": 8,
    "+269": 7,
    "+290": 8,
    "+291": 7,
    "+297": 7,
    "+298": 6,
    "+299": 6,
    "+340": 7,
    "+350": 8,
    "+351": 9,
    "+352": 9,
    "+353": 9,
    "+354": 7,
    "+355": 9,
    "+356": 8,
    "+357": 8,
    "+358": 9,
    "+359": 9,
    "+370": 8,
    "+371": 8,
    "+372": 7,
    "+373": 8,
    "+374": 8,
    "+375": 9,
    "+376": 6,
    "+377": 8,
    "+378": 7,
    "+379": 7,
    "+380": 9,
    "+381": 9,
    "+382": 8,
    "+383": 8,
    "+385": 9,
    "+386": 8,
    "+387": 8,
    "+389": 8,
    "+420": 9,
    "+421": 9,
    "+423": 7,
    "+500": 5,
    "+501": 7,
    "+502": 8,
    "+503": 8,
    "+504": 8,
    "+505": 8,
    "+506": 8,
    "+507": 8,
    "+508": 6,
    "+509": 8,
    "+590": 9,
    "+591": 8,
    "+592": 7,
    "+593": 9,
    "+594": 9,
    "+595": 9,
    "+596": 9,
    "+597": 7,
    "+598": 8,
    "+599": 7,
    "+670": 8,
    "+672": 6,
    "+673": 7,
    "+674": 7,
    "+675": 8,
    "+676": 7,
    "+677": 7,
    "+678": 7,
    "+679": 7,
    "+680": 7,
    "+681": 6,
    "+682": 5,
    "+683": 4,
    "+685": 7,
    "+686": 8,
    "+687": 6,
    "+688": 5,
    "+689": 6,
    "+690": 4,
    "+691": 7,
    "+692": 7,
    "+721": 7,
    "+784": 7,
    "+787": 7,
    "+809": 7,
    "+850": 8,
    "+852": 8,
    "+853": 8,
    "+855": 9,
    "+856": 9,
    "+880": 10,
    "+886": 9,
    "+960": 7,
    "+961": 8,
    "+962": 8,
    "+963": 8,
    "+964": 10,
    "+965": 8,
    "+966": 9,
    "+967": 8,
    "+968": 8,
    "+970": 9,
    "+971": 9,
    "+973": 8,
    "+974": 8,
    "+975": 8,
    "+976": 8,
    "+977": 10,
    "+992": 9,
    "+993": 8,
    "+994": 9,
    "+995": 9,
    "+996": 9,
    "+998": 9,
    "+1-242": 7,
    "+1-246": 7,
    "+1-264": 7,
    "+1-268": 7,
    "+1-284": 7,
    "+1-340": 7,
    "+1-345": 7,
    "+1-441": 7,
    "+1-473": 7,
    "+1-649": 7,
    "+1-664": 7,
    "+1-670": 7,
    "+1-671": 7,
    "+1-684": 7,
    "+1-721": 7,
    "+1-758": 7,
    "+1-767": 7,
    "+1-784": 7,
    "+1-787": 7,
    "+1-809": 7,
    "+1-868": 7,
    "+1-869": 7,
    "+1-876": 7,
    "+44-1481": 10,
    "+44-1534": 10,
    "+44-1624": 10,
};

const DEFAULT_MAX_LENGTH = 10;
const OTP_LENGTH = 6;

const DEFAULT_COUNTRY: CountryCode =
    countryCodes.find((c) => c.key === "sa") ?? countryCodes[0];

type LoginState = {
    step: LoginStep;

    selectedCountry: CountryCode;
    setSelectedCountry: (country: CountryCode) => void;

    phoneNumber: string;
    setPhoneNumber: (phone: string) => void;
    fullPhoneNumber: string;
    phoneMaxLength: number;
    isNextEnabled: boolean;

    otp: string;
    setOtp: (otp: string) => void;

    isLoading: boolean;
    error: string | null;

    handleNext: () => Promise<void>;
    handleVerify: () => Promise<void>;
    reset: () => void;
};

export const useLoginStore = create<LoginState>((set, get) => ({
    step: "phone",

    selectedCountry: DEFAULT_COUNTRY,
    setSelectedCountry: (country) => {
        const maxLength = PHONE_MAX_LENGTHS[country.code] ?? DEFAULT_MAX_LENGTH;
        const { phoneNumber } = get();
        const trimmed = phoneNumber.slice(0, maxLength);
        set({
            selectedCountry: country,
            phoneNumber: trimmed,
            phoneMaxLength: maxLength,
            fullPhoneNumber: trimmed ? `${country.code}${trimmed}` : "",
            isNextEnabled: trimmed.length === maxLength,
        });
    },

    phoneNumber: "",
    fullPhoneNumber: "",
    phoneMaxLength: PHONE_MAX_LENGTHS[DEFAULT_COUNTRY.code] ?? DEFAULT_MAX_LENGTH,
    isNextEnabled: false,
    setPhoneNumber: (phone) => {
        const { selectedCountry, phoneMaxLength } = get();
        const digits = phone.replace(/\D/g, "").slice(0, phoneMaxLength);
        set({
            phoneNumber: digits,
            fullPhoneNumber: digits ? `${selectedCountry.code}${digits}` : "",
            isNextEnabled: digits.length === phoneMaxLength,
        });
    },

    otp: "",
    setOtp: (otp) => {
        const digits = otp.replace(/\D/g, "").slice(0, OTP_LENGTH);
        set({ otp: digits });
        if (digits.length === OTP_LENGTH) {
            get().handleVerify();
        }
    },

    isLoading: false,
    error: null,

    handleNext: async () => {
        const { fullPhoneNumber, isNextEnabled } = get();
        if (!isNextEnabled) return;
        set({ isLoading: true, error: null });
        try {
            const { data, error } = await authClient.phoneNumber.sendOtp({
                phoneNumber: fullPhoneNumber
            });

            if (error) {
                console.log(error.message);
                return;
            }

            set({ step: "otp", otp: "" });
            router.push('/(auth)/otp-verification');
        } catch {
            set({ error: "Failed to send OTP. Please try again." });
        } finally {
            set({ isLoading: false });
        }
    },

    handleVerify: async () => {
        const { otp, fullPhoneNumber } = get();
        set({ isLoading: true, error: null });
        try {
            const { data, error } = await authClient.phoneNumber.verify({
                phoneNumber: fullPhoneNumber,
                code: otp,
                disableSession: false,
                updatePhoneNumber: false,
            });

            if (error) {
                console.log(error.message);
                return;
            }

            if (data.token) {
                await saveToken(data.token);
                useAuthStore.getState().setHasSession(true);
            }

            await db.insert(currentUser).values({
                id: data.user.id,
                name: data.user.name,
                phone_number: data.user.phoneNumber ?? null,
                image: data.user.image ?? null,
                about_ciphertext: data.user.aboutCiphertext ?? null,
                about_iv: data.user.aboutIv ?? null,
                yhla_public_key: data.user.yhlaPublicKey ?? null,
                yhla_encrypted_private_key: data.user.yhlaEncryptedPrivateKey ?? null,
                yhla_private_key_iv: data.user.yhlaPrivateKeyIv ?? null,
                yhla_pin_salt: data.user.yhlaPinSalt ?? null,
                yhla_pin_verification_tag: data.user.yhlaPinVerificationTag ?? null,
                yhla_pin_verification_iv: data.user.yhlaPinVerificationIv ?? null,
                chat_wallpaper: data.user.chatWallpaper ?? "wallpaper-1",
                enable_read_receipts: data.user.enableReadReceipts ?? true,
                last_seen: data.user.lastSeen?.toString() ?? null,
                updated_at: data.user.updatedAt?.toString() ?? null,
            }).onConflictDoUpdate({
                target: currentUser.id,
                set: {
                    name: data.user.name,
                    image: data.user.image ?? null,
                    updated_at: data.user.updatedAt?.toString() ?? null,
                }
            });

            if (data.user.isNewUser) {
                router.replace('/(newUser)');
                return;
            }

            router.replace('/(tabs)');
        } catch {
            set({ error: "Invalid OTP. Please try again." });
        } finally {
            set({ isLoading: false });
        }
    },

    reset: () =>
        set({
            step: "phone",
            selectedCountry: DEFAULT_COUNTRY,
            phoneNumber: "",
            fullPhoneNumber: "",
            phoneMaxLength: PHONE_MAX_LENGTHS[DEFAULT_COUNTRY.code] ?? DEFAULT_MAX_LENGTH,
            isNextEnabled: false,
            otp: "",
            isLoading: false,
            error: null,
        }),
}));