import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const formaDJR = localFont({
  src: "../../public/fonts/FormaDJRDisplay-Regular.otf",
  variable: "--font-forma-djr",
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HP Chat - Chat with your Documents",
  description: "HP Chat - Chatea con tus documentos usando modelos locales de Ollama. Sube documentos, genera embeddings y haz preguntas con RAG.",
  keywords: ["HP Chat", "Ollama", "RAG", "Chat", "Embeddings", "AI", "Local LLM"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${formaDJR.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-forma-djr), sans-serif" }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
