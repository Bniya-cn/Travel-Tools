import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CityPicker } from './CityPicker';

describe('CityPicker', () => {
  it('selects province then city', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CityPicker value={null} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByRole('button', { name: '陕西省' }));
    await user.click(screen.getByRole('button', { name: /西安市/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cityName: '西安',
        label: expect.stringContaining('西安市'),
      }),
    );
  });

  it('types in trigger to search nationwide', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<CityPicker value={null} onChange={onChange} />);

    const input = screen.getByRole('combobox');
    await user.click(input);
    await user.type(input, '武侯');
    await user.click(screen.getByRole('button', { name: /武侯区/ }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cityName: '成都',
        label: expect.stringContaining('武侯区'),
      }),
    );
  });
});
