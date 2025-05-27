import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { db } from "./index";

export const usersTable = pgTable("users", {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    email: text("email").notNull().unique(),
    password_hash: text("password_hash").notNull(),
    created_at: timestamp("created_at").defaultNow(),
})

export async function createUser(email: string, passwordHash: string) {
    return db.insert(usersTable).values({email, password_hash: passwordHash});
}


