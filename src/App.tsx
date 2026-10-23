import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './App.css'

type RemoteEntry = {
  name: string
  kind: 'folder' | 'file'
  modified: string
  size: number
  thumbnailUrl?: string
}

type RemoteFilesResponse = {
  rootDir: string
  files: RemoteEntry[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type ViewMode = 'list' | 'grid'

const PAGE_SIZE = 20

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseRemoteFilesResponse(value: unknown): RemoteFilesResponse {
  if (!isRecord(value) || !Array.isArray(value.files)) {
    throw new Error('The file server returned an invalid response.')
  }

  const { rootDir, files, total, page, limit, totalPages } = value
  if (
    typeof rootDir !== 'string' ||
    typeof total !== 'number' || !Number.isInteger(total) || total < 0 ||
    typeof page !== 'number' || !Number.isInteger(page) || page < 1 ||
    typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 ||
    typeof totalPages !== 'number' || !Number.isInteger(totalPages) || totalPages < 1 ||
    page > totalPages
  ) {
    throw new Error('The file server returned invalid pagination data.')
  }

  const parsedFiles = files.map((file): RemoteEntry => {
    if (
      !isRecord(file) ||
      typeof file.name !== 'string' ||
      (file.kind !== 'folder' && file.kind !== 'file') ||
      typeof file.modified !== 'string' ||
      !Number.isFinite(Date.parse(file.modified)) ||
      typeof file.size !== 'number' || !Number.isFinite(file.size) || file.size < 0 ||
      (file.thumbnailUrl !== undefined && typeof file.thumbnailUrl !== 'string')
    ) {
      throw new Error('The file server returned an invalid file entry.')
    }

    return {
      name: file.name,
      kind: file.kind,
      modified: file.modified,
      size: file.size,
      ...(typeof file.thumbnailUrl === 'string' ? { thumbnailUrl: file.thumbnailUrl } : {}),
    }
  })

  return { rootDir, files: parsedFiles, total, page, limit, totalPages }
}


function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
  }

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg>
}

function App() {
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [remoteEntries, setRemoteEntries] = useState<RemoteEntry[]>([])
  const [remoteRoot, setRemoteRoot] = useState('')
  const [remotePage, setRemotePage] = useState(1)
  const [remoteTotalPages, setRemoteTotalPages] = useState(1)
  const [remoteTotal, setRemoteTotal] = useState(0)
  const [isRefreshingRemote, setIsRefreshingRemote] = useState(true)
  const [remoteError, setRemoteError] = useState('')
  const remoteRequest = useRef<AbortController | null>(null)

  const displayedRemoteEntries = useMemo(() => remoteEntries.filter((entry) =>
    entry.name.toLowerCase().includes(query.trim().toLowerCase()),
  ), [query, remoteEntries])
  const canGoPrev = remotePage > 1 && remoteTotalPages > 1
  const canGoNext = remotePage < remoteTotalPages && remoteTotalPages > 1

  const pageNumbers = useMemo(() => {
    if (remoteTotalPages <= 1) return [1]

    const pages: Array<number | 'ellipsis'> = []
    const maxVisiblePages = 5

    if (remoteTotalPages <= maxVisiblePages) {
      for (let page = 1; page <= remoteTotalPages; page += 1) pages.push(page)
      return pages
    }

    const left = Math.max(1, remotePage - 1)
    const right = Math.min(remoteTotalPages, remotePage + 1)

    if (left > 1) pages.push(1)
    if (left > 2) pages.push('ellipsis')
    for (let page = left; page <= right; page += 1) pages.push(page)
    if (right < remoteTotalPages - 1) pages.push('ellipsis')
    if (right < remoteTotalPages) pages.push(remoteTotalPages)

    return pages
  }, [remotePage, remoteTotalPages])

  const fetchRemoteFiles = useCallback(async (page: number, refresh: boolean, signal: AbortSignal) => {
    const url = new URL('/files', 'http://localhost:3001')
    url.searchParams.set('page', String(page))
    url.searchParams.set('limit', String(PAGE_SIZE))
    if (refresh) url.searchParams.set('refresh', 'true')

    const response = await fetch(url, { signal })
    if (!response.ok) throw new Error(`Request failed: ${response.status}`)
    return parseRemoteFilesResponse(await response.json())
  }, [])

  const applyRemoteFiles = (payload: RemoteFilesResponse) => {
    setRemoteRoot(payload.rootDir)
    setRemoteEntries(payload.files)
    setRemoteTotalPages(payload.totalPages)
    setRemoteTotal(payload.total)
    setRemoteError('')
    setRemotePage((currentPage) => Math.min(currentPage, payload.totalPages))
  }

  useEffect(() => {
    remoteRequest.current?.abort()
    const controller = new AbortController()
    remoteRequest.current = controller

    const load = async () => {
      try {
        const payload = await fetchRemoteFiles(remotePage, false, controller.signal)
        if (!controller.signal.aborted) applyRemoteFiles(payload)
      } catch (error) {
        if (!controller.signal.aborted) {
          setRemoteError(error instanceof Error ? error.message : 'Could not load files from localhost.')
        }
      } finally {
        if (!controller.signal.aborted) {
          if (remoteRequest.current === controller) remoteRequest.current = null
          setIsRefreshingRemote(false)
        }
      }
    }

    void load()
    return () => {
      remoteRequest.current?.abort()
      remoteRequest.current = null
    }
  }, [fetchRemoteFiles, remotePage])

  const refreshRemoteFiles = () => {
    remoteRequest.current?.abort()
    const controller = new AbortController()
    remoteRequest.current = controller
    setIsRefreshingRemote(true)
    setRemoteError('')

    const refresh = async () => {
      try {
        const payload = await fetchRemoteFiles(remotePage, true, controller.signal)
        if (!controller.signal.aborted) applyRemoteFiles(payload)
      } catch (error) {
        if (!controller.signal.aborted) {
          setRemoteError(error instanceof Error ? error.message : 'Could not load files from localhost.')
        }
      } finally {
        if (!controller.signal.aborted) {
          if (remoteRequest.current === controller) remoteRequest.current = null
          setIsRefreshingRemote(false)
        }
      }
    }
    void refresh()
  }

  const changeRemotePage = (page: number) => {
    setIsRefreshingRemote(true)
    setRemoteError('')
    setRemotePage(page)
  }

  return (
    <main className="local-files-app">
      <header className="local-files-topbar">
        <div className="local-files-brand">
          <span className="local-files-brand-mark"><Icon name="folder" size={18} /></span>
          <span>folio<span>.</span></span>
        </div>
        <label className="local-files-search">
          <Icon name="search" size={17} />
          <input aria-label="Search files and folders" placeholder="Search files" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span className="local-files-device">{remoteRoot || 'localhost'}</span>
      </header>

      <section className="local-files-content">
        <div className="local-files-heading">
          <div>
            <h1>Files</h1>
            <p>{remoteTotal} {remoteTotal === 1 ? 'item' : 'items'}</p>
          </div>
        </div>

        <div className="local-files-toolbar">
          <span>Name</span>
          <div className="local-files-view-switch" aria-label="View mode">
            <button className={viewMode === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><Icon name="list" size={17} /></button>
            <button className={viewMode === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}><Icon name="grid" size={16} /></button>
          </div>
        </div>

        <div className="local-files-remote">
          <div className="local-files-remote-header">
            <strong>Directory</strong>
            <span>{remoteRoot || 'localhost'}</span>
            <button
              className="local-files-button local-files-button-primary"
              onClick={refreshRemoteFiles}
              disabled={isRefreshingRemote}
              type="button"
            >
              {isRefreshingRemote ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          {remoteError && <p className="local-files-error" role="alert">{remoteError}</p>}
          {displayedRemoteEntries.length === 0 ? (
            <div className="local-files-empty">
              <span className="local-files-empty-icon"><Icon name="folder" size={24} /></span>
              <strong>{isRefreshingRemote ? 'Loading files' : query ? 'No matching files' : remoteError ? 'Files could not be loaded' : 'No files found'}</strong>
              <span>{isRefreshingRemote ? 'Reading the directory…' : query ? 'Try a different search.' : remoteError ? 'Try refreshing the directory.' : 'This directory is empty.'}</span>
            </div>
          ) : (
            <>
              {viewMode === 'list' ? (
                <ul className="local-files-remote-list">
                  {displayedRemoteEntries.map((entry) => (
                    <li key={entry.name}>
                      <span className="local-files-thumb-wrap">
                        {entry.thumbnailUrl ? (
                          <img className="local-files-thumb" src={entry.thumbnailUrl} alt={entry.name} />
                        ) : (
                          <span className="local-files-file-badge">
                            {entry.kind === 'folder' ? <Icon name="folder" size={15} /> : <Icon name="file" size={15} />}
                          </span>
                        )}
                      </span>
                      <span>{entry.name}</span>
                      <span>{new Date(entry.modified).toLocaleDateString()}</span>
                      <span>{entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="local-files-grid">
                  {displayedRemoteEntries.map((entry) => (
                    <div className="local-files-card" key={entry.name}>
                      <button className="local-files-card-open" type="button">
                        <span className="local-files-card-preview">
                          {entry.thumbnailUrl ? (
                            <img src={entry.thumbnailUrl} alt={entry.name} />
                          ) : (
                            <span className={`local-files-entry-icon kind-${entry.kind}`}><Icon name={entry.kind} size={20} /></span>
                          )}
                        </span>
                        <strong>{entry.name}</strong>
                        <span>{new Date(entry.modified).toLocaleDateString()} <span aria-hidden="true">·</span> {entry.size < 1024 ? `${entry.size} B` : `${(entry.size / 1024).toFixed(1)} KB`}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="local-files-remote-pagination">
                <button disabled={!canGoPrev} onClick={() => changeRemotePage(Math.max(1, remotePage - 1))}>Previous</button>

                <div className="local-files-page-numbers">
                  {pageNumbers.map((page, index) => {
                    if (page === 'ellipsis') {
                      return <span key={`ellipsis-${index}`} className="local-files-page-ellipsis">…</span>
                    }

                    return (
                      <button
                        key={page}
                        className={remotePage === page ? 'active' : ''}
                        onClick={() => changeRemotePage(page)}
                        disabled={remotePage === page}
                      >
                        {page}
                      </button>
                    )
                  })}
                </div>

                <button disabled={!canGoNext} onClick={() => changeRemotePage(Math.min(remoteTotalPages, remotePage + 1))}>Next</button>
              </div>

              <div className="local-files-remote-summary">
                <span>Page {remotePage} of {remoteTotalPages}</span>
                <span>{remoteTotal} total items</span>
              </div>
            </>
          )}
        </div>

      </section>
    </main>
  )
}

export default App
