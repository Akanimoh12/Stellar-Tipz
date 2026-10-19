import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import ErrorState from '@/components/shared/ErrorState';
const meta = { title: 'Shared/ErrorState', component: ErrorState, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div className="p-8"><Story /></div></MemoryRouter>], argTypes: { title: { control: 'text' }, message: { control: 'text' } } } satisfies Meta<typeof ErrorState>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { title: 'Something went wrong', message: 'An unexpected error occurred.', onRetry: fn() } };
export const WithoutRetry: Story = { args: { title: 'Connection lost', message: 'Check your internet connection.' } };
