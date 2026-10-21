import type { Meta, StoryObj } from '@storybook/react';
import SkeletonWrapper from './SkeletonWrapper';
import Skeleton from './Skeleton';

const meta: Meta<typeof SkeletonWrapper> = {
  title: 'UI/SkeletonWrapper',
  component: SkeletonWrapper,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof SkeletonWrapper>;

const ContentCard = () => (
  <div className="w-80 p-4 border-2 border-black bg-white">
    <h3 className="text-lg font-bold mb-2">Content Loaded</h3>
    <p className="text-gray-700">This is the actual content displayed after loading completes.</p>
  </div>
);

const SkeletonCard = () => (
  <div className="w-80 p-4 border-2 border-black bg-white">
    <Skeleton className="h-6 w-3/4 mb-2" />
    <Skeleton className="h-4 w-full mb-1" />
    <Skeleton className="h-4 w-5/6" />
  </div>
);

export const Default: Story = {
  args: {
    loading: false,
    skeleton: <SkeletonCard />,
    children: <ContentCard />,
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    skeleton: <SkeletonCard />,
    children: <ContentCard />,
  },
};

export const WithDelay: Story = {
  args: {
    loading: true,
    skeleton: <SkeletonCard />,
    children: <ContentCard />,
    delayMs: 500,
  },
};

export const DarkMode: Story = {
  args: {
    loading: true,
    skeleton: (
      <div className="w-80 p-4 border-2 border-white bg-gray-800">
        <Skeleton className="h-6 w-3/4 mb-2" />
        <Skeleton className="h-4 w-full mb-1" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    ),
    children: (
      <div className="w-80 p-4 border-2 border-white bg-gray-800">
        <h3 className="text-lg font-bold mb-2 text-white">Content Loaded</h3>
        <p className="text-gray-300">This is the actual content displayed after loading completes.</p>
      </div>
    ),
  },
  parameters: {
    backgrounds: { default: 'dark' },
  },
  decorators: [
    (Story) => (
      <div className="dark">
        <Story />
      </div>
    ),
  ],
};
