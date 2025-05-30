import { Router, Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { createRoom, getRoomByCode, endRoom, roomsTable, usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

interface JwtPayload {
    id: number;
    email: string;
    [key: string]: any;
}

interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        email: string
    };
}

function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.status(401).json({ message: 'Access token required' });
        return;
    }

    jwt.verify(token, process.env.JWT_SECRET!, (err, decoded) => {
        if (err) {
            res.status(403).json({ message: 'Invalid token' });
            return;
        }
        const payload = decoded as JwtPayload;
        req.user = { id: payload.id, email: payload.email };
        next();
    });
}

export default function roomRoutes(db: PostgresJsDatabase) {
    const router = Router();

    router.post("/", authenticateToken, (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { title } = req.body;
            const hostId = req.user!.id;

            const room = await createRoom(hostId, title);

            return res.status(201).json({
                message: "Room created successfully",
                room: {
                    id: room.id,
                    roomCode: room.room_code,
                    title: room.title,
                    isActive: room.is_active,
                    createdAt: room.created_at
                }
            });
        } catch (error) {
            console.error('Error creating room:', error);
            return res.status(500).json({ message: 'Failed to create room' });
        }
    }) as unknown as Router);

    router.get("/:roomCode", authenticateToken, (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { roomCode } = req.params;
            const room = await getRoomByCode(roomCode);

            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            if (!room.is_active) {
                return res.status(410).json({ message: 'Room has ended' });
            }

            const [host] = await db
                .select({ email: usersTable.email })
                .from(usersTable)
                .where(eq(usersTable.id, room.host_id))
                .limit(1);

            const userId = req.user!.id;
            const isCreator = userId === room.host_id;

            return res.status(200).json({
                room: {
                    id: room.id,
                    roomCode: room.room_code,
                    title: room.title,
                    hostEmail: host?.email,
                    isActive: room.is_active,
                    createdAt: room.created_at,
                    isCreator
                }
            });
        } catch (error) {
            console.error('Error joining room:', error);
            return res.status(500).json({ message: 'Failed to join room' });
        }
    }) as unknown as Router);

    router.delete("/:roomCode", authenticateToken, (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const { roomCode } = req.params;
            const userId = req.user!.id;

            const room = await getRoomByCode(roomCode);
            if (!room) {
                return res.status(404).json({ message: 'Room not found' });
            }

            if (room.host_id !== userId) {
                return res.status(403).json({ message: 'Only the host can end the room' });
            }

            await endRoom(room.id);

            return res.status(200).json({ message: 'Room ended successfully' });
        } catch (error) {
            console.error('Error ending room:', error);
            return res.status(500).json({ message: 'Failed to end room' });
        }
    }) as unknown as Router);

    router.get("/", authenticateToken, (async (req: AuthenticatedRequest, res: Response) => {
        try {
            const userId = req.user!.id;

            const rooms = await db
                .select()
                .from(roomsTable)
                .where(eq(roomsTable.host_id, userId))
                .orderBy(roomsTable.created_at);

            return res.status(200).json({
                rooms: rooms.map(room => ({
                    id: room.id,
                    roomCode: room.room_code,
                    title: room.title,
                    isActive: room.is_active,
                    createdAt: room.created_at,
                    endedAt: room.ended_at
                }))
            });
        } catch (error) {
            console.error('Error fetching rooms:', error);
            return res.status(500).json({ message: 'Failed to fetch rooms' });
        }
    }) as unknown as Router);

    return router;
}
