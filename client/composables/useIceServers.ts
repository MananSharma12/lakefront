export const useIceServers = () => {
    const getIceServers = async () => {
        return $fetch<RTCIceServer[]>('/api/ice-servers/', {
            baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000'
        });
    }

    return {
        getIceServers
    }
}