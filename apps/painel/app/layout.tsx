import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Fluxo de Etapas", description: "Demandas por cliente, com etapas e responsáveis" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Archivo+Black&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
