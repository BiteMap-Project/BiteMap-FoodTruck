import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import MenuPhoto from "./MenuPhoto";

it("falls back after an image fails without retrying the broken URL", () => {
  const { container, rerender } = render(<MenuPhoto src="/photo?v=1" fallback="🌮" />);
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByTestId("menu-photo-fallback")).toHaveTextContent("🌮");
  expect(container.querySelector("img")).toBeNull();
  rerender(<MenuPhoto src="/photo?v=2" fallback="🌮" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "/photo?v=2");
});

it("uses the illustration when no custom image exists", () => {
  render(<MenuPhoto fallback="🍽️" />);
  expect(screen.getByTestId("menu-photo-fallback")).toHaveTextContent("🍽️");
});
