import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
const meta = { title: 'UI/EmptyState', component: EmptyState, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div className="p-8"><Story /></div></MemoryRouter>], argTypes: { title: { control: 'text' }, description: { control: 'text' } } } satisfies Meta<typeof EmptyState>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { title: 'No results found', description: 'Try adjusting your search.', action: { label: 'Clear Filters', onClick: fn() } } };
export const WithoutAction: Story = { args: { title: 'No data available', description: 'There is no data to display.' } };
