import { integer, pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { db } from "./index";
import { eq } from "drizzle-orm";

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash").notNull(),
    created_at: timestamp("created_at").defaultNow(),
})

export async function createUser(email: string, passwordHash: string) {
    return db.insert(usersTable).values({email, password_hash: passwordHash});
}

export const roomsTable = pgTable("rooms", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    room_code: text("room_code").notNull().unique(),
    host_id: integer("host_id").notNull().references(() => usersTable.id),
    title: text("title"),
    is_active: boolean("is_active").default(true),
    created_at: timestamp("created_at").defaultNow(),
    ended_at: timestamp("ended_at"),
})

export async function createRoom(hostId: number, title?: string) {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const [room] = await db.insert(roomsTable).values({
        room_code: roomCode,
        host_id: hostId,
        title: title || `Room ${roomCode}`,
    }).returning();
    return room;
}

export async function getRoomByCode(roomCode: string) {
    const [room] = await db
        .select()
        .from(roomsTable)
        .where(eq(roomsTable.room_code, roomCode))
        .limit(1);
    return room;
}

export async function endRoom(roomId: number) {
    return db
        .update(roomsTable)
        .set({ is_active: false, ended_at: new Date() })
        .where(eq(roomsTable.id, roomId));
}
