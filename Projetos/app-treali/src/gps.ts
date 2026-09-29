export type Position = { latitude: number; longitude: number; accuracy: number | null }

export async function capturePosition(): Promise<Position> {
  if (!('geolocation' in navigator)) throw new Error('Este navegador não disponibiliza localização GPS.')
  return new Promise<Position>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null
      }),
      () => reject(new Error('Não foi possível obter sua localização. Autorize o GPS e tente novamente.')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 }
    )
  })
}
