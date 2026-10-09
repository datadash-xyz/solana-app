import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { ConnectWallet } from "@/components/ConnectWallet";
import { Search } from "@/components/Search";
import { Suspense } from "react";
import { NavLinks, NavLinksFallback } from "@/components/NavLinks";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Datadash on Solana",
  description:
    "The intelligence layer for prediction markets, now on Solana. Category leaderboards, verified trader portfolios, live trades and where top Solana traders are positioned.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 backdrop-blur">
          <nav className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/datadash.svg" alt="Datadash" className="h-7" />
              <span className="rounded-full border border-violet bg-violet-bg px-2.5 py-0.5 text-xs font-semibold text-violet">on Solana · beta</span>
            </Link>
            <Suspense fallback={<NavLinksFallback />}>
              <NavLinks />
            </Suspense>
            <div className="ml-auto flex items-center gap-3">
              <div className="hidden w-64 md:block">
                <Search />
              </div>
              <ConnectWallet />
            </div>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">{children}</main>
        <footer className="border-t border-line">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-xs text-dim">
            <span>Data: Jupiter Prediction API. Trades verified on Solana via Helius RPC.</span>
            <span>Public on-chain data. Not financial advice.</span>
            <a className="ml-auto hover:text-text" href="https://datadash.xyz">datadash.xyz</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
