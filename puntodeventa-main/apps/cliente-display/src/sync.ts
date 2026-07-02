export type DisplayItem = {
  id: string
  nombre: string
  cantidad: number
  precio: number
}

export type DisplayEvent =
  | { type: 'item-added'; item: DisplayItem; total: number; totalItems: number }
  | { type: 'item-removed'; id: string; total: number; totalItems: number }
  | { type: 'cart-cleared' }
  | { type: 'order-paid'; folio: string }

export const CHANNEL = 'shakeaholic-display'

export function subscribe(handler: (e: DisplayEvent) => void): () => void {
  try {
    if (typeof BroadcastChannel === 'undefined') return () => {}
    const ch = new BroadcastChannel(CHANNEL)
    ch.onmessage = (m) => handler(m.data as DisplayEvent)
    return () => {
      try { ch.close() } catch {}
    }
  } catch {
    return () => {}
  }
}

export function publish(event: DisplayEvent): void {
  try {
    if (typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(CHANNEL)
    ch.postMessage(event)
    ch.close()
  } catch {
    // no-op
  }
}
