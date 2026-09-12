// lib/order-code.ts
// Sinh mã đơn duy nhất dạng HD-XXXXXX

/**
 * Sinh mã đơn ngẫu nhiên dạng HD-XXXXXX (6 chữ số).
 * Dùng timestamp + random để tránh trùng.
 */
export function generateOrderCode(): string {
  const timestamp = Date.now().toString().slice(-4); // 4 chữ số cuối của timestamp
  const random = Math.floor(Math.random() * 100)
    .toString()
    .padStart(2, "0"); // 2 chữ số random
  return `HD-${timestamp}${random}`;
}
