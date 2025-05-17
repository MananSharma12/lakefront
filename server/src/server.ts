import express, { Request, Response } from "express"
import dotenv from "dotenv"
import postgres from "pg"
import {PostgresJsDatabase} from "drizzle-orm/postgres-js";
import {drizzle} from "drizzle-orm/neon-http";

dotenv.config()

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const pool = new postgres.Pool({
    connectionString: process.env.DATABASE_URL,
})

const db: PostgresJsDatabase = drizzle(pool)

app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running 🚀" });
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`)
})
