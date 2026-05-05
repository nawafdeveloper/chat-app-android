import * as Contacts from 'expo-contacts';

export async function RequestContact() {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
        await Contacts.requestPermissionsAsync();
    }
}