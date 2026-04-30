import React from "react";
import { QRCodeSVG } from "qrcode.react";

// Real QR code linking to Google Play listing for Trimble Go.Driver.
// Used inside the printable/exported paper trip sheet.
const GO_DRIVER_URL =
  "https://play.google.com/store/apps/details?id=com.peopleNet.android.UTAndroidApp";

export default function GoDriverQR({ size = 90 }) {
  return (
    <QRCodeSVG
      value={GO_DRIVER_URL}
      size={size}
      level="M"
      includeMargin={false}
      bgColor="#FFFFFF"
      fgColor="#000000"
    />
  );
}
