import express, { Request, Response } from "express"
import dotenv from "dotenv"

dotenv.config()

import { db } from "./db"
import userRoutes from "./routes/users";

const app = express()
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/api/users", userRoutes(db))

app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running 🚀" });
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`)
})
