import * as Contacts from 'expo-contacts';

export async function RequestContact() {
    const { status } = await Contacts.requestPermissionsAsync();
    let nextStatus = status;

    if (nextStatus !== 'granted') {
        const retry = await Contacts.requestPermissionsAsync();
        nextStatus = retry.status;
    }

    if (nextStatus !== 'granted') {
        return [];
    }

    const response = await Contacts.getContactsAsync({
        fields: [
            Contacts.Fields.FirstName,
            Contacts.Fields.LastName,
            Contacts.Fields.Name,
            Contacts.Fields.PhoneNumbers,
            Contacts.Fields.Image,
        ],
    });

    return response.data;
}
