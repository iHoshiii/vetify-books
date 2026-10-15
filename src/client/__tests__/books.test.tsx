import { mount, state } from './books-fixtures';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { write } from '../api';

describe('Books page, preserved library behavior', () => {
  it('shows a concise library and hides uploads from users and admins', async () => {
    const first = mount();
    expect(await screen.findByText('Veterinary handbook')).toBeInTheDocument();
    expect(screen.queryByText(/downloads remaining|3 downloads per book/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload book' })).not.toBeInTheDocument();
    first.unmount(); state.role = 'admin'; mount();
    expect(screen.queryByRole('button', { name: 'Upload book' })).not.toBeInTheDocument();
  });
  it('keeps the verified professional upload form collapsed until requested', () => {
    state.role = 'professional'; mount();
    expect(screen.getByRole('button', { name: 'Upload book' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload book' }));
    expect(screen.getByLabelText('Topic')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toBeRequired();
  });
  it('hides uploads until main confirms actual professional verification', () => {
    state.role = 'professional'; state.verified = false; mount();
    expect(screen.queryByRole('button', { name: 'Upload book' })).not.toBeInTheDocument();
    expect(screen.getByText(/Verified professional approval is required/)).toBeInTheDocument();
  });
  it('allows repeated downloads without commission-limit banners or disabled buttons', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    mount(); await screen.findByText('Veterinary handbook');
    const button = screen.getByRole('button', { name: 'Download Veterinary handbook' });
    for (let index = 0; index < 4; index++) {
      fireEvent.click(button);
      await waitFor(() => expect(click).toHaveBeenCalledTimes(index + 1));
      await waitFor(() => expect(button).toBeEnabled());
    }
    expect(screen.queryByText(/Resets|downloads left|Limit reached/)).not.toBeInTheDocument();
    expect(write).toHaveBeenCalledWith('/books/book-id/download', 'test-csrf', undefined,
      { 'Idempotency-Key': expect.any(String) });
  });
  it('surfaces download failures and leaves retry available', async () => {
    vi.mocked(write).mockRejectedValue(new Error('Download failed. Please try again.'));
    mount(); const button = await screen.findByRole('button', { name: 'Download Veterinary handbook' });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Download failed. Please try again.');
    await waitFor(() => expect(button).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Download Veterinary surgery' })).toBeEnabled();
  });
});
