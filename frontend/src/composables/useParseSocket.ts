import { ref, watch, onUnmounted, type Ref } from 'vue'
import { io, Socket } from 'socket.io-client'

export interface ParseProgress {
  taskId: string
  status: string
  processedEntries: number
  failedEntries: number
  percentage?: number
  checkpointOffset?: number
}

export interface ParseCompleted {
  taskId: string
  status: 'COMPLETED'
  processedEntries: number
  failedEntries: number
  completedAt: string
}

export interface ParseFailed {
  taskId: string
  status: 'FAILED'
  errorCode: string
  message: string
  recoverable: boolean
}

export function useParseSocket(taskId: Ref<string | null>) {
  const progress = ref<ParseProgress | null>(null)
  const status = ref<'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('IDLE')
  const error = ref<ParseFailed | null>(null)

  let socket: Socket | null = null

  function connect() {
    if (socket) {
      socket.disconnect()
    }

    socket = io('/parse', {
      withCredentials: true,
      transports: ['websocket'],
    })

    socket.on('connect', () => {
      const id = taskId.value
      if (id) {
        socket!.emit('subscribe:task', { taskId: id })
      }
    })

    socket.on('parseProgress', (data: ParseProgress) => {
      if (data.taskId === taskId.value) {
        progress.value = data
        status.value = 'RUNNING'
      }
    })

    socket.on('parseCompleted', (data: ParseCompleted) => {
      if (data.taskId === taskId.value) {
        progress.value = {
          taskId: data.taskId,
          status: 'COMPLETED',
          processedEntries: data.processedEntries,
          failedEntries: data.failedEntries,
          percentage: 100,
        }
        status.value = 'COMPLETED'
      }
    })

    socket.on('parseFailed', (data: ParseFailed) => {
      if (data.taskId === taskId.value) {
        error.value = data
        status.value = 'FAILED'
      }
    })
  }

  function disconnect() {
    if (socket) {
      if (taskId.value) {
        socket.emit('unsubscribe:task', { taskId: taskId.value })
      }
      socket.disconnect()
      socket = null
    }
  }

  watch(
    taskId,
    (newId, oldId) => {
      if (!newId) {
        disconnect()
        return
      }

      if (!socket || !socket.connected) {
        connect()
      } else {
        if (oldId) {
          socket.emit('unsubscribe:task', { taskId: oldId })
        }
        socket.emit('subscribe:task', { taskId: newId })
      }
    },
    { immediate: true }
  )

  onUnmounted(disconnect)

  return { progress, status, error }
}
