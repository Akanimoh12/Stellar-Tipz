import React, { useRef, useState, useCallback, useEffect } from "react";
import { Crop, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import Button from "../ui/Button";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

interface ImageCropperProps {
  label?: string;
  maxSizeBytes?: number;
  onCrop: (dataUrl: string) => void;
  onError?: (message: string) => void;
}

const ImageCropper: React.FC<ImageCropperProps> = ({
  label = "Image",
  maxSizeBytes = MAX_FILE_BYTES,
  onCrop,
  onError,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [src, setSrc] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reportError = useCallback(
    (msg: string) => {
      setError(msg);
      onError?.(msg);
    },
    [onError],
  );

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > maxSizeBytes) {
        reportError(
          `File too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)} MB.`,
        );
        return;
      }
      if (!file.type.startsWith("image/")) {
        reportError("Please select an image file.");
        return;
      }

      setError(null);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setSrc(ev.target?.result as string);
        setZoom(1);
        setRotation(0);
      };
      reader.readAsDataURL(file);
    },
    [maxSizeBytes, reportError],
  );

  // Redraw canvas whenever src, zoom, or rotation changes
  useEffect(() => {
    if (!src || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const size = 200;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      const scale = Math.min(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, -w / 2, -h / 2, w, h);
      ctx.restore();
    };
    img.src = src;
  }, [src, zoom, rotation]);

  const handleApply = useCallback(() => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/jpeg", 0.85);
    onCrop(dataUrl);
  }, [onCrop]);

  return (
    <div className="space-y-3">
      <label className="block text-xs font-black uppercase tracking-widest text-gray-800 dark:text-gray-200">
        {label}
      </label>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {/* File picker */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            aria-label={label}
            onChange={handleFile}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            icon={<Crop size={16} />}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose image
          </Button>
          <p className="mt-1 text-xs text-gray-500">
            Max {Math.round(maxSizeBytes / 1024 / 1024)} MB · JPG, PNG, WebP
          </p>
        </div>

        {/* Preview canvas + controls */}
        {src && (
          <div className="space-y-2">
            <canvas
              ref={canvasRef}
              className="border-2 border-black"
              style={{ width: 100, height: 100 }}
              aria-label="Cropped image preview"
            />
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() => setZoom((z) => Math.min(z + 0.1, 3))}
                className="flex h-7 w-7 items-center justify-center border-2 border-black bg-white hover:bg-gray-100"
              >
                <ZoomIn size={14} />
              </button>
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() => setZoom((z) => Math.max(z - 0.1, 0.3))}
                className="flex h-7 w-7 items-center justify-center border-2 border-black bg-white hover:bg-gray-100"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                aria-label="Rotate"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="flex h-7 w-7 items-center justify-center border-2 border-black bg-white hover:bg-gray-100"
              >
                <RotateCw size={14} />
              </button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleApply}
                className="ml-1"
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-xs font-bold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
};

export default ImageCropper;
