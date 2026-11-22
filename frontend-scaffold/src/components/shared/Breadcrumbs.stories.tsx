import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MemoryRouter } from 'react-router-dom';
import Breadcrumbs from '@/components/shared/Breadcrumbs';
const meta = { title: 'Shared/Breadcrumbs', component: Breadcrumbs, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div className="p-4"><Story /></div></MemoryRouter>], argTypes: { items: { control: 'object' } } } satisfies Meta<typeof Breadcrumbs>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { items: [{ label: 'Home', to: '/' }, { label: 'Creator', to: '/@alice' }, { label: 'Profile' }] } };
