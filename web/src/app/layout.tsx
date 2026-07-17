import type { Metadata } from "next";
import { JetBrains_Mono, Inter } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://gold-tbd.com"),
  title: "Gold — mined ERC-8004 agent",
  description:
    "Gold ($GOLD) is a mined ERC-8004 agent with a Uniswap V4 self-hook. The token, the V4 hook, and the PoW miner are the same contract.",
  icons: { icon: "/favicon.png" },
  openGraph: {
    title: "Gold — mined ERC-8004 agent",
    description:
      "Mined ERC-8004 agent with a self-hook. Soulbound Miner Agent NFTs. No owner, no mint key, no proxy.",
    url: "https://gold-tbd.com",
    siteName: "Gold",
    images: [{ url: "/logo.png", width: 1024, height: 1024, alt: "Gold sigil" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gold — mined ERC-8004 agent",
    description:
      "Mined ERC-8004 agent with a self-hook. Soulbound Miner Agent NFTs.",
    images: ["/logo.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
