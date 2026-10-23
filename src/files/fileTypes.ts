export type RemoteEntry = {
  name: string
  kind: 'folder' | 'file'
  modified: string
  size: number
  thumbnailUrl?: string
}

export type RemoteFilesResponse = {
  rootDir: string
  files: RemoteEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function getFileUrl(name: string): string {
  const url = new URL('/file', 'http://localhost:3001')
  url.searchParams.set('name', name)
  return url.toString()
}