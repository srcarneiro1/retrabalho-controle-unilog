import { cp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const source = path.join(root, 'out')
const target = path.join(root, 'dist')

await rm(target, { recursive: true, force: true })
await mkdir(target, { recursive: true })
await cp(source, target, { recursive: true })
