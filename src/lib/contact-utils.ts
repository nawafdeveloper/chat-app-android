import type { Contact, ContactPayload } from "@/types/contacts.type";

export function normalizePhoneNumber(value: string): string {
    const trimmed = value.trim();
    const digits = trimmed.replace(/\D/g, "");

    if (!digits) {
        return "";
    }

    return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function buildPhoneLookupVariants(value: string): string[] {
    const normalized = normalizePhoneNumber(value);

    if (!normalized) {
        return [];
    }

    const variants = new Set<string>();
    const digits = normalized.replace(/\D/g, "");

    const addDigitsVariant = (nextDigits: string) => {
        if (!nextDigits) {
            return;
        }

        variants.add(nextDigits);
        variants.add(`+${nextDigits}`);
    };

    variants.add(normalized);
    addDigitsVariant(digits);

    if (digits) {
        for (
            let countryCodeLength = 1;
            countryCodeLength <= 3;
            countryCodeLength += 1
        ) {
            const countryCode = digits.slice(0, countryCodeLength);
            const subscriber = digits.slice(countryCodeLength);

            if (!countryCode || !subscriber) {
                continue;
            }

            const trimmedSubscriber = subscriber.replace(/^0+/, "");
            if (!trimmedSubscriber) {
                continue;
            }

            addDigitsVariant(`${countryCode}${trimmedSubscriber}`);
            addDigitsVariant(`${countryCode}0${trimmedSubscriber}`);
        }
    }

    return [...variants];
}

export function buildPhoneDigitLookupVariants(value: string): string[] {
    return [
        ...new Set(
            buildPhoneLookupVariants(value)
                .map((variant) => variant.replace(/\D/g, ""))
                .filter(Boolean)
        ),
    ];
}

export function phoneValuesMatch(
    left: string | null | undefined,
    right: string | null | undefined
): boolean {
    if (!left || !right) {
        return false;
    }

    const leftVariants = new Set(buildPhoneLookupVariants(left));
    const rightVariants = buildPhoneLookupVariants(right);

    return rightVariants.some((variant) => leftVariants.has(variant));
}

export function buildFullPhoneNumber(
    dialCode: string | undefined,
    phoneNumber: string
): string {
    const normalizedDialCode = normalizePhoneNumber(dialCode ?? "");
    const rawLocalDigits = phoneNumber.replace(/\D/g, "");
    const localDigits = normalizedDialCode
        ? rawLocalDigits.replace(/^0+/, "")
        : rawLocalDigits;

    if (!normalizedDialCode || !localDigits) {
        return normalizePhoneNumber(`${normalizedDialCode}${localDigits}`);
    }

    return `${normalizedDialCode}${localDigits}`;
}

export function deriveContactLetterGroup({
    contact_first_name,
    contact_second_name,
    contact_number,
}: ContactPayload): string {
    const source =
        contact_first_name?.trim() ||
        contact_second_name?.trim() ||
        contact_number.trim();
    const firstCharacter = source.charAt(0).toUpperCase();

    return /^[A-Z]$/.test(firstCharacter) ? firstCharacter : "#";
}

export function toContactDisplayName(contact: Pick<
    Contact,
    "contact_first_name" | "contact_second_name" | "contact_number"
>): string {
    const fullName = `${contact.contact_first_name ?? ""} ${contact.contact_second_name ?? ""
        }`
        .trim()
        .replace(/\s+/g, " ");

    return fullName || contact.contact_number;
}

export function createContactSearchValue(contact: Contact): string {
    return [
        contact.contact_first_name,
        contact.contact_second_name,
        toContactDisplayName(contact),
        contact.contact_number,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}
