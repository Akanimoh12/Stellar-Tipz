import type { LeaderboardEntry, Profile, Tip } from "../types";

export const mockProfile: Profile = {
  owner: "GBZXN7PIRZGNMHGA6M44Q5X5V5JH7OD7TLFAGL5EXAMPLEA",
  username: "stellarjane",
  displayName: "Jane of Stellar",
  bio: "Creator, educator, and on-chain community builder sharing practical crypto explainers.",
  imageUrl: "",
  xHandle: "stellarjane",
  xFollowers: 18420,
  xPosts: 932,
  xReplies: 1480,
  creditScore: 812,
  totalTipsReceived: "2845000000",
  totalTipsCount: 126,
  balance: "1294000000",
  registeredAt: 1734307200000,
  updatedAt: 1741824000000,
};

export const mockTips: Tip[] = [
  {
    from: "GACCTSUPPORTERONE1234567890EXAMPLE1111111111111",
    to: mockProfile.owner,
    amount: "125000000",
    message: "Your thread on Stellar fees saved me hours.",
    timestamp: Date.now() - 1000 * 60 * 18,
  },
  {
    from: "GACCTSUPPORTERTWO1234567890EXAMPLE2222222222222",
    to: mockProfile.owner,
    amount: "50000000",
    message: "Keep shipping these explainers.",
    timestamp: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    from: "GACCTSUPPORTERTHREE1234567890EXAMPLE33333333333",
    to: mockProfile.owner,
    amount: "250000000",
    message: "Tipped from your live workshop audience.",
    timestamp: Date.now() - 1000 * 60 * 60 * 26,
  },
  {
    from: "GACCTSUPPORTERFOUR1234567890EXAMPLE444444444444",
    to: mockProfile.owner,
    amount: "80000000",
    message: "",
    timestamp: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    from: "GACCTSUPPORTERFIVE1234567890EXAMPLE555555555555",
    to: mockProfile.owner,
    amount: "150000000",
    message: "For the wallet onboarding guide.",
    timestamp: Date.now() - 1000 * 60 * 60 * 72,
  },
  {
    from: "GACCTSUPPORTERSIX1234567890EXAMPLE6666666666666",
    to: mockProfile.owner,
    amount: "210000000",
    message: "Loved the hackathon demo.",
    timestamp: Date.now() - 1000 * 60 * 60 * 96,
  },
];

export const mockLeaderboard: LeaderboardEntry[] = [
  { address: mockProfile.owner, username: "stellarjane", totalTipsReceived: "2845000000", creditScore: 812 },
  { address: "GB5Z2Y74EXAMPLELEADER0000000000000000000000001", username: "orbitmax", totalTipsReceived: "2510000000", creditScore: 790 },
  { address: "GCV7FZ8QEXAMPLELEADER0000000000000000000000002", username: "buildwithade", totalTipsReceived: "2275000000", creditScore: 768 },
  { address: "GDS4L4QKEXAMPLELEADER0000000000000000000000003", username: "mintmara", totalTipsReceived: "1980000000", creditScore: 742 },
  { address: "GA42VHXPEXAMPLELEADER0000000000000000000000004", username: "bytebloom", totalTipsReceived: "1764000000", creditScore: 701 },
  { address: "GBH2KXDGEXAMPLELEADER0000000000000000000000005", username: "soroqueen", totalTipsReceived: "1559000000", creditScore: 688 },
  { address: "GD6Q7M4NEXAMPLELEADER0000000000000000000000006", username: "chainmuse", totalTipsReceived: "1428000000", creditScore: 655 },
  { address: "GA0N5R2TEXAMPLELEADER0000000000000000000000007", username: "stellarframe", totalTipsReceived: "1315000000", creditScore: 630 },
  { address: "GCD9W3P1EXAMPLELEADER0000000000000000000000008", username: "devnomad", totalTipsReceived: "1182000000", creditScore: 592 },
  { address: "GB8K1J6SEXAMPLELEADER0000000000000000000000009", username: "lumencode", totalTipsReceived: "1010000000", creditScore: 560 },
  { address: "GDB4Y8E7EXAMPLELEADER0000000000000000000000010", username: "afriwallet", totalTipsReceived: "965000000", creditScore: 541 },
  { address: "GBQ6N2C3EXAMPLELEADER0000000000000000000000011", username: "retrobyte", totalTipsReceived: "902000000", creditScore: 520 },
];
