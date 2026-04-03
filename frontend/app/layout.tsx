import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Journaling App - Audio Emotion Tracking",
  description: "Daily audio journaling with emotional evolution insights",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
