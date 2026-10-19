import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import Toast from '@/components/ui/Toast';
const meta = { title: 'UI/Toast', component: Toast, tags: ['autodocs'], argTypes: { message: { control: 'text' }, type: { control: 'select', options: ['success', 'error', 'info'] }, duration: { control: 'number' }, onClose: { action: 'closed' } } } satisfies Meta<typeof Toast>;
export default meta; type Story = StoryObj<typeof meta>;
export const Success: Story = { args: { message: 'Tip sent successfully!', type: 'success', onClose: fn() } };
export const Error: Story = { args: { message: 'Transaction failed.', type: 'error', onClose: fn() } };
export const Info: Story = { args: { message: 'Processing your tip...', type: 'info', onClose: fn() } };
