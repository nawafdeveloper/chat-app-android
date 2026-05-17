import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as SQLite from 'expo-sqlite';
import * as schema from './schema';

type MigrationRow = {
    created_at: number | string | null;
};

type TableColumnRow = {
    name: string;
};

const MESSAGE_READ_RECEIPTS_MIGRATION_AT = 1778469600000;
const PREVIOUS_MESSAGE_READ_RECEIPTS_MIGRATION_AT = 1778383200000;

const expo = SQLite.openDatabaseSync('db.db', {
    enableChangeListener: true,
});

function getLastMigrationAt(database: SQLite.SQLiteDatabase) {
    const rows = database.getAllSync<MigrationRow>(
        'SELECT created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1'
    );
    const value = rows[0]?.created_at;
    const timestamp = typeof value === 'number' ? value : Number(value);

    return Number.isFinite(timestamp) ? timestamp : null;
}

function markReadReceiptsMigrationApplied(database: SQLite.SQLiteDatabase) {
    const lastMigrationAt = getLastMigrationAt(database);

    if (
        lastMigrationAt === null ||
        lastMigrationAt >= MESSAGE_READ_RECEIPTS_MIGRATION_AT ||
        lastMigrationAt < PREVIOUS_MESSAGE_READ_RECEIPTS_MIGRATION_AT
    ) {
        return;
    }

    database.execSync(`
        INSERT INTO "__drizzle_migrations" ("hash", "created_at")
        VALUES ('', ${MESSAGE_READ_RECEIPTS_MIGRATION_AT})
    `);
}

export function ensureLocalDbSchema() {
    try {
        expo.execSync(`
            CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
                id SERIAL PRIMARY KEY,
                hash text NOT NULL,
                created_at numeric
            )
        `);
    } catch (error) {
        console.log('Failed to prepare local migration table:', error);
        return;
    }

    try {
        const columns = expo.getAllSync<TableColumnRow>('PRAGMA table_info("messages")');

        if (columns.length === 0) {
            return;
        }

        const columnNames = new Set(columns.map((column) => column.name));
        const missingReadByRecipient = !columnNames.has('is_read_by_recipient');
        const missingReadByUserIds = !columnNames.has('read_by_user_ids_json');

        if (!missingReadByRecipient && !missingReadByUserIds) {
            markReadReceiptsMigrationApplied(expo);
            return;
        }

        const lastMigrationAt = getLastMigrationAt(expo);

        if (
            lastMigrationAt === null ||
            lastMigrationAt < PREVIOUS_MESSAGE_READ_RECEIPTS_MIGRATION_AT
        ) {
            return;
        }

        if (missingReadByRecipient) {
            expo.execSync('ALTER TABLE "messages" ADD COLUMN "is_read_by_recipient" integer DEFAULT 0');
        }

        if (missingReadByUserIds) {
            expo.execSync('ALTER TABLE "messages" ADD COLUMN "read_by_user_ids_json" text');
        }

        if (missingReadByRecipient) {
            expo.execSync(`
                UPDATE "messages"
                SET "is_read_by_recipient" = 1
                WHERE "message_id" IN (
                    SELECT "last_message_id"
                    FROM "chats"
                    WHERE "last_message_is_read_by_recipient" = 1
                )
            `);
        }

        markReadReceiptsMigrationApplied(expo);
    } catch (error) {
        console.log('Failed to ensure local message read receipt columns:', error);
    }
}

ensureLocalDbSchema();

export const db = drizzle(expo, { schema });
