export interface User {
  id: string; // e.g. RL-123456
  name: string;
  mobile: string;
  password: string;
  balance: number;
  totalWon: number;
  matchesPlayed: number;
  joinedAt: string;
  isBlocked: boolean;
  status?: 'active' | 'blocked';
  profilePic?: string;
  bkashOrNagad?: string;
  nidFront?: string;
  nidBack?: string;
  selfieWithNid?: string;
  deviceOwner?: boolean;
  referCode?: string;
  referredBy?: string;
  referralsCount?: number;
  referralEarnings?: number;
}

export interface DepositRequest {
  id: string;
  userId: string;
  userName: string;
  userMobile: string;
  method: 'bKash' | 'Nagad';
  senderMobile: string;
  amount: number;
  trxId: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  note?: string;
}

export interface WithdrawRequest {
  id: string;
  userId: string;
  userName: string;
  userMobile: string;
  method: 'bKash' | 'Nagad';
  accountType: 'Personal' | 'Agent';
  receiverNumber: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  note?: string;
}

export interface Match {
  id: number;
  title?: string;
  prize: number;
  win: number;
  entry: number;
  players: number;
  maxPlayers: number;
  type: string;
  status: 'up' | 'on' | 'done'; // upcoming, ongoing, completed
  roomCode?: string;
  opponentName?: string;
  joinedUserIds?: string[];
  winnerId?: string;
  screenshotUrl?: string;
  userClaim?: 'win' | 'lose';
  isApproved?: boolean;
}

export interface MatchResultClaim {
  id: string;
  matchId: number;
  userId: string;
  userName: string;
  userMobile: string;
  claim: 'win' | 'lose';
  screenshotUrl: string;
  prize: number;
  winAmount: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  adminNote?: string;
}

export interface ChatMessage {
  id: string;
  matchId: number;
  sender: 'me' | 'opp';
  senderId?: string;
  senderName: string;
  text: string;
  time: string;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  time: string;
  createdAt?: string;
  read: boolean;
  type?: 'info' | 'success' | 'warning' | 'promo';
}

export interface AppSettings {
  appName: string;
  tagline: string;
  logoEmoji: string;
  logoImageUrl: string;
  defaultAvatarUrl?: string;
  loginTitle: string;
  loginSubtext: string;
  versionText: string;
  noticeText: string;
  noticeEnabled: boolean;
  bkashNumber: string;
  bkashLabel: string;
  nagadNumber: string;
  paymentInstructions: string;
  supportWhatsapp: string;
  supportTelegram: string;
  minDeposit: number;
  minWithdraw: number;
  referralLink: string;
  referralBonus: number;
  referralRules: string;
  adminPin: string;
  firebaseRtdbUrl: string;
  apkVersion?: string;
  apkUrl?: string;
  apkDownloadUrl?: string;
  apkReleaseNotes?: string;
  apkFileSize?: string;
  apkForceUpdate?: boolean;
}
