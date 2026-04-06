import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "Jornadas Sonoras",
  description:
    "Diario em audio com acompanhamento emocional e recomendacoes de regulacao",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt">
      <body className="bg-(--background) text-(--foreground) antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
