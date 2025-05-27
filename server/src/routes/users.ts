import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createUser, usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export default function userRoutes(db: PostgresJsDatabase) {
    const router = Router();

    router.post("/", (async (req: Request, res: Response) => {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required",
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser(email, hashedPassword);
        return res.status(201).json({
            message: "User registered successfully",
        });
    }) as unknown as Router);

    router.post("/login", (async (req: Request, res: Response) => {
        const { email, password } = req.body;

        const [user] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email))
            .limit(1);

        if (!user) {
            return res.status(401).json({
                message: "Invalid credentials",
            });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({
                message: "Invalid credentials",
            });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, {
            expiresIn: "1D",
        });

        return res.status(200).json({
            message: "Login successful",
            token,
        });
    }) as unknown as Router);

    return router;
}
