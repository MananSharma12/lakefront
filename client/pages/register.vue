<script setup lang="ts">
import { z } from 'zod'

const { register } = useAuth()
const toast = useToast()
const loading = ref(false)

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: 'Passwords must match',
  path: ['confirmPassword'],
})

const state = reactive({
  email: '',
  password: '',
  confirmPassword: ''
})

const handleRegister = async () => {
  loading.value = true
  try {
    await register(state.email, state.password)
    toast.add({
      title: 'Account created successfully!',
      description: 'Login with your credentials now.',
      color: 'success'
    })
    navigateTo('/login')
  } catch (error) {
    toast.add({
      title: 'Registration failed',
      description: error.data?.message || 'Something went wrong',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UContainer class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">

    <UForm :schema="schema" :state="state" @submit="handleRegister">
      <h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
        Create your account
      </h2>

      <UFormField label="Email" name="email" class="mt-2">
        <UInput v-model="state.email" type="email" />
      </UFormField>

      <UFormField label="Password" name="password" class="mt-2">
        <UInput v-model="state.password" type="password" />
      </UFormField>

      <UFormField label="Confirm Password" name="confirmPassword" class="mt-2">
        <UInput v-model="state.confirmPassword" type="password" />
      </UFormField>

      <div>
        <UButton type="submit" :loading="loading" class="mt-4 mb-2">
          Sign Up
        </UButton>
      </div>

      <div>
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-primary-600 hover:text-primary-500">
            Sign in
          </NuxtLink>
        </span>
      </div>
    </UForm>
  </UContainer>
</template>