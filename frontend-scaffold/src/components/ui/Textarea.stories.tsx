import type { Meta, StoryObj } from '@storybook/react';
import Textarea from './Textarea';

const meta: Meta<typeof Textarea> = {
  title: 'UI/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
};

export default meta;
type Story = StoryObj<typeof Textarea>;

export const Default: Story = {
  args: {
    label: 'Message',
    placeholder: 'Enter your message...',
    rows: 4,
  },
};

export const WithValue: Story = {
  args: {
    label: 'Bio',
    value: 'This is a pre-filled textarea with some content.',
    rows: 4,
  },
};

export const WithMaxLength: Story = {
  args: {
    label: 'Description',
    placeholder: 'Enter description',
    maxLength: 200,
    rows: 4,
  },
};

export const WithError: Story = {
  args: {
    label: 'Feedback',
    placeholder: 'Enter your feedback',
    error: 'This field is required',
    rows: 4,
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled Textarea',
    placeholder: 'Cannot edit this',
    disabled: true,
    rows: 4,
  },
};

export const Required: Story = {
  args: {
    label: 'Required Field',
    placeholder: 'This field is required',
    required: true,
    rows: 4,
  },
};

export const DarkMode: Story = {
  args: {
    label: 'Dark Mode',
    placeholder: 'Enter text here',
    rows: 4,
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
