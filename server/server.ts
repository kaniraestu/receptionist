import express from 'express'
import dotenv from 'dotenv'
import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

dotenv.config({ path: '.env.development' });

const rootDir = process.env.ROOT_DIR?.trim() ?? ''
const CACHE_TTL_MS = 10_000
const port = Number(process.env.PORT ?? 3001)

type FileEntry = {
  name: string
  kind: 'folder' | 'file'
  size: number
  modified: string
  thumbnailUrl?: string
}

const fileCache = new Map<string, { files: FileEntry[]; cachedAt: number }>()

function isWithinDirectory(rootPath: string, candidatePath: string) {
  const relativePath = path.relative(rootPath, candidatePath)
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath))
}

async function resolveDirectory(relativePath: string) {
  const rootPath = await realpath(rootDir)
  const directoryPath = await realpath(path.resolve(rootPath, relativePath || '.'))
  if (!isWithinDirectory(rootPath, directoryPath) || !(await stat(directoryPath)).isDirectory()) {
    throw new Error('Directory not found.')
  }
  return { rootPath, directoryPath }
}

async function resolveFile(relativePath: string, name: string) {
  if (!name || name === '.' || name === '..' || path.basename(name) !== name) {
    throw new Error('File not found.')
  }

  const { rootPath, directoryPath } = await resolveDirectory(relativePath)
  const filePath = await realpath(path.join(directoryPath, name))
  if (!isWithinDirectory(rootPath, filePath) || path.dirname(filePath) !== directoryPath || !(await stat(filePath)).isFile()) {
    throw new Error('File not found.')
  }
  return filePath
}

function isImageFile(name: string) {
  const extension = path.extname(name).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(extension)
}

async function loadFilesFromDisk(relativePath: string): Promise<FileEntry[]> {
  const { directoryPath } = await resolveDirectory(relativePath)
  const entries = await readdir(directoryPath, { withFileTypes: true })
  const files: FileEntry[] = await Promise.all(
    entries.map(async (entry): Promise<FileEntry> => {
      const fullPath = path.join(directoryPath, entry.name)
      const metadata = await stat(fullPath)
      const shouldUseThumb = !entry.isDirectory() && isImageFile(entry.name)
      const thumbnailUrl = new URL(`/thumb?file=${encodeURIComponent(entry.name)}`, `http://localhost:${port}`)
      if (relativePath) thumbnailUrl.searchParams.set('path', relativePath)

      return {
        name: entry.name,
        kind: entry.isDirectory() ? 'folder' : 'file',
        size: metadata.size,
        modified: metadata.mtime.toISOString(),
        thumbnailUrl: shouldUseThumb ? thumbnailUrl.toString() : undefined,
      }
    }),
  )

  const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name))
  fileCache.set(relativePath, { files: sortedFiles, cachedAt: Date.now() })
  return sortedFiles
}

async function getFiles(relativePath: string, forceRefresh = false): Promise<FileEntry[]> {
  const now = Date.now()
  const cached = fileCache.get(relativePath)
  if (forceRefresh || !cached || now - cached.cachedAt > CACHE_TTL_MS) {
    return loadFilesFromDisk(relativePath)
  }

  return cached.files
}

const app = express()
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }

  next()
})
app.use((_req, res, next) => {
  if (!rootDir) {
    return res.status(500).json({
      ok: false,
      error: 'ROOT_DIR is not configured. Set it in .env.development.',
    })
  }
  next()
})
app.locals.rootDir = rootDir

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'receptionist backend is running',
    rootDir,
  })
})

app.get('/thumb', async (req, res) => {
  try {
    const relativePath = typeof req.query.path === 'string' ? req.query.path : ''
    const rawName = typeof req.query.file === 'string' ? req.query.file : ''
    const source = await resolveFile(relativePath, rawName)

    const image = await sharp(source)
      .resize(180, 180, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer()

    res.setHeader('Content-Type', 'image/webp')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(image)
  } catch (error) {
    res.status(404).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

app.get('/file', async (req, res) => {
  try {
    const relativePath = typeof req.query.path === 'string' ? req.query.path : ''
    const name = typeof req.query.name === 'string' ? req.query.name : ''
    const filePath = await resolveFile(relativePath, name)

    res.sendFile(filePath, (error) => {
      if (error && !res.headersSent) res.sendStatus(404)
    })
  } catch {
    res.sendStatus(404)
  }
})

app.get('/files', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page ?? 1))
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 20)))
    const forceRefresh = req.query.refresh === 'true'
    const relativePath = typeof req.query.path === 'string' ? req.query.path : ''

    const sortedFiles = await getFiles(relativePath, forceRefresh)
    const total = sortedFiles.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const currentPage = Math.min(page, totalPages)
    const start = (currentPage - 1) * limit
    const end = start + limit

    res.json({
      ok: true,
      rootDir,
      files: sortedFiles.slice(start, end),
      total,
      page: currentPage,
      limit,
      totalPages,
    })
  } catch (error) {
    res.status(500).json({
      ok: false,
      rootDir,
      error: error instanceof Error ? error.message : 'Unknown error',
      files: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    })
  }
})

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`)
  console.log(`Root dir: ${rootDir}`)
})