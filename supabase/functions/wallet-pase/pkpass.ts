// Arma y firma un .pkpass (Apple Wallet).
//
// Un pase es un zip con pass.json, las imágenes, un manifest.json (SHA-1 de
// cada archivo) y `signature`: la firma PKCS#7 *separada* del manifest, hecha
// con el certificado del Pass Type ID y encadenada al WWDR de Apple. Sin esa
// firma, Wallet lo rechaza sin decir por qué.
import forge from 'npm:node-forge@1.3.1'
import { strToU8, zipSync } from 'npm:fflate@0.8.2'

export interface Firma {
  certPem: string
  keyPem: string
  keyPassword?: string
  wwdrPem: string
}

export async function firmarPase(archivos: Record<string, Uint8Array>, firma: Firma): Promise<Uint8Array> {
  // SHA-1 con Web Crypto, no con forge: `forge.util.binary.raw.encode` pasa
  // el archivo entero por `String.fromCharCode.apply` y con el strip de
  // 140 KB revienta la pila (lo encontró la prueba local).
  const manifest: Record<string, string> = {}
  for (const [nombre, datos] of Object.entries(archivos)) {
    const hash = await crypto.subtle.digest('SHA-1', datos)
    manifest[nombre] = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('')
  }
  const manifestJson = JSON.stringify(manifest)

  const cert = forge.pki.certificateFromPem(firma.certPem)
  const wwdr = forge.pki.certificateFromPem(firma.wwdrPem)
  const key = firma.keyPassword
    ? forge.pki.decryptRsaPrivateKey(firma.keyPem, firma.keyPassword)
    : forge.pki.privateKeyFromPem(firma.keyPem)
  if (!key) throw new Error('No se pudo leer la llave del certificado del pase.')

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(manifestJson, 'utf8')
  p7.addCertificate(wwdr)
  p7.addCertificate(cert)
  p7.addSigner({
    key,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign({ detached: true })
  const der = forge.asn1.toDer(p7.toAsn1()).getBytes()
  const signature = forge.util.binary.raw.decode(der)

  return zipSync(
    { ...archivos, 'manifest.json': strToU8(manifestJson), signature },
    { level: 6 },
  )
}

export function desdeBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}
