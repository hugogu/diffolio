import { ref, onUnmounted } from 'vue'
import { io, Socket } from 'socket.io-client'

export interface ExportReady {
  exportId: string
  comparisonId: string
  downloadUrl: string
  expiresAt: string
}

export function useExportSocket() {
  const exportData = ref<ExportReady | null>(null)
  const isWaiting = ref(false)
  let socket: Socket | null = null
  let resolvePromise: ((data: ExportReady) => void) | null = null

  function connect() {
    if (socket) return

    socket = io('/parse', {
      withCredentials: true,
      transports: ['websocket'],
    })

    socket.on('exportReady', (data: ExportReady) => {
      exportData.value = data
      isWaiting.value = false
      if (resolvePromise) {
        resolvePromise(data)
        resolvePromise = null
      }
    })
  }

  function waitForExport(exportId: string): Promise<ExportReady> {
    connect()
    isWaiting.value = true
    return new Promise((resolve) => {
      // Check if already received
      if (exportData.value?.exportId === exportId) {
        isWaiting.value = false
        resolve(exportData.value)
        return
      }
      resolvePromise = resolve
    })
  }

  function disconnect() {
    socket?.disconnect()
    socket = null
  }

  onUnmounted(disconnect)

  return { exportData, isWaiting, waitForExport }
}
