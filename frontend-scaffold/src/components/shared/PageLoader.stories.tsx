import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import PageLoader from '@/components/shared/PageLoader';
const meta = { title: 'Shared/PageLoader', component: PageLoader, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div className="min-h-screen"><Story /></div></MemoryRouter>] } satisfies Meta<typeof PageLoader>;
export default meta; type Story = StoryObj<typeof meta>;
export const Default: Story = { args: {} };
