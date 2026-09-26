import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import TipCard from '@/components/shared/TipCard';
const meta = { title: 'Shared/TipCard', component: TipCard, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div className="p-4"><Story /></div></MemoryRouter>], argTypes: { creator: { control: 'text' }, amount: { control: 'text' }, message: { control: 'text' } } } satisfies Meta<typeof TipCard>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { creator: '@alice', amount: '10 XLM', message: 'Great content!', onTip: fn() } };
export const LargeTip: Story = { args: { creator: '@bob', amount: '1000 XLM', message: 'Amazing work!', onTip: fn() } };
