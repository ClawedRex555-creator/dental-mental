import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2f63c8",
};

const inter = localFont({
  src: [
    {
      path: "../public/fonts/inter/inter-latin-wght-normal.woff2",
      style: "normal",
      weight: "100 900",
    },
    {
      path: "../public/fonts/inter/inter-cyrillic-wght-normal.woff2",
      style: "normal",
      weight: "100 900",
    },
  ],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
  verification: {
    yandex: "4764f4747b629720",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`h-full antialiased ${inter.variable}`} data-theme="light">
      <body
        className={`${inter.className} min-h-full font-sans`}
        style={{ background: "var(--background)", color: "var(--foreground)" }}
      >
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
