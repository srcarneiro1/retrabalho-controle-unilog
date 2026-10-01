import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'out')
const target = path.join(root, 'dist')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })

const title = 'Retrabalho | Unilog Express'
const commit =
  process.env.CF_PAGES_COMMIT_SHA
  || process.env.GITHUB_SHA
  || process.env.COMMIT_SHA
  || 'local'

let exportedTitle = ''
try {
  const html = await readFile(path.join(target, 'index.html'), 'utf8')
  const match = html.match(/<title>([^<]*)<\/title>/i)
  exportedTitle = match?.[1] || ''
} catch {}

await writeFile(
  path.join(target, 'build-meta.json'),
  JSON.stringify({
    app: 'Retrabalho Controle',
    title,
    exportedTitle,
    commit,
    builtAt: new Date().toISOString(),
  }, null, 2),
  'utf8',
)
