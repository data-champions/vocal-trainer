import "./globals.css";

export const metadata = {
  title: "Composer",
  description: "Music notation composer"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
