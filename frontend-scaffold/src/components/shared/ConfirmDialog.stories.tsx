import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import Button from '@/components/ui/Button';
const meta = { title: 'Shared/ConfirmDialog', component: ConfirmDialog, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div className="p-4"><Button onClick={() => {}}>Trigger</Button><Story /></div></MemoryRouter>], argTypes: { title: { control: 'text' }, message: { control: 'text' }, confirmText: { control: 'text' }, cancelText: { control: 'text' }, isOpen: { control: 'boolean' }, loading: { control: 'boolean' } } } satisfies Meta<typeof ConfirmDialog>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { isOpen: true, title: 'Confirm Action', message: 'Are you sure?', confirmText: 'Confirm', cancelText: 'Cancel', onConfirm: fn(), onClose: fn() } };
export const Destructive: Story = { args: { isOpen: true, title: 'Delete Subscription', message: 'This will permanently cancel your recurring tip.', confirmText: 'Cancel Subscription', cancelText: 'Keep it', onConfirm: fn(), onClose: fn() } };
