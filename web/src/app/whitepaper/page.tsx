import { promises as fs } from "fs";
import path from "path";
import { marked } from "marked";
import { Header } from "@/components/Header";

export const metadata = {
  title: "Nonce — Whitepaper",
  description:
    "Technical and economic specification of the Nonce ($NONCE) contract.",
};

// The markdown lives at the repo root. We read it at build time and render
// it as static HTML inside a site-styled container.
async function loadWhitepaperHtml(): Promise<string> {
  // process.cwd() during `next build` is the web/ directory (we set base=web
  // in netlify.toml). The source markdown is one level up.
  const candidates = [
    path.join(process.cwd(), "..", "WHITEPAPER.md"),
    path.join(process.cwd(), "WHITEPAPER.md"),
  ];
  for (const c of candidates) {
    try {
      const md = await fs.readFile(c, "utf-8");
      return marked.parse(md, { async: false }) as string;
    } catch {
      continue;
    }
  }
  return "<p>Whitepaper source not found at build time.</p>";
}

export default async function WhitepaperPage() {
  const html = await loadWhitepaperHtml();

  return (
    <>
      <Header />
      <main className="wp-page">
        <div className="wp-toolbar">
          <a href="/" className="wp-back">← back to dashboard</a>
          <a
            href="/whitepaper.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="wp-pdf"
          >
            download pdf ↗
          </a>
        </div>
        <article
          className="wp-content"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </main>
    </>
  );
}
