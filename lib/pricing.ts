// lib/pricing.ts
// HÀM TÍNH TIỀN CHUẨN XÁC — CHỈ GỌI TỪ SERVER ACTION
// Không bao giờ tin số tính từ client để chốt tiền

/**
 * Tính tiền theo bậc thang block.
 * Vượt qua mốc block (dù 1 phút) → tính sang block mới ngay.
 * Tối thiểu luôn là 1 block.
 *
 * Ví dụ (pricePerBlock=30000, blockHours=4):
 *   3h30m → 1 block → 30.000đ
 *   4h01m → 2 block → 60.000đ
 *   9h00m → 3 block → 90.000đ
 */
export function calculatePrice(
  checkIn: Date,
  checkOut: Date,
  pricePerBlock: number,
  blockHours: number = 4
): number {
  const hoursElapsed =
    (checkOut.getTime() - checkIn.getTime()) / 3_600_000;

  // ceil: vượt mốc 1 phút → block mới; max(1,...): tối thiểu 1 block
  const blocks = Math.max(1, Math.ceil(hoursElapsed / blockHours));

  return blocks * pricePerBlock;
}

/** Tính tiền tạm tính để hiển thị trên UI (client-side, logic giống server) */
export function calculatePreviewPrice(
  checkInTime: string, // ISO string từ DB
  pricePerBlock: number,
  blockHours: number = 4
): number {
  const checkIn = new Date(checkInTime);
  const now = new Date();
  return calculatePrice(checkIn, now, pricePerBlock, blockHours);
}

/** Format số tiền VNĐ */
export function formatCurrency(amount: number): string {
  return `${(amount || 0).toLocaleString("vi-VN")} VND`;
}

/** Format milliseconds → "HH:MM:SS" */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Format milliseconds → chuỗi hiển thị chuẩn giao diện ("1 phút", "11 phút", "3h40 phút") */
export function formatDurationDisplay(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  
  if (h === 0) return `${m === 0 ? 1 : m} phút`;
  return `${h}h${m > 0 ? String(m).padStart(2, "0") + " " : ""}phút`;
}

/** Format milliseconds → chuỗi dễ đọc "X giờ Y phút" */
export function formatDurationHuman(ms: number): string {
  if (ms < 0) ms = 0;
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} phút`;
  if (m === 0) return `${h} giờ`;
  return `${h} giờ ${m} phút`;
}

