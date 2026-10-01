import type { Metadata, Viewport } from 'next'
import 'primereact/resources/themes/lara-light-indigo/theme.css'
import 'primereact/resources/primereact.min.css'
import 'primeicons/primeicons.css'
import './styles.css'
import './unilog-design-system.css'
import './component-geometry.css'
import './mobile-polish.css'

export const metadata: Metadata = {
  applicationName: 'Retrabalho Controle',
  title: 'Retrabalho Controle',
  description: 'Retrabalho Controle — Unilog Express',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/brand/unilog-favicon-red.svg?v=20261001-4',
    shortcut: '/brand/unilog-favicon-red.svg?v=20261001-4',
  },
  appleWebApp: {
    capable: true,
    title: 'Retrabalho Controle',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title: 'Retrabalho Controle',
    siteName: 'Retrabalho Controle',
    description: 'Retrabalho Controle — Unilog Express',
    type: 'website',
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
