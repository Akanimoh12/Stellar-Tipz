import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import ShareButton from '@/components/shared/ShareButton';
const meta = { title: 'Shared/ShareButton', component: ShareButton, tags: ['autodocs'], argTypes: { url: { control: 'text' }, label: { control: 'text' } } } satisfies Meta<typeof ShareButton>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { url: 'https://tipz.app/@alice', label: 'Share', onClick: fn() } };
