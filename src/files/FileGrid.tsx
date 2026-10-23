import { FileIcon } from './FileIcon'
import { getFileUrl, type RemoteEntry } from './fileTypes'

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

export function FileGrid({ entries }: { entries: RemoteEntry[] }) {
  return (
    <div className="local-files-grid">
      {entries.map((entry) => (
        <div className="local-files-card" key={entry.name}>
          {entry.kind === 'file' ? (
            <a className="local-files-card-open" href={getFileUrl(entry.name)} target="_blank" rel="noopener noreferrer">
              <span className="local-files-card-preview">
                {entry.thumbnailUrl ? (
                  <img src={entry.thumbnailUrl} alt={entry.name} />
                ) : (
                  <span className={`local-files-entry-icon kind-${entry.kind}`}>
                    <FileIcon name="file" size={20} />
                  </span>
                )}
              </span>
              <strong>{entry.name}</strong>
              <span>{new Date(entry.modified).toLocaleDateString()} <span aria-hidden="true">·</span> {formatSize(entry.size)}</span>
            </a>
          ) : (
            <div className="local-files-card-open">
              <span className="local-files-card-preview">
                <span className={`local-files-entry-icon kind-${entry.kind}`}>
                  <FileIcon name="folder" size={20} />
                </span>
              </span>
              <strong>{entry.name}</strong>
              <span>{new Date(entry.modified).toLocaleDateString()} <span aria-hidden="true">·</span> {formatSize(entry.size)}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}