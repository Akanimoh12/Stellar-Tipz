import type { Meta, StoryObj } from '@storybook/react-vite';
import Avatar from '@/components/ui/Avatar';
const meta = { title: 'UI/Avatar', component: Avatar, tags: ['autodocs'], argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg', 'xl'] }, alt: { control: 'text' }, address: { control: 'text' }, fallback: { control: 'text' } } } satisfies Meta<typeof Avatar>;
export default meta; type Story = StoryObj<typeof meta>;
export const WithImage: Story = { args: { src: 'https://example.com/avatar.png', alt: 'User avatar', size: 'md' } };
export const WithFallback: Story = { args: { fallback: 'JD', alt: 'Jane Doe', size: 'md' } };
export const WithAddress: Story = { args: { address: 'GBVKN6YMDXP4FKXB26BWZJHXPGQPZLWXHKJM5YXJKTZRQPLTKLPXNQK', alt: 'Creator', size: 'md' } };
