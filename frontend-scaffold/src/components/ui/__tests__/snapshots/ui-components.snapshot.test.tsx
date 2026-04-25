/**
 * Visual regression snapshot tests for the Tipz brutalist UI component library.
 *
 * These tests capture the rendered HTML of every UI primitive so that
 * unintended style or markup regressions are caught in CI.
 *
 * To update baselines after intentional changes run:
 *   npm test -- --update-snapshots
 *   (or: npx vitest run --update-snapshots)
 */

import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import Button from '../../Button';
import Card from '../../Card';
import Input from '../../Input';
import Textarea from '../../Textarea';
import Select from '../../Select';
import Badge from '../../Badge';
import Loader from '../../Loader';
import Skeleton from '../../Skeleton';
import EmptyState from '../../EmptyState';
import Divider from '../../Divider';
import Modal from '../../Modal';
import Pagination from '../../Pagination';

// ── Button ────────────────────────────────────────────────────────────────────

describe('Button snapshots', () => {
  it('primary variant', () => {
    const { container } = render(<Button>Click me</Button>);
    expect(container).toMatchSnapshot();
  });

  it('outline variant', () => {
    const { container } = render(<Button variant="outline">Outline</Button>);
    expect(container).toMatchSnapshot();
  });

  it('ghost variant', () => {
    const { container } = render(<Button variant="ghost">Ghost</Button>);
    expect(container).toMatchSnapshot();
  });

  it('small size', () => {
    const { container } = render(<Button size="sm">Small</Button>);
    expect(container).toMatchSnapshot();
  });

  it('medium size (default)', () => {
    const { container } = render(<Button size="md">Medium</Button>);
    expect(container).toMatchSnapshot();
  });

  it('large size', () => {
    const { container } = render(<Button size="lg">Large</Button>);
    expect(container).toMatchSnapshot();
  });

  it('loading state', () => {
    const { container } = render(<Button loading>Submit</Button>);
    expect(container).toMatchSnapshot();
  });

  it('loading state with custom text', () => {
    const { container } = render(<Button loading loadingText="Sending…">Submit</Button>);
    expect(container).toMatchSnapshot();
  });

  it('disabled state', () => {
    const { container } = render(<Button disabled>Disabled</Button>);
    expect(container).toMatchSnapshot();
  });

  it('with leading icon', () => {
    const { container } = render(<Button icon={<span aria-hidden="true">★</span>}>Starred</Button>);
    expect(container).toMatchSnapshot();
  });

  it('with trailing icon', () => {
    const { container } = render(
      <Button iconRight={<span aria-hidden="true">→</span>}>Next</Button>,
    );
    expect(container).toMatchSnapshot();
  });

  it('outline + large + disabled', () => {
    const { container } = render(
      <Button variant="outline" size="lg" disabled>Big disabled</Button>,
    );
    expect(container).toMatchSnapshot();
  });
});

// ── Card ──────────────────────────────────────────────────────────────────────

describe('Card snapshots', () => {
  it('default (medium padding)', () => {
    const { container } = render(<Card>Card content</Card>);
    expect(container).toMatchSnapshot();
  });

  it('small padding', () => {
    const { container } = render(<Card padding="sm">Small padding</Card>);
    expect(container).toMatchSnapshot();
  });

  it('large padding', () => {
    const { container } = render(<Card padding="lg">Large padding</Card>);
    expect(container).toMatchSnapshot();
  });

  it('hover enabled', () => {
    const { container } = render(<Card hover>Hoverable</Card>);
    expect(container).toMatchSnapshot();
  });

  it('clickable (renders as button)', () => {
    const { container } = render(
      <Card isClickable onClick={() => {}}>Clickable card</Card>,
    );
    expect(container).toMatchSnapshot();
  });

  it('anchor card', () => {
    const { container } = render(<Card href="/dashboard">Link card</Card>);
    expect(container).toMatchSnapshot();
  });

  it('with custom className', () => {
    const { container } = render(<Card className="extra-class">Custom class</Card>);
    expect(container).toMatchSnapshot();
  });
});

// ── Input ─────────────────────────────────────────────────────────────────────

describe('Input snapshots', () => {
  it('bare input', () => {
    const { container } = render(<Input />);
    expect(container).toMatchSnapshot();
  });

  it('with label', () => {
    const { container } = render(<Input label="Username" />);
    expect(container).toMatchSnapshot();
  });

  it('with placeholder', () => {
    const { container } = render(<Input placeholder="Enter username" />);
    expect(container).toMatchSnapshot();
  });

  it('with error message', () => {
    const { container } = render(
      <Input label="Email" error="Invalid email address" />,
    );
    expect(container).toMatchSnapshot();
  });

  it('with helper text', () => {
    const { container } = render(
      <Input label="Username" helperText="3–32 characters, letters and numbers only" />,
    );
    expect(container).toMatchSnapshot();
  });

  it('disabled state', () => {
    const { container } = render(<Input label="Read-only" disabled defaultValue="alice" />);
    expect(container).toMatchSnapshot();
  });
});

// ── Textarea ──────────────────────────────────────────────────────────────────

describe('Textarea snapshots', () => {
  it('bare textarea', () => {
    const { container } = render(<Textarea />);
    expect(container).toMatchSnapshot();
  });

  it('with label', () => {
    const { container } = render(<Textarea label="Bio" />);
    expect(container).toMatchSnapshot();
  });

  it('with label and character counter', () => {
    const { container } = render(<Textarea label="Message" maxLength={280} />);
    expect(container).toMatchSnapshot();
  });

  it('with error', () => {
    const { container } = render(
      <Textarea label="Message" error="Message is too long" />,
    );
    expect(container).toMatchSnapshot();
  });

  it('with warnAt and dangerAt thresholds', () => {
    const { container } = render(
      <Textarea label="Bio" maxLength={280} warnAt={250} dangerAt={270} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('with pre-filled value and counter', () => {
    const { container } = render(
      <Textarea maxLength={280} value="Hello world" onChange={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });
});

// ── Select ────────────────────────────────────────────────────────────────────

describe('Select snapshots', () => {
  const options = [
    { value: 'testnet', label: 'Testnet' },
    { value: 'public', label: 'Public Network' },
  ];

  it('basic select', () => {
    const { container } = render(<Select options={options} />);
    expect(container).toMatchSnapshot();
  });

  it('with label', () => {
    const { container } = render(<Select label="Network" options={options} />);
    expect(container).toMatchSnapshot();
  });

  it('with placeholder', () => {
    const { container } = render(
      <Select options={options} placeholder="Choose a network" />,
    );
    expect(container).toMatchSnapshot();
  });

  it('with error', () => {
    const { container } = render(
      <Select label="Network" options={options} error="Please select a network" />,
    );
    expect(container).toMatchSnapshot();
  });

  it('disabled state', () => {
    const { container } = render(<Select options={options} disabled />);
    expect(container).toMatchSnapshot();
  });
});

// ── Badge ─────────────────────────────────────────────────────────────────────

describe('Badge snapshots', () => {
  const tiers = ['new', 'bronze', 'silver', 'gold', 'diamond'] as const;

  tiers.forEach((tier) => {
    it(`${tier} tier`, () => {
      const { container } = render(<Badge tier={tier} />);
      expect(container).toMatchSnapshot();
    });
  });

  it('gold tier with score (tooltip trigger present)', () => {
    const { container } = render(<Badge tier="gold" score={75} />);
    expect(container).toMatchSnapshot();
  });

  it('diamond tier with custom className', () => {
    const { container } = render(<Badge tier="diamond" className="text-xs" />);
    expect(container).toMatchSnapshot();
  });
});

// ── Loader ────────────────────────────────────────────────────────────────────

describe('Loader snapshots', () => {
  it('default (medium) size', () => {
    const { container } = render(<Loader />);
    expect(container).toMatchSnapshot();
  });

  it('small size', () => {
    const { container } = render(<Loader size="sm" />);
    expect(container).toMatchSnapshot();
  });

  it('large size', () => {
    const { container } = render(<Loader size="lg" />);
    expect(container).toMatchSnapshot();
  });

  it('with loading text', () => {
    const { container } = render(<Loader text="Loading profile…" />);
    expect(container).toMatchSnapshot();
  });

  it('with aria attributes', () => {
    const { container } = render(
      <Loader role="status" aria-label="Loading transaction" />,
    );
    expect(container).toMatchSnapshot();
  });
});

// ── Skeleton ──────────────────────────────────────────────────────────────────

describe('Skeleton snapshots', () => {
  it('rect variant with fixed dimensions', () => {
    const { container } = render(<Skeleton variant="rect" width={200} height={20} />);
    expect(container).toMatchSnapshot();
  });

  it('text variant with percentage width', () => {
    const { container } = render(<Skeleton variant="text" width="80%" height={16} />);
    expect(container).toMatchSnapshot();
  });

  it('circle variant', () => {
    const { container } = render(<Skeleton variant="circle" width={48} height={48} />);
    expect(container).toMatchSnapshot();
  });

  it('default (rect) variant no explicit dimensions', () => {
    const { container } = render(<Skeleton />);
    expect(container).toMatchSnapshot();
  });

  it('with className override', () => {
    const { container } = render(<Skeleton className="h-4 w-full" />);
    expect(container).toMatchSnapshot();
  });
});

// ── EmptyState ────────────────────────────────────────────────────────────────

describe('EmptyState snapshots', () => {
  it('title only', () => {
    const { container } = render(<EmptyState title="Nothing here yet" />);
    expect(container).toMatchSnapshot();
  });

  it('with icon and description', () => {
    const { container } = render(
      <EmptyState
        icon={<span>📭</span>}
        title="No tips yet"
        description="Be the first to support this creator."
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it('with action button', () => {
    const { container } = render(
      <EmptyState
        title="No results"
        description="Try a different search term."
        action={{ label: 'Clear search', onClick: () => {} }}
      />,
    );
    expect(container).toMatchSnapshot();
  });

  it('full props', () => {
    const { container } = render(
      <EmptyState
        icon={<span>🔍</span>}
        title="Creator not found"
        description="We searched but couldn't find that creator."
        action={{ label: 'Browse leaderboard', onClick: () => {} }}
      />,
    );
    expect(container).toMatchSnapshot();
  });
});

// ── Divider ───────────────────────────────────────────────────────────────────

describe('Divider snapshots', () => {
  it('horizontal (default)', () => {
    const { container } = render(<Divider />);
    expect(container).toMatchSnapshot();
  });

  it('vertical', () => {
    const { container } = render(<Divider orientation="vertical" />);
    expect(container).toMatchSnapshot();
  });

  it('horizontal with className', () => {
    const { container } = render(<Divider className="my-8" />);
    expect(container).toMatchSnapshot();
  });
});

// ── Modal ─────────────────────────────────────────────────────────────────────

describe('Modal snapshots', () => {
  it('open modal with title and content', () => {
    const { container } = render(
      <Modal isOpen onClose={() => {}} title="Review Transaction">
        <p>Are you sure you want to proceed?</p>
      </Modal>,
    );
    expect(container).toMatchSnapshot();
  });

  it('closed modal renders empty', () => {
    const { container } = render(
      <Modal isOpen={false} onClose={() => {}} title="Hidden Modal">
        <p>This should not appear</p>
      </Modal>,
    );
    expect(container).toMatchSnapshot();
  });

  it('open modal without title', () => {
    const { container } = render(
      <Modal isOpen onClose={() => {}}>
        <p>Untitled modal content</p>
      </Modal>,
    );
    expect(container).toMatchSnapshot();
  });

  it('open modal with rich content', () => {
    const { container } = render(
      <Modal isOpen onClose={() => {}} title="Confirm Tip">
        <div>
          <p>Amount: 5 XLM</p>
          <p>Recipient: Alice</p>
        </div>
      </Modal>,
    );
    expect(container).toMatchSnapshot();
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

describe('Pagination snapshots', () => {
  it('first page of 10', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={10} onPageChange={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('middle page (page 3 of 10)', () => {
    const { container } = render(
      <Pagination currentPage={3} totalPages={10} onPageChange={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('last page of 10', () => {
    const { container } = render(
      <Pagination currentPage={10} totalPages={10} onPageChange={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('single page renders nothing', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });

  it('two-page pagination', () => {
    const { container } = render(
      <Pagination currentPage={1} totalPages={2} onPageChange={() => {}} />,
    );
    expect(container).toMatchSnapshot();
  });
});
