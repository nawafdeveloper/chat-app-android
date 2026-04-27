import { Colors } from '@/constants/theme'
import React, { useState } from 'react'
import { StyleSheet, useColorScheme } from 'react-native'
import { TextInput } from 'react-native-paper'
import { ThemedView } from './themed-view'

const ProfileSettings = () => {
    const scheme = useColorScheme();
    const colors = Colors[scheme === 'unspecified' ? 'light' : scheme ?? 'light'];

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [about, setAbout] = useState('');

    return (
        <ThemedView style={styles.main}>
            <TextInput
                label="First name"
                value={firstName}
                onChangeText={text => setFirstName(text)}
                cursorColor='#25D366'
                underlineColor={colors.indicator}
                activeUnderlineColor='#25D366'
                style={{
                    backgroundColor: colors.card,
                }}
            />
            <TextInput
                label="Last name"
                value={lastName}
                onChangeText={text => setLastName(text)}
                cursorColor='#25D366'
                underlineColor={colors.indicator}
                activeUnderlineColor='#25D366'
                style={{
                    backgroundColor: colors.card,
                }}
            />
            <TextInput
                label="About"
                value={about}
                onChangeText={text => setAbout(text)}
                cursorColor='#25D366'
                underlineColor={colors.indicator}
                activeUnderlineColor='#25D366'
                style={{
                    backgroundColor: colors.card,
                }}
            />
        </ThemedView>
    )
}

export default ProfileSettings

const styles = StyleSheet.create({
    main: {
        flex: 1,
        width: '100%',
        padding: 16,
        gap: 24
    },
})