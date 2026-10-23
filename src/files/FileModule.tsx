import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileGrid } from './FileGrid'
import { FileIcon } from './FileIcon'
import { FileList } from './FileList'
import type { RemoteEntry, RemoteFilesResponse } from './fileTypes'
import '../App.css'

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

export function FileModule() {
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
          <span className="local-files-brand-mark"><FileIcon name="folder" size={18} /></span>
          <span>folio<span>.</span></span>
        </div>
        <label className="local-files-search">
          <FileIcon name="search" size={17} />
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
            <button className={viewMode === 'list' ? 'active' : ''} aria-label="List view" aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}><FileIcon name="list" size={17} /></button>
            <button className={viewMode === 'grid' ? 'active' : ''} aria-label="Grid view" aria-pressed={viewMode === 'grid'} onClick={() => setViewMode('grid')}><FileIcon name="grid" size={16} /></button>
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
              <span className="local-files-empty-icon"><FileIcon name="folder" size={24} /></span>
              <strong>{isRefreshingRemote ? 'Loading files' : query ? 'No matching files' : remoteError ? 'Files could not be loaded' : 'No files found'}</strong>
              <span>{isRefreshingRemote ? 'Reading the directory…' : query ? 'Try a different search.' : remoteError ? 'Try refreshing the directory.' : 'This directory is empty.'}</span>
            </div>
          ) : (
            <>
              {viewMode === 'list'
                ? <FileList entries={displayedRemoteEntries} />
                : <FileGrid entries={displayedRemoteEntries} />}

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