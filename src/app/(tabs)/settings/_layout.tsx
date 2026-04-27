import { Stack } from 'expo-router'
import React from 'react'

const SettingsLayout = () => {
    return (
        <Stack>
            <Stack.Screen
                name='index'
                options={{
                    headerShown: false
                }}
            />
            <Stack.Screen
                name='sub-setting'
                options={{
                    headerShown: false
                }}
            />
        </Stack>
    )
}

export default SettingsLayout