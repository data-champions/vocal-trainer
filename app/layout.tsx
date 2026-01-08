import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Voice Trainer 🎹",
  description: "Interactive vocal training tool recreated in Next.js",
  icons: {
    icon: [
      {
        url: "/musical_keyboard-removebg.png",
        type: "image/png"
      }
    ]
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
