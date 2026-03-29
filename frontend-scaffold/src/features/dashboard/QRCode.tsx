import React from "react";
import { Download, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";

import Button from "../../components/ui/Button";

interface QRCodeProps {
  url: string;
  size?: number;
}

const QRCode: React.FC<QRCodeProps> = ({ url, size = 200 }) => {
  const downloadQRCode = () => {
    const canvas = document.getElementById("tipz-qr-canvas") as HTMLCanvasElement;
    if (!canvas) return;

    const pngUrl = canvas
      .toDataURL("image/png")
      .replace("image/png", "image/octet-stream");
    
    const downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = "stellar-tipz-qr.png";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div className="flex flex-col items-center space-y-6 text-center">
      <div className="space-y-2">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-gray-500">
          Your Tipping QR
        </p>
        <h3 className="text-xl font-black uppercase">Scan to tip</h3>
      </div>

      <div className="relative border-4 border-black bg-white p-4 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <QRCodeCanvas
          id="tipz-qr-canvas"
          value={url}
          size={size}
          level={"H"}
          includeMargin={false}
          imageSettings={{
            src: "/logo.png", // This might need adjustment if logo exists
            x: undefined,
            y: undefined,
            height: 24,
            width: 24,
            excavate: true,
          }}
        />
      </div>

      <div className="w-full space-y-3">
        <div className="flex items-center justify-center gap-2 border-2 border-black bg-gray-50 p-3">
          <QrCode size={16} className="shrink-0" />
          <span className="truncate text-xs font-bold text-gray-600">{url}</span>
        </div>

        <Button
          onClick={downloadQRCode}
          variant="outline"
          className="w-full"
          icon={<Download size={18} />}
        >
          Download QR (PNG)
        </Button>
      </div>
    </div>
  );
};

export default QRCode;
