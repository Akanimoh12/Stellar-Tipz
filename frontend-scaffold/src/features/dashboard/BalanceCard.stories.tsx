import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import BalanceCard from '@/features/dashboard/BalanceCard';

const meta = {
  title: 'Composite/BalanceCard',
  component: BalanceCard,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="max-w-md p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    onWithdraw: fn(),
  },
} satisfies Meta<typeof BalanceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBalance: Story = {
  args: {
    balance: '250.5000000',
    feeBps: 200,
  },
};

export const LowBalance: Story = {
  args: {
    balance: '0.0010000',
    feeBps: 200,
  },
};

export const ZeroBalance: Story = {
  args: {
    balance: '0.0000000',
    feeBps: 200,
  },
};

export const LargeBalance: Story = {
  args: {
    balance: '99999.9990000',
    feeBps: 50,
  },
};
