import { FileIcon } from './FileIcon'
import { getFileUrl, type RemoteEntry } from './fileTypes'

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}

export function FileList({ entries }: { entries: RemoteEntry[] }) {
  return (
    <ul className="local-files-remote-list">
      {entries.map((entry) => {
        const contents = (
          <>
            <span className="local-files-thumb-wrap">
              {entry.thumbnailUrl ? (
                <img className="local-files-thumb" src={entry.thumbnailUrl} alt={entry.name} />
              ) : (
                <span className="local-files-file-badge">
                  <FileIcon name={entry.kind === 'folder' ? 'folder' : 'file'} size={15} />
                </span>
              )}
            </span>
            <span>{entry.name}</span>
            <span>{new Date(entry.modified).toLocaleDateString()}</span>
            <span>{formatSize(entry.size)}</span>
          </>
        )

        return (
          <li key={entry.name}>
            {entry.kind === 'file' ? (
              <a className="local-files-list-link" href={getFileUrl(entry.name)} target="_blank" rel="noopener noreferrer">
                {contents}
              </a>
            ) : contents}
          </li>
        )
      })}
    </ul>
  )
}