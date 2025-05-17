import express, { Request, Response } from "express"
import dotenv from "dotenv"
import postgres from "postgres"
import { PostgresJsDatabase, drizzle} from "drizzle-orm/postgres-js";

dotenv.config()

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const sql = postgres(process.env.DATABASE_URL as string);
const db: PostgresJsDatabase = drizzle(sql)

app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running 🚀" });
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`)
})
