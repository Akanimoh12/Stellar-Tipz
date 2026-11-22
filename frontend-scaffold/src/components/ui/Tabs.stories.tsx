import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import Tabs from '@/components/ui/Tabs';
const tabs = [{ id: 'overview', label: 'Overview', content: <div>Overview</div> }, { id: 'details', label: 'Details', content: <div>Details</div> }, { id: 'settings', label: 'Settings', content: <div>Settings</div> }];
const meta = { title: 'UI/Tabs', component: Tabs, tags: ['autodocs'], argTypes: { defaultTab: { control: 'text' } } } satisfies Meta<typeof Tabs>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { tabs } };
export const WithDefaultTab: Story = { args: { tabs, defaultTab: 'details' } };
