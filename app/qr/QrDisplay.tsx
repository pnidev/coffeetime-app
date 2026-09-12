"use client";
// app/qr/QrDisplay.tsx
// Client component: generate QR code SVG/canvas từ URL

import { useEffect, useRef } from "react";

interface QrDisplayProps {
  url: string;
  printMode?: boolean;
}

export default function QrDisplay({ url, printMode = false }: QrDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    async function generateQR() {
      const QRCode = (await import("qrcode")).default;
      const canvas = canvasRef.current;
      if (!canvas) return;

      await QRCode.toCanvas(canvas, url, {
        width: printMode ? 280 : 240,
        margin: 2,
        color: {
          dark: "#0f0d0b",
          light: "#fffbeb",
        },
        errorCorrectionLevel: "H",
      });
    }

    generateQR();
  }, [url, printMode]);

  return (
    <div
      style={{
        display: "inline-block",
        padding: "16px",
        borderRadius: "16px",
        background: "#fffbeb",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      <canvas
        ref={canvasRef}
        id="qr-canvas"
        style={{ display: "block", borderRadius: "8px" }}
      />
    </div>
  );
}
