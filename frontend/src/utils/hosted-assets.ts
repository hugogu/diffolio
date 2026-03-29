export function hostedAssetUrl(fileName: string): string {
  return `/overrides/img/${fileName}`
}

export async function loadHostedImage(fileName: string): Promise<string> {
  const url = hostedAssetUrl(fileName)

  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok ? url : ''
  } catch {
    return ''
  }
}
