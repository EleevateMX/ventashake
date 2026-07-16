import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usuarioActual } from '@shake/supabase'
import { useCarrito } from '@/store/carritoStore'
import { sb } from '@/lib/sb'

export function AuthCallback() {
  const navigate = useNavigate()
  const { setUsuario } = useCarrito()
  const [estado, setEstado] = useState('Verificando tu cuenta…')

  useEffect(() => {
    async function resolver() {
      // Give Supabase a moment to exchange the token from URL hash
      await new Promise((r) => setTimeout(r, 800))

      const user = await usuarioActual(sb)

      if (!user || !user.email) {
        navigate('/pago', { replace: true })
        return
      }

      setEstado('Buscando tu cuenta…')

      setUsuario({
        authId: user.id,
        nombre: user.user_metadata?.full_name ?? user.email,
        email: user.email,
        clienteId: null,
      })

      navigate('/pago', { replace: true })
    }

    resolver().catch((e) => {
      console.error('[AuthCallback]', e)
      navigate('/pago', { replace: true })
    })
  }, [navigate, setUsuario])

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-sa-green-deep text-sa-cream gap-6">
      <div className="w-12 h-12 border-4 border-sa-cream/30 border-t-sa-cream rounded-full animate-spin" />
      <p className="font-display text-2xl">{estado}</p>
    </div>
  )
}
