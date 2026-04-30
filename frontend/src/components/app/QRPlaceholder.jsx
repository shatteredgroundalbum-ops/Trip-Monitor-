import React from "react";

// Simple static SVG placeholder that looks like a QR code pattern.
// Used inside the printable/exported paper sheet. Not a functional QR.
export default function QRPlaceholder() {
  const size = 90;
  const grid = 10;
  const cell = size / grid;
  // Deterministic pseudo-random pattern
  const pattern = [
    "1111111011","1000001001","1011101001","1011101011","1011101001",
    "1000001011","1111111010","0000000010","1011110110","1100101001",
  ];
  const rects = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (pattern[r][c] === "1") {
        rects.push(<rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#000" />);
      }
    }
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} xmlns="http://www.w3.org/2000/svg">
      <rect width={size} height={size} fill="#fff" />
      {rects}
    </svg>
  );
}
