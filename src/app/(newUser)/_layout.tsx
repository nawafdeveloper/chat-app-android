import { Stack } from 'expo-router'
import React from 'react'

const NewUserLayout = () => {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name='index' />
            <Stack.Screen name='verify-new-pin-code' />
        </Stack>
    )
}

export default NewUserLayout