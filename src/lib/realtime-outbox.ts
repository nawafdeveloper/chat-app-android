import { db } from "@/db/client";
import {
    pendingRealtimeEvents,
    type DbPendingRealtimeEvent,
    type DbPendingRealtimeEventInsert,
} from "@/db/schema";
import type { ClientRealtimeEvent } from "@/types/realtime-events";
import { asc, eq } from "drizzle-orm";

const DURABLE_EVENT_TYPES = new Set<ClientRealtimeEvent["type"]>([
    "SEND_MESSAGE",
    "REACT_MESSAGE",
    "MARK_DELIVERED",
    "MARK_READ",
]);

let isFlushing = false;
let shouldFlushAgain = false;

export function isDurableRealtimeEvent(event: ClientRealtimeEvent) {
    return DURABLE_EVENT_TYPES.has(event.type);
}

function createLocalId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getEventDedupeKey(event: ClientRealtimeEvent) {
    switch (event.type) {
        case "SEND_MESSAGE":
            return `SEND_MESSAGE:${event.clientMessageId ?? createLocalId()}`;
        case "REACT_MESSAGE":
            return [
                "REACT_MESSAGE",
                event.conversationId,
                event.messageId,
                event.reactionEmoji,
            ].join(":");
        case "MARK_DELIVERED":
            return [
                "MARK_DELIVERED",
                event.conversationId,
                event.messageId ?? "conversation",
            ].join(":");
        case "MARK_READ":
            return `MARK_READ:${event.conversationId}`;
        default:
            return `${event.type}:${createLocalId()}`;
    }
}

function rowToEvent(row: DbPendingRealtimeEvent): ClientRealtimeEvent | null {
    try {
        return JSON.parse(row.event_json) as ClientRealtimeEvent;
    } catch {
        return null;
    }
}

function requiresServerAck(event: ClientRealtimeEvent) {
    return event.type === "MARK_READ";
}

async function upsertPendingEvent(values: DbPendingRealtimeEventInsert) {
    await db
        .insert(pendingRealtimeEvents)
        .values(values)
        .onConflictDoUpdate({
            target: pendingRealtimeEvents.dedupe_key,
            set: {
                event_json: values.event_json,
                event_type: values.event_type,
                attempts: 0,
                last_error: null,
                updated_at: values.updated_at,
            },
        });
}

export async function enqueueRealtimeEvent(event: ClientRealtimeEvent) {
    if (!isDurableRealtimeEvent(event)) {
        return null;
    }

    const now = new Date().toISOString();
    const pendingEvent: DbPendingRealtimeEventInsert = {
        id: createLocalId(),
        event_type: event.type,
        dedupe_key: getEventDedupeKey(event),
        event_json: JSON.stringify(event),
        attempts: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
    };

    await upsertPendingEvent(pendingEvent);
    return pendingEvent.id;
}

export async function completePendingRealtimeEvent(event: ClientRealtimeEvent) {
    if (!isDurableRealtimeEvent(event)) {
        return;
    }

    await db
        .delete(pendingRealtimeEvents)
        .where(eq(pendingRealtimeEvents.dedupe_key, getEventDedupeKey(event)));
}

export async function getPendingMarkReadEvents() {
    const rows = await db
        .select()
        .from(pendingRealtimeEvents)
        .where(eq(pendingRealtimeEvents.event_type, "MARK_READ"));

    return rows
        .map((row) => {
            const event = rowToEvent(row);
            if (event?.type !== "MARK_READ") {
                return null;
            }

            return {
                conversationId: event.conversationId,
                messageId: event.messageId ?? null,
                updatedAt: new Date(row.updated_at),
            };
        })
        .filter(
            (
                event
            ): event is {
                conversationId: string;
                messageId: string | null;
                updatedAt: Date;
            } => Boolean(event)
        );
}

export async function flushPendingRealtimeEvents(socket: WebSocket | null) {
    if (
        !socket ||
        socket.readyState !== WebSocket.OPEN
    ) {
        return;
    }

    if (isFlushing) {
        shouldFlushAgain = true;
        return;
    }

    isFlushing = true;

    try {
        do {
            shouldFlushAgain = false;

            const rows = await db
                .select()
                .from(pendingRealtimeEvents)
                .orderBy(asc(pendingRealtimeEvents.created_at));

            for (const row of rows) {
                if (socket.readyState !== WebSocket.OPEN) {
                    break;
                }

                const event = rowToEvent(row);
                if (!event) {
                    await db
                        .delete(pendingRealtimeEvents)
                        .where(eq(pendingRealtimeEvents.id, row.id));
                    continue;
                }

                try {
                    socket.send(JSON.stringify(event));

                    if (requiresServerAck(event)) {
                        await db
                            .update(pendingRealtimeEvents)
                            .set({
                                attempts: row.attempts + 1,
                                last_error: null,
                                updated_at: new Date().toISOString(),
                            })
                            .where(eq(pendingRealtimeEvents.id, row.id));
                    } else {
                        await db
                            .delete(pendingRealtimeEvents)
                            .where(eq(pendingRealtimeEvents.id, row.id));
                    }
                } catch (error) {
                    await db
                        .update(pendingRealtimeEvents)
                        .set({
                            attempts: row.attempts + 1,
                            last_error:
                                error instanceof Error
                                    ? error.message
                                    : "Failed to send realtime event",
                            updated_at: new Date().toISOString(),
                        })
                        .where(eq(pendingRealtimeEvents.id, row.id));
                    break;
                }
            }

            if (socket.readyState !== WebSocket.OPEN) {
                break;
            }
        } while (shouldFlushAgain);
    } finally {
        isFlushing = false;
    }
}
