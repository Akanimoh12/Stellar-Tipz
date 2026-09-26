import type { Meta, StoryObj } from '@storybook/react-vite';
import Loader from '@/components/ui/Loader';
const meta = { title: 'UI/Loader', component: Loader, tags: ['autodocs'], argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] }, text: { control: 'text' } } } satisfies Meta<typeof Loader>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { size: 'md' } };
export const Small: Story = { args: { size: 'sm', text: 'Loading...' } };
export const Large: Story = { args: { size: 'lg', text: 'Processing...' } };
