import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { axe, toHaveNoViolations } from 'jest-axe';
import ImageCropper from '../ImageCropper';

expect.extend(toHaveNoViolations);

describe('ImageCropper', () => {
  const onCrop = vi.fn();
  const onError = vi.fn();

  const mockCtx = {
    clearRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
  };

  class MockFileReader {
    onload: ((ev: { target: { result: string } }) => void) | null = null;
    readAsDataURL(_file: Blob) {
      setTimeout(() => {
        if (this.onload) {
          this.onload({
            target: { result: 'data:image/png;base64,mockImageData' },
          });
        }
      }, 0);
    }
  }

  class MockImage {
    onload: (() => void) | null = null;
    width = 200;
    height = 200;
    private _src = '';

    get src() {
      return this._src;
    }

    set src(val: string) {
      this._src = val;
      setTimeout(() => {
        this.onload?.();
      }, 0);
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal('FileReader', MockFileReader);
    vi.stubGlobal('Image', MockImage);

    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId) => {
      if (contextId === '2d') return mockCtx;
      return null;
    });

    HTMLCanvasElement.prototype.toDataURL = vi
      .fn()
      .mockReturnValue('data:image/jpeg;base64,mockCroppedResult');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial rendering', () => {
    it('renders with default label, choose image button, and size limit helper text', () => {
      render(<ImageCropper onCrop={onCrop} />);

      expect(screen.getByText('Image')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /choose image/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Max 5 MB · JPG, PNG, WebP/i),
      ).toBeInTheDocument();
    });

    it('renders with custom label and custom max size in MB', () => {
      render(
        <ImageCropper
          label="Profile Picture"
          maxSizeBytes={2 * 1024 * 1024}
          onCrop={onCrop}
        />,
      );

      expect(screen.getByText('Profile Picture')).toBeInTheDocument();
      expect(
        screen.getByText(/Max 2 MB · JPG, PNG, WebP/i),
      ).toBeInTheDocument();
    });

    it('does not display preview canvas or crop controls initially', () => {
      render(<ImageCropper onCrop={onCrop} />);

      expect(
        screen.queryByLabelText('Cropped image preview'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /zoom in/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /apply/i }),
      ).not.toBeInTheDocument();
    });

    it('delegates "Choose image" button click to the hidden file input', async () => {
      const user = userEvent.setup();
      render(<ImageCropper label="Avatar" onCrop={onCrop} />);

      const fileInput = screen.getByLabelText('Avatar');
      const clickSpy = vi.spyOn(fileInput, 'click');

      await user.click(screen.getByRole('button', { name: /choose image/i }));
      expect(clickSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('file validation', () => {
    it('shows error and calls onError when file size exceeds maxSizeBytes', () => {
      render(
        <ImageCropper
          maxSizeBytes={1024 * 1024}
          onCrop={onCrop}
          onError={onError}
        />,
      );

      const fileInput = screen.getByLabelText('Image');
      const largeFile = new File(['x'.repeat(100)], 'large.png', {
        type: 'image/png',
      });
      Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 });

      fireEvent.change(fileInput, { target: { files: [largeFile] } });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('File too large. Maximum size is 1 MB.');
      expect(onError).toHaveBeenCalledWith(
        'File too large. Maximum size is 1 MB.',
      );
      expect(
        screen.queryByLabelText('Cropped image preview'),
      ).not.toBeInTheDocument();
    });

    it('shows error and calls onError when selected file is not an image', () => {
      render(<ImageCropper onCrop={onCrop} onError={onError} />);

      const fileInput = screen.getByLabelText('Image');
      const textFile = new File(['text content'], 'document.pdf', {
        type: 'application/pdf',
      });

      fireEvent.change(fileInput, { target: { files: [textFile] } });

      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Please select an image file.');
      expect(onError).toHaveBeenCalledWith('Please select an image file.');
      expect(
        screen.queryByLabelText('Cropped image preview'),
      ).not.toBeInTheDocument();
    });

    it('does nothing when no file is chosen (empty file list)', () => {
      render(<ImageCropper onCrop={onCrop} onError={onError} />);

      const fileInput = screen.getByLabelText('Image');
      fireEvent.change(fileInput, { target: { files: [] } });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('image cropping and interactions', () => {
    const uploadValidImage = async () => {
      const fileInput = screen.getByLabelText('Image');
      const validFile = new File(['image-bytes'], 'photo.png', {
        type: 'image/png',
      });
      Object.defineProperty(validFile, 'size', { value: 1024 });

      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(
          screen.getByLabelText('Cropped image preview'),
        ).toBeInTheDocument();
      });
    };

    it('renders preview canvas and controls when valid image is loaded', async () => {
      render(<ImageCropper onCrop={onCrop} onError={onError} />);
      await uploadValidImage();

      expect(screen.getByLabelText('Cropped image preview')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /zoom in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /zoom out/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /rotate/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('handles Zoom in button interaction', async () => {
      const user = userEvent.setup();
      render(<ImageCropper onCrop={onCrop} />);
      await uploadValidImage();

      const zoomInBtn = screen.getByRole('button', { name: /zoom in/i });
      await user.click(zoomInBtn);

      await waitFor(() => {
        expect(mockCtx.drawImage).toHaveBeenCalled();
      });
    });

    it('handles Zoom out button interaction', async () => {
      const user = userEvent.setup();
      render(<ImageCropper onCrop={onCrop} />);
      await uploadValidImage();

      const zoomOutBtn = screen.getByRole('button', { name: /zoom out/i });
      await user.click(zoomOutBtn);

      await waitFor(() => {
        expect(mockCtx.drawImage).toHaveBeenCalled();
      });
    });

    it('handles Rotate button interaction', async () => {
      const user = userEvent.setup();
      render(<ImageCropper onCrop={onCrop} />);
      await uploadValidImage();

      const rotateBtn = screen.getByRole('button', { name: /rotate/i });
      await user.click(rotateBtn);

      await waitFor(() => {
        expect(mockCtx.rotate).toHaveBeenCalled();
      });
    });

    it('calls onCrop with the cropped canvas dataUrl when Apply is clicked', async () => {
      const user = userEvent.setup();
      render(<ImageCropper onCrop={onCrop} />);
      await uploadValidImage();

      const applyBtn = screen.getByRole('button', { name: /apply/i });
      await user.click(applyBtn);

      expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith(
        'image/jpeg',
        0.85,
      );
      expect(onCrop).toHaveBeenCalledTimes(1);
      expect(onCrop).toHaveBeenCalledWith('data:image/jpeg;base64,mockCroppedResult');
    });

    it('clears previous errors when a valid image is selected afterwards', async () => {
      render(<ImageCropper onCrop={onCrop} onError={onError} />);

      const fileInput = screen.getByLabelText('Image');
      const textFile = new File(['text'], 'file.txt', { type: 'text/plain' });
      fireEvent.change(fileInput, { target: { files: [textFile] } });

      expect(screen.getByRole('alert')).toBeInTheDocument();

      // Now select valid image
      await uploadValidImage();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('accessibility attributes', () => {
    it('has proper accessibility labels on all interactive controls', async () => {
      render(<ImageCropper label="User Avatar" onCrop={onCrop} />);

      expect(screen.getByLabelText('User Avatar')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /choose image/i }),
      ).toBeInTheDocument();

      const fileInput = screen.getByLabelText('User Avatar');
      const validFile = new File(['img'], 'pic.jpg', { type: 'image/jpeg' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(
          screen.getByLabelText('Cropped image preview'),
        ).toBeInTheDocument();
      });

      expect(screen.getByLabelText('Zoom in')).toBeInTheDocument();
      expect(screen.getByLabelText('Zoom out')).toBeInTheDocument();
      expect(screen.getByLabelText('Rotate')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument();
    });

    it('has no accessibility violations in initial state', async () => {
      const { container } = render(<ImageCropper onCrop={onCrop} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('has no accessibility violations when preview and controls are displayed', async () => {
      const { container } = render(<ImageCropper onCrop={onCrop} />);

      const fileInput = screen.getByLabelText('Image');
      const validFile = new File(['bytes'], 'test.png', { type: 'image/png' });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      await waitFor(() => {
        expect(
          screen.getByLabelText('Cropped image preview'),
        ).toBeInTheDocument();
      });

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
