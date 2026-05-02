export const formatPhoneNumber = (phoneNumber: string | null | undefined) => {
    if (!phoneNumber) return '';

    let cleaned = phoneNumber.replace(/[^\d+]/g, '');

    if (!cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    }

    const countryMatch = cleaned.match(/^\+\d{1,3}/);
    if (!countryMatch) return phoneNumber;

    const countryCode = countryMatch[0];
    const nationalNumber = cleaned.slice(countryCode.length);

    if (countryCode === '+972') return '';

    const formats = {
        '+1': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            if (num.length === 11) return `${countryCode} ${num.slice(1, 4)} ${num.slice(4, 7)} ${num.slice(7)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+7': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+20': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+27': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+30': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+31': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+32': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+33': (num: string) => {
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+34': (num: string) => {
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+36': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+39': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+40': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+41': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+43': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+44': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 4)} ${num.slice(4, 7)} ${num.slice(7)}`;
            return `${countryCode} ${num.match(/.{1,4}/g)?.join(' ') || num}`;
        },
        '+45': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+46': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+47': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+48': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+49': (num: string) => {
            if (num.length === 11) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+51': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+52': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5, 8)} ${num.slice(8)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+53': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+54': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+55': (num: string) => {
            if (num.length === 11) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 7)} ${num.slice(7)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+56': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+57': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+58': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+60': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+61': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+62': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+63': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+64': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+65': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+66': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+81': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+82': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+84': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+86': (num: string) => {
            if (num.length === 11) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 7)} ${num.slice(7)}`;
            return `${countryCode} ${num.match(/.{1,4}/g)?.join(' ') || num}`;
        },
        '+90': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+91': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 4)} ${num.slice(4, 7)} ${num.slice(7)}`;
            return `${countryCode} ${num.match(/.{1,4}/g)?.join(' ') || num}`;
        },
        '+92': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+93': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+94': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+95': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+98': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+212': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+213': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+216': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+218': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+220': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+221': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+222': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+223': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+224': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+225': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+226': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+227': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+228': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+229': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+230': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+231': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+232': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+233': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+234': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+235': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+236': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+237': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+238': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+239': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+240': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+241': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+242': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+243': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+244': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+245': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+246': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+247': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+248': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+249': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+250': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+251': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+252': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+253': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+254': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+255': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+256': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+257': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+258': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+260': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+261': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+262': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+263': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+264': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+265': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+266': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+267': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+268': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+269': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+290': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+291': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+297': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+298': (num: string) => {
            if (num.length === 6) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+299': (num: string) => {
            if (num.length === 6) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+350': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+351': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+352': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+353': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+354': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+355': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+356': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+357': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+358': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+359': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+370': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+371': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+372': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+373': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+374': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+375': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+376': (num: string) => {
            if (num.length === 6) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+377': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+378': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+379': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+380': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+381': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+382': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+383': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+385': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+386': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+387': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+389': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+420': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+421': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+423': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+500': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+501': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+502': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+503': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+504': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+505': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+506': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+507': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+508': (num: string) => {
            if (num.length === 6) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+509': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+590': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+591': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+592': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+593': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+594': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+595': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+596': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+597': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+598': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+599': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+670': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+672': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+673': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+674': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+675': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+676': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+677': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+678': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+679': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+680': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+681': (num: string) => {
            if (num.length === 6) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+682': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+683': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+685': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+686': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+687': (num: string) => {
            if (num.length === 6) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,2}/g)?.join(' ') || num}`;
        },
        '+688': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+689': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+690': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+691': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+692': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+852': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,4}/g)?.join(' ') || num}`;
        },
        '+853': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 4)} ${num.slice(4)}`;
            return `${countryCode} ${num.match(/.{1,4}/g)?.join(' ') || num}`;
        },
        '+855': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+856': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+880': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+886': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+960': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+961': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+962': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+963': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+964': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+965': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+966': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+967': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+968': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+970': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+971': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+972': (num: string) => {
            return '';
        },
        '+973': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+974': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+975': (num: string) => {
            if (num.length === 7) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+976': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+977': (num: string) => {
            if (num.length === 10) return `${countryCode} ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+992': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+993': (num: string) => {
            if (num.length === 8) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+994': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+995': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+996': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
        '+998': (num: string) => {
            if (num.length === 9) return `${countryCode} ${num.slice(0, 2)} ${num.slice(2, 5)} ${num.slice(5)}`;
            return `${countryCode} ${num.match(/.{1,3}/g)?.join(' ') || num}`;
        },
    };

    if (formats[countryCode as keyof typeof formats]) {
        return formats[countryCode as keyof typeof formats](nationalNumber);
    }

    const length = nationalNumber.length;

    if (length === 7) {
        return `${countryCode} ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3)}`;
    } else if (length === 8) {
        return `${countryCode} ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4)}`;
    } else if (length === 9) {
        return `${countryCode} ${nationalNumber.slice(0, 2)} ${nationalNumber.slice(2, 5)} ${nationalNumber.slice(5)}`;
    } else if (length === 10) {
        return `${countryCode} ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 6)} ${nationalNumber.slice(6)}`;
    } else if (length === 11) {
        return `${countryCode} ${nationalNumber.slice(0, 4)} ${nationalNumber.slice(4, 7)} ${nationalNumber.slice(7)}`;
    } else if (length === 12) {
        return `${countryCode} ${nationalNumber.slice(0, 3)} ${nationalNumber.slice(3, 6)} ${nationalNumber.slice(6, 9)} ${nationalNumber.slice(9)}`;
    } else {
        const groups = [];
        let remaining = nationalNumber;

        while (remaining.length > 4) {
            groups.push(remaining.slice(0, 3));
            remaining = remaining.slice(3);
        }
        groups.push(remaining);

        return `${countryCode} ${groups.join(' ')}`;
    }
};