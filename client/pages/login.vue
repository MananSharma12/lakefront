<script setup>
import { z } from 'zod'

const { login } = useAuth()
const toast = useToast()
const loading = ref(false)

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters')
})

const state = reactive({
  email: '',
  password: ''
})

const handleLogin = async () => {
  loading.value = true
  try {
    await login(state.email, state.password)
    toast.add({ title: 'Login successful!', color: 'success' })
    navigateTo('/')
  } catch (error) {
    toast.add({
      title: 'Login failed',
      description: error.data?.message || 'Invalid credentials',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div class="max-w-md space-y-8">
      <div>
        <h2 class="mt-6 text-3xl font-extrabold text-gray-900 dark:text-white">
          Sign-in to Lakefront
        </h2>
      </div>
      <UForm :schema="schema" :state="state" @submit="handleLogin" class="space-y-6">
        <UFormField label="Email" name="email">
          <UInput v-model="state.email" type="email" />
        </UFormField>

        <UFormField label="Password" name="password">
          <UInput v-model="state.password" type="password" />
        </UFormField>

        <div>
          <UButton type="submit" :loading="loading">
            Sign In
          </UButton>
        </div>

        <div>
            Don't have an account?
            <NuxtLink to="/register" class="font-medium text-primary-600 hover:text-primary-500">
              Sign up
            </NuxtLink>
        </div>
      </UForm>
    </div>
  </div>
</template>