import type { Meta, StoryObj } from '@storybook/react-vite';
import Select from '@/components/ui/Select';

const options = [
  { value: 'xlm', label: 'Stellar Lumens (XLM)' },
  { value: 'usdc', label: 'USD Coin (USDC)' },
  { value: 'eurc', label: 'Euro Coin (EURC)' },
];

const meta = {
  title: 'UI/Select',
  component: Select,
  tags: ['autodocs'],
  argTypes: {
    label: { control: 'text' },
    placeholder: { control: 'text' },
    error: { control: 'text' },
    disabled: { control: 'boolean' },
  },
  args: { options },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Tip asset' },
};

export const WithPlaceholder: Story = {
  args: { label: 'Tip asset', placeholder: 'Choose an asset' },
};

export const WithError: Story = {
  args: {
    label: 'Tip asset',
    placeholder: 'Choose an asset',
    error: 'Select the asset to send.',
  },
};

export const Disabled: Story = {
  args: { label: 'Tip asset', value: 'xlm', disabled: true },
};

export const Empty: Story = {
  args: { label: 'Tip asset', options: [], placeholder: 'No assets available' },
};
