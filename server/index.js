import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'
import 'dotenv/config'

const app = express()
const PORT = process.env.PORT || 5000
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173', // Use the exact port from your browser URL
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }),
)

let onlineUsers = new Set()

io.on('connection', (socket) => {
  console.log('💚 A user connected:', socket.id)
  onlineUsers.add(socket.id)
  socket.on('cursorUpdate', (data) => {
    socket.broadcast.emit('cursorUpdate', { ...data, id: socket.id })
  })

  socket.on('updateShapes', (data) => {
    socket.broadcast.emit('updateShapes', data)
  })

  io.emit('totalMembers', onlineUsers.size)

  socket.on('disconnect', () => {
    console.log('💔 A user disconnected:', socket.id)
    onlineUsers.delete(socket.id)
    io.emit('totalMembers', onlineUsers.size)
    socket.broadcast.emit('userDisconnected', socket.id)
  })
})

if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../client/dist')
  app.use(express.static(clientPath))

  app.get('/{*any}', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'))
  })
}

// Change this block
const startServer = async () => {
  try {
    server.listen(PORT, () => {
      console.log(`🚀 Real-time server running on: http://localhost:${PORT}`)
    })
  } catch (error) {
    console.log(`Error starting the server: ${error}`)
  }
}

startServer()
