import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { Server as HttpServer } from "http";

interface JwtPayload {
    id: number;
    email: string;
    [key: string]: any;
}

interface RoomParticipant {
    socketId: string;
    userId?: number;
    email?: string;
    isHost: boolean;
    joinedAt: Date;
}

interface Room {
    code: string;
    participants: Map<string, RoomParticipant>;
    hostSocketId?: string;
    createdAt: Date;
}

export function setupSignaling(httpServer: HttpServer): Server {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            credentials: true,
            methods: ["GET", "POST"]
        },
        pingTimeout: 60000,
        pingInterval: 25000
    });

    const rooms = new Map<string, Room>();

    io.use((socket: Socket, next) => {
        const token = socket.handshake.auth.token;

        if (token) {
            jwt.verify(token, process.env.JWT_SECRET!, (err: any, decoded: any) => {
                if (err) {
                    console.log("Invalid token for socket:", socket.id);
                    return next(new Error("Invalid token"));
                } else {
                    const payload = decoded as JwtPayload;
                    socket.data.user = { id: payload.id, email: payload.email };
                    console.log("Authenticated user:", payload.email, "for socket:", socket.id);
                }
                next();
            });
        } else {
            socket.data.user = null;
            next();
        }
    });

    interface JoinRoomData {
        roomCode: string;
        isHost: boolean;
    }

    interface OfferData {
        roomCode: string;
        offer: RTCSessionDescriptionInit;
        targetId: string;
    }

    interface AnswerData {
        roomCode: string;
        answer: RTCSessionDescriptionInit;
        targetId: string;
    }

    interface IceCandidateData {
        candidate: RTCIceCandidateInit;
        targetId: string;
    }

    interface LeaveRoomData {
        roomCode: string;
    }

    const cleanupInterval = setInterval(() => {
        const now = new Date();
        for (const [roomCode, room] of rooms.entries()) {
            // Remove rooms that are empty for more than 5 minutes
            if (room.participants.size === 0 &&
                (now.getTime() - room.createdAt.getTime()) > 5 * 60 * 1000) {
                rooms.delete(roomCode);
                console.log(`Cleaned up empty room: ${roomCode}`);
            }
        }
    }, 60000);

    io.on("connection", (socket: Socket) => {
        console.log("User Connected:", socket.id, socket.data.user?.email || 'Guest');

        socket.on('join-room', ({ roomCode, isHost }: JoinRoomData) => {
            roomCode = roomCode.toUpperCase();
            console.log(`User ${socket.id} (${socket.data.user?.email || 'Guest'}) joining room ${roomCode} as ${isHost ? 'host' : 'guest'}`);

            if (!rooms.has(roomCode)) {
                console.log(`Creating new room: ${roomCode}`);
                rooms.set(roomCode, {
                    code: roomCode,
                    participants: new Map(),
                    createdAt: new Date()
                });
            }

            const room = rooms.get(roomCode)!;

            if (room.participants.has(socket.id)) {
                console.log(`User ${socket.id} is already in room ${roomCode}`);
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
                console.log(`Set ${socket.id} as host for room ${roomCode}`);
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

            console.log(`Room ${roomCode} now has ${room.participants.size} participants`);
        });

        socket.on('offer', ({ roomCode, offer, targetId }: OfferData) => {
            roomCode = roomCode.toUpperCase();
            console.log(`Relaying offer from ${socket.id} to ${targetId} in room ${roomCode}`);

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
            console.log(`Relaying answer from ${socket.id} to ${targetId} in room ${roomCode}`);

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

        socket.on('ice-candidate', ({ candidate, targetId }: IceCandidateData) => {
            console.log(`Relaying ICE candidate from ${socket.id} to ${targetId}`);

            let foundRoom = false;
            for (const [roomCode, room] of rooms.entries()) {
                if (room.participants.has(socket.id) && room.participants.has(targetId)) {
                    socket.to(targetId).emit('ice-candidate', {
                        candidate,
                        fromId: socket.id
                    });
                    foundRoom = true;
                    break;
                }
            }

            if (!foundRoom) {
                console.warn(`Invalid ICE candidate relay attempt from ${socket.id} to ${targetId}`);
            }
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id, socket.data.user?.email || 'Guest');
            handleUserLeaving(socket.id);
        });

        socket.on('leave-room', ({ roomCode }: LeaveRoomData) => {
            roomCode = roomCode.toUpperCase();
            console.log(`User ${socket.id} leaving room ${roomCode}`);

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

                    console.log(`Assigned new host ${newHost.socketId} for room ${roomCode}`);

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
                    console.log(`Deleted empty room: ${roomCode}`);
                }

                console.log(`Room ${roomCode} now has ${room.participants.size} participants`);
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

                    console.log(`Assigned new host ${newHost.socketId} for room ${roomCode} after disconnect`);

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
                    console.log(`Deleted empty room after disconnect: ${roomCode}`);
                }

                console.log(`User ${socketId} removed from room ${roomCode}, ${room.participants.size} participants remaining`);
                break;
            }
        }
    }

    process.on('SIGTERM', () => {
        console.log('Shutting down signaling server...');
        clearInterval(cleanupInterval);
        io.close(() => {
            console.log('Signaling server closed');
        });
    });

    if (process.env.NODE_ENV === 'development') {
        setInterval(() => {
            if (rooms.size > 0) {
                console.log(`Active rooms: ${rooms.size}`);
                for (const [code, room] of rooms.entries()) {
                    console.log(`  Room ${code}: ${room.participants.size} participants`);
                }
            }
        }, 30000);
    }

    return io;
}
