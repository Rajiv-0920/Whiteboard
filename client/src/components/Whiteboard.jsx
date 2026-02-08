import React, { useState, useRef, useEffect } from 'react'
import {
  Stage,
  Circle,
  Layer,
  Rect,
  Line,
  Group,
  Path,
  Text,
} from 'react-konva'
import {
  Pencil,
  Circle as CircleIcon,
  Square,
  Eraser,
  Trash2,
  MousePointer2,
  Undo2,
  Redo2,
  Users,
  Sparkles,
  Minus,
  Plus,
} from 'lucide-react'
import socket from '../socket/socket.js'

const Whiteboard = () => {
  const [tool, setTool] = useState('pencil')
  const [color, setColor] = useState('#4f46e5')
  const [pencilSize, setPencilSize] = useState(4)
  const [eraserSize, setEraserSize] = useState(30)
  const [shapes, setShapes] = useState([])
  const [history, setHistory] = useState([[]]) // Starts with an empty board snapshot
  const [step, setStep] = useState(0)
  const [remoteCursors, setRemoteCursors] = useState({}) // Store other users
  const [selectedId, setSelectedId] = useState(null)
  const isDrawing = useRef(false)
  const lastEmitTime = useRef(0)
  const [totalMembers, setTotalMembers] = useState(0)

  useEffect(() => {
    socket.on('updateShapes', (remoteShapes) => setShapes(remoteShapes))

    socket.on('cursorUpdate', (data) => {
      setRemoteCursors((prev) => ({
        ...prev,
        [data.id]: { x: data.x, y: data.y, color: data.color, name: data.name },
      }))
    })

    socket.on('totalMembers', (members) => {
      setTotalMembers(members)
    })

    socket.on('userDisconnected', (userId) => {
      setRemoteCursors((prev) => {
        const next = { ...prev }
        delete next[userId]
        return next
      })
    })

    return () => {
      socket.off('updateShapes')
      socket.off('cursorUpdate')
      socket.off('totalMembers')
      socket.off('userDisconnected')
    }
  }, [])

  const handleMouseMove = (e) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    const now = Date.now()
    if (now - lastEmitTime.current > 30) {
      socket.emit('cursorUpdate', {
        x: pos.x,
        y: pos.y,
        color: color,
        name: `User ${socket.id?.substring(0, 4)}`,
      })
      lastEmitTime.current = now
    }

    if (!isDrawing.current || tool === 'cursor') return

    let lastShape = { ...shapes[shapes.length - 1] }
    if (tool === 'pencil' || tool === 'eraser') {
      lastShape.points = lastShape.points.concat([pos.x, pos.y])
    } else if (tool === 'rect') {
      lastShape.width = pos.x - lastShape.x
      lastShape.height = pos.y - lastShape.y
    } else if (tool === 'circle') {
      const width = pos.x - lastShape.x
      const height = pos.y - lastShape.y

      const radius = Math.max(Math.abs(width), Math.abs(height)) / 2

      lastShape.currentX = lastShape.x + (width >= 0 ? radius : -radius)
      lastShape.currentY = lastShape.y + (height >= 0 ? radius : -radius)

      lastShape.radius = radius
    }
    const newShapes = shapes.slice(0, -1).concat(lastShape)
    setShapes(newShapes)
  }

  const handleMouseDown = (e) => {
    const stage = e.target.getStage()
    const pos = stage.getPointerPosition()

    // If cursor tool, check if clicking on a shape
    if (tool === 'cursor') {
      const clickedOnEmpty = e.target === stage
      if (clickedOnEmpty) {
        setSelectedId(null)
        return
      }

      // Find which shape was clicked
      const clickedShape = e.target.attrs.shapeId
      if (clickedShape) {
        setSelectedId(clickedShape)
      }
      return
    }

    // Drawing tools
    isDrawing.current = true

    const newShape = {
      id: Date.now().toString(),
      tool,
      color: tool === 'eraser' ? '#ffffff' : color,
      points: [pos.x, pos.y],
      x: tool === 'pencil' || tool === 'eraser' ? 0 : pos.x,
      y: tool === 'pencil' || tool === 'eraser' ? 0 : pos.y,
      radius: 0,
      width: 0,
      height: 0,
      strokeWidth:
        tool === 'eraser' ? eraserSize : tool === 'pencil' ? pencilSize : 3,
    }

    const updatedShapes = [...shapes, newShape]
    setShapes(updatedShapes)
    socket.emit('updateShapes', updatedShapes)
  }

  const handleUndo = () => {
    if (step === 0) return
    const previousStep = step - 1
    const previousShapes = history[previousStep]

    setStep(previousStep)
    setShapes(previousShapes)
    socket.emit('updateShapes', previousShapes)
  }

  const handleRedo = () => {
    if (step === history.length - 1) return
    const nextStep = step + 1
    const nextShapes = history[nextStep]

    setStep(nextStep)
    setShapes(nextShapes)
    socket.emit('updateShapes', nextShapes)
  }

  const handleMouseUp = () => {
    isDrawing.current = false

    const newHistory = history.slice(0, step + 1)
    const finalShapes = [...shapes]

    setHistory([...newHistory, finalShapes])
    setStep(newHistory.length)

    socket.emit('updateShapes', finalShapes)
  }

  const handleShapeDragEnd = (e, shapeId) => {
    const shape = shapes.find((s) => s.id === shapeId)

    const newShapes = shapes.map((s) => {
      if (s.id === shapeId) {
        // For lines/pencil strokes, we need to update the actual points array
        if (s.tool === 'pencil' || s.tool === 'eraser') {
          const deltaX = e.target.x() - (s.dragOffsetX || 0)
          const deltaY = e.target.y() - (s.dragOffsetY || 0)

          // Apply the delta to all points in the array
          const newPoints = [...s.points]
          for (let i = 0; i < newPoints.length; i += 2) {
            newPoints[i] += deltaX
            newPoints[i + 1] += deltaY
          }

          return {
            ...s,
            points: newPoints,
            dragOffsetX: e.target.x(),
            dragOffsetY: e.target.y(),
            x: 0,
            y: 0,
          }
        }

        // For shapes, just update x and y
        return {
          ...s,
          x: e.target.x(),
          y: e.target.y(),
        }
      }
      return s
    })

    setShapes(newShapes)
    socket.emit('updateShapes', newShapes)

    // Update history
    const newHistory = history.slice(0, step + 1)
    setHistory([...newHistory, newShapes])
    setStep(newHistory.length)
  }

  const handleDelete = () => {
    if (!selectedId) return

    const newShapes = shapes.filter((shape) => shape.id !== selectedId)
    setShapes(newShapes)
    socket.emit('updateShapes', newShapes)
    setSelectedId(null)

    // Update history
    const newHistory = history.slice(0, step + 1)
    setHistory([...newHistory, newShapes])
    setStep(newHistory.length)
  }

  // Handle keyboard delete
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        handleDelete()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, shapes, history, step])

  const quickColors = [
    '#ef4444', // red
    '#f59e0b', // amber
    '#10b981', // emerald
    '#3b82f6', // blue
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#0f172a', // slate
  ]

  const handleToolChange = (newTool) => {
    setTool(newTool)
    setSelectedId(null) // Clear selection when switching tools
  }

  return (
    <div className='flex flex-col h-screen w-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 overflow-hidden relative'>
      {/* Animated background pattern */}
      <div className='absolute inset-0 opacity-5 pointer-events-none'>
        <div className='absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full blur-3xl animate-pulse' />
        <div
          className='absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full blur-3xl animate-pulse'
          style={{ animationDelay: '1s' }}
        />
      </div>

      {/* Top toolbar */}
      <div className='absolute top-6 left-1/2 -translate-x-1/2 z-10 flex gap-3 bg-white/90 backdrop-blur-xl p-3 rounded-2xl shadow-2xl border border-white/20 ring-1 ring-black/5'>
        <div className='flex gap-1.5 bg-slate-50/80 rounded-xl p-1.5'>
          <ToolBtn
            active={tool === 'cursor'}
            onClick={() => handleToolChange('cursor')}
            icon={<MousePointer2 size={18} />}
            tooltip='Select'
          />
          <ToolBtn
            active={tool === 'pencil'}
            onClick={() => handleToolChange('pencil')}
            icon={<Pencil size={18} />}
            tooltip='Draw'
          />
          <ToolBtn
            active={tool === 'rect'}
            onClick={() => handleToolChange('rect')}
            icon={<Square size={18} />}
            tooltip='Rectangle'
          />
          <ToolBtn
            active={tool === 'circle'}
            onClick={() => handleToolChange('circle')}
            icon={<CircleIcon size={18} />}
            tooltip='Circle'
          />
          <ToolBtn
            active={tool === 'eraser'}
            onClick={() => handleToolChange('eraser')}
            icon={<Eraser size={18} />}
            tooltip='Eraser'
          />
        </div>

        <div className='w-px h-10 bg-gradient-to-b from-transparent via-slate-300 to-transparent' />

        {/* Color picker section */}
        <div className='flex gap-2 items-center bg-slate-50/80 rounded-xl p-1.5'>
          <div className='relative group'>
            <input
              type='color'
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className='w-10 h-10 rounded-lg cursor-pointer border-2 border-white shadow-md hover:scale-110 transition-transform'
              style={{ backgroundColor: color }}
            />
            <div className='absolute -bottom-1 -right-1 w-4 h-4 bg-white rounded-full shadow-sm flex items-center justify-center'>
              <Sparkles size={10} className='text-indigo-500' />
            </div>
          </div>

          <div className='flex gap-1.5 ml-1'>
            {quickColors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-lg shadow-sm hover:scale-110 transition-all border-2 ${
                  color === c
                    ? 'border-indigo-500 scale-110 ring-2 ring-indigo-200'
                    : 'border-white hover:border-slate-200'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className='w-px h-10 bg-gradient-to-b from-transparent via-slate-300 to-transparent' />

        {/* Pen size controls */}
        {(tool === 'pencil' || tool === 'eraser') && (
          <>
            <div className='flex items-center gap-2 bg-slate-50/80 rounded-xl p-1.5 px-3'>
              <button
                onClick={() => {
                  if (tool === 'pencil') {
                    setPencilSize(Math.max(1, pencilSize - 2))
                  } else {
                    setEraserSize(Math.max(10, eraserSize - 10))
                  }
                }}
                className='p-1.5 hover:bg-white text-slate-600 rounded-lg transition-all hover:scale-110 active:scale-95'
                title='Decrease size'
              >
                <Minus size={14} />
              </button>

              <div className='flex flex-col items-center gap-1'>
                <div className='flex items-center gap-2'>
                  <div
                    className='rounded-full bg-slate-800 transition-all'
                    style={{
                      width: `${tool === 'pencil' ? Math.min(pencilSize * 2, 24) : Math.min(eraserSize / 2, 24)}px`,
                      height: `${tool === 'pencil' ? Math.min(pencilSize * 2, 24) : Math.min(eraserSize / 2, 24)}px`,
                    }}
                  />
                </div>
                <span className='text-xs font-semibold text-slate-600'>
                  {tool === 'pencil' ? pencilSize : eraserSize}px
                </span>
              </div>

              <button
                onClick={() => {
                  if (tool === 'pencil') {
                    setPencilSize(Math.min(50, pencilSize + 2))
                  } else {
                    setEraserSize(Math.min(100, eraserSize + 10))
                  }
                }}
                className='p-1.5 hover:bg-white text-slate-600 rounded-lg transition-all hover:scale-110 active:scale-95'
                title='Increase size'
              >
                <Plus size={14} />
              </button>
            </div>
            <div className='w-px h-10 bg-gradient-to-b from-transparent via-slate-300 to-transparent' />
          </>
        )}

        {/* History controls */}
        <div className='flex gap-1.5 bg-slate-50/80 rounded-xl p-1.5'>
          <button
            onClick={handleUndo}
            disabled={step === 0}
            className='p-2.5 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-slate-700 rounded-lg transition-all hover:scale-105 active:scale-95 hover:shadow-sm group'
            title='Undo'
          >
            <Undo2
              size={18}
              className='group-hover:-rotate-12 transition-transform'
            />
          </button>

          <button
            onClick={handleRedo}
            disabled={step === history.length - 1}
            className='p-2.5 hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent text-slate-700 rounded-lg transition-all hover:scale-105 active:scale-95 hover:shadow-sm group'
            title='Redo'
          >
            <Redo2
              size={18}
              className='group-hover:rotate-12 transition-transform'
            />
          </button>
        </div>

        <div className='w-px h-10 bg-gradient-to-b from-transparent via-slate-300 to-transparent' />

        {/* Delete selected button */}
        {selectedId && tool === 'cursor' && (
          <>
            <button
              onClick={handleDelete}
              className='px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-all hover:scale-105 active:scale-95 font-medium flex items-center gap-2 group hover:shadow-lg hover:shadow-red-200'
              title='Delete selected (Del)'
            >
              <Trash2
                size={18}
                className='group-hover:rotate-12 transition-transform'
              />
              <span className='text-sm'>Delete</span>
            </button>
            <div className='w-px h-10 bg-gradient-to-b from-transparent via-slate-300 to-transparent' />
          </>
        )}

        {/* Clear button */}
        <button
          onClick={() => {
            setShapes([])
            socket.emit('updateShapes', [])
          }}
          className='px-4 py-2.5 hover:bg-red-50 text-red-500 rounded-xl transition-all hover:scale-105 active:scale-95 font-medium flex items-center gap-2 group hover:shadow-lg hover:shadow-red-100'
          title='Clear board'
        >
          <Trash2
            size={18}
            className='group-hover:rotate-12 transition-transform'
          />
          <span className='text-sm'>Clear</span>
        </button>

        <div className='w-px h-10 bg-gradient-to-b from-transparent via-slate-300 to-transparent' />

        {/* Live users indicator */}
        <div className='flex items-center gap-2.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-xl shadow-lg hover:shadow-xl transition-all hover:scale-105'>
          <div className='relative'>
            <Users size={18} className='animate-pulse' />
            <div className='absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-ping' />
            <div className='absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full' />
          </div>
          <span className='text-lg font-bold tracking-tight'>
            {totalMembers}
          </span>
          <span className='text-xs font-semibold uppercase tracking-widest opacity-90'>
            Live
          </span>
        </div>
      </div>

      {/* Canvas area */}
      <div className='flex-1 bg-white rounded-3xl m-4 shadow-2xl border border-slate-200/50 overflow-hidden relative'>
        {/* Subtle grid pattern */}
        <div
          className='absolute inset-0 opacity-[0.03] pointer-events-none'
          style={{
            backgroundImage: `
              linear-gradient(to right, #94a3b8 1px, transparent 1px),
              linear-gradient(to bottom, #94a3b8 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        <Stage
          width={window.innerWidth - 32}
          height={window.innerHeight - 32}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <Layer>
            {shapes.map((shape) => {
              const isSelected = selectedId === shape.id
              const isDraggable = tool === 'cursor'

              if (shape.tool === 'circle') {
                return (
                  <Circle
                    key={shape.id}
                    shapeId={shape.id}
                    x={shape.currentX || shape.x}
                    y={shape.currentY || shape.y}
                    radius={shape.radius || 0}
                    stroke={shape.color}
                    strokeWidth={isSelected ? 4 : 3}
                    shadowBlur={isSelected ? 10 : 5}
                    shadowColor={shape.color}
                    shadowOpacity={isSelected ? 0.5 : 0.3}
                    draggable={isDraggable}
                    onDragEnd={(e) => handleShapeDragEnd(e, shape.id)}
                    onClick={() => tool === 'cursor' && setSelectedId(shape.id)}
                  />
                )
              }

              if (shape.tool === 'rect') {
                return (
                  <Rect
                    key={shape.id}
                    shapeId={shape.id}
                    x={shape.x}
                    y={shape.y}
                    width={shape.width}
                    height={shape.height}
                    stroke={shape.color}
                    strokeWidth={isSelected ? 4 : 3}
                    shadowBlur={isSelected ? 10 : 5}
                    shadowColor={shape.color}
                    shadowOpacity={isSelected ? 0.5 : 0.3}
                    draggable={isDraggable}
                    onDragEnd={(e) => handleShapeDragEnd(e, shape.id)}
                    onClick={() => tool === 'cursor' && setSelectedId(shape.id)}
                  />
                )
              }

              if (shape.tool === 'pencil' || shape.tool === 'eraser') {
                return (
                  <Line
                    key={shape.id}
                    shapeId={shape.id}
                    points={shape.points}
                    x={shape.x || 0}
                    y={shape.y || 0}
                    stroke={shape.color}
                    strokeWidth={
                      shape.strokeWidth || (shape.tool === 'eraser' ? 30 : 4)
                    }
                    tension={0.5}
                    lineCap='round'
                    lineJoin='round'
                    shadowBlur={
                      shape.tool === 'eraser' ? 0 : isSelected ? 6 : 3
                    }
                    shadowColor={shape.color}
                    shadowOpacity={isSelected ? 0.4 : 0.2}
                    globalCompositeOperation={
                      shape.tool === 'eraser'
                        ? 'destination-out'
                        : 'source-over'
                    }
                    draggable={isDraggable}
                    onDragEnd={(e) => handleShapeDragEnd(e, shape.id)}
                    onClick={() => tool === 'cursor' && setSelectedId(shape.id)}
                  />
                )
              }

              return null
            })}
          </Layer>

          <Layer>
            {Object.entries(remoteCursors).map(([id, pos]) => (
              <Group key={id} x={pos.x} y={pos.y} listening={false}>
                <Path
                  data='M0,0 L0,20 L6,14 L12,14 Z'
                  fill={pos.color}
                  stroke='white'
                  strokeWidth={2}
                  shadowBlur={8}
                  shadowColor={pos.color}
                  shadowOpacity={0.5}
                />
                <Text
                  text={pos.name}
                  y={22}
                  x={-2}
                  fontSize={13}
                  fontStyle='bold'
                  fill='white'
                  stroke={pos.color}
                  strokeWidth={3}
                  shadowBlur={4}
                  shadowColor='rgba(0,0,0,0.3)'
                />
                <Text
                  text={pos.name}
                  y={22}
                  x={-2}
                  fontSize={13}
                  fontStyle='bold'
                  fill={pos.color}
                />
              </Group>
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  )
}

const ToolBtn = ({ active, onClick, icon, tooltip }) => (
  <button
    onClick={onClick}
    title={tooltip}
    className={`p-2.5 rounded-lg transition-all duration-200 relative group ${
      active
        ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-200 scale-105'
        : 'hover:bg-white text-slate-600 hover:text-slate-900 hover:scale-105 active:scale-95'
    }`}
  >
    <div className={active ? 'animate-pulse' : ''}>{icon}</div>
    {active && (
      <div className='absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full' />
    )}
  </button>
)

export default Whiteboard
