import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";
import { Masthead } from "@/components/Masthead";
import { TickerTape } from "@/components/TickerTape";
import "./globals.css";

// One job per family: serif for headlines, Inter for UI, mono for every number.
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });
const sans = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "The Daily Tape",
  description: "A personal market paper: crypto and global markets, priced in PHP.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-screen">
        <div className="mx-auto max-w-[1280px] px-4">
          <Masthead />
          <TickerTape />
          <main className="pt-3 pb-10">{children}</main>
        </div>
      </body>
    </html>
  );
}
