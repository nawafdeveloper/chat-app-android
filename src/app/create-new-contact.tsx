import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { countryCodes } from '@/constants/country-code'
import { Colors } from '@/constants/theme'
import { useCryptoKeys } from '@/context/crypto'
import { buildFullPhoneNumber, normalizePhoneNumber } from '@/lib/contact-utils'
import { useCreateContactStore } from '@/store/use-create-contact-store'
import type { AccountStatus } from '@/store/use-create-contact-store'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useEffect } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import {
    ActivityIndicator,
    Appbar,
    Button,
    HelperText,
    Icon,
    TextInput,
    TouchableRipple,
} from 'react-native-paper'

const getPhoneHelperText = (
    accountStatus: AccountStatus,
    error: string | null
) => {
    if (error) {
        return error
    }

    if (accountStatus === 'exists') {
        return 'This number has an account and can be added.'
    }

    if (accountStatus === 'duplicate') {
        return 'This contact already exists.'
    }

    if (accountStatus === 'missing') {
        return 'This number does not have an account.'
    }

    return ' '
}

const countriesByLongestDialCode = [...countryCodes].sort(
    (left, right) =>
        right.code.replace(/\D/g, '').length -
        left.code.replace(/\D/g, '').length
)

const resolvePhonePrefill = (phoneNumber: string) => {
    const normalized = normalizePhoneNumber(phoneNumber)
    const digits = normalized.replace(/\D/g, '')

    if (!digits) {
        return null
    }

    const country = countriesByLongestDialCode.find((item) => {
        const dialDigits = item.code.replace(/\D/g, '')
        return dialDigits.length > 0 && digits.startsWith(dialDigits)
    })

    if (!country) {
        return null
    }

    const dialDigits = country.code.replace(/\D/g, '')
    const localDigits = digits.slice(dialDigits.length).slice(0, country.maxLength)

    return {
        country,
        localDigits,
        fullPhoneNumber: buildFullPhoneNumber(country.code, localDigits),
    }
}

const CreateNewContact = () => {
    const scheme = useColorScheme()
    const resolvedScheme = scheme === 'unspecified' ? 'light' : scheme ?? 'light'
    const colors = Colors[resolvedScheme]
    const { isReady } = useCryptoKeys()
    const params = useLocalSearchParams<{ phoneNumber?: string | string[] }>()
    const initialPhoneNumber = Array.isArray(params.phoneNumber)
        ? params.phoneNumber[0]
        : params.phoneNumber
    const {
        selectedCountry,
        setSelectedCountry,
        firstName,
        setFirstName,
        lastName,
        setLastName,
        phoneMaxLength,
        phoneNumber,
        setPhoneNumber,
        fullPhoneNumber,
        linkedUserId,
        accountStatus,
        error,
        resetContactCheck,
        verifyContact,
        createContact,
        isCreating,
        isVerifying,
    } = useCreateContactStore()

    useEffect(() => {
        if (!initialPhoneNumber) {
            return
        }

        const prefill = resolvePhonePrefill(initialPhoneNumber)
        if (!prefill || prefill.fullPhoneNumber === fullPhoneNumber) {
            return
        }

        setSelectedCountry(prefill.country)
        setPhoneNumber(prefill.localDigits)
    }, [fullPhoneNumber, initialPhoneNumber, setPhoneNumber, setSelectedCountry])

    useEffect(() => {
        if (!fullPhoneNumber || phoneNumber.length < 5) {
            resetContactCheck()
            return
        }

        const timeoutId = setTimeout(() => {
            void verifyContact()
        }, 400)

        return () => clearTimeout(timeoutId)
    }, [fullPhoneNumber, phoneNumber, resetContactCheck, verifyContact])

    const phoneHelperText = getPhoneHelperText(accountStatus, error)
    const hasPhoneProblem =
        accountStatus === 'missing' ||
        accountStatus === 'duplicate' ||
        accountStatus === 'error' ||
        Boolean(error)
    const canCreate =
        isReady &&
        accountStatus === 'exists' &&
        Boolean(linkedUserId) &&
        Boolean(firstName.trim()) &&
        !isCreating &&
        !isVerifying

    const handleCreateContact = async () => {
        const created = await createContact()
        if (created) {
            router.back()
        }
    }

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header style={{ backgroundColor: colors.background, borderBottomColor: colors.indicator + '33', borderBottomWidth: 1 }}>
                <Appbar.BackAction onPress={() => router.back()} disabled={isCreating} />
                <Appbar.Content title='Create new contact' />
            </Appbar.Header>
            <ThemedView style={styles.contentContainer}>
                <TextInput
                    label="First name"
                    value={firstName}
                    onChangeText={setFirstName}
                    disabled={isCreating}
                    error={Boolean(error) && !firstName.trim()}
                    mode='flat'
                    cursorColor='#25D366'
                    underlineColor={colors.indicator}
                    activeUnderlineColor='#25D366'
                    style={{
                        backgroundColor: colors.background,
                        borderRadius: 0,
                    }}
                />
                <TextInput
                    label="Last name"
                    value={lastName}
                    onChangeText={setLastName}
                    disabled={isCreating}
                    mode='flat'
                    cursorColor='#25D366'
                    underlineColor={colors.indicator}
                    activeUnderlineColor='#25D366'
                    style={{
                        backgroundColor: colors.background,
                        borderRadius: 0,
                    }}
                />
                <ThemedView style={styles.phoneMainContainer}>
                    <TouchableRipple
                        onPress={() => router.push('/create-contact-select-country')}
                        disabled={isCreating}
                    >
                        <ThemedView style={[styles.countrySelectorButton, { borderBottomColor: colors.indicator }]}>
                            <ThemedText>{selectedCountry.code}</ThemedText>
                            <Icon
                                source="unfold-more-horizontal"
                                color={colors.text}
                                size={20}
                            />
                        </ThemedView>
                    </TouchableRipple>
                    <TextInput
                        label="Phone number"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        maxLength={phoneMaxLength}
                        disabled={isCreating}
                        error={hasPhoneProblem}
                        mode='flat'
                        keyboardType='numeric'
                        cursorColor='#25D366'
                        underlineColor={colors.indicator}
                        activeUnderlineColor='#25D366'
                        right={
                            accountStatus === 'checking' ? (
                                <TextInput.Icon
                                    icon={() => (
                                        <ActivityIndicator size='small' color='#25D366' />
                                    )}
                                    disabled
                                />
                            ) : accountStatus === 'exists' ? (
                                <TextInput.Icon
                                    icon='check-circle-outline'
                                    color='#25D366'
                                    disabled
                                />
                            ) : undefined
                        }
                        style={{
                            backgroundColor: colors.background,
                            borderRadius: 0,
                            flex: 1
                        }}
                    />
                </ThemedView>
                <HelperText
                    type={hasPhoneProblem ? 'error' : 'info'}
                    visible={phoneHelperText.trim().length > 0}
                    style={styles.helperText}
                >
                    {phoneHelperText}
                </HelperText>
                {!isReady ? (
                    <ThemedText style={[styles.keyWarning, { color: colors.textSecondary }]}>
                        Unlock your encryption keys before saving a contact.
                    </ThemedText>
                ) : null}
                <Button
                    mode="contained"
                    buttonColor='#25D366'
                    textColor='#1C1E21'
                    disabled={!canCreate}
                    loading={isCreating}
                    onPress={handleCreateContact}
                    style={styles.submitButton}
                >
                    Add contact
                </Button>
            </ThemedView>
        </ThemedView>
    )
}

export default CreateNewContact

const styles = StyleSheet.create({
    main: {
        flex: 1
    },
    contentContainer: {
        flexDirection: 'column',
        gap: 16,
        paddingHorizontal: 16,
        paddingVertical: 8
    },
    phoneMainContainer: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 16
    },
    countrySelectorButton: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        borderBottomWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    helperText: {
        marginTop: -12,
        marginBottom: 4,
    },
    keyWarning: {
        fontSize: 13,
    },
    submitButton: {
        marginTop: 4,
        borderRadius: 99,
    },
})
