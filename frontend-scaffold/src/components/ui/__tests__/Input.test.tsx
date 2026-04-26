import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Input from "../Input";

describe("Input", () => {
  it("renders without a label", () => {
    render(<Input placeholder="Search" />);
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeInTheDocument();
  });

  it("renders the label and links it to the input via htmlFor", () => {
    render(<Input label="Username" />);
    const label = screen.getByText("Username");
    const input = screen.getByLabelText("Username");
    expect(label).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    // The label's htmlFor must match the input's id (auto-generated from label).
    expect(label).toHaveAttribute("for", "username");
    expect(input).toHaveAttribute("id", "username");
  });

  it("uses an explicit id when provided", () => {
    render(<Input label="Email" id="email-field" />);
    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "email-field");
  });

  it("normalises a multi-word label into a slug for the id", () => {
    render(<Input label="Display Name" />);
    expect(screen.getByLabelText("Display Name")).toHaveAttribute(
      "id",
      "display-name",
    );
  });

  it("calls onChange as the user types", async () => {
    const onChange = vi.fn();
    render(<Input label="Tip" onChange={onChange} />);
    const input = screen.getByLabelText("Tip");
    await userEvent.type(input, "abc");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect((input as HTMLInputElement).value).toBe("abc");
  });

  it("renders the error message and applies the error border", () => {
    render(<Input label="Amount" error="Must be > 0" />);
    expect(screen.getByText("Must be > 0")).toBeInTheDocument();
    expect(screen.getByLabelText("Amount").className).toMatch(/border-red-500/);
    expect(screen.getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not render the error paragraph when error is undefined", () => {
    const { container } = render(<Input label="Bio" />);
    expect(container.querySelector("p.text-red-500")).toBeNull();
  });

  it("forwards arbitrary HTML attributes (type, disabled, maxLength)", () => {
    render(<Input label="Pin" type="number" maxLength={6} disabled />);
    const input = screen.getByLabelText("Pin");
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("maxLength", "6");
    expect(input).toBeDisabled();
  });
});
