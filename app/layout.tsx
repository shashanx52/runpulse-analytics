import "./globals.css";
import type { Metadata } from "next";
import { ThemeProvider } from "@/lib/theme";

export const metadata: Metadata = {
  title: "RunPulse Analytics",
  description:
    "Marketing analytics, data-quality and forecasting platform for the Velocity Run Series 2026.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>
          <div className="appwrap">{children}</div>
        </ThemeProvider>
      </body>
    </html>
  );
}
