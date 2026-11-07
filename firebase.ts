/**
 * Firebase Realtime Database & State Sync Engine
 * Realtime Database URL: https://real-ludo-c4611-default-rtdb.firebaseio.com/
 */

import { AppSettings, DepositRequest, Match, User, WithdrawRequest } from './types';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  databaseURL: "https://real-ludo-c4611-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

export const RTDB_BASE_URL = "https://real-ludo-c4611-default-rtdb.firebaseio.com";

export const DEFAULT_SETTINGS: AppSettings = {
  appName: "Real Ludo",
  tagline: "খেলো • জিতো • টাকা নাও",
  logoEmoji: "🎲",
  logoImageUrl: "",
  defaultAvatarUrl: "",
  loginTitle: "Real Ludo",
  loginSubtext: "১ ফোন = ১ নাম্বার = ১ অ্যাকাউন্ট",
  versionText: "Version FINAL FULL • Made in Bangladesh 🇧🇩",
  noticeText: "🔔 রিয়েল লুডুতে স্বাগতম! বিকাশ পেমেন্ট করার ৫ মিনিটের মধ্যে টাকা যুক্ত হবে। কোনো সমস্যা হলে সাপোর্টে যোগাযোগ করুন।",
  noticeEnabled: true,
  bkashNumber: "01610336066",
  bkashLabel: "bkash pement number",
  nagadNumber: "01610336066",
  paymentInstructions: `১. আপনার বিকাশ অ্যাপ ওপেন করুন
২. "Payment" / "পেমেন্ট" অপশনে চাপ দিন
৩. পেমেন্ট নাম্বার দিন: 01610336066 (পাশে কপি বাটন আছে)
৪. টাকার পরিমাণ দিন (সর্বনিম্ন ১০ টাকা)
৫. আপনার পিন দিয়ে পেমেন্ট সফল করুন
৬. প্রাপ্ত TrxID (Transaction ID) নিচে দিয়ে ডিপোজিট রিকোয়েস্ট পাঠান`,
  supportWhatsapp: "01610336066",
  supportTelegram: "@realludo_official",
  minDeposit: 10,
  minWithdraw: 50,
  referralLink: "",
  referralBonus: 10,
  referralRules: "আপনার রেফারেল কোড বা লিংক শেয়ার করে বন্ধুদের যুক্ত করুন। বন্ধু সফলভাবে যুক্ত হলে আপনি পাবেন ৳১০ বোনাস!",
  adminPin: "0549",
  firebaseRtdbUrl: RTDB_BASE_URL,
  apkVersion: "v1.2.0",
  apkUrl: "",
  apkDownloadUrl: "",
  apkReleaseNotes: "🔥 নতুন আপডেট: লাইভ প্লেয়ার চ্যাট হিস্ট্রি, রুম কোড অটো-ডিটেকশন, ফাস্ট ডিপোজিট ও নেটিভ অ্যান্ড্রয়েড সাপোর্ট।",
  apkFileSize: "12.8 MB",
  apkForceUpdate: false
};

export const INITIAL_MATCHES: Match[] = [
  { id: 1, prize: 35, win: 20, entry: 10, players: 0, maxPlayers: 2, type: 'PLAYER 1VS1 PLAYER', status: 'up' },
  { id: 2, prize: 100, win: 55, entry: 25, players: 1, maxPlayers: 2, type: 'AUTO MATCH', status: 'up' },
  { id: 3, prize: 450, win: 250, entry: 100, players: 0, maxPlayers: 2, type: 'PLAYER 1VS1 PLAYER', status: 'up' },
  { id: 4, prize: 800, win: 440, entry: 200, players: 0, maxPlayers: 2, type: 'PLAYER 1VS1 PLAYER', status: 'up' },
  { id: 5, prize: 1000, win: 550, entry: 250, players: 0, maxPlayers: 2, type: 'PLAYER 1VS1 PLAYER', status: 'up' },
  { id: 6, prize: 2000, win: 1100, entry: 500, players: 0, maxPlayers: 2, type: 'PLAYER 1VS1 PLAYER', status: 'up' },
  { id: 7, prize: 4000, win: 2200, entry: 1000, players: 0, maxPlayers: 2, type: 'PLAYER 1VS1 PLAYER', status: 'up' }
];

// Broadcast channel for multi-tab sync (Admin panel <-> User App)
let syncChannel: BroadcastChannel | null = null;
try {
  syncChannel = new BroadcastChannel('real_ludo_sync_channel');
} catch {
  // BroadcastChannel not available in some environments
}

export const broadcastStateUpdate = (type: string, data?: unknown) => {
  if (syncChannel) {
    try {
      syncChannel.postMessage({ type, data, timestamp: Date.now() });
    } catch {
      // ignore
    }
  }
};

export const onBroadcastMessage = (callback: (message: { type: string; data?: unknown }) => void) => {
  if (!syncChannel) return () => {};
  const handler = (e: MessageEvent) => {
    if (e.data) callback(e.data);
  };
  syncChannel.addEventListener('message', handler);
  return () => syncChannel?.removeEventListener('message', handler);
};

// Direct Firebase Realtime Database REST API Client
export class FirebaseRtdbService {
  private baseUrl: string;

  constructor(customUrl?: string) {
    this.baseUrl = (customUrl || RTDB_BASE_URL).replace(/\/$/, "");
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, "");
  }

  getBaseUrl() {
    return this.baseUrl;
  }

  async get<T>(path: string): Promise<T | null> {
    try {
      const url = `${this.baseUrl}/${path}.json`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async set<T>(path: string, data: T): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/${path}.json`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async update<T>(path: string, data: Partial<T>): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/${path}.json`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async delete(path: string): Promise<boolean> {
    try {
      const url = `${this.baseUrl}/${path}.json`;
      const res = await fetch(url, {
        method: 'DELETE'
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const rtdb = new FirebaseRtdbService();
