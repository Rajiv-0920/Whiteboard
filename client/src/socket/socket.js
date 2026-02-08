import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

const socket = io(SOCKET_URL, {
  transports: ['websocket'],

  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,

  autoConnect: true, // Set to false if you want to connect only after user login
  withCredentials: true,

  forceNew: false,
})

// --- Lifecycle Event Handling ---

socket.on('connect', () => {
  console.log(
    `%c[Socket] Connected: ${socket.id}`,
    'color: #10b981; font-weight: bold;',
  )
})

socket.on('connect_error', (err) => {
  console.error(
    `%c[Socket] Connection Error: ${err.message}`,
    'color: #ef4444;',
  )
  // Optional: Trigger a global UI notification here
})

socket.on('disconnect', (reason) => {
  console.warn(`%c[Socket] Disconnected: ${reason}`, 'color: #f59e0b;')
  if (reason === 'io server disconnect') {
    // Reconnect manually if the server kicked the client
    socket.connect()
  }
})

export default socket
