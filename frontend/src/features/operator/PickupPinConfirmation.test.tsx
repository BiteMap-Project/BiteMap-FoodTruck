import { useState, type ReactNode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PickupPinConfirmation from './PickupPinConfirmation';
import type { ScheduleAddress } from './ScheduleAddressFields';

const map = vi.hoisted(() => ({ panTo: vi.fn(), click: (() => {}) as (event: unknown) => void }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div aria-label="Map preview">{children}</div>,
  TileLayer: ({ eventHandlers }: { eventHandlers: { tileerror: () => void } }) => <button onClick={eventHandlers.tileerror}>Fail tiles</button>,
  CircleMarker: () => null,
  useMap: () => map,
  useMapEvents: (events: { click: (event: unknown) => void }) => { map.click = events.click; },
}));
afterEach(() => { vi.unstubAllEnvs(); });
function Form() {
  const [value, setValue] = useState<ScheduleAddress>({ address: 'CSUN', latitude: 34.24, longitude: -118.53 });
  return <PickupPinConfirmation value={value} onChange={setValue} />;
}
it('starts unconfirmed and invalidates confirmation when the pin moves', () => {
  vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-only');
  render(<Form />);
  const checkbox = screen.getByRole('checkbox');
  expect(checkbox).not.toBeChecked();
  fireEvent.click(checkbox);
  act(() => map.click({ latlng: { wrap: () => ({ lat: 34.26, lng: -118.53 }) } }));
  expect(checkbox).not.toBeChecked();
  expect(screen.getByLabelText('Pickup latitude')).toHaveValue(34.26);
  fireEvent.click(checkbox);
  fireEvent.change(screen.getByLabelText('Pickup latitude'), { target: { value: '34.25' } });
  expect(checkbox).not.toBeChecked();
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://www.google.com/maps/search/?api=1&query=34.25%2C-118.53');
});
it('keeps an external verification option when tiles fail and allows retry', () => {
  vi.stubEnv('VITE_GEOAPIFY_API_KEY', 'test-only');
  render(<Form />);
  fireEvent.click(screen.getByRole('button', { name: 'Fail tiles' }));
  expect(screen.getByRole('status')).toHaveTextContent('Map preview unavailable');
  expect(screen.getByRole('link')).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Retry map preview' }));
  expect(screen.getByLabelText('Map preview')).toBeInTheDocument();
});
it('does not require an API key to show the explicit external-map fallback', () => {
  vi.stubEnv('VITE_GEOAPIFY_API_KEY', '');
  render(<Form />);
  expect(screen.getByRole('status')).toHaveTextContent('Open the external map');
  expect(screen.queryByLabelText('Map preview')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
});
