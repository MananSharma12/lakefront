import { Router, Request, Response } from "express";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createUser, usersTable } from "../db/schema";

export default function userRoutes(db: PostgresJsDatabase) {
    const router = Router();

    router.post("/", async (req: Request, res: Response) => {
        const {email, password} = req.body;
        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser(email, hashedPassword);
        res.status(201).json({
            message: "User registered successfully"
        });
    })

    router.post("/login", async (req: Request, res: Response) => {
        const {email, password} = req.body;
        const user = await db.select(usersTable).where(usersTable.email.eq(email))

        if (user.length === 0) {
            return res.status(401).json({
                message: "Invalid credentials"
            })
        }

        const validPassword = await bcrypt.compare(password, user[0].password_hash);
        if (!validPassword) {
            return res.status(401).json({
                message: "Invalid credentials"
            })
        }

        const token = jwt.sign({user}, process.env.JWT_SECRET!, {})
    })
}