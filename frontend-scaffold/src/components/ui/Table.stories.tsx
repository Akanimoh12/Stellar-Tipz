import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import Table from '@/components/ui/Table';
const columns = [{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'status', label: 'Status' }];
const data = [{ name: 'Alice', amount: '100 XLM', status: 'Completed' }, { name: 'Bob', amount: '50 XLM', status: 'Pending' }];
const meta = { title: 'UI/Table', component: Table, tags: ['autodocs'], argTypes: { columns: { control: 'object' }, data: { control: 'object' }, onRowClick: { action: 'rowClicked' } } } satisfies Meta<typeof Table>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { columns, data, onRowClick: fn() } };
export const EmptyData: Story = { args: { columns, data: [] } };
