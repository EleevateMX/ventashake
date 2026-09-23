/**
 * Pedirle la ubicación al navegador, con las tres cosas que hay que
 * decirle o se porta mal en un teléfono:
 *
 * - `enableHighAccuracy`: sin esto Android contesta con la torre de
 *   celular, que da un radio de cientos de metros. Con eso, la geocerca
 *   deja de acotar nada — y el servidor lo rechazaría de todos modos.
 * - `timeout`: un GPS bajo techo puede tardar. Sin límite, el botón se
 *   queda pensando sin decir nada, que es peor que fallar.
 * - `maximumAge: 0`: una lectura guardada de hace media hora es de donde
 *   estabas antes, no de donde estás. Para un checador eso es justo lo
 *   que no sirve.
 */
export interface Ubicacion {
  lat: number
  lon: number
  precision_m: number | null
}

export function pedirUbicacion(): Promise<Ubicacion> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este teléfono no puede dar su ubicación. Checa en la barra.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          precision_m: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
        }),
      (e) => reject(new Error(mensajeDeGeo(e))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}

/**
 * Los mensajes del navegador son de programador («User denied
 * Geolocation»). Quien los lee está parado en la barra con prisa, así que
 * cada uno dice **qué hacer**, no qué pasó.
 */
function mensajeDeGeo(e: GeolocationPositionError): string {
  if (e.code === e.PERMISSION_DENIED) {
    return 'No diste permiso de ubicación. Ábrelo en los ajustes del navegador, o checa en la barra.'
  }
  if (e.code === e.POSITION_UNAVAILABLE) {
    return 'No se pudo leer tu ubicación. Prende el GPS y vuelve a intentar.'
  }
  return 'Tardó demasiado en encontrarte. Sal un momento al aire libre y vuelve a intentar.'
}
