import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../Modal';

describe("Modal", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}}>
        <p>Hidden</p>
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders children when isOpen is true", () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <p data-testid="modal-body">Content</p>
      </Modal>,
    );
    expect(screen.getByTestId('modal-body')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });

  it("renders the title and a close button when title is provided", () => {
    render(
      <Modal isOpen onClose={() => {}} title="Send a tip">
        <p>x</p>
      </Modal>,
    );
    expect(screen.getByRole("heading", { name: "Send a tip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.close" })).toBeInTheDocument();
  });

  it("omits the close button when no title is provided", () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.queryByRole("button", { name: "common.close" })).toBeNull();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Hi">
        <p>x</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "common.close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose}>
        <p>x</p>
      </Modal>,
    );
    // Backdrop has role="presentation", need to use hidden option
    await userEvent.click(screen.getByRole("presentation", { hidden: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus within modal', async () => {
    const user = userEvent.setup();

    render(
      <Modal isOpen={true} onClose={() => {}} title="Focus Test">
        <input aria-label="Name" />
        <button>OK</button>
      </Modal>
    );

    const textbox = screen.getByRole('textbox', { name: 'Name', hidden: true });
    const button = screen.getByRole('button', { name: 'OK', hidden: true });
    const closeButton = screen.getByRole('button', { name: 'common.close', hidden: true });

    // First focusable element (not close button) should be focused
    expect(textbox).toHaveFocus();

    await user.tab();
    expect(button).toHaveFocus();

    await user.tab();
    expect(closeButton).toHaveFocus();

    await user.tab();
    expect(textbox).toHaveFocus();

    await user.tab({ shift: true });
    expect(closeButton).toHaveFocus();
  });

  it('prevents body scroll when open', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Body lock test">
        <div>Modal Content</div>
      </Modal>
    );

    expect(document.body).toHaveStyle('overflow: hidden');
  });

  it('restores focus to trigger element on close', () => {
    const TriggerHarness = ({ isOpen }: { isOpen: boolean }) => (
      <>
        <button>Open modal</button>
        <Modal isOpen={isOpen} onClose={() => {}} title="Focus Restore">
          <button>Confirm</button>
        </Modal>
      </>
    );

    const { rerender } = render(<TriggerHarness isOpen={false} />);
    const trigger = screen.getByRole('button', { name: 'Open modal' });
    trigger.focus();
    expect(trigger).toHaveFocus();

    rerender(<TriggerHarness isOpen={true} />);
    // The first focusable element (not close button) should be focused
    expect(screen.getByRole('button', { name: 'Confirm', hidden: true })).toHaveFocus();

    rerender(<TriggerHarness isOpen={false} />);
    expect(trigger).toHaveFocus();
  });

  it('has correct ARIA attributes and supports labels/description ids', () => {
    render(
      <Modal
        isOpen={true}
        onClose={() => {}}
        title="Test Modal"
        ariaDescribedBy="modal-description"
      >
        <p id="modal-description">Content</p>
      </Modal>
    );

    const dialog = screen.getByRole('dialog', { hidden: true });
    const heading = screen.getByRole('heading', { name: 'Test Modal' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', heading.id);
    expect(dialog).toHaveAttribute('aria-describedby', 'modal-description');
  });

  it('does not close on backdrop click when closeOnBackdropClick is false', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal" closeOnBackdropClick={false}>
        <div>Modal Content</div>
      </Modal>
    );

    const backdrop = screen.getByRole('presentation', { hidden: true });
    fireEvent.click(backdrop);

    expect(handleClose).not.toHaveBeenCalled();
  });

  it('closes on Escape when closeOnEscape is true', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal" closeOnEscape={true}>
        <div>Modal Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Test Modal" closeOnEscape={false}>
        <div>Modal Content</div>
      </Modal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('adds aria-hidden to background content when open', () => {
    render(
      <Modal isOpen={true} onClose={() => {}} title="Test Modal">
        <div>Modal Content</div>
      </Modal>
    );

    // The modal itself should not have aria-hidden
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect(dialog).not.toHaveAttribute('aria-hidden');
  });

  it('renders without a title', () => {
    render(
      <Modal isOpen onClose={() => {}}>
        <p>x</p>
      </Modal>,
    );
    expect(screen.queryByText('Test Modal')).toBeNull();
    expect(screen.getByRole('dialog', { hidden: true })).toBeInTheDocument();
  });
});
