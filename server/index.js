import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const PORT = process.env.PORT || 3000
const server = createServer(app)
const io = new Server(server, {
  cors: { origin: '*' },
})

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  }),
)

let onlineUsers = new Set()

io.on('connection', (socket) => {
  console.log('💚 A user connected')
  onlineUsers.add(socket.id)
  socket.on('cursorUpdate', (data) => {
    socket.broadcast.emit('cursorUpdate', data)
  })

  socket.on('updateShapes', (data) => {
    socket.broadcast.emit('updateShapes', data)
  })

  io.emit('totalMembers', onlineUsers.size)

  socket.on('disconnect', () => {
    console.log('💔 A user disconnected')
    onlineUsers.delete(socket.id)
  })
})

if (process.env.NODE_ENV === 'production') {
  const clientPath = path.join(__dirname, '../client/dist')
  app.use(express.static(clientPath))

  app.get('/{*any}', (req, res) => {
    res.sendFile(path.join(clientPath, 'index.html'))
  })
}

const startServer = async () => {
  try {
    app.listen(PORT, () => {
      console.log(`Server is running on the port: ${PORT}`)
    })
  } catch (error) {
    console.log(`Error starting the server: ${error}`)
  }
}

startServer()
