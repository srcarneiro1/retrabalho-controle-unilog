import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'

if (!existsSync('out')) throw new Error('Diretório out não encontrado após next build.')
rmSync('dist', { recursive: true, force: true })
mkdirSync('dist', { recursive: true })
cpSync('out', 'dist', { recursive: true })
console.log('Next static export copiado de out/ para dist/.')
