import type { Meta, StoryObj } from '@storybook/react-vite';
import ToastContainer from '@/components/shared/ToastContainer';
const meta = { title: 'Shared/ToastContainer', component: ToastContainer, tags: ['autodocs'] } satisfies Meta<typeof ToastContainer>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
