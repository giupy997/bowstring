"use client";

import Image from "next/image";
import { ConnectWallet } from "./ConnectWallet";

export function Header() {
  return (
    <header className="app-header">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <a href="/" className="app-logo">
            <Image
              src="/logo.png"
              alt="Gold"
              width={32}
              height={32}
              priority
              className="app-logo-mark"
            />
            <span className="app-logo-text">GOLD</span>
          </a>
          <nav className="hidden sm:flex gap-7">
            <a href="#genesis" className="nav-link">genesis</a>
            <a href="#mine" className="nav-link">mine</a>
            <a href="/whitepaper" className="nav-link">whitepaper</a>
            <a
              href="https://x.com/gold-tbd"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-link"
            >
              x
            </a>
          </nav>
        </div>
        <ConnectWallet />
      </div>
    </header>
  );
}
