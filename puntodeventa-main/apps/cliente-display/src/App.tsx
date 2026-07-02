import React, { useEffect, useRef, useState } from 'react'
import { subscribe, type DisplayEvent, type DisplayItem } from './sync'
import { AdReel } from './components/AdReel'
import { OrderingView } from './components/OrderingView'
import { PaidView } from './components/PaidView'

type DisplayState = 'idle' | 'ordering' | 'paid'

export default function App() {
  const [state, setState] = useState<DisplayState>('idle')
  const [items, setItems] = useState<DisplayItem[]>([])
  const [total, setTotal] = useState(0)
  const [folio, setFolio] = useState<string>('')
  const [highlightId, setHighlightId] = useState<string | null>(null)

  const paidTimerRef = useRef<number | null>(null)
  const highlightTimerRef = useRef<number | null>(null)

  // Detect demo mode via query param
  const isDemo = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('demo') === '1'

  // Subscribe to broadcast events
  useEffect(() => {
    const unsubscribe = subscribe((e: DisplayEvent) => {
      handleEvent(e)
    })
    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleEvent(e: DisplayEvent) {
    if (e.type === 'item-added') {
      setItems((prev) => {
        const existing = prev.find((i) => i.id === e.item.id)
        if (existing) {
          return prev.map((i) =>
            i.id === e.item.id ? { ...i, cantidad: e.item.cantidad } : i,
          )
        }
        return [...prev, e.item]
      })
      setTotal(e.total)
      setState('ordering')
      setHighlightId(e.item.id)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
      highlightTimerRef.current = window.setTimeout(() => setHighlightId(null), 1200)
    } else if (e.type === 'item-removed') {
      setItems((prev) => prev.filter((i) => i.id !== e.id))
      setTotal(e.total)
      if (e.totalItems <= 0) {
        setState('idle')
        setItems([])
        setTotal(0)
      }
    } else if (e.type === 'cart-cleared') {
      setItems([])
      setTotal(0)
      setState('idle')
    } else if (e.type === 'order-paid') {
      setFolio(e.folio)
      setState('paid')
      if (paidTimerRef.current) window.clearTimeout(paidTimerRef.current)
      paidTimerRef.current = window.setTimeout(() => {
        setState('idle')
        setItems([])
        setTotal(0)
        setFolio('')
      }, 8000)
    }
  }

  // Demo mode: simulate item-added then cart-cleared every 12 seconds
  useEffect(() => {
    if (!isDemo) return
    const demoItems: DisplayItem[] = [
      { id: 'd-1', nombre: 'Shake Fresa Power', cantidad: 1, precio: 85 },
      { id: 'd-2', nombre: 'Bowl Banana + Granola', cantidad: 1, precio: 110 },
      { id: 'd-3', nombre: 'Café Frío Mocha', cantidad: 1, precio: 65 },
      { id: 'd-4', nombre: 'Snack Choco-Avena', cantidad: 2, precio: 35 },
    ]
    let i = 0
    const runCycle = () => {
      const it = demoItems[i % demoItems.length]
      if (!it) return
      const folioDemo = `A-${(Date.now() % 10000).toString().padStart(4, '0')}`
      handleEvent({
        type: 'item-added',
        item: it,
        total: it.precio * it.cantidad,
        totalItems: it.cantidad,
      })
      window.setTimeout(() => {
        handleEvent({ type: 'order-paid', folio: folioDemo })
      }, 4500)
      i++
    }
    runCycle()
    const id = window.setInterval(runCycle, 14000)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo])

  // Cleanup
  useEffect(() => {
    return () => {
      if (paidTimerRef.current) window.clearTimeout(paidTimerRef.current)
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current)
    }
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden font-body text-sa-green-ink">
      {state === 'idle' && <AdReel />}
      {state === 'ordering' && (
        <OrderingView items={items} total={total} highlightId={highlightId} />
      )}
      {state === 'paid' && <PaidView folio={folio} />}
    </div>
  )
}
