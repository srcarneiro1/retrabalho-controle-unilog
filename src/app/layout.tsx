import type { Metadata, Viewport } from 'next'
import 'primereact/resources/themes/lara-light-indigo/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './styles.css'
import './unilog-design-system.css'
import './component-geometry.css'

export const metadata: Metadata = {
  applicationName: 'Retrabalho Controle | Unilog Express',
  title: {
    default: 'Retrabalho Controle | Unilog Express',
    template: '%s | Unilog Express',
  },
  description: 'Retrabalho Controle — Unilog Express',
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/brand/unilog-favicon-red.svg?v=20261001-1', type: 'image/svg+xml' },
    ],
    shortcut: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    title: 'Retrabalho Controle',
    statusBarStyle: 'black-translucent',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#171b24',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
