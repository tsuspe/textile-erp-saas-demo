// app/layout.tsx
import AuthProvider from "@/app/components/AuthProvider";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* SessionProvider global para poder usar useSession() en el chrome */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
