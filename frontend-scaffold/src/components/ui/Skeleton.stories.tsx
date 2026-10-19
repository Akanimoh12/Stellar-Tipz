import type { Meta, StoryObj } from '@storybook/react-vite';
import Skeleton from '@/components/ui/Skeleton';
const meta = { title: 'UI/Skeleton', component: Skeleton, tags: ['autodocs'], argTypes: { variant: { control: 'select', options: ['text', 'rect', 'circle'] }, width: { control: 'text' }, height: { control: 'text' } } } satisfies Meta<typeof Skeleton>;
export default meta; type Story = StoryObj<typeof meta>;
export const TextVariant: Story = { args: { variant: 'text', width: '200px', height: '14px' } };
export const RectVariant: Story = { args: { variant: 'rect', width: '100%', height: '200px' } };
export const CircleVariant: Story = { args: { variant: 'circle', width: '48px', height: '48px' } };
