import type { Meta, StoryObj } from '@storybook/react-vite';
import { StatCard } from '@/components/ui/StartCard';
const meta = { title: 'UI/StartCard', component: StatCard, tags: ['autodocs'], argTypes: { label: { control: 'text' }, value: { control: 'text' } } } satisfies Meta<typeof StatCard>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { label: 'Total Tips', value: '12,345' } };
export const WithChange: Story = { args: { label: 'Tips This Week', value: '1,234', change: { value: 12, positive: true } } };
