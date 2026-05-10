import React from 'react'
import { StyleSheet } from 'react-native'
import { ThemedView } from './themed-view'

const ImagePreviewBeforeSent = () => {
    return (
        <ThemedView style={styles.main}>

        </ThemedView>
    )
}

export default ImagePreviewBeforeSent

const styles = StyleSheet.create({
    main: {
        flex: 1
    }
})