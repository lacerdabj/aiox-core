export interface GeoCoordinates {
  latitude: number
  longitude: number
  accuracy?: number
}

export interface ResolvedAddress {
  city?: string
  neighborhood?: string
  road?: string
}

export async function captureCurrentPosition(): Promise<GeoCoordinates | null> {
  if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
    return null
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6)),
          accuracy: pos.coords.accuracy
        })
      },
      (err) => {
        console.warn('Erro ao obter geolocalização:', err.message)
        resolve(null)
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    )
  })
}

// Tenta resolver cidade/bairro caso haja conexão com internet, com timeout rápido
export async function tryReverseGeocode(lat: number, lon: number): Promise<ResolvedAddress | null> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return null
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3500)

    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Treali-PWA-Rua/1.0' }
    })
    clearTimeout(timer)

    if (!res.ok) return null
    const data = await res.json()
    const addr = data.address || {}

    const city = addr.city || addr.town || addr.municipality || addr.village || ''
    const neighborhood = addr.suburb || addr.neighbourhood || addr.city_district || ''
    const road = addr.road || ''

    return { city, neighborhood, road }
  } catch {
    return null
  }
}
