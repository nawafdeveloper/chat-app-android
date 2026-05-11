import * as MediaLibrary from 'expo-media-library';
import { Alert, Platform } from 'react-native';

interface DownloadResult {
    success: boolean;
    uri?: string;
    error?: string;
}

export const saveImageToGallery = async (localFileUri: string): Promise<DownloadResult> => {
    try {
        // Request permission
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to save to gallery');
            return { success: false, error: 'Permission denied' };
        }

        // Ensure URI has proper format for MediaLibrary
        let finalUri = localFileUri;
        if (Platform.OS === 'android' && !finalUri.startsWith('file://')) {
            finalUri = `file://${finalUri}`;
        }

        // Save directly to gallery
        const asset = await MediaLibrary.createAssetAsync(finalUri);
        
        // Optional: Save to a specific album
        const albumName = 'ChatApp';
        let album = await MediaLibrary.getAlbumAsync(albumName);
        if (album) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
            await MediaLibrary.createAlbumAsync(albumName, asset, false);
        }

        Alert.alert('Success', 'Image saved to gallery!');
        return { success: true, uri: asset.uri };
    } catch (error) {
        console.error('Save to gallery error:', error);
        Alert.alert('Error', 'Failed to save image to gallery');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
};

export const saveVideoToGallery = async (localFileUri: string): Promise<DownloadResult> => {
    try {
        // Request permission
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission required', 'Please allow access to save to gallery');
            return { success: false, error: 'Permission denied' };
        }

        // Ensure URI has proper format for MediaLibrary
        let finalUri = localFileUri;
        if (Platform.OS === 'android' && !finalUri.startsWith('file://')) {
            finalUri = `file://${finalUri}`;
        }

        // Save directly to gallery
        const asset = await MediaLibrary.createAssetAsync(finalUri);
        
        // Optional: Save to a specific album
        const albumName = 'ChatApp Videos';
        let album = await MediaLibrary.getAlbumAsync(albumName);
        if (album) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
        } else {
            await MediaLibrary.createAlbumAsync(albumName, asset, false);
        }

        Alert.alert('Success', 'Video saved to gallery!');
        return { success: true, uri: asset.uri };
    } catch (error) {
        console.error('Save to gallery error:', error);
        Alert.alert('Error', 'Failed to save video to gallery');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
};

// Generic function that detects media type based on file extension
export const saveMediaToGallery = async (localFileUri: string): Promise<DownloadResult> => {
    try {
        // Detect media type from file extension
        const fileExtension = localFileUri.split('.').pop()?.toLowerCase() || '';
        const videoExtensions = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', '3gp'];
        const isVideo = videoExtensions.includes(fileExtension);
        
        if (isVideo) {
            return await saveVideoToGallery(localFileUri);
        } else {
            return await saveImageToGallery(localFileUri);
        }
    } catch (error) {
        console.error('Save media error:', error);
        Alert.alert('Error', 'Failed to save media to gallery');
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
};