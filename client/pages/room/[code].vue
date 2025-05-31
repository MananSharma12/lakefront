<script setup lang="ts">
import { io, Socket } from 'socket.io-client'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const { user, token } = useAuth()
const { joinRoom, endRoom } = useRooms()
const { getIceServers } = useIceServers()
const toast = useToast()

const roomCode = route.params.code.toUpperCase()
const loading = ref(true)
const loadingMessage = ref('Joining room...')

interface RoomInfo {
  id: number;
  roomCode: string;
  title: string | null;
  hostEmail: string;
  isActive: true;
  createdAt: Date | null;
  isCreator: boolean;
}

const roomInfo = ref<RoomInfo | null>(null)
const isHost = ref<boolean | undefined>(false)

const localVideo = ref<HTMLVideoElement | null>(null)
const localStream = ref<MediaStream | null>(null)
const socket = ref<Socket | null>(null)

const peerConnections = ref<Map<string, RTCPeerConnection>>(new Map())
const remoteStreams = ref<Map<string, MediaStream>>(new Map())

const isAudioEnabled = ref(true)
const isVideoEnabled = ref(true)
const connectionStatus = ref('disconnected')

interface Participant {
  socketId: string;
  isHost: boolean;
  email?: string;
}

const participants = ref<Participant[]>([])

const ICE_SERVERS_CONFIG = ref<RTCIceServer[]>([])

onMounted(async () => {
  try {
    loadingMessage.value = 'Fetching ICE configuration...';
    try {
      const fetchedIceServers = await getIceServers()
      if (!fetchedIceServers.length) {
        throw new Error(`Failed to fetch ICE servers: ${response.statusText}`);
      }
      if (fetchedIceServers && fetchedIceServers.length > 0) {
        ICE_SERVERS_CONFIG.value = fetchedIceServers;
        console.log('Fetched ICE Servers from backend:', ICE_SERVERS_CONFIG.value);
      } else {
        ICE_SERVERS_CONFIG.value = [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ];
      }
    } catch (iceError) {
      ICE_SERVERS_CONFIG.value = [
        {urls: 'stun:stun.l.google.com:19302'},
        {urls: 'stun:stun1.l.google.com:19302'},
        {urls: 'stun:stun2.l.google.com:19302'}
      ];
    }

    loadingMessage.value = 'Checking room...'

    try {
      roomInfo.value = await joinRoom(roomCode)
      isHost.value = roomInfo.value.room.isCreator
    } catch (error) {
      toast.add({
        title: 'Room not found',
        description: 'The room you are trying to join does not exist',
        color: 'error'
      })
      return navigateTo('/')
    }

    loadingMessage.value = 'Accessing camera and microphone...'
    await setupMediaDevices()

    loadingMessage.value = 'Connecting to signaling server...'
    const serverUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000'

    socket.value = io(serverUrl, {
      auth: {token: token.value},
      transports: ['websocket', 'polling']
    })

    setupSocketListeners()

    socket.value.on('connect', () => {
      socket.value?.emit('join-room', {
        roomCode,
        isHost: isHost.value
      })
    })

    socket.value.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      toast.add({
        title: 'Connection failed',
        description: 'Failed to connect to signaling server',
        color: 'error'
      })
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
  cleanup()
})

const cleanup = () => {
  if (socket.value) {
    socket.value.emit('leave-room', {roomCode})
    socket.value.disconnect()
  }

  peerConnections.value.forEach(pc => {
    pc.close()
  })
  peerConnections.value.clear()
  remoteStreams.value.clear()

  if (localStream.value) {
    localStream.value.getTracks().forEach(track => track.stop())
  }
}

const setupMediaDevices = async (): Promise<MediaStream | null> => {
  try {
    localStream.value = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        width: {ideal: 1280},
        height: {ideal: 720},
        frameRate: {ideal: 30}
      }
    })

    if (localVideo.value) {
      localVideo.value.srcObject = localStream.value
    }

    return localStream.value
  } catch (error) {
    console.error('Error accessing media devices:', error)

    try {
      localStream.value = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {width: 640, height: 480}
      })

      if (localVideo.value) {
        localVideo.value.srcObject = localStream.value
      }

      return localStream.value
    } catch (fallbackError) {
      toast.add({
        title: 'Media access denied',
        description: 'Please allow access to your camera and microphone',
        color: 'error'
      })
      throw fallbackError
    }
  }
}

const createPeerConnection = (targetId: string): RTCPeerConnection => {
  console.log('Using ICE Servers:', ICE_SERVERS_CONFIG.value); // Log what's being used
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS_CONFIG.value,
    iceCandidatePoolSize: 10
  })

  if (localStream.value) {
    localStream.value.getTracks().forEach(track => {
      pc.addTrack(track, localStream.value!)
    })
  }

  pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
    if (event.candidate) {
      socket.value?.emit('ice-candidate', {
        roomCode,
        candidate: event.candidate,
        targetId
      })
    }
  }

  pc.onconnectionstatechange = () => {
    updateConnectionStatus()
  }

  pc.ontrack = (event: RTCTrackEvent) => {
    if (event.streams && event.streams[0]) {
      remoteStreams.value.set(targetId, event.streams[0])
    }
  }

  peerConnections.value.set(targetId, pc)
  updateConnectionStatus()

  return pc
}

const updateConnectionStatus = () => {
  if (peerConnections.value.size === 0) {
    connectionStatus.value = 'disconnected'
    return
  }

  const states = Array.from(peerConnections.value.values()).map(pc => pc.connectionState)

  if (states.some(state => state === 'failed')) {
    connectionStatus.value = 'failed'
  } else if (states.some(state => state === 'disconnected')) {
    connectionStatus.value = 'disconnected'
  } else if (states.some(state => state === 'connecting')) {
    connectionStatus.value = 'connecting'
  } else if (states.every(state => state === 'connected')) {
    connectionStatus.value = 'connected'
  } else {
    connectionStatus.value = 'connecting'
  }
}

interface RoomJoinedEvent {
  participants: Participant[];
}

interface UserJoinedEvent {
  socketId: string;
  isHost: boolean;
  email?: string;
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

  socket.value.on('room-joined', ({participants: roomParticipants}: RoomJoinedEvent) => {
    participants.value = roomParticipants

    roomParticipants.forEach(participant => {
      initiateCall(participant.socketId);
    })
  })

  socket.value.on('user-joined', (participant: UserJoinedEvent) => {
    const newParticipant: Participant = {
      socketId: participant.socketId,
      isHost: participant.isHost,
      email: participant.email
    }

    participants.value.push(newParticipant)

    if (socket.value?.id && socket.value.id < participant.socketId) {
      setTimeout(() => initiateCall(participant.socketId), 1000)
    }
  })

  socket.value.on('user-left', ({socketId}: UserLeftEvent) => {
    participants.value = participants.value.filter(p => p.socketId !== socketId)

    if (peerConnections.value.has(socketId)) {
      const pc = peerConnections.value.get(socketId)
      pc?.close()
      peerConnections.value.delete(socketId)
    }

    if (remoteStreams.value.has(socketId)) {
      remoteStreams.value.delete(socketId)
    }

    updateConnectionStatus()
  })

  socket.value.on('offer', async ({offer, fromId}: OfferEvent) => {
    try {
      if (!peerConnections.value.has(fromId)) {
        createPeerConnection(fromId)
      }

      const pc = peerConnections.value.get(fromId)
      if (!pc) {
        console.error('No peer connection for:', fromId)
        return
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      socket.value?.emit('answer', {
        roomCode,
        answer,
        targetId: fromId
      })
    } catch (error) {
      console.error('Error handling offer from', fromId, ':', error)
    }
  })

  socket.value.on('answer', async ({answer, fromId}: AnswerEvent) => {
    try {
      const pc = peerConnections.value.get(fromId)
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      }
    } catch (error) {
      console.error('Error handling answer from', fromId, ':', error)
    }
  })

  socket.value.on('ice-candidate', async ({candidate, fromId}: IceCandidateEvent) => {
    try {
      const pc = peerConnections.value.get(fromId)
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
    } catch (error) {
      console.error('Error adding ICE candidate from', fromId, ':', error)
    }
  })
}

const initiateCall = async (targetId: string): Promise<void> => {
  try {
    if (peerConnections.value.has(targetId)) {
      return
    }

    const pc = createPeerConnection(targetId)

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    })

    await pc.setLocalDescription(offer)

    socket.value?.emit('offer', {
      roomCode,
      offer,
      targetId
    })
  } catch (error) {
    console.error('Error initiating call to', targetId, ':', error)
  }
}

const toggleAudio = (): void => {
  if (localStream.value) {
    const audioTrack = localStream.value.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      isAudioEnabled.value = audioTrack.enabled
    }
  }
}

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
    cleanup()
    navigateTo('/')
  } catch (error) {
    console.error('Error ending call:', error)
    navigateTo('/')
  }
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Loading Screen -->
    <div v-if="loading" class="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
      <div class="text-center text-white">
        <UIcon name="i-material-symbols:change-circle-outline" class="animate-spin h-12 w-12 mx-auto mb-4"/>
        <h2 class="text-xl font-semibold mb-2">{{ loadingMessage }}</h2>
        <p class="text-gray-300">Please wait...</p>
      </div>
    </div>

    <!-- Header -->
    <header class="bg-white dark:bg-gray-800 shadow">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between h-16 items-center">
          <div class="flex items-center">
            <h1 class="text-xl font-semibold">Room: {{ roomCode }}</h1>
            <span
                class="ml-4 px-2 py-1 text-xs rounded-full"
                :class="{
                'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100': connectionStatus === 'connected',
                'bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100': connectionStatus === 'connecting',
                'bg-red-100 text-red-800 dark:bg-red-800 dark:text-red-100': connectionStatus === 'disconnected' || connectionStatus === 'failed'
              }"
            >
              {{ connectionStatus }}
            </span>
          </div>
          <div>
            <UButton
                color="error"
                @click="handleEndCall"
                icon="i-material-symbols:call-end"
            >
              End Call
            </UButton>
          </div>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <!-- Video Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- Local Video -->
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
          <!-- Video status indicators -->
          <div class="absolute top-4 right-4 flex space-x-2">
            <div v-if="!isAudioEnabled" class="bg-red-500 rounded p-1">
              <UIcon name="i-material-symbols:mic-off" class="text-white"/>
            </div>
            <div v-if="!isVideoEnabled" class="bg-red-500 rounded p-1">
              <UIcon name="i-material-symbols:videocam-off" class="text-white"/>
            </div>
          </div>
        </div>

        <!-- Remote Videos -->
        <template v-if="participants.length > 0">
          <div
              v-for="participant in participants"
              :key="participant.socketId"
              class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video"
          >
            <video
              v-if="remoteStreams.has(participant.socketId)"
              :srcObject="remoteStreams.get(participant.socketId)"
              autoplay playsinline class="w-full h-full object-cover"
            ></video>
            <div v-else class="absolute inset-0 flex items-center justify-center text-white">
              <div class="text-center">
                <UIcon name="i-material-symbols:person" class="h-16 w-16 mx-auto mb-4"/>
                <p>Connecting...</p>
              </div>
            </div>
            <div class="absolute bottom-4 left-4 bg-black bg-opacity-50 px-3 py-1 rounded-full text-white text-sm">
              {{ participant.email || 'Guest' }}
              {{ participant.isHost ? '(Host)' : '' }}
            </div>
          </div>
        </template>

        <!-- Waiting Message -->
        <div v-if="participants.length === 0" class="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
          <div class="absolute inset-0 flex items-center justify-center text-white">
            <div class="text-center">
              <UIcon name="i-material-symbols:person" class="h-16 w-16 mx-auto mb-4"/>
              <p>Waiting for someone to join...</p>
              <p class="text-sm text-gray-400 mt-2">Share code: {{ roomCode }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Controls -->
      <div class="mt-6 flex justify-center space-x-4">
        <UButton
            :color="isAudioEnabled ? 'neutral' : 'error'"
            @click="toggleAudio"
            :icon="isAudioEnabled ? 'i-material-symbols:mic' : 'i-material-symbols:mic-off'"
            variant="soft"
        >
          {{ isAudioEnabled ? 'Mute' : 'Unmute' }}
        </UButton>

        <UButton
            :color="isVideoEnabled ? 'neutral' : 'error'"
            @click="toggleVideo"
            :icon="isVideoEnabled ? 'i-material-symbols:videocam' : 'i-material-symbols:videocam-off'"
            variant="soft"
        >
          {{ isVideoEnabled ? 'Hide Video' : 'Show Video' }}
        </UButton>
      </div>

      <!-- Participants List -->
      <div class="mt-8">
        <h2 class="text-lg font-medium mb-4">Participants ({{ participants.length + 1 }})</h2>
        <ul class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <!-- Current User -->
          <li class="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center">
              <UIcon name="i-material-symbols:account-circle" class="h-6 w-6 mr-3 text-gray-500"/>
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
              <UIcon name="i-material-symbols:account-circle" class="h-6 w-6 mr-3 text-gray-500"/>
              <span>{{ participant.email || 'Guest' }} {{ participant.isHost ? '(Host)' : '' }}</span>
            </div>
            <UBadge
                :color="peerConnections.has(participant.socketId) && peerConnections.get(participant.socketId)?.connectionState === 'connected' ? 'success' : 'warning'"
            >
              {{
                peerConnections.has(participant.socketId) && peerConnections.get(participant.socketId)?.connectionState === 'connected' ? 'Connected' : 'Connecting'
              }}
            </UBadge>
          </li>
        </ul>
      </div>
    </main>
  </div>
</template>