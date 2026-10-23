import express from 'express'
import 'dotenv/config'
import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const rootDir = process.env.ROOT_DIR ?? process.cwd()
const CACHE_TTL_MS = 10_000
const port = Number(process.env.PORT ?? 3001)

type FileEntry = {
  name: string
  kind: 'folder' | 'file'
  size: number
  modified: string
  thumbnailUrl?: string
}

let cachedFiles: FileEntry[] = []
let cachedAt = 0

function isImageFile(name: string) {
  const extension = path.extname(name).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(extension)
}

async function loadFilesFromDisk(): Promise<FileEntry[]> {
  const entries = await readdir(rootDir, { withFileTypes: true })
  const files: FileEntry[] = await Promise.all(
    entries.map(async (entry): Promise<FileEntry> => {
      const fullPath = path.join(rootDir, entry.name)
      const metadata = await stat(fullPath)
      const shouldUseThumb = !entry.isDirectory() && isImageFile(entry.name)

      return {
        name: entry.name,
        kind: entry.isDirectory() ? 'folder' : 'file',
        size: metadata.size,
        modified: metadata.mtime.toISOString(),
        thumbnailUrl: shouldUseThumb ? `http://localhost:${port}/thumb?file=${encodeURIComponent(entry.name)}` : undefined,
      }
    }),
  )

  const sortedFiles = files.sort((a, b) => a.name.localeCompare(b.name))
  cachedFiles = sortedFiles
  cachedAt = Date.now()
  return sortedFiles
}

async function getFiles(forceRefresh = false): Promise<FileEntry[]> {
  const now = Date.now()
  if (forceRefresh || now - cachedAt > CACHE_TTL_MS || cachedFiles.length === 0) {
    return loadFilesFromDisk()
  }

  return cachedFiles
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
    const rawName = typeof req.query.file === 'string' ? req.query.file : ''
    const safeName = path.basename(rawName)
    const source = path.join(rootDir, safeName)

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
    const name = typeof req.query.name === 'string' ? req.query.name : ''
    if (!name || name === '.' || name === '..' || path.basename(name) !== name) {
      res.sendStatus(404)
      return
    }

    const rootPath = await realpath(rootDir)
    const filePath = await realpath(path.join(rootPath, name))
    if (path.dirname(filePath) !== rootPath || !(await stat(filePath)).isFile()) {
      res.sendStatus(404)
      return
    }

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

    const sortedFiles = await getFiles(forceRefresh)
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