export interface RoomInfo {
    id: number;
    roomCode: string;
    title: string | null;
    hostEmail: string;
    isActive: true;
    createdAt: Date | null;
    isCreator: boolean;
}

export interface Participant {
    socketId: string;
    isHost: boolean;
    email?: string;
}

export interface RoomJoinedEvent {
    participants: Participant[];
}

export interface UserJoinedEvent {
    socketId: string;
    isHost: boolean;
    email?: string;
}

export interface UserLeftEvent {
    socketId: string;
    isHost: boolean;
}

export interface OfferEvent {
    offer: RTCSessionDescriptionInit;
    fromId: string;
}

export interface AnswerEvent {
    answer: RTCSessionDescriptionInit;
    fromId: string;
}

export interface IceCandidateEvent {
    candidate: RTCIceCandidateInit;
    fromId: string;
}