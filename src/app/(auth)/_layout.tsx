import { Stack } from 'expo-router'
import React from 'react'

const AuthLayout = () => {
    return (
        <Stack>
            <Stack.Screen name='index' options={{ headerShown: false }} />
            <Stack.Screen name='select-country' options={{ headerShown: false, animation: 'fade_from_bottom', animationDuration: 100 }} />
            <Stack.Screen name='otp-verification' options={{ headerShown: false }} />
        </Stack>
    )
}

export default AuthLayout