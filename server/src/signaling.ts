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
}

interface Room {
    code: string;
    participants: Map<string, RoomParticipant>;
    hostSocketId?: string;
}

export function setupSignaling(httpServer: HttpServer): Server {
    const io = new Server(httpServer, {
        cors: {
            origin: process.env.CLIENT_URL || "http://localhost:3000",
            methods: ["GET", "POST"]
        }
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

    interface JoinRoomData {
        roomCode: string;
        isHost: boolean;
    }

    interface OfferData {
        roomCode: string;
        offer: any;
        targetId: string;
    }

    interface AnswerData {
        roomCode: string;
        answer: any;
        targetId: string;
    }

    interface IceCandidateData {
        candidate: any;
        targetId: string;
    }

    interface LeaveRoomData {
        roomCode: string;
    }

    io.on("connection", (socket: Socket) => {
        console.log("User Connected", socket.id);

        socket.on('join-room', ({ roomCode, isHost }: JoinRoomData) => {
            console.log(`User ${socket.id} joining room ${roomCode} as ${isHost ? 'host' : 'guest'}`);

            roomCode = roomCode.toUpperCase();

            if (!rooms.has(roomCode)) {
                rooms.set(roomCode, {
                    code: roomCode,
                    participants: new Map(),
                });
            }

            const room = rooms.get(roomCode)!;

            const participant: RoomParticipant = {
                socketId: socket.id,
                userId: socket.data.user?.id,
                email: socket.data.user?.email,
                isHost
            };

            room.participants.set(socket.id, participant);

            if (isHost) {
                room.hostSocketId = socket.id;
            }

            socket.join(roomCode);

            socket.to(roomCode).emit('user-joined', {
                socketId: socket.id,
                isHost,
                email: socket.data.user?.email
            });

            const participants = Array.from(room.participants.values())
                .filter(p => p.socketId !== socket.id)
                .map(p => ({
                    socketId: p.socketId,
                    isHost: p.isHost,
                    email: p.email
                }));

            socket.emit('room-joined', { participants });
        });

        socket.on('offer', ({ roomCode, offer, targetId }: OfferData) => {
            console.log(`Offer from ${socket.id} to ${targetId} in room ${roomCode}`);
            socket.to(targetId).emit('offer', {
                offer,
                fromId: socket.id
            });
        });

        socket.on('answer', ({ roomCode, answer, targetId }: AnswerData) => {
            console.log(`Answer from ${socket.id} to ${targetId} in room ${roomCode}`);
            socket.to(targetId).emit('answer', {
                answer,
                fromId: socket.id
            });
        });

        socket.on('ice-candidate', ({ candidate, targetId }: IceCandidateData) => {
            console.log(`ICE candidate from ${socket.id} to ${targetId}`);
            socket.to(targetId).emit('ice-candidate', {
                candidate,
                fromId: socket.id
            });
        });

        socket.on('disconnect', () => {
            console.log('User disconnected:', socket.id);

            for (const [roomCode, room] of rooms.entries()) {
                if (room.participants.has(socket.id)) {
                    const participant = room.participants.get(socket.id)!;
                    room.participants.delete(socket.id);

                    socket.to(roomCode).emit('user-left', {
                        socketId: socket.id,
                        isHost: participant.isHost
                    });

                    if (room.participants.size === 0) {
                        rooms.delete(roomCode);
                    }

                    break;
                }
            }
        });

        socket.on('leave-room', ({ roomCode }: LeaveRoomData) => {
            roomCode = roomCode.toUpperCase();
            const room = rooms.get(roomCode);

            if (room && room.participants.has(socket.id)) {
                const participant = room.participants.get(socket.id)!;
                room.participants.delete(socket.id);
                socket.leave(roomCode);

                socket.to(roomCode).emit('user-left', {
                    socketId: socket.id,
                    isHost: participant.isHost
                });

                if (room.participants.size === 0) {
                    rooms.delete(roomCode);
                }
            }
        });
    });

    return io;
}
