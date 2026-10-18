const hora = () =>
  new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Merida', hour12: false })

export const log = {
  info: (m: string, quien = '') => console.log(`[${hora()}]${quien ? ' ' + quien : ''} ${m}`),
  aviso: (m: string, quien = '') => console.log(`[${hora()}]${quien ? ' ' + quien : ''} AVISO  ${m}`),
  error: (m: string, quien = '') => console.error(`[${hora()}]${quien ? ' ' + quien : ''} ERROR  ${m}`),
}
