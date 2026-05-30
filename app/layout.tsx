import type { Metadata } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased" data-theme="light">
      <body className="min-h-full font-sans" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
