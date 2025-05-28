export const useRooms = () => {
    const { token } = useAuth()

    const createRoom = async (title?: string) => {
        return await $fetch<{ room: any; message: string }>('/api/rooms', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.value}`
            },
            body: { title },
            baseURL: 'http://localhost:4000'
        })
    }

    const joinRoom = async (roomCode: string) => {
        return await $fetch<{ room: any }>(`/api/rooms/${roomCode}`, {
            baseURL: 'http://localhost:4000'
        })
    }

    const endRoom = async (roomCode: string) => {
        return await $fetch<{ message: string }>(`/api/rooms/${roomCode}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token.value}`
            },
            baseURL: 'http://localhost:4000'
        })
    }

    const getUserRooms = async () => {
        return await $fetch<{ rooms: any[] }>('/api/rooms', {
            headers: {
                Authorization: `Bearer ${token.value}`
            },
            baseURL: 'http://localhost:4000'
        })
    }

    return {
        createRoom,
        joinRoom,
        endRoom,
        getUserRooms
    }
}
