import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import AmountDisplay from '@/components/shared/AmountDisplay';
const meta = { title: 'Shared/AmountDisplay', component: AmountDisplay, tags: ['autodocs'], argTypes: { amount: { control: 'number' }, currency: { control: 'text' } } } satisfies Meta<typeof AmountDisplay>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { amount: 100.5, currency: 'XLM' } };
export const LargeAmount: Story = { args: { amount: 1250000, currency: 'XLM' } };
export const ZeroAmount: Story = { args: { amount: 0, currency: 'XLM' } };
