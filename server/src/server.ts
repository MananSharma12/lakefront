import express, { Request, Response } from "express"
import dotenv from "dotenv"
import cors from "cors"
import { createServer } from "http";

dotenv.config()

import { db } from "./db"
import userRoutes from "./routes/users";
import roomRoutes from "./routes/rooms";
import { setupSignaling } from "./signaling";

const app = express()
const httpServer = createServer(app)

setupSignaling(httpServer)

app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/api/users", userRoutes(db))
app.use("/api/rooms", roomRoutes(db))

app.get("/", (req: Request, res: Response) => {
    res.json({ message: "Server is running 🚀" });
})

const PORT = process.env.PORT || 4000
httpServer.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`)
})
