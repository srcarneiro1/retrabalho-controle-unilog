// Gera o tema PrimeReact da Unilog a partir do Lara Light Indigo oficial.
//
// Por que existe: o Lara usa ~320 cores indigo/roxas fixas (hex), não só variáveis CSS.
// Sobrescrever componente por componente deixava estados escapando (hover, foco,
// selecionado, calendário, paginação, checkbox). Aqui a troca é feita na origem,
// a cada build, mantendo o tema sincronizado com a versão instalada do PrimeReact.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const source = require.resolve('primereact/resources/themes/lara-light-indigo/theme.css')
const target = path.join(process.cwd(), 'src/app/generated/primereact-unilog-theme.css')

// Escala indigo (Tailwind) do Lara → escala vermelho Unilog (#db0812).
const PALETTE = {
  '#eef2ff': '#fdecee', // 50  fundo de item selecionado
  '#e0e7ff': '#fbd9dc', // 100
  '#c7d2fe': '#f5b5b9', // 200 anel de foco
  '#a5b4fc': '#ee8a90', // 300
  '#818cf8': '#e55a62', // 400
  '#6366f1': '#db0812', // 500 primária
  '#4f46e5': '#b8070f', // 600 hover
  '#4338ca': '#9e060d', // 700 texto destacado
  '#3730a3': '#83050b', // 800
  '#312e81': '#6a0409', // 900
}

let css = await readFile(source, 'utf8')

// A tipografia canônica é Roboto (Google Fonts). Remove a Inter embutida no Lara.
css = css.replace(/@font-face\s*{[^}]*}/g, '')

for (const [from, to] of Object.entries(PALETTE)) {
  css = css.replace(new RegExp(from, 'gi'), to)
}
css = css.replace(/rgba\(\s*99,\s*102,\s*241,/g, 'rgba(219, 8, 18,')

const leftover = css.match(/#(eef2ff|e0e7ff|c7d2fe|a5b4fc|818cf8|6366f1|4f46e5|4338ca|3730a3|312e81)\b|rgba\(\s*99,\s*102,\s*241/gi)
if (leftover) {
  throw new Error(`Tema Unilog: restaram ${leftover.length} cores indigo no tema gerado.`)
}

await mkdir(path.dirname(target), { recursive: true })
await writeFile(
  target,
  '/* ARQUIVO GERADO por scripts/build-unilog-theme.mjs — não editar manualmente. */\n' + css,
)
console.log('Tema PrimeReact Unilog gerado:', path.relative(process.cwd(), target))
