<script setup>
definePageMeta({
  middleware: 'auth'
})

const { user, logout } = useAuth()
const { createRoom, joinRoom } = useRooms()
const toast = useToast()

const creatingRoom = ref(false)
const joiningRoom = ref(false)
const createdRoom = ref(null)

const roomForm = reactive({
  title: ''
})

const joinForm = reactive({
  roomCode: ''
})

const roomLink = computed(() => {
  if (!createdRoom.value) return ''
  return `${window.location.origin}/room/${createdRoom.value.roomCode}`
})

const handleCreateRoom = async () => {
  creatingRoom.value = true
  try {
    const data = await createRoom(roomForm.title || undefined)
    createdRoom.value = data.room
    roomForm.title = ''
    toast.add({ title: 'Room created successfully!', color: 'success' })
  } catch (error) {
    console.error(error)
    toast.add({
      title: 'Failed to create room',
      description: error.data?.message || 'Something went wrong',
      color: 'error'
    })
  } finally {
    creatingRoom.value = false
  }
}

const handleJoinRoom = async () => {
  joiningRoom.value = true
  try {
    const roomCode = joinForm.roomCode.toUpperCase()
    await joinRoom(roomCode)
    navigateTo(`/room/${roomCode}`)
  } catch (error) {
    toast.add({
      title: 'Failed to join room',
      description: error.data?.message || 'Room not found',
      color: 'error'
    })
  } finally {
    joiningRoom.value = false
  }
}

const copyRoomLink = async () => {
  try {
    await navigator.clipboard.writeText(roomLink.value)
    toast.add({ title: 'Link copied to clipboard!', color: 'success' })
  } catch (error) {
    toast.add({ title: 'Failed to copy link', color: 'error' })
  }
}

const goToRoom = (roomCode) => {
  navigateTo(`/room/${roomCode}`)
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <nav class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16">
          <div class="flex items-center">
            <h1 class="text-xl font-semibold">Riverside Clone</h1>
          </div>
          <div class="flex items-center space-x-4">
            <span class="text-sm text-gray-600 dark:text-gray-400">{{ user?.email }}</span>
            <UButton @click="logout" variant="ghost">Logout</UButton>
          </div>
        </div>
      </div>
    </nav>

    <div class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UCard>
            <template #header>
              <h3 class="text-lg font-medium">Create New Room</h3>
            </template>

            <UForm :state="roomForm" @submit="handleCreateRoom" class="space-y-4">
              <UFormField label="Room Title (Optional)">
                <UInput v-model="roomForm.title" placeholder="My Meeting Room" />
              </UFormField>
              <UButton type="submit" :loading="creatingRoom" block>
                Create Room
              </UButton>
            </UForm>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="text-lg font-medium">Join Room</h3>
            </template>

            <UForm :state="joinForm" @submit="handleJoinRoom" class="space-y-4">
              <UFormField label="Room Code">
                <UInput v-model="joinForm.roomCode" placeholder="ABC123" class="uppercase" />
              </UFormField>
              <UButton type="submit" :loading="joiningRoom" block variant="outline">
                Join Room
              </UButton>
            </UForm>
          </UCard>
        </div>

        <div v-if="createdRoom" class="mt-6">
          <UCard>
            <template #header>
              <h3 class="text-lg font-medium text-green-600">Room Created Successfully!</h3>
            </template>

            <div class="space-y-4">
              <div>
                <p class="text-sm text-gray-600 dark:text-gray-400">Room Code:</p>
                <p class="text-xl font-mono font-bold">{{ createdRoom.roomCode }}</p>
              </div>

              <div>
                <p class="text-sm text-gray-600 dark:text-gray-400">Share this link:</p>
                <div class="flex items-center space-x-2">
                  <UInput :model-value="roomLink" readonly />
                  <UButton @click="copyRoomLink" size="sm">Copy</UButton>
                </div>
              </div>

              <div class="flex space-x-2">
                <UButton @click="goToRoom(createdRoom.roomCode)">Join as Host</UButton>
                <UButton @click="createdRoom = null" variant="outline">Close</UButton>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </div>
  </div>
</template>
