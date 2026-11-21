import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { axe, toHaveNoViolations } from "jest-axe";
import QRCode from "../QRCode";

expect.extend(toHaveNoViolations);

describe("QRCode", () => {
  const defaultUrl = "https://stellartipz.com/@charlie";
  let mockWriteText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: {
        writeText: mockWriteText,
      },
    });

    // Mock 2D context to prevent jsdom warnings
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Array(4) })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => []),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      fillText: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      transform: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
    });

    // Mock canvas toDataURL
    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue("data:image/png;base64,mockPngBase64");

    // Mock URL.createObjectURL and URL.revokeObjectURL
    if (typeof URL.createObjectURL === "undefined") {
      URL.createObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:http://localhost/mock-blob-id");
    }

    if (typeof URL.revokeObjectURL === "undefined") {
      URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    }
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("Rendering", () => {
    it("renders QR canvas with accessible img role and aria-label", () => {
      render(<QRCode url={defaultUrl} />);

      const canvas = screen.getByRole("img", { name: `QR code for ${defaultUrl}` });
      expect(canvas).toBeInTheDocument();
      expect(canvas.id).toBe("tipz-qr-canvas-tipz-qr");
    });

    it("renders the encoded URL text", () => {
      render(<QRCode url={defaultUrl} />);

      expect(screen.getByText(defaultUrl)).toBeInTheDocument();
    });

    it("renders Copy link button by default without download controls", () => {
      render(<QRCode url={defaultUrl} />);

      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /download/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^png$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^svg$/i })).not.toBeInTheDocument();
    });

    it("renders download buttons when downloadable is true", () => {
      render(<QRCode url={defaultUrl} downloadable />);

      expect(screen.getByRole("button", { name: /^png$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^svg$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /download/i })).toBeInTheDocument();
    });

    it("applies custom className and custom canvasId derived from filename", () => {
      const { container } = render(
        <QRCode
          url={defaultUrl}
          filename="special-creator-card!"
          className="custom-qr-class"
        />,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass("custom-qr-class");

      const canvas = screen.getByRole("img", { name: `QR code for ${defaultUrl}` });
      expect(canvas.id).toBe("tipz-qr-canvas-special-creator-card-");
    });

    it("renders hidden container for SVG download with aria-hidden true", () => {
      const { container } = render(<QRCode url={defaultUrl} downloadable />);

      const hiddenContainers = container.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenContainers.length).toBeGreaterThan(0);
      const hiddenSvgWrapper = Array.from(hiddenContainers).find((el) =>
        el.querySelector("svg"),
      );
      expect(hiddenSvgWrapper).toBeDefined();
    });
  });

  describe("Key interactions", () => {
    it("toggles active format state between PNG and SVG", () => {
      render(<QRCode url={defaultUrl} downloadable />);

      const pngBtn = screen.getByRole("button", { name: /^png$/i });
      const svgBtn = screen.getByRole("button", { name: /^svg$/i });

      // PNG is default
      expect(pngBtn).toHaveClass("bg-black", "text-white");
      expect(svgBtn).toHaveClass("bg-white", "text-black");

      // Switch to SVG
      fireEvent.click(svgBtn);
      expect(svgBtn).toHaveClass("bg-black", "text-white");
      expect(pngBtn).toHaveClass("bg-white", "text-black");

      // Switch back to PNG
      fireEvent.click(pngBtn);
      expect(pngBtn).toHaveClass("bg-black", "text-white");
      expect(svgBtn).toHaveClass("bg-white", "text-black");
    });

    it("triggers PNG download when Download button is clicked in PNG format", () => {
      render(<QRCode url={defaultUrl} downloadable filename="test-qr" />);

      let clickedLink: { href: string; download: string } | null = null;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        clickedLink = {
          href: this.href,
          download: this.download,
        };
      };

      try {
        const downloadBtn = screen.getByRole("button", { name: /download/i });
        fireEvent.click(downloadBtn);

        expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith("image/png");
        expect(clickedLink).not.toBeNull();
        expect(clickedLink?.download).toBe("test-qr.png");
        expect(clickedLink?.href).toBe("data:image/png;base64,mockPngBase64");
      } finally {
        HTMLAnchorElement.prototype.click = originalClick;
      }
    });

    it("triggers SVG download when Download button is clicked in SVG format", () => {
      render(<QRCode url={defaultUrl} downloadable filename="test-svg-qr" />);

      let clickedLink: { href: string; download: string } | null = null;
      const originalClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        clickedLink = {
          href: this.href,
          download: this.download,
        };
      };

      try {
        // Toggle to SVG format
        fireEvent.click(screen.getByRole("button", { name: /^svg$/i }));

        const downloadBtn = screen.getByRole("button", { name: /download/i });
        fireEvent.click(downloadBtn);

        expect(URL.createObjectURL).toHaveBeenCalled();
        expect(clickedLink).not.toBeNull();
        expect(clickedLink?.download).toBe("test-svg-qr.svg");
        expect(URL.revokeObjectURL).toHaveBeenCalled();
      } finally {
        HTMLAnchorElement.prototype.click = originalClick;
      }
    });

    it("copies URL to clipboard and provides feedback that reverts after timeout", async () => {
      vi.useFakeTimers();

      render(<QRCode url={defaultUrl} />);

      const copyBtn = screen.getByRole("button", { name: /copy link/i });

      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(mockWriteText).toHaveBeenCalledWith(defaultUrl);
      expect(screen.getByRole("button", { name: /copied!/i })).toBeInTheDocument();

      // Fast-forward past 1800ms
      act(() => {
        vi.advanceTimersByTime(1800);
      });

      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    });

    it("supports keyboard focus navigation and button activation", async () => {
      render(<QRCode url={defaultUrl} downloadable />);

      const pngBtn = screen.getByRole("button", { name: /^png$/i });
      const svgBtn = screen.getByRole("button", { name: /^svg$/i });
      const downloadBtn = screen.getByRole("button", { name: /download/i });
      const copyBtn = screen.getByRole("button", { name: /copy link/i });

      // Focus navigation through controls
      pngBtn.focus();
      expect(pngBtn).toHaveFocus();

      svgBtn.focus();
      expect(svgBtn).toHaveFocus();
      fireEvent.keyDown(svgBtn, { key: "Enter" });
      fireEvent.click(svgBtn);
      expect(svgBtn).toHaveClass("bg-black", "text-white");

      downloadBtn.focus();
      expect(downloadBtn).toHaveFocus();

      copyBtn.focus();
      expect(copyBtn).toHaveFocus();
      fireEvent.keyDown(copyBtn, { key: "Enter" });
      fireEvent.click(copyBtn);
      expect(mockWriteText).toHaveBeenCalledWith(defaultUrl);
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /copied!/i })).toBeInTheDocument();
      });
    });
  });

  describe("Accessibility attributes", () => {
    it("provides accessible name for QR code canvas via aria-label", () => {
      render(<QRCode url="https://stellartipz.com/@bob" />);

      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("aria-label", "QR code for https://stellartipz.com/@bob");
    });

    it("ensures all buttons have explicit type=button attribute", () => {
      render(<QRCode url={defaultUrl} downloadable />);

      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute("type", "button");
      });
    });

    it("has no accessibility violations in default view", async () => {
      const { container } = render(<QRCode url={defaultUrl} />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("has no accessibility violations with download controls enabled", async () => {
      const { container } = render(<QRCode url={defaultUrl} downloadable />);

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
