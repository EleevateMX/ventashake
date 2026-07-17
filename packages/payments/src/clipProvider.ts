import type { ShakeClient } from '@shake/supabase'
import type { EstadoTransaccionPago } from '@shake/types'
import type {
  PaymentProvider,
  CrearPagoParams,
  CrearPagoResultado,
  EstadoPagoResultado,
  WebhookEvento,
} from './types'

/**
 * Cliente de Clip. NUNCA guarda ni ve credenciales — todo lo que hace es
 * invocar Edge Functions de Supabase (`clip-crear-cobro`,
 * `clip-estado-cobro`, `clip-cancelar`, `clip-reembolsar`), que sí tienen
 * `CLIP_API_KEY`/`CLIP_WEBHOOK_SECRET` como secrets del lado servidor
 * (ver supabase/functions/clip-*). El kiosko/POS solo importan esta
 * clase — nunca el SDK de Clip directamente.
 *
 * Mientras esas Edge Functions no tengan las credenciales configuradas,
 * responden `{ ok: false, error: { codigo: 'not_configured', ... } }` —
 * este cliente PROPAGA ese estado tal cual, nunca lo convierte en una
 * aprobación simulada.
 */
export class ClipPaymentProvider implements PaymentProvider {
  readonly nombre = 'clip'
  private readonly sb: ShakeClient

  constructor(sb: ShakeClient) {
    this.sb = sb
  }

  async createPayment(params: CrearPagoParams): Promise<CrearPagoResultado> {
    const { data, error } = await this.sb.functions.invoke('clip-crear-cobro', {
      body: {
        orden_id: params.ordenId,
        monto: params.monto,
        idempotency_key: params.idempotencyKey,
        sucursal_id: params.sucursalId,
        descripcion: params.descripcion,
      },
    })

    if (error) {
      return {
        ok: false,
        proveedorPaymentId: null,
        estado: 'unknown',
        error: { codigo: 'edge_function_error', mensaje: error.message },
      }
    }

    const respuesta = data as {
      ok: boolean
      proveedor_payment_id?: string
      estado?: string
      checkout_url?: string
      qr_data?: string
      error?: { codigo: string; mensaje: string }
    }

    if (!respuesta.ok) {
      return {
        ok: false,
        proveedorPaymentId: null,
        estado: 'unknown',
        error: respuesta.error ?? { codigo: 'unknown', mensaje: 'Pago temporalmente no disponible' },
        raw: respuesta,
      }
    }

    return {
      ok: true,
      proveedorPaymentId: respuesta.proveedor_payment_id ?? null,
      estado: this.normalizePaymentStatus(respuesta.estado ?? 'pending'),
      checkoutUrl: respuesta.checkout_url,
      qrData: respuesta.qr_data,
      raw: respuesta,
    }
  }

  async getPaymentStatus(proveedorPaymentId: string): Promise<EstadoPagoResultado> {
    const { data, error } = await this.sb.functions.invoke('clip-estado-cobro', {
      body: { proveedor_payment_id: proveedorPaymentId },
    })
    if (error) return { estado: 'unknown', raw: { error: error.message } }
    const respuesta = data as { estado?: string }
    return { estado: this.normalizePaymentStatus(respuesta.estado ?? 'unknown'), raw: respuesta }
  }

  async cancelPayment(proveedorPaymentId: string): Promise<void> {
    await this.sb.functions.invoke('clip-cancelar-cobro', { body: { proveedor_payment_id: proveedorPaymentId } })
  }

  async refundPayment(proveedorPaymentId: string, monto?: number): Promise<void> {
    await this.sb.functions.invoke('clip-reembolsar', { body: { proveedor_payment_id: proveedorPaymentId, monto } })
  }

  // El webhook real lo procesa la Edge Function `clip-webhook` del lado
  // servidor (ahí sí vive CLIP_WEBHOOK_SECRET) — el frontend nunca valida
  // firmas de webhook. Este método existe para cumplir la interfaz y para
  // que la Edge Function (que también puede importar este paquete en su
  // propio contexto Deno) reutilice `normalizePaymentStatus`.
  async verifyWebhook(): Promise<WebhookEvento | null> {
    throw new Error(
      'verifyWebhook() de Clip corre en la Edge Function clip-webhook (server-side), no en el cliente.',
    )
  }

  normalizePaymentStatus(estadoProveedor: string): EstadoTransaccionPago {
    // Mapeo genérico documentado en docs/integracion-clip.md — se ajusta
    // en cuanto se tenga la documentación real de los valores que manda
    // Clip (no se inventan valores reales de su API).
    const mapa: Record<string, EstadoTransaccionPago> = {
      pending: 'pending',
      processing: 'processing',
      authorized: 'authorized',
      approved: 'authorized',
      declined: 'declined',
      rejected: 'declined',
      cancelled: 'cancelled',
      canceled: 'cancelled',
      expired: 'expired',
      refunded: 'refunded_full',
      partially_refunded: 'refunded_partial',
    }
    return mapa[estadoProveedor.toLowerCase()] ?? 'unknown'
  }
}
