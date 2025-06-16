import { Request } from 'express';

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
    roomCode: string;
    candidate: RTCIceCandidateInit;
    targetId: string;
}

interface LeaveRoomData {
    roomCode: string;
}

interface AuthenticatedRequest extends Request {
    user?: {
        id: number;
        email: string
    };
}

export {
    JwtPayload,
    RoomParticipant,
    Room,
    JoinRoomData,
    OfferData,
    AnswerData,
    IceCandidateData,
    LeaveRoomData,
    AuthenticatedRequest,
}