import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import PageTransition from '@/components/shared/PageTransition';
const meta = { title: 'Shared/PageTransition', component: PageTransition, tags: ['autodocs'], decorators: [(Story) => <MemoryRouter><div><Story /></div></MemoryRouter>] } satisfies Meta<typeof PageTransition>;
export default meta; type Story = StoryObj<typeof meta>;
export const Fade: Story = { args: { animationType: 'fade', children: <div>Content</div> } };
export const Slide: Story = { args: { animationType: 'slide', children: <div>Content</div> } };
export const NoAnimation: Story = { args: { animationType: 'none', children: <div>Content</div> } };
