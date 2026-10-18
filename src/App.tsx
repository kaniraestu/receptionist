import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import './App.css'

type Entry = {
  id: string
  name: string
  kind: 'folder' | 'file' | 'image' | 'pdf' | 'spreadsheet'
  modified: string
  size: string
  parentId: string | null
  previewUrl?: string
}

type RemoteEntry = {
  name: string
  kind: 'folder' | 'file'
  modified: string
  size: number
  thumbnailUrl?: string
}

type RemoteFilesResponse = {
  rootDir?: string
  files?: RemoteEntry[]
  total?: number
  page?: number
  limit?: number
  totalPages?: number
}

type ViewMode = 'list' | 'grid'

const PAGE_SIZE = 20

const STORAGE_KEY = 'folio.local-files.v1'

function loadEntries(): Entry[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const entries: unknown = JSON.parse(saved)
    if (!Array.isArray(entries)) return []
    return entries.filter((entry): entry is Entry =>
      entry && typeof entry.id === 'string' && typeof entry.name === 'string' &&
      typeof entry.kind === 'string' && typeof entry.modified === 'string' &&
      typeof entry.size === 'string' && (typeof entry.parentId === 'string' || entry.parentId === null) &&
      (typeof (entry as Partial<Entry>).previewUrl === 'string' || (entry as Partial<Entry>).previewUrl === undefined),
    )
  } catch {
    return []
  }
}

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></>,
    spreadsheet: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9m6 12V9" /></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
  }

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.file}</svg>
}

function entryKind(fileName: string): Entry['kind'] {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension ?? '')) return 'image'
  if (extension === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'csv', 'ods'].includes(extension ?? '')) return 'spreadsheet'
  return 'file'
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getPreviewUrl(kind: Entry['kind'], fileName: string): string {
  const label = fileName.replace(/\.[^.]+$/, '').slice(0, 14) || 'file'
  const palettes: Record<Entry['kind'], [string, string]> = {
    folder: ['#fff5e8', '#f0be67'],
    file: ['#eef2ff', '#8390ff'],
    image: ['#ebfff8', '#67d4b2'],
    pdf: ['#fff0f1', '#ef8d93'],
    spreadsheet: ['#edf9f1', '#7acb9a'],
  }

  const [from, to] = palettes[kind] ?? palettes.file
  const accent = kind === 'image'
    ? '<circle cx="76" cy="54" r="22" fill="rgba(255,255,255,0.6)" /><path d="M48 82l18-18 16 18 18-26 18 26v18H48Z" fill="rgba(255,255,255,0.8)" />'
    : kind === 'pdf'
      ? '<rect x="44" y="34" width="64" height="64" rx="10" fill="rgba(255,255,255,0.22)" /><path d="M58 52h36M58 66h40M58 80h28" stroke="rgba(255,255,255,0.9)" stroke-width="6" stroke-linecap="round" />'
      : kind === 'spreadsheet'
        ? '<rect x="42" y="36" width="72" height="62" rx="10" fill="rgba(255,255,255,0.22)" /><path d="M56 50h44M56 66h44M56 82h44M64 44v52M84 44v52" stroke="rgba(255,255,255,0.9)" stroke-width="5" stroke-linecap="round" />'
        : '<path d="M46 84V48c0-8 6-14 14-14h34c8 0 14 6 14 14v36H46Z" fill="rgba(255,255,255,0.25)" /><path d="M58 54h28M58 68h38M58 82h30" stroke="rgba(255,255,255,0.9)" stroke-width="6" stroke-linecap="round" />'

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="${from}"/>
          <stop offset="100%" stop-color="${to}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="120" rx="18" fill="url(#g)"/>
      <rect x="18" y="16" width="124" height="88" rx="12" fill="rgba(255,255,255,0.18)"/>
      ${accent}
      <text x="22" y="104" fill="rgba(34,42,54,0.8)" font-family="Arial, Helvetica, sans-serif" font-size="17" font-weight="700">${label}</text>
    </svg>
  `

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

function App() {
  const [entries, setEntries] = useState<Entry[]>(loadEntries)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [remoteEntries, setRemoteEntries] = useState<RemoteEntry[]>([])
  const [remoteRoot, setRemoteRoot] = useState('')
  const [remotePage, setRemotePage] = useState(1)
  const [remoteTotalPages, setRemoteTotalPages] = useState(1)
  const [remoteTotal, setRemoteTotal] = useState(0)
  const [isRefreshingRemote, setIsRefreshingRemote] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const displayedRemoteEntries = useMemo(() => remoteEntries.slice(0, PAGE_SIZE), [remoteEntries])
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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  }, [entries])

  useEffect(() => {
    const controller = new AbortController()
    const serverUrl = 'http://localhost:3001'

    fetch(`${serverUrl}/files?page=${remotePage}&limit=${PAGE_SIZE}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`)
        }
        const payload = await response.json() as RemoteFilesResponse
        setRemoteRoot(payload.rootDir ?? 'localhost')
        setRemoteEntries(Array.isArray(payload.files) ? payload.files : [])
        setRemoteTotalPages(payload.totalPages ?? 1)
        setRemoteTotal(payload.total ?? 0)
        setRemotePage((page) => Math.min(page, payload.totalPages ?? 1))
      })
      .catch(() => {
        setRemoteRoot('localhost')
        setRemoteEntries([])
        setRemoteTotalPages(1)
        setRemoteTotal(0)
      })
      .finally(() => {
        setIsRefreshingRemote(false)
      })

    return () => controller.abort()
  }, [remotePage])

  const refreshRemoteFiles = () => {
    setIsRefreshingRemote(true)
    const serverUrl = 'http://localhost:3001'

    fetch(`${serverUrl}/files?page=${remotePage}&limit=${PAGE_SIZE}&refresh=true`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Request failed: ${response.status}`)
        }
        const payload = await response.json() as RemoteFilesResponse
        setRemoteRoot(payload.rootDir ?? 'localhost')
        setRemoteEntries(Array.isArray(payload.files) ? payload.files : [])
        setRemoteTotalPages(payload.totalPages ?? 1)
        setRemoteTotal(payload.total ?? 0)
        setRemotePage((page) => Math.min(page, payload.totalPages ?? 1))
      })
      .catch(() => {
        setRemoteRoot('localhost')
        setRemoteEntries([])
        setRemoteTotalPages(1)
        setRemoteTotal(0)
      })
      .finally(() => setIsRefreshingRemote(false))
  }

  const folderPath = useMemo(() => {
    const path: Entry[] = []
    let folderId = currentFolderId
    while (folderId) {
      const folder = entries.find((entry) => entry.id === folderId && entry.kind === 'folder')
      if (!folder) break
      path.unshift(folder)
      folderId = folder.parentId
    }
    return path
  }, [currentFolderId, entries])

  const visibleEntries = useMemo(() => entries
    .filter((entry) => entry.parentId === currentFolderId && entry.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((first, second) => Number(second.kind === 'folder') - Number(first.kind === 'folder') || first.name.localeCompare(second.name)),
  [currentFolderId, entries, query])

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const addedEntries = Array.from(files, (file): Entry => {
      const kind = entryKind(file.name)
      return {
        id: crypto.randomUUID(),
        name: file.name,
        kind,
        modified: new Date(file.lastModified).toLocaleDateString(),
        size: formatSize(file.size),
        parentId: currentFolderId,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : getPreviewUrl(kind, file.name),
      }
    })
    setEntries((current) => [...current, ...addedEntries])
    if (fileInput.current) fileInput.current.value = ''
  }

  const createFolder = () => {
    const name = window.prompt('Folder name')?.trim()
    if (!name) return
    const duplicate = entries.some((entry) => entry.parentId === currentFolderId && entry.name.toLowerCase() === name.toLowerCase())
    if (duplicate) {
      window.alert('An item with that name already exists in this folder.')
      return
    }
    setEntries((current) => [...current, {
      id: crypto.randomUUID(),
      name,
      kind: 'folder',
      modified: new Date().toLocaleDateString(),
      size: 'Folder',
      parentId: currentFolderId,
    }])
  }

  const deleteEntry = (entryId: string) => {
    const target = entries.find((entry) => entry.id === entryId)
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl)
    }

    const descendants = new Set([entryId])
    let changed = true
    while (changed) {
      changed = false
      entries.forEach((entry) => {
        if (entry.parentId && descendants.has(entry.parentId) && !descendants.has(entry.id)) {
          descendants.add(entry.id)
          changed = true
        }
      })
    }
    setEntries((current) => current.filter((entry) => !descendants.has(entry.id)))
  }

  const currentTitle = folderPath.at(-1)?.name ?? 'My files'

  return (
    <main className="local-files-app">
      <header className="local-files-topbar">
        <a className="local-files-brand" href="#" onClick={(event) => { event.preventDefault(); setCurrentFolderId(null) }}>
          <span className="local-files-brand-mark"><Icon name="folder" size={18} /></span>
          <span>folio<span>.</span></span>
        </a>
        <label className="local-files-search">
          <Icon name="search" size={17} />
          <input aria-label="Search files and folders" placeholder="Search this folder" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <span className="local-files-device">Saved in this browser</span>
      </header>

      <section className="local-files-content">
        <div className="local-files-heading">
          <div>
            <nav className="local-files-breadcrumbs" aria-label="Folder path">
              <button onClick={() => setCurrentFolderId(null)}>My files</button>
              {folderPath.map((folder, index) => (
                <span key={folder.id}>
                  <span className="local-files-crumb-separator">/</span>
                  <button onClick={() => setCurrentFolderId(folder.id)} aria-current={index === folderPath.length - 1 ? 'page' : undefined}>{folder.name}</button>
                </span>
              ))}
            </nav>
            <h1>{currentTitle}</h1>
            <p>{visibleEntries.length} {visibleEntries.length === 1 ? 'item' : 'items'}</p>
          </div>
          <div className="local-files-actions">
            <button className="local-files-button" onClick={createFolder}><Icon name="plus" size={17} /> New folder</button>
            <button className="local-files-button local-files-button-primary" onClick={() => fileInput.current?.click()}><Icon name="plus" size={17} /> Add files</button>
            <input ref={fileInput} className="local-files-input" type="file" multiple onChange={(event) => addFiles(event.target.files)} />
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
            <strong>Exposed localhost files</strong>
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
          {displayedRemoteEntries.length === 0 ? (
            <p>No files available from localhost yet.</p>
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
                <button disabled={!canGoPrev} onClick={() => setRemotePage((page) => Math.max(1, page - 1))}>Previous</button>

                <div className="local-files-page-numbers">
                  {pageNumbers.map((page, index) => {
                    if (page === 'ellipsis') {
                      return <span key={`ellipsis-${index}`} className="local-files-page-ellipsis">…</span>
                    }

                    return (
                      <button
                        key={page}
                        className={remotePage === page ? 'active' : ''}
                        onClick={() => setRemotePage(page)}
                        disabled={remotePage === page}
                      >
                        {page}
                      </button>
                    )
                  })}
                </div>

                <button disabled={!canGoNext} onClick={() => setRemotePage((page) => Math.min(remoteTotalPages, page + 1))}>Next</button>
              </div>

              <div className="local-files-remote-summary">
                <span>Page {remotePage} of {remoteTotalPages}</span>
                <span>{remoteTotal} total items</span>
              </div>
            </>
          )}
        </div>

        {visibleEntries.length === 0 ? (
          <div className="local-files-empty">
            <span className="local-files-empty-icon"><Icon name="folder" size={24} /></span>
            <strong>{query ? 'No matching items' : 'This folder is empty'}</strong>
            <span>{query ? 'Try a different search.' : 'Add files or create a folder to get started.'}</span>
          </div>
        ) : viewMode === 'list' ? (
          <div className="local-files-list">
            <div className="local-files-list-head"><span>Name</span><span>Modified</span><span>Size</span><span /></div>
            {visibleEntries.map((entry) => (
              <div className="local-files-row" key={entry.id}>
                <button className="local-files-entry-name" onClick={() => entry.kind === 'folder' && setCurrentFolderId(entry.id)}>
                  <span className={`local-files-entry-icon kind-${entry.kind}`}><Icon name={entry.kind} size={18} /></span>
                  <span>{entry.name}</span>
                </button>
                <span className="local-files-meta">{entry.modified}</span>
                <span className="local-files-meta">{entry.size}</span>
                <button className="local-files-delete" aria-label={`Delete ${entry.name}`} title="Delete" onClick={() => deleteEntry(entry.id)}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </div>
        ) : (
          <div className="local-files-grid">
            {visibleEntries.map((entry) => (
              <div className="local-files-card" key={entry.id}>
                <button className="local-files-card-open" onClick={() => entry.kind === 'folder' && setCurrentFolderId(entry.id)}>
                  <span className="local-files-card-preview">
                    {entry.previewUrl ? (
                      <img src={entry.previewUrl} alt={entry.name} />
                    ) : (
                      <span className={`local-files-entry-icon kind-${entry.kind}`}><Icon name={entry.kind} size={20} /></span>
                    )}
                  </span>
                  <strong>{entry.name}</strong>
                  <span>{entry.modified} <span aria-hidden="true">·</span> {entry.size}</span>
                </button>
                <button className="local-files-delete" aria-label={`Delete ${entry.name}`} title="Delete" onClick={() => deleteEntry(entry.id)}><Icon name="trash" size={16} /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
