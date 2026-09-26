import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import Pagination from '@/components/ui/Pagination';
const meta = { title: 'UI/Pagination', component: Pagination, tags: ['autodocs'], argTypes: { currentPage: { control: 'number', min: 1 }, totalPages: { control: 'number', min: 1 }, onPageChange: { action: 'pageChanged' } } } satisfies Meta<typeof Pagination>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { currentPage: 1, totalPages: 10, onPageChange: fn() } };
export const CurrentPage5: Story = { args: { currentPage: 5, totalPages: 10, onPageChange: fn() } };
export const SinglePage: Story = { args: { currentPage: 1, totalPages: 1, onPageChange: fn() } };
