import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEXA Admin',
  description: 'NEXA platform administration dashboard',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
