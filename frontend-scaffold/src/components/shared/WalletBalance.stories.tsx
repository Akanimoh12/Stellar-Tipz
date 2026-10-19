import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import WalletBalance from '@/components/shared/WalletBalance';
const meta = { title: 'Shared/WalletBalance', component: WalletBalance, tags: ['autodocs'], argTypes: { balance: { control: 'text' }, currency: { control: 'text' } } } satisfies Meta<typeof WalletBalance>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { balance: '1250.50', currency: 'XLM' } };
export const ZeroBalance: Story = { args: { balance: '0', currency: 'XLM' } };
