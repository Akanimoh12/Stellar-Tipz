import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import LeaderboardTable from '@/features/leaderboard/LeaderboardTable';
import type { LeaderboardEntry } from '@/types/contract';

const makeEntry = (
  username: string,
  address: string,
  totalTipsReceived: string,
  creditScore: number,
): LeaderboardEntry => ({
  address,
  username,
  totalTipsReceived,
  creditScore,
});

const mockEntries: LeaderboardEntry[] = [
  makeEntry('stellar_dev', 'GABC1234DEFG5678HIJK9012LMNO3456PQRS7890TUVW1234XYZA5678BCDE', '9800.00', 920),
  makeEntry('crypto_writer', 'GBCD2345EFGH6789IJKL0123MNOP4567QRST8901UVWX2345YYZAB678CDEF', '7200.00', 870),
  makeEntry('node_runner', 'GCDE3456FGHI7890JKLM1234NOPQ5678RSTU9012VWXY3456ZABC789DEFG', '5100.00', 810),
  makeEntry('blockchain_bard', 'GDEF4567GHIJ8901KLMN2345OPQR6789STUV0123WXYZ4567ABCD890EFGH', '3300.00', 760),
  makeEntry('tip_artist', 'GEFG5678HIJK9012LMNO3456PQRS7890TUVW1234XYZA5678BCDE901FGHI', '1800.00', 690),
];

const meta = {
  title: 'Composite/LeaderboardTable',
  component: LeaderboardTable,
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div className="max-w-3xl p-4">
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
} satisfies Meta<typeof LeaderboardTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithEntries: Story = {
  args: {
    entries: mockEntries,
  },
};

export const Empty: Story = {
  args: {
    entries: [],
  },
};

export const ManyEntries: Story = {
  args: {
    entries: Array.from({ length: 30 }, (_, i) =>
      makeEntry(
        `creator_${i + 1}`,
        `G${String(i + 1).padStart(55, 'A')}`,
        String((30 - i) * 500) + '.00',
        900 - i * 10,
      ),
    ),
  },
};
