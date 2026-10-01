import type { Metadata, Viewport } from 'next'
import 'primereact/resources/themes/lara-light-indigo/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './styles.css'
import './unilog-design-system.css'
import './component-geometry.css'
import './mobile-polish.css'

export const metadata: Metadata = {
  title: 'Retrabalho | Unilog Express',
  description: 'Retrabalho — Unilog Express',
  icons: {
    icon: '/brand/unilog-favicon-red.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#171b24',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
