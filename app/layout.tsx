import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoffeeShop — Quản lý giờ ngồi",
  description: "Hệ thống tính giờ và thanh toán tự động cho CoffeeShop. Quét mã QR để bắt đầu phiên ngồi.",
  keywords: "coffeeshop, quán cafe, tính giờ, thanh toán",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#0f0d0b" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
