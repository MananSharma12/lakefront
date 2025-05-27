export const useAuth = () => {
    const token = useCookie('auth-token', { secure: true, sameSite: 'strict' })
    const user = ref<{ id: number; email: string } | null>(null)

    const login = async (email: string, password: string) => {
        const data = await $fetch<{ token: string; message: string }>('/api/users/login', {
            method: 'POST',
            body: { email, password },
            baseURL: 'http://localhost:4000'
        })

        token.value = data.token

        const payload = JSON.parse(atob(data.token.split('.')[1]))
        user.value = { id: payload.id, email: payload.email }

        return data
    }

    const register = async (email: string, password: string) => {
        return await $fetch<{ message: string }>('/api/users', {
            method: 'POST',
            body: { email, password },
            baseURL: 'http://localhost:4000'
        })
    }

    const logout = () => {
        token.value = null
        user.value = null
        navigateTo('/login')
    }

    const isAuthenticated = computed(() => !!token.value)

    onMounted(() => {
        if (token.value) {
            try {
                const payload = JSON.parse(atob(token.value.split('.')[1]))
                user.value = { id: payload.id, email: payload.email }
            } catch (error) {
                token.value = null
            }
        }
    })

    return {
        token,
        user,
        login,
        register,
        logout,
        isAuthenticated
    }
}
