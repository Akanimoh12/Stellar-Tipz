import type { Meta, StoryObj } from '@storybook/react-vite';
import Divider from '@/components/ui/Divider';
const meta = { title: 'UI/Divider', component: Divider, tags: ['autodocs'], argTypes: { orientation: { control: 'select', options: ['horizontal', 'vertical'] } } } satisfies Meta<typeof Divider>;
export default meta; type Story = StoryObj<typeof meta>;
export const Horizontal: Story = { args: { orientation: 'horizontal' } };
export const Vertical: Story = { args: { orientation: 'vertical' } };
