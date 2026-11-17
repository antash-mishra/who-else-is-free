/** `#RRGGBB` → `rgba(r, g, b, alpha)`, for fades that must blend into a solid colour. */
export const withAlpha = (hex: string, alpha: number): string => {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};
