# Frontend Architecture Guide

> Conventions, patterns, and structure for the Stellar Tipz React frontend.

---

## Stack

| Layer | Technology |
|-------|------------|
| **Framework** | React 18 |
| **Language** | TypeScript (strict) |
| **Build** | Vite 6 |
| **Styling** | TailwindCSS 3 + brutalist design system |
| **State** | Zustand (global) |
| **Routing** | React Router v7 |
| **Animations** | Framer Motion |
| **Icons** | Lucide React |
| **Wallet** | Stellar Wallets Kit + Freighter |

---

## Directory Structure

```
src/
├── index.tsx               # Entry point — mounts <App />
├── index.scss              # Tailwind directives + global styles
├── App.tsx                 # Router + providers + layout
├── routes.tsx              # Route config
│
├── components/             # Reusable UI components
│   ├── ui/                 # Design-system atoms (stateless)
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Badge.tsx
│   │   ├── Modal.tsx
│   │   ├── Loader.tsx
│   │   └── Toast.tsx
│   ├── layout/             # Layout components
│   │   ├── Header.tsx
│   │   ├── Footer.tsx
│   │   └── PageContainer.tsx
│   └── shared/             # Composite shared components
│       ├── WalletConnect.tsx
│       ├── CreditBadge.tsx
│       └── TransactionStatus.tsx
│
├── features/               # Feature modules (pages)
│   ├── landing/
│   ├── profile/
│   ├── tipping/
│   ├── dashboard/
│   └── leaderboard/
│
├── hooks/                  # Custom React hooks
├── store/                  # Zustand stores
├── services/               # External API integrations
├── helpers/                # Pure utility functions
└── types/                  # TypeScript definitions
```

---

## Component Guidelines

### 1. UI Atoms (`components/ui/`)

Stateless, theme-consistent primitives. These form the design system.

```tsx
// Button.tsx — example pattern
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses = 'font-bold uppercase tracking-wide transition-transform duration-200 border-2 border-black';

  const variants = {
    primary: 'bg-black text-white hover:-translate-x-1 hover:-translate-y-1',
    outline: 'bg-white text-black hover:-translate-x-1 hover:-translate-y-1',
    ghost: 'bg-transparent text-black border-transparent hover:border-black',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      style={{ boxShadow: '4px 4px 0px 0px rgba(0,0,0,1)' }}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
};

export default Button;
```

**Rules**:
- Accept `className` prop for overrides
- Use the brutalist shadow system
- Support `disabled` and `loading` states
- Export as default from each file

### 2. Layout Components (`components/layout/`)

Structural wrappers for page chrome.

```tsx
// PageContainer.tsx
import React from 'react';

interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

const PageContainer: React.FC<PageContainerProps> = ({ children, maxWidth = 'lg' }) => {
  const widths = {
    sm: 'max-w-2xl',
    md: 'max-w-4xl',
    lg: 'max-w-6xl',
    xl: 'max-w-7xl',
  };

  return (
    <div className={`${widths[maxWidth]} mx-auto px-4 py-8`}>
      {children}
    </div>
  );
};

export default PageContainer;
```

### 3. Feature Modules (`features/`)

Each feature is a self-contained page module:

```
features/tipping/
├── TipPage.tsx          # Route-level page component
├── TipForm.tsx          # Tip amount + message form
├── TipConfirm.tsx       # Confirmation modal
└── TipResult.tsx        # Success/failure display
```

**Rules**:
- One `*Page.tsx` per feature (mapped in routes)
- Feature-specific components live inside the feature folder
- Import shared components from `components/`
- Import hooks from `hooks/`

---

## State Management

### Zustand Stores

For small, focused global state:

```typescript
// store/walletStore.ts
import { create } from 'zustand';

interface WalletState {
  publicKey: string | null;
  connected: boolean;
  network: string;
  connect: (key: string) => void;
  disconnect: () => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  publicKey: null,
  connected: false,
  network: 'TESTNET',
  connect: (key) => set({ publicKey: key, connected: true }),
  disconnect: () => set({ publicKey: null, connected: false }),
}));
```

### When to Use What

| State Type | Solution |
|------------|----------|
| Wallet connection | Zustand store |
| Profile data | Zustand store + contract fetch |
| Contract reads | Direct Soroban RPC calls in hooks |
| Form state | React `useState` |
| URL state | React Router params |

---

## Hooks

Custom hooks encapsulate contract interactions:

```typescript
// hooks/useContract.ts
import { getServer, getTxBuilder, simulateTx, submitTx } from '../services/soroban';
import { useWalletStore } from '../store/walletStore';

export const useContract = () => {
  const { publicKey } = useWalletStore();

  const getProfile = async (address: string) => {
    // Build and simulate read-only transaction
  };

  const sendTip = async (creator: string, amount: string, message: string) => {
    // Build, sign, and submit transaction
  };

  return { getProfile, sendTip };
};
```

---

## Styling

### Brutalist Design System

Core classes defined in `index.scss`:

| Class | Usage |
|-------|-------|
| `.btn-brutalist` | Primary black button with shadow |
| `.btn-brutalist-outline` | Outline button with shadow |
| `.card-brutalist` | Card with 3px border and shadow |

### Tailwind Custom Extensions

Defined in `tailwind.config.js`:

| Token | Value |
|-------|-------|
| `colors.off-white` | `#FAFAFA` |
| `boxShadow.brutalist` | `4px 4px 0px 0px rgba(0,0,0,1)` |
| `boxShadow.brutalist-lg` | `6px 6px 0px 0px rgba(0,0,0,1)` |
| `borderWidth.3` | `3px` |
| `fontFamily.display` | `Space Grotesk` |
| `fontFamily.sans` | `Inter` |

### Best Practices

- Use Tailwind utility classes as primary styling
- Use `index.scss` for reusable component classes only
- Never use inline styles except for dynamic values
- Keep the black/white brutalist palette — no random colors
- All interactive elements need `:hover` and `:focus` states

---

## Routing

```typescript
// routes.tsx
import { createBrowserRouter } from 'react-router-dom';

import LandingPage from './features/landing/LandingPage';
import ProfilePage from './features/profile/ProfilePage';
import TipPage from './features/tipping/TipPage';
import DashboardPage from './features/dashboard/DashboardPage';
import LeaderboardPage from './features/leaderboard/LeaderboardPage';

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  { path: '/@:username', element: <TipPage /> },
  { path: '/profile', element: <ProfilePage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/leaderboard', element: <LeaderboardPage /> },
]);
```

---

## Services Layer

All external calls go through `services/`:

| File | Responsibility |
|------|---------------|
| `soroban.ts` | Contract invocation (build TX, simulate, submit) |
| `stellar.ts` | Stellar SDK helpers (account info, network) |
| `ipfs.ts` | IPFS upload/download for profile images |

**Rule**: Components never call Stellar SDK directly — always go through `services/` → `hooks/`.

---

## TypeScript Conventions

- **Strict mode** enabled in `tsconfig.json`
- No `any` types in new code
- Interface over Type for object shapes
- Suffix props interfaces with `Props` (e.g., `ButtonProps`)
- Export types from `types/` for shared use

---

## Import Order

```typescript
// 1. React
import React, { useState, useEffect } from 'react';

// 2. Third-party libraries
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

// 3. Internal components
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

// 4. Hooks and stores
import { useWallet } from '../hooks/useWallet';

// 5. Services and helpers
import { sendTip } from '../services/soroban';
import { formatAmount } from '../helpers/format';

// 6. Types
import { Profile } from '../types/profile';
```
