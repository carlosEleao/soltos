import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { Providers } from "@/components/Providers";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-next",
});

const body = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body-next",
});

export const metadata: Metadata = {
  title: "CivicLink — protocolos e tickets no seu agente",
  description:
    "Conecte prefeitura, energia e internet. Gere um link MCP para ChatGPT e agentes monitorarem e abrirem tickets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
