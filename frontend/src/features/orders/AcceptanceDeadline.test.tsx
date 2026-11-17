import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AcceptanceDeadline from './AcceptanceDeadline';

afterEach(() => vi.useRealTimers());

it('warns before the deadline and waits for server confirmation instead of inventing a cancellation', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
  render(<AcceptanceDeadline status="PLACED" deadline="2030-01-01T12:00:45Z" owner />);
  expect(screen.getByText(/Less than a minute remaining/)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(45000));
  expect(screen.getByText(/Waiting for the server to confirm/)).toBeInTheDocument();
});

it('shows customer expectations and removes the deadline after acceptance or for legacy orders', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-01-01T12:00:00Z'));
  const view = render(<AcceptanceDeadline status="PLACED" deadline="2030-01-01T12:20:00Z" />);
  expect(screen.getByText(/Preparation time is separate/)).toBeInTheDocument();
  view.rerender(<AcceptanceDeadline status="ACCEPTED" deadline="2030-01-01T12:20:00Z" />);
  expect(view.container).toBeEmptyDOMElement();
  view.rerender(<AcceptanceDeadline status="PLACED" deadline={null} />);
  expect(view.container).toBeEmptyDOMElement();
});
