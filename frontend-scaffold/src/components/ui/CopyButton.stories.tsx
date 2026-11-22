import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import CopyButton from '@/components/ui/CopyButton';
const meta = { title: 'UI/CopyButton', component: CopyButton, tags: ['autodocs'], argTypes: { text: { control: 'text' }, label: { control: 'text' } } } satisfies Meta<typeof CopyButton>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { text: 'Copy this text', label: 'Copy', onClick: fn() } };
