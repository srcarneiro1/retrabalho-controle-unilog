import 'primereact/resources/themes/lara-light-red/theme.css'
import 'primeicons/primeicons.css'
import './styles.css'

export const metadata = {
  title: 'Retrabalho Controle | Unilog',
  description: 'Controle operacional de retrabalho e etiquetagem',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
