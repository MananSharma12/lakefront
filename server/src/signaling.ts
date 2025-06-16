import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Server as HttpServer } from "http";
import type {
    JwtPayload,
    Room,
    RoomParticipant,
    JoinRoomData,
    LeaveRoomData,
    AnswerData,
    OfferData,
    IceCandidateData
} from "./types";

export function setupSignaling(httpServer: HttpServer): Server {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            credentials: true,
            methods: ["GET", "POST"]
        },
        transports: ['websocket'],
        pingTimeout: 60000,
        pingInterval: 25000
    });

    const rooms = new Map<string, Room>();

    io.use((socket: Socket, next) => {
        const token = socket.handshake.auth.token;

        if (token) {
            jwt.verify(token, process.env.JWT_SECRET!, (err: any, decoded: any) => {
                if (err) {
                    return next(new Error("Invalid token"));
                } else {
                    const payload = decoded as JwtPayload;
                    socket.data.user = { id: payload.id, email: payload.email };
                }
                next();
            });
        } else {
            socket.data.user = null;
            next();
        }
    });

    const cleanupInterval = setInterval(() => {
        const now = new Date();
        for (const [roomCode, room] of rooms.entries()) {
            // Remove rooms that are empty for more than 5 minutes
            if (room.participants.size === 0 &&
                (now.getTime() - room.createdAt.getTime()) > 5 * 60 * 1000) {
                rooms.delete(roomCode);
            }
        }
    }, 60000);

    io.on("connection", (socket: Socket) => {
        socket.on('join-room', ({ roomCode, isHost }: JoinRoomData) => {
            roomCode = roomCode.toUpperCase();
            if (!rooms.has(roomCode)) {
                rooms.set(roomCode, {
                    code: roomCode,
                    participants: new Map(),
                    createdAt: new Date()
                });
            }

            const room = rooms.get(roomCode)!;

            if (room.participants.has(socket.id)) {
                return;
            }

            const participant: RoomParticipant = {
                socketId: socket.id,
                userId: socket.data.user?.id,
                email: socket.data.user?.email,
                joinedAt: new Date(),
                isHost
            };

            room.participants.set(socket.id, participant);

            if (isHost && !room.hostSocketId) {
                room.hostSocketId = socket.id;
            }

            socket.join(roomCode);

            const existingParticipants = Array.from(room.participants.values())
                .filter(p => p.socketId !== socket.id)
                .map(p => ({
                    socketId: p.socketId,
                    isHost: p.isHost,
                    email: p.email
                }));

            socket.to(roomCode).emit('user-joined', {
                socketId: socket.id,
                isHost,
                email: socket.data.user?.email
            });

            socket.emit('room-joined', {
                participants: existingParticipants
            });
        });

        socket.on('offer', ({ roomCode, offer, targetId }: OfferData) => {
            roomCode = roomCode.toUpperCase();

            const room = rooms.get(roomCode);
            if (room && room.participants.has(socket.id) && room.participants.has(targetId)) {
                socket.to(targetId).emit('offer', {
                    offer,
                    fromId: socket.id
                });
            } else {
                console.warn(`Invalid offer relay attempt in room ${roomCode}`);
            }
        });

        socket.on('answer', ({ roomCode, answer, targetId }: AnswerData) => {
            roomCode = roomCode.toUpperCase();

            const room = rooms.get(roomCode);
            if (room && room.participants.has(socket.id) && room.participants.has(targetId)) {
                socket.to(targetId).emit('answer', {
                    answer,
                    fromId: socket.id
                });
            } else {
                console.warn(`Invalid answer relay attempt in room ${roomCode}`);
            }
        });

        socket.on('ice-candidate', ({ roomCode, candidate, targetId }: IceCandidateData) => {
            roomCode = roomCode.toUpperCase(); // Consistent casing
            const room = rooms.get(roomCode);

            if (room && room.participants.has(socket.id) && room.participants.has(targetId)) {
                socket.to(targetId).emit('ice-candidate', {
                    candidate,
                    fromId: socket.id
                });
            } else {
                console.warn(`Invalid ICE candidate relay attempt in room ${roomCode} from ${socket.id} to ${targetId}`);
            }
        });

        socket.on('disconnect', () => {
            handleUserLeaving(socket.id);
        });

        socket.on('leave-room', ({ roomCode }: LeaveRoomData) => {
            roomCode = roomCode.toUpperCase();

            const room = rooms.get(roomCode);
            if (room && room.participants.has(socket.id)) {
                const participant = room.participants.get(socket.id)!;

                // Remove participant from room
                room.participants.delete(socket.id);
                socket.leave(roomCode);

                // Notify other participants
                socket.to(roomCode).emit('user-left', {
                    socketId: socket.id,
                    isHost: participant.isHost
                });

                if (room.hostSocketId === socket.id && room.participants.size > 0) {
                    const newHost = Array.from(room.participants.values())[0];
                    room.hostSocketId = newHost.socketId;
                    newHost.isHost = true;

                    io.to(newHost.socketId).emit('host-assigned', {
                        roomCode,
                        isHost: true
                    });

                    socket.to(roomCode).emit('host-changed', {
                        newHostSocketId: newHost.socketId,
                        newHostEmail: newHost.email
                    });
                }

                if (room.participants.size === 0) {
                    rooms.delete(roomCode);
                }
            }
        });

        socket.on('error', (error) => {
            console.error(`Socket error for ${socket.id}:`, error);
        });
    });

    function handleUserLeaving(socketId: string) {
        for (const [roomCode, room] of rooms.entries()) {
            if (room.participants.has(socketId)) {
                const participant = room.participants.get(socketId)!;
                room.participants.delete(socketId);

                io.to(roomCode).emit('user-left', {
                    socketId: socketId,
                    isHost: participant.isHost
                });

                if (room.hostSocketId === socketId && room.participants.size > 0) {
                    const newHost = Array.from(room.participants.values())[0];
                    room.hostSocketId = newHost.socketId;
                    newHost.isHost = true;

                    io.to(newHost.socketId).emit('host-assigned', {
                        roomCode,
                        isHost: true
                    });

                    io.to(roomCode).emit('host-changed', {
                        newHostSocketId: newHost.socketId,
                        newHostEmail: newHost.email
                    });
                }

                if (room.participants.size === 0) {
                    rooms.delete(roomCode);
                }
                break;
            }
        }
    }

    return io;
}
