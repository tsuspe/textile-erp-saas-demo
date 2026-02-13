// app/layout.tsx
import AuthProvider from "@/app/components/AuthProvider";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Demo Textile Platform · Gestion interna",
    template: "%s · Demo Textile Platform",
  },
  description:
    "Plataforma interna para fichas, producción y maestros. Multi-empresa, trazable y con asistente IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* SessionProvider global para poder usar useSession() en el chrome */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
