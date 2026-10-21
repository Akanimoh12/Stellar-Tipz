import type { Meta, StoryObj } from '@storybook/react';
import VirtualizedList from './VirtualizedList';

const meta: Meta<typeof VirtualizedList> = {
  title: 'UI/VirtualizedList',
  component: VirtualizedList,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof VirtualizedList>;

const generateItems = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: `Item ${i + 1}`,
    description: `Description for item ${i + 1}`,
  }));

const items = generateItems(1000);

const ItemRenderer = (item: { id: number; title: string; description: string }) => (
  <div className="p-4 border-b-2 border-black bg-white hover:bg-gray-50">
    <h4 className="font-bold text-lg">{item.title}</h4>
    <p className="text-gray-700">{item.description}</p>
  </div>
);

export const Default: Story = {
  args: {
    items,
    renderItem: ItemRenderer,
    height: 400,
    estimatedItemHeight: 72,
    ariaLabel: 'Example list',
  },
};

export const SmallList: Story = {
  args: {
    items: generateItems(10),
    renderItem: ItemRenderer,
    height: 300,
    estimatedItemHeight: 72,
    ariaLabel: 'Small list',
  },
};

export const LargeList: Story = {
  args: {
    items: generateItems(10000),
    renderItem: ItemRenderer,
    height: 500,
    estimatedItemHeight: 72,
    ariaLabel: 'Large list with 10,000 items',
  },
};

export const CustomStyling: Story = {
  args: {
    items: generateItems(500),
    renderItem: (item) => (
      <div className="p-6 border-b-4 border-black bg-yellow-100 hover:bg-yellow-200">
        <h4 className="font-black text-xl uppercase">{item.title}</h4>
        <p className="text-gray-900 font-medium">{item.description}</p>
      </div>
    ),
    height: 400,
    estimatedItemHeight: 88,
    ariaLabel: 'Styled list',
    className: 'border-4 border-black',
  },
};

export const DarkMode: Story = {
  args: {
    items,
    renderItem: (item) => (
      <div className="p-4 border-b-2 border-gray-600 bg-gray-800 hover:bg-gray-700">
        <h4 className="font-bold text-lg text-white">{item.title}</h4>
        <p className="text-gray-300">{item.description}</p>
      </div>
    ),
    height: 400,
    estimatedItemHeight: 72,
    ariaLabel: 'Dark mode list',
    className: 'border-2 border-gray-600',
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
