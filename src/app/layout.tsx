import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import RegistarApp from "@/components/RegistarApp";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = { title: "GESTAO APP", description: "Gestão de faturas", robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: "Gestão", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#4f46e5" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full">{children}<RegistarApp /></body>
    </html>
  );
}
