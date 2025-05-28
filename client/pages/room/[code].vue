<script setup lang="ts">
import { io, Socket } from 'socket.io-client'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const { user, token } = useAuth()
const { joinRoom, endRoom } = useRooms()
const toast = useToast()

const roomCode = route.params.code.toUpperCase()
const loading = ref(true)
const loadingMessage = ref('Joining room...')
interface RoomInfo {
  isCreator: boolean;
  [key: string]: any;
}

const roomInfo = ref<RoomInfo | null>(null)
const isHost = ref(false)

const localVideo = ref<HTMLVideoElement | null>(null)
const remoteVideo = ref<HTMLVideoElement | null>(null)
const localStream = ref<MediaStream | null>(null)
const peerConnection = ref<RTCPeerConnection | null>(null)
const socket = ref<Socket | null>(null)
const remoteSocketId = ref<string | null>(null)

const isAudioEnabled = ref(true)
const isVideoEnabled = ref(true)
const connectionStatus = ref('disconnected')
interface Participant {
  socketId: string;
  isHost: boolean;
  email?: string;
}

const participants = ref<Participant[]>([])

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
]

onMounted(async () => {
  try {
    loadingMessage.value = 'Checking room...'

    try {
      roomInfo.value = await joinRoom(roomCode)
      isHost.value = roomInfo.value.isCreator
    } catch (error) {
      toast.add({
        title: 'Room not found',
        description: 'The room you are trying to join does not exist',
        color: 'error'
      })
      return navigateTo('/')
    }

    loadingMessage.value = 'Connecting to signaling server...'
    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

    socket.value = io(serverUrl, {
      auth: { token }
    })

    setupSocketListeners()

    loadingMessage.value = 'Accessing camera and microphone...'
    await setupMediaDevices()

    socket.value.emit('join-room', {
      roomCode, 
      isHost: isHost.value 
    })

    loading.value = false
  } catch (error) {
    console.error('Setup error:', error)
    toast.add({
      title: 'Connection failed',
      description: error.message || 'Failed to set up the call',
      color: 'error'
    })
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (socket.value) {
    socket.value.emit('leave-room', { roomCode })
    socket.value.disconnect()
  }

  if (peerConnection.value) {
    peerConnection.value.close()
  }

  if (localStream.value) {
    localStream.value.getTracks().forEach(track => track.stop())
  }
})

const setupMediaDevices = async (): Promise<MediaStream | null> => {
  try {
    localStream.value = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    })

    if (localVideo.value) {
      localVideo.value.srcObject = localStream.value
    }

    return localStream.value
  } catch (error) {
    console.error('Error accessing media devices:', error)
    toast.add({
      title: 'Media access denied',
      description: 'Please allow access to your camera and microphone',
      color: 'error'
    })
    throw error
  }
}

const createPeerConnection = (targetId: string): RTCPeerConnection => {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

  if (localStream.value) {
    localStream.value.getTracks().forEach(track => {
      pc.addTrack(track, localStream.value!)
    })
  }

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      socket.value.emit('ice-candidate', {
        candidate: event.candidate,
        targetId
      })
    }
  }

  pc.onconnectionstatechange = () => {
    connectionStatus.value = pc.connectionState
  }

  pc.ontrack = (event: RTCTrackEvent) => {
    if (remoteVideo.value) {
      remoteVideo.value.srcObject = event.streams[0]
    }
  }

  return pc
}

interface RoomJoinedEvent {
  participants: Participant[];
}

interface UserLeftEvent {
  socketId: string;
  isHost: boolean;
}

interface OfferEvent {
  offer: RTCSessionDescriptionInit;
  fromId: string;
}

interface AnswerEvent {
  answer: RTCSessionDescriptionInit;
  fromId: string;
}

interface IceCandidateEvent {
  candidate: RTCIceCandidateInit;
  fromId: string;
}

const setupSocketListeners = (): void => {
  if (!socket.value) return

  socket.value.on('room-joined', ({ participants: roomParticipants }: RoomJoinedEvent) => {
    participants.value = roomParticipants

    if (roomParticipants.length > 0) {
      remoteSocketId.value = roomParticipants[0].socketId

      if (isHost.value) {
        initiateCall(remoteSocketId.value)
      }
    }
  })

  socket.value.on('user-joined', (participant: Participant) => {
    participants.value.push(participant)
    remoteSocketId.value = participant.socketId

    if (isHost.value) {
      initiateCall(participant.socketId)
    }
  })

  socket.value.on('user-left', ({ socketId }: UserLeftEvent) => {
    participants.value = participants.value.filter(p => p.socketId !== socketId)

    if (socketId === remoteSocketId.value) {
      if (remoteVideo.value) {
        remoteVideo.value.srcObject = null
      }
      remoteSocketId.value = null

      if (peerConnection.value) {
        peerConnection.value.close()
        peerConnection.value = null
      }

      connectionStatus.value = 'disconnected'
    }
  })

  // Handle incoming offers
  socket.value.on('offer', async ({ offer, fromId }: OfferEvent) => {
    try {
      remoteSocketId.value = fromId
      peerConnection.value = createPeerConnection(fromId)

      await peerConnection.value.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await peerConnection.value.createAnswer()
      await peerConnection.value.setLocalDescription(answer)

      socket.value.emit('answer', {
        roomCode,
        answer,
        targetId: fromId
      })
    } catch (error) {
      console.error('Error handling offer:', error)
    }
  })

  // Handle incoming answers
  socket.value.on('answer', async ({ answer, fromId }: AnswerEvent) => {
    try {
      if (peerConnection.value) {
        await peerConnection.value.setRemoteDescription(new RTCSessionDescription(answer))
      }
    } catch (error) {
      console.error('Error handling answer:', error)
    }
  })

  // Handle incoming ICE candidates
  socket.value.on('ice-candidate', async ({ candidate, fromId }: IceCandidateEvent) => {
    try {
      if (peerConnection.value) {
        await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (error) {
      console.error('Error adding ICE candidate:', error)
    }
  })
}

// Initiate a call to another user
const initiateCall = async (targetId: string): Promise<void> => {
  try {
    peerConnection.value = createPeerConnection(targetId)

    const offer = await peerConnection.value.createOffer()
    await peerConnection.value.setLocalDescription(offer)

    socket.value.emit('offer', {
      roomCode,
      offer,
      targetId
    })
  } catch (error) {
    console.error('Error initiating call:', error)
  }
}

// Toggle audio
const toggleAudio = (): void => {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      isAudioEnabled.value = audioTrack.enabled
    }
  }
}

// Toggle video
const toggleVideo = (): void => {
  if (localStream.value) {
    const videoTrack = localStream.value.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      isVideoEnabled.value = videoTrack.enabled
    }
  }
}

const handleEndCall = async (): Promise<void> => {
  try {
    if (isHost.value) {
      await endRoom(roomCode)
    }

    if (socket.value) {
      socket.value.emit('leave-room', { roomCode })
    }

    navigateTo('/')
  } catch (error) {
    console.error('Error ending call:', error)
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <div v-if="loading" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div class="text-center text-white">
        <UIcon name="i-heroicons-arrow-path" class="animate-spin h-12 w-12 mx-auto mb-4" />
        <h2 class="text-xl font-semibold mb-2">{{ loadingMessage }}</h2>
        <p class="text-gray-300">Please wait...</p>
      </div>
    </div>

    <header class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16 items-center">
          <div class="flex items-center">
            <h1 class="text-xl font-semibold">Room: {{ roomCode }}</h1>
            <span 
              class="ml-4 px-2 py-1 text-xs rounded-full"
              :class="{
                'bg-green-100 text-green-800': connectionStatus === 'connected',
                'bg-yellow-100 text-yellow-800': connectionStatus === 'connecting',
                'bg-red-100 text-red-800': connectionStatus === 'disconnected' || connectionStatus === 'failed'
              }"
            >
              {{ connectionStatus }}
            </span>
          </div>
          <div>
            <UButton 
              color="primary"
              @click="handleEndCall"
              icon="i-heroicons-phone-x-mark"
            >
              End Call
            </UButton>
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <!-- Video grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Local video -->
        <div class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
          <video 
            ref="localVideo" 
            autoplay 
            muted 
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div class="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white text-sm">
            You {{ isHost ? '(Host)' : '' }}
          </div>
        </div>

        <!-- Remote video -->
        <div class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
          <video 
            v-if="remoteSocketId"
            ref="remoteVideo" 
            autoplay 
            playsinline
            class="w-full h-full object-cover"
          ></video>
          <div v-else class="absolute inset-0 flex items-center justify-center text-white">
            <div class="text-center">
              <UIcon name="i-heroicons-user" class="h-16 w-16 mx-auto mb-4" />
              <p>Waiting for someone to join...</p>
            </div>
          </div>
          <div v-if="remoteSocketId" class="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white text-sm">
            {{ participants.find(p => p.socketId === remoteSocketId)?.email || 'Guest' }}
            {{ participants.find(p => p.socketId === remoteSocketId)?.isHost ? '(Host)' : '' }}
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="mt-6 flex justify-center space-x-4">
        <UButton
          :color="isAudioEnabled ? 'secondary' : 'error'"
          @click="toggleAudio"
          :icon="isAudioEnabled ? 'i-heroicons-microphone' : 'i-heroicons-microphone-slash'"
          variant="soft"
        >
          {{ isAudioEnabled ? 'Mute' : 'Unmute' }}
        </UButton>

        <UButton
          :color="isVideoEnabled ? 'secondary' : 'error'"
          @click="toggleVideo"
          :icon="isVideoEnabled ? 'i-heroicons-video-camera' : 'i-heroicons-video-camera-slash'"
          variant="soft"
        >
          {{ isVideoEnabled ? 'Hide Video' : 'Show Video' }}
        </UButton>
      </div>

      <div class="mt-8">
        <h2 class="text-lg font-medium mb-4">Participants ({{ participants.length + 1 }})</h2>
        <ul class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <li class="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center">
              <UIcon name="i-heroicons-user-circle" class="h-6 w-6 mr-3 text-gray-500" />
              <span>{{ user?.email || 'You' }} {{ isHost ? '(Host)' : '' }}</span>
            </div>
            <UBadge color="success">You</UBadge>
          </li>

          <li
            v-for="participant in participants" 
            :key="participant.socketId"
            class="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 last:border-0"
          >
            <div class="flex items-center">
              <UIcon name="i-heroicons-user-circle" class="h-6 w-6 mr-3 text-gray-500" />
              <span>{{ participant.email || 'Guest' }} {{ participant.isHost ? '(Host)' : '' }}</span>
            </div>
            <UBadge v-if="participant.socketId === remoteSocketId" color="neutral">Connected</UBadge>
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>
