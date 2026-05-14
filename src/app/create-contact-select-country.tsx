import { ThemedView } from '@/components/themed-view'
import { ThemedText } from '@/components/themed-text'
import { CountryCodeData, countryCodes } from '@/constants/country-code'
import { Colors } from '@/constants/theme'
import { useCreateContactStore } from '@/store/use-create-contact-store'
import { router } from 'expo-router'
import React, { useMemo, useState } from 'react'
import { FlatList, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native'
import { Appbar, List, Searchbar } from 'react-native-paper'

const CreateContactSelectCountry = () => {
    const scheme = useColorScheme()
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light']
    const { setSelectedCountry } = useCreateContactStore();

    const [searchQuery, setSearchQuery] = useState('')

    const filteredCountries = useMemo(() => {
        if (!searchQuery.trim()) {
            return countryCodes
        }
        const query = searchQuery.toLowerCase().trim()
        return countryCodes.filter(country =>
            country.label.toLowerCase().includes(query) ||
            country.code.includes(query) ||
            country.key.toLowerCase().includes(query)
        )
    }, [searchQuery])

    const renderCountryItem = ({ item }: { item: CountryCodeData }) => (
        <TouchableOpacity
            style={[styles.countryItem]}
            onPress={() => {
                router.back();
                setSelectedCountry(item);
            }}
        >
            <ThemedText style={styles.flagEmoji}>{item.flag}</ThemedText>
            <List.Item
                title={item.label}
                titleStyle={[styles.countryLabel, { color: colors.text }]}
                style={styles.listItem}
            />
            <ThemedText style={[styles.countryCodeRight, { color: colors.text }]}>
                {item.code}
            </ThemedText>
        </TouchableOpacity>
    )

    return (
        <ThemedView style={styles.main}>
            <Appbar.Header
                style={{
                    backgroundColor: colors.background,
                }}
            >
                <Appbar.BackAction onPress={() => router.back()} />
                <Appbar.Content title="Your country" />
            </Appbar.Header>
            <ThemedView style={styles.contentContainer}>
                <Searchbar
                    placeholder="Search your country"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    style={{ backgroundColor: colors.card, marginBottom: 12 }}
                    cursorColor={'#25D366'}
                    iconColor={colors.text}
                    inputStyle={{ color: colors.text }}
                    placeholderTextColor={colors.text}
                />
                <FlatList
                    data={filteredCountries}
                    renderItem={renderCountryItem}
                    keyExtractor={(item) => item.key}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={50}
                    maxToRenderPerBatch={20}
                    windowSize={10}
                    ListEmptyComponent={() => (
                        <ThemedView style={styles.emptyContainer}>
                            <ThemedText style={[styles.emptyText, { color: colors.text }]}>
                                No countries found
                            </ThemedText>
                        </ThemedView>
                    )}
                />
            </ThemedView>
        </ThemedView>
    )
}

export default CreateContactSelectCountry

const styles = StyleSheet.create({
    main: {
        flex: 1,
    },
    contentContainer: {
        flex: 1,
        paddingHorizontal: 16,
        maxWidth: 430,
        marginHorizontal: 'auto',
        width: '100%'
    },
    countryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
    },
    flagEmoji: {
        fontSize: 16,
        marginRight: 12,
        marginLeft: 4,
    },
    listItem: {
        flex: 1,
        paddingVertical: 0,
        marginVertical: 0,
    },
    countryLabel: {
        fontSize: 16,
        fontWeight: '500',
    },
    countryCodeRight: {
        fontSize: 15,
        marginRight: 8,
        fontWeight: '500',
    },
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 50,
    },
    emptyText: {
        fontSize: 16,
    },
})
