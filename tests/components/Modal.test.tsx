import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "@/components/ui/Modal";

describe("Modal", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>Content</Modal>
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders children when open", () => {
    render(
      <Modal open={true} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>
    );
    expect(screen.getByText("Modal content")).toBeInTheDocument();
  });

  it("renders title when provided", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test Title">
        Content
      </Modal>
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>Content</Modal>
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>Content</Modal>
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does not call onClose when content clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose}>
        <button>Click me</button>
      </Modal>
    );
    fireEvent.click(screen.getByText("Click me"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has dialog role and aria-modal", () => {
    render(
      <Modal open={true} onClose={() => {}}>Content</Modal>
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
