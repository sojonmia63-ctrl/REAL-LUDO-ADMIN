import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  AppSettings,
  DepositRequest,
  Match,
  MatchResultClaim,
  User,
  WithdrawRequest,
  ChatMessage,
  AppNotification
} from '../types';
import { DEFAULT_SETTINGS, INITIAL_MATCHES, broadcastStateUpdate, onBroadcastMessage, rtdb } from '../firebase';

interface AppContextType {
  settings: AppSettings;
  updateSettings: (newSettings: Partial<AppSettings>) => Promise<boolean>;
  resetSettingsToDefault: () => Promise<boolean>;
  updateAdminPin: (newPin: string) => Promise<boolean>;
  
  users: User[];
  currentUser: User | null;
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  login: (mobile: string, pass: string) => { success: boolean; message: string };
  signup: (name: string, mobile: string, pass: string, refCode?: string) => { success: boolean; message: string; user?: User };
  logout: () => void;
  updateUserProfile: (data: Partial<User>) => Promise<void>;
  
  // Admin User controls
  adminUpdateBalance: (userId: string, newBalance: number, reason?: string) => Promise<boolean>;
  adminToggleBlock: (userId: string) => Promise<boolean>;
  adminBlockUser: (userId: string) => Promise<boolean>;
  adminUnblockUser: (userId: string) => Promise<boolean>;
  adminDeleteUser: (userId: string) => Promise<boolean>;
  
  // Deposit flow
  depositRequests: DepositRequest[];
  submitDeposit: (method: 'bKash' | 'Nagad', senderMobile: string, amount: number, trxId: string) => Promise<{ success: boolean; message: string }>;
  adminApproveDeposit: (id: string) => Promise<boolean>;
  adminRejectDeposit: (id: string, note?: string) => Promise<boolean>;
  
  // Withdraw flow
  withdrawRequests: WithdrawRequest[];
  submitWithdraw: (method: 'bKash' | 'Nagad', accountType: 'Personal' | 'Agent', receiverNumber: string, amount: number) => Promise<{ success: boolean; message: string }>;
  adminApproveWithdraw: (id: string) => Promise<boolean>;
  adminRejectWithdraw: (id: string, note?: string) => Promise<boolean>;
  
  // Matches & Tournaments
  matches: Match[];
  joinMatch: (matchId: number) => Promise<{ success: boolean; message: string; isOngoing?: boolean }>;
  submitMatchResult: (matchId: number, claim: 'win' | 'lose', screenshot?: string) => Promise<{ success: boolean; message: string }>;
  adminUpdateMatch: (match: Match) => Promise<boolean>;
  adminCreateMatch: (newMatch: Omit<Match, 'id'>) => Promise<boolean>;
  adminDeleteMatch: (matchId: number) => Promise<boolean>;
  
  // Match claims & screenshot proofs for Admin review
  matchClaims: MatchResultClaim[];
  adminApproveMatchClaim: (claimId: string) => Promise<boolean>;
  adminRejectMatchClaim: (claimId: string, note?: string) => Promise<boolean>;

  // Chat
  chatMessages: Record<number, ChatMessage[]>;
  sendChatMessage: (matchId: number, text: string, senderName: string) => void;

  // Notifications
  notifications: AppNotification[];
  sendPushNotification: (title: string, message: string) => Promise<boolean>;
  deleteNotification: (id: string) => Promise<boolean>;
  markNotificationsAsRead: () => void;
  
  // Connection state
  isRtdbConnected: boolean;
  isSyncing: boolean;
  refreshFromFirebase: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SETTINGS: 'real_ludo_settings',
  USERS: 'real_ludo_users',
  CURRENT_USER_ID: 'real_ludo_current_user_id',
  DEPOSITS: 'real_ludo_deposits',
  WITHDRAWS: 'real_ludo_withdraws',
  MATCHES: 'real_ludo_matches',
  MATCH_CLAIMS: 'real_ludo_match_claims',
  DEVICE_OWNER: 'real_ludo_device_owner',
  CHATS: 'real_ludo_chats'
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Settings state
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // 2. Users state
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USERS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 3. Current User state (Persistent session)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEYS.CURRENT_USER_ID);
      const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      if (savedId && savedUsers) {
        const parsedUsers: User[] = JSON.parse(savedUsers);
        const found = parsedUsers.find(u => u.id === savedId || u.mobile === savedId);
        if (found && !found.isBlocked) return found;
      }
      return null;
    } catch {
      return null;
    }
  });

  // 4. Deposits
  const [depositRequests, setDepositRequests] = useState<DepositRequest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DEPOSITS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 5. Withdraws
  const [withdrawRequests, setWithdrawRequests] = useState<WithdrawRequest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WITHDRAWS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 6. Matches
  const [matches, setMatches] = useState<Match[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MATCHES);
      return saved ? JSON.parse(saved) : INITIAL_MATCHES;
    } catch {
      return INITIAL_MATCHES;
    }
  });

  // 7. Match Claims (Result & Screenshot submitted by users for Admin verification)
  const [matchClaims, setMatchClaims] = useState<MatchResultClaim[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MATCH_CLAIMS);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 8. Chats
  const [chatMessages, setChatMessages] = useState<Record<number, ChatMessage[]>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CHATS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // 9. Notifications
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('real_ludo_notifications');
      return saved ? JSON.parse(saved) : [
        {
          id: 'notif-1',
          title: 'রিয়েল লুডুতে স্বাগতম! 🎲',
          message: 'প্রতিটি জয়ে তাৎক্ষণিক প্রাইজ মানি নিন। কোনো সমস্যা হলে সাপোর্টে যোগাযোগ করুন।',
          time: 'আজ',
          createdAt: 'আজ',
          read: false
        }
      ];
    } catch {
      return [
        {
          id: 'notif-1',
          title: 'রিয়েল লুডুতে স্বাগতম! 🎲',
          message: 'প্রতিটি জয়ে তাৎক্ষণিক প্রাইজ মানি নিন। কোনো সমস্যা হলে সাপোর্টে যোগাযোগ করুন।',
          time: 'আজ',
          createdAt: 'আজ',
          read: false
        }
      ];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('real_ludo_notifications', JSON.stringify(notifications));
    } catch {}
  }, [notifications]);

  const sendPushNotification = async (title: string, message: string): Promise<boolean> => {
    if (!title.trim() || !message.trim()) return false;
    const timeFormatted = new Date().toLocaleString('bn-BD', {
      timeZone: 'Asia/Dhaka',
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short'
    });
    const newNotif: AppNotification = {
      id: 'notif-' + Date.now(),
      title: title.trim(),
      message: message.trim(),
      time: timeFormatted,
      createdAt: timeFormatted,
      read: false,
      type: 'info'
    };
    const updated = [newNotif, ...notifications.filter(n => n.id !== newNotif.id)];
    setNotifications(updated);
    try {
      localStorage.setItem('real_ludo_notifications', JSON.stringify(updated));
      await rtdb.set(`notifications/${newNotif.id}`, newNotif);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    }
  };

  const deleteNotification = async (id: string): Promise<boolean> => {
    // 1. Persist in deleted notification IDs blacklist so it never resurrects
    try {
      let deletedIds: string[] = [];
      const stored = localStorage.getItem('real_ludo_deleted_notif_ids');
      if (stored) deletedIds = JSON.parse(stored);
      if (!deletedIds.includes(id)) {
        deletedIds.push(id);
        localStorage.setItem('real_ludo_deleted_notif_ids', JSON.stringify(deletedIds));
      }
    } catch {}

    // 2. Immediately remove from local state
    const updated = notifications.filter(n => n.id !== id);
    setNotifications(updated);
    try {
      localStorage.setItem('real_ludo_notifications', JSON.stringify(updated));
    } catch {}

    // 3. Delete from Firebase RTDB cloud database
    try {
      await rtdb.delete(`notifications/${id}`);
    } catch {}

    // 4. Broadcast instant deletion event across all browser tabs and User App instances
    broadcastStateUpdate('NOTIFICATION_DELETED', { id });
    broadcastStateUpdate('DATA_UPDATED');
    return true;
  };

  const markNotificationsAsRead = () => {
    const updated = notifications.map(n => ({ ...n, read: true }));
    setNotifications(updated);
    try {
      localStorage.setItem('real_ludo_notifications', JSON.stringify(updated));
      const readIds = notifications.map(n => n.id);
      localStorage.setItem('real_ludo_read_notif_ids', JSON.stringify(readIds));
    } catch {}
  };

  const [isRtdbConnected, setIsRtdbConnected] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {}
  }, [settings]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    } catch {}
  }, [users]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.DEPOSITS, JSON.stringify(depositRequests));
    } catch {}
  }, [depositRequests]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WITHDRAWS, JSON.stringify(withdrawRequests));
    } catch {}
  }, [withdrawRequests]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(matches));
    } catch {}
  }, [matches]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MATCH_CLAIMS, JSON.stringify(matchClaims));
    } catch {}
  }, [matchClaims]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chatMessages));
    } catch {}
  }, [chatMessages]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, currentUser.id);
      } else {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
      }
    } catch {}
  }, [currentUser]);

  // Ensure current user is synced with users list
  useEffect(() => {
    if (currentUser) {
      const updated = users.find(u => u.id === currentUser.id);
      if (updated) {
        if (updated.isBlocked || updated.status === 'blocked') {
          setCurrentUser(null);
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
        } else if (JSON.stringify(updated) !== JSON.stringify(currentUser)) {
          setCurrentUser(updated);
        }
      }
    }
  }, [users, currentUser]);

  // Fetch / Sync with Firebase Realtime Database
  const refreshFromFirebase = useCallback(async () => {
    setIsSyncing(true);
    try {
      // 1. Settings
      const remoteSettings = await rtdb.get<AppSettings>('settings');
      if (remoteSettings && typeof remoteSettings === 'object') {
        setSettings(prev => ({ ...prev, ...remoteSettings }));
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(remoteSettings));
      } else {
        rtdb.set('settings', settings).catch(() => {});
      }

      // 2. Users
      const remoteUsersMap = await rtdb.get<Record<string, User> | User[]>('users');
      if (remoteUsersMap) {
        const rawArray: User[] = Array.isArray(remoteUsersMap)
          ? remoteUsersMap.filter(Boolean)
          : Object.values(remoteUsersMap);
        const usersArray: User[] = rawArray
          .filter((u): u is User => Boolean(u && typeof u === 'object'))
          .map(u => ({
            ...u,
            id: String(u.id || ''),
            name: String(u.name || 'User'),
            mobile: String(u.mobile || (u as unknown as { phone?: string }).phone || ''),
            balance: typeof u.balance === 'number' ? u.balance : Number(u.balance) || 0,
            totalWon: typeof u.totalWon === 'number' ? u.totalWon : Number(u.totalWon) || 0,
            isBlocked: Boolean(u.isBlocked || (u as unknown as { status?: string }).status === 'blocked'),
            status: ((u.isBlocked || (u as unknown as { status?: string }).status === 'blocked') ? 'blocked' : 'active') as 'active' | 'blocked'
          }));
        if (usersArray.length > 0) {
          setUsers(usersArray);
        }
      }

      // 3. Deposits
      const remoteDeposits = await rtdb.get<Record<string, DepositRequest> | DepositRequest[]>('deposits');
      if (remoteDeposits) {
        const depositsArray: DepositRequest[] = Array.isArray(remoteDeposits)
          ? remoteDeposits.filter(Boolean)
          : Object.values(remoteDeposits);
        setDepositRequests(depositsArray);
      }

      // 4. Withdraws
      const remoteWithdraws = await rtdb.get<Record<string, WithdrawRequest> | WithdrawRequest[]>('withdraws');
      if (remoteWithdraws) {
        const withdrawsArray: WithdrawRequest[] = Array.isArray(remoteWithdraws)
          ? remoteWithdraws.filter(Boolean)
          : Object.values(remoteWithdraws);
        setWithdrawRequests(withdrawsArray);
      }

      // 5. Matches
      const remoteMatches = await rtdb.get<Record<string, Match> | Match[]>('matches');
      if (remoteMatches) {
        const matchesArray: Match[] = Array.isArray(remoteMatches)
          ? remoteMatches.filter(Boolean)
          : Object.values(remoteMatches);
        if (matchesArray.length > 0) {
          setMatches(matchesArray);
        }
      }

      // 6. Match Claims
      const remoteClaims = await rtdb.get<Record<string, MatchResultClaim> | MatchResultClaim[]>('matchClaims');
      if (remoteClaims) {
        const claimsArray: MatchResultClaim[] = Array.isArray(remoteClaims)
          ? remoteClaims.filter(Boolean)
          : Object.values(remoteClaims);
        setMatchClaims(claimsArray);
      }

      // 7. Real Live Chat Sync
      const remoteChats = await rtdb.get<Record<string, Record<string, ChatMessage>>>('chats');
      if (remoteChats && typeof remoteChats === 'object') {
        const mapped: Record<number, ChatMessage[]> = {};
        Object.entries(remoteChats).forEach(([mId, msgs]) => {
          if (msgs && typeof msgs === 'object') {
            const arr: ChatMessage[] = Array.isArray(msgs) ? msgs.filter(Boolean) : Object.values(msgs);
            mapped[Number(mId)] = arr;
          }
        });
        setChatMessages(prev => ({ ...prev, ...mapped }));
      }

      // 8. Notifications Sync
      let deletedIds: string[] = [];
      try {
        const storedDel = localStorage.getItem('real_ludo_deleted_notif_ids');
        if (storedDel) deletedIds = JSON.parse(storedDel);
      } catch {}

      let readIds: string[] = [];
      try {
        const stored = localStorage.getItem('real_ludo_read_notif_ids');
        if (stored) readIds = JSON.parse(stored);
      } catch {}

      const remoteNotifs = await rtdb.get<Record<string, AppNotification> | AppNotification[]>('notifications');
      let notifArray: AppNotification[] = [];

      if (remoteNotifs && typeof remoteNotifs === 'object' && Object.keys(remoteNotifs).length > 0) {
        const rawList: AppNotification[] = Array.isArray(remoteNotifs)
          ? remoteNotifs.filter(Boolean)
          : Object.entries(remoteNotifs).map(([key, val]) => {
              const notifId = val.id || key;
              return {
                id: notifId,
                title: val.title || 'নোটিফিকেশন',
                message: val.message || '',
                time: val.time || val.createdAt || 'এখন',
                createdAt: val.createdAt || val.time || 'এখন',
                read: Boolean(val.read) || readIds.includes(notifId),
                type: val.type || 'info'
              };
            });
        notifArray = rawList.filter(n => !deletedIds.includes(n.id));
      } else {
        try {
          const localSaved = localStorage.getItem('real_ludo_notifications');
          if (localSaved) {
            const parsed: AppNotification[] = JSON.parse(localSaved);
            notifArray = parsed.filter(n => !deletedIds.includes(n.id));
          }
        } catch {}
      }

      const sorted = notifArray.sort((a, b) => b.id.localeCompare(a.id));
      setNotifications(sorted);
      try {
        localStorage.setItem('real_ludo_notifications', JSON.stringify(sorted));
      } catch {}

      setIsRtdbConnected(true);
    } catch {
      setIsRtdbConnected(false);
    } finally {
      setIsSyncing(false);
    }
  }, [settings]);

  // Initial load and periodic heartbeat sync (3 seconds for real-time notification delivery)
  useEffect(() => {
    refreshFromFirebase();

    const cleanupBroadcast = onBroadcastMessage((msg) => {
      if (msg.type === 'NOTIFICATION_DELETED' && msg.data && (msg.data as { id: string }).id) {
        const delId = (msg.data as { id: string }).id;
        setNotifications(prev => prev.filter(n => n.id !== delId));
        try {
          const stored = localStorage.getItem('real_ludo_notifications');
          if (stored) {
            const list: AppNotification[] = JSON.parse(stored);
            localStorage.setItem('real_ludo_notifications', JSON.stringify(list.filter(n => n.id !== delId)));
          }
        } catch {}
      }
      if (msg.type === 'DATA_UPDATED') {
        refreshFromFirebase();
      }
    });

    const interval = setInterval(() => {
      refreshFromFirebase();
    }, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshFromFirebase();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cleanupBroadcast();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshFromFirebase]);

  // Update Settings
  const updateSettings = async (newSettings: Partial<AppSettings>): Promise<boolean> => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      await rtdb.set('settings', updated);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    }
  };

  const updateAdminPin = async (newPin: string): Promise<boolean> => {
    if (!newPin.trim() || newPin.trim().length < 4) return false;
    return await updateSettings({ adminPin: newPin.trim() });
  };

  const resetSettingsToDefault = async (): Promise<boolean> => {
    return await updateSettings(DEFAULT_SETTINGS);
  };

  // Auth: Signup with Referral support
  const signup = (name: string, mobile: string, pass: string, refCode?: string): { success: boolean; message: string; user?: User } => {
    const cleanMobile = mobile.trim();
    if (!/^01[3-9]\d{8}$/.test(cleanMobile)) {
      return { success: false, message: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (১১ ডিজিট)' };
    }
    if (name.trim().length < 3) {
      return { success: false, message: 'ইউজারনেম কমপক্ষে ৩ অক্ষরের হতে হবে' };
    }
    if (pass.length < 6) {
      return { success: false, message: 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে' };
    }

    const deviceOwner = localStorage.getItem(STORAGE_KEYS.DEVICE_OWNER);
    if (deviceOwner && deviceOwner !== cleanMobile) {
      return { success: false, message: `এই ডিভাইসে ইতিমধ্যে একটি অ্যাকাউন্ট রেজিস্টার করা আছে (${deviceOwner})` };
    }

    const existing = users.find(u => u.mobile === cleanMobile);
    if (existing) {
      return { success: false, message: 'এই নাম্বারে ইতিমধ্যে একটি অ্যাকাউন্ট আছে! অনুগ্রহ করে লগইন করুন।' };
    }

    const gameId = 'RL-' + Math.floor(100000 + Math.random() * 900000);
    const cleanRef = refCode?.trim();

    // Referrer lookup
    let referrerUser: User | undefined;
    if (cleanRef) {
      referrerUser = users.find(u => u.id === cleanRef || u.referCode === cleanRef || u.mobile === cleanRef);
    }

    const newUser: User = {
      id: gameId,
      name: name.trim(),
      mobile: cleanMobile,
      password: pass,
      balance: 100, // starting welcome bonus
      totalWon: 0,
      matchesPlayed: 0,
      joinedAt: new Date().toLocaleDateString('bn-BD'),
      isBlocked: false,
      deviceOwner: true,
      referCode: gameId,
      referredBy: referrerUser?.id,
      referralsCount: 0,
      referralEarnings: 0
    };

    let updatedUsers = [...users, newUser];

    // If referred by another user, reward referrer bonus if configured
    if (referrerUser) {
      const bonus = settings.referralBonus || 10;
      updatedUsers = updatedUsers.map(u => {
        if (u.id === referrerUser!.id) {
          return {
            ...u,
            balance: (u.balance || 0) + bonus,
            referralsCount: (u.referralsCount || 0) + 1,
            referralEarnings: (u.referralEarnings || 0) + bonus
          };
        }
        return u;
      });
    }

    setUsers(updatedUsers);
    setCurrentUser(newUser);

    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    localStorage.setItem(STORAGE_KEYS.DEVICE_OWNER, cleanMobile);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, newUser.id);

    rtdb.set(`users/${newUser.id}`, newUser).catch(() => {});
    if (referrerUser) {
      const updatedReferrer = updatedUsers.find(u => u.id === referrerUser!.id);
      if (updatedReferrer) {
        rtdb.set(`users/${referrerUser.id}`, updatedReferrer).catch(() => {});
      }
    }
    broadcastStateUpdate('DATA_UPDATED');

    return { success: true, message: 'অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে!', user: newUser };
  };

  // Auth: Login
  const login = (mobile: string, pass: string): { success: boolean; message: string } => {
    const cleanMobile = mobile.trim();
    const user = users.find(u => u.mobile === cleanMobile);
    if (!user) {
      return { success: false, message: 'এই নাম্বারে কোনো অ্যাকাউন্ট পাওয়া যায়নি। অনুগ্রহ করে সাইন আপ করুন।' };
    }
    if (user.password !== pass) {
      return { success: false, message: 'ভুল পাসওয়ার্ড! আবার চেষ্টা করুন।' };
    }
    if (user.isBlocked) {
      return { success: false, message: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে। সাপোর্টে যোগাযোগ করুন।' };
    }

    setCurrentUser(user);
    localStorage.setItem(STORAGE_KEYS.CURRENT_USER_ID, user.id);
    return { success: true, message: 'লগইন সফল হয়েছে!' };
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER_ID);
  };

  const updateUserProfile = async (data: Partial<User>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...data };
    setCurrentUser(updated);
    const updatedUsers = users.map(u => u.id === currentUser.id ? updated : u);
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    try {
      await rtdb.update(`users/${currentUser.id}`, data);
      broadcastStateUpdate('DATA_UPDATED');
    } catch {}
  };

  // Admin user actions
  const adminUpdateBalance = async (userId: string, newBalance: number, reason?: string): Promise<boolean> => {
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, balance: Math.max(0, newBalance) };
      }
      return u;
    });
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    try {
      await rtdb.update(`users/${userId}`, { balance: Math.max(0, newBalance) });
      broadcastStateUpdate('DATA_UPDATED', { userId, newBalance, reason });
      return true;
    } catch {
      return true;
    }
  };

  const adminToggleBlock = async (userId: string): Promise<boolean> => {
    let nextBlocked = false;
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        nextBlocked = !u.isBlocked;
        return { ...u, isBlocked: nextBlocked, status: (nextBlocked ? 'blocked' : 'active') as 'active' | 'blocked' };
      }
      return u;
    });
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    try {
      await rtdb.update(`users/${userId}`, {
        isBlocked: nextBlocked,
        status: nextBlocked ? 'blocked' : 'active',
        updatedAt: Date.now()
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminBlockUser = async (userId: string): Promise<boolean> => {
    console.log("adminBlockUser executing for:", userId);
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, isBlocked: true, status: 'blocked' as const };
      }
      return u;
    });
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    if (currentUser?.id === userId) {
      logout();
    }
    try {
      await rtdb.update(`users/${userId}`, {
        isBlocked: true,
        status: 'blocked',
        updatedAt: Date.now()
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminUnblockUser = async (userId: string): Promise<boolean> => {
    console.log("adminUnblockUser executing for:", userId);
    const updatedUsers = users.map(u => {
      if (u.id === userId) {
        return { ...u, isBlocked: false, status: 'active' as const };
      }
      return u;
    });
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    try {
      await rtdb.update(`users/${userId}`, {
        isBlocked: false,
        status: 'active',
        updatedAt: Date.now()
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminDeleteUser = async (userId: string): Promise<boolean> => {
    console.log("adminDeleteUser executing for:", userId);
    const updatedUsers = users.filter(u => u.id !== userId);
    setUsers(updatedUsers);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
    if (currentUser?.id === userId) {
      logout();
    }
    try {
      await Promise.all([
        fetch(`${rtdb.getBaseUrl()}/users/${userId}.json`, { method: 'DELETE' }),
        rtdb.set(`users/${userId}`, null)
      ]);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  // Deposit Actions (Min deposit dynamic from settings)
  const submitDeposit = async (
    method: 'bKash' | 'Nagad',
    senderMobile: string,
    amount: number,
    trxId: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) {
      return { success: false, message: 'ডিপোজিট করতে আগে লগইন করুন' };
    }
    const minDep = settings.minDeposit ?? 10;
    if (amount < minDep) {
      return { success: false, message: `সর্বনিম্ন ডিপোজিট পরিমাণ ৳${minDep}` };
    }
    if (!senderMobile.trim() || !/^01[3-9]\d{8}$/.test(senderMobile.trim())) {
      return { success: false, message: 'সঠিক প্রেরক মোবাইল নম্বর দিন' };
    }
    if (!trxId.trim() || trxId.trim().length < 5) {
      return { success: false, message: 'সঠিক TrxID (Transaction ID) দিন' };
    }

    const duplicate = depositRequests.find(d => d.trxId.toLowerCase() === trxId.trim().toLowerCase() && d.status === 'pending');
    if (duplicate) {
      return { success: false, message: 'এই TrxID দিয়ে ইতিমধ্যে একটি রিকোয়েস্ট পেন্ডিং আছে!' };
    }

    const newReq: DepositRequest = {
      id: 'DEP-' + Math.floor(100000 + Math.random() * 900000),
      userId: currentUser.id,
      userName: currentUser.name,
      userMobile: currentUser.mobile,
      method,
      senderMobile: senderMobile.trim(),
      amount,
      trxId: trxId.trim().toUpperCase(),
      status: 'pending',
      createdAt: new Date().toLocaleString('bn-BD')
    };

    const updated = [newReq, ...depositRequests];
    setDepositRequests(updated);
    localStorage.setItem(STORAGE_KEYS.DEPOSITS, JSON.stringify(updated));

    try {
      await rtdb.set(`deposits/${newReq.id}`, newReq);
      broadcastStateUpdate('DATA_UPDATED');
    } catch {}

    return { success: true, message: 'ডিপোজিট রিকোয়েস্ট অ্যাডমিনের কাছে পাঠানো হয়েছে! যাচাই করে ব্যালেন্স যোগ করা হবে।' };
  };

  const adminApproveDeposit = async (id: string): Promise<boolean> => {
    const req = depositRequests.find(d => d.id === id);
    if (!req || req.status !== 'pending') return false;

    const updatedRequests = depositRequests.map(d =>
      d.id === id ? { ...d, status: 'approved' as const, reviewedAt: new Date().toLocaleString('bn-BD') } : d
    );
    setDepositRequests(updatedRequests);
    localStorage.setItem(STORAGE_KEYS.DEPOSITS, JSON.stringify(updatedRequests));

    // Find target user by ID or mobile number
    let targetUser = users.find(u => u.id === req.userId || u.mobile === req.userMobile);
    if (!targetUser) {
      targetUser = users.find(u => u.name.toLowerCase() === req.userName.toLowerCase());
    }

    if (targetUser) {
      const newBal = (Number(targetUser.balance) || 0) + Number(req.amount);
      await adminUpdateBalance(targetUser.id, newBal, `Deposit Approved: Trx ${req.trxId}`);
      
      const updatedUsers = users.map(u =>
        u.id === targetUser!.id ? { ...u, balance: Math.max(0, newBal), wallet: Math.max(0, newBal) } : u
      );
      setUsers(updatedUsers);
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
      try {
        await rtdb.update(`users/${targetUser.id}`, { balance: Math.max(0, newBal), wallet: Math.max(0, newBal) });
      } catch {}
    } else {
      // If user not in local state, search remote users
      try {
        const remoteUsersMap = await rtdb.get<Record<string, User> | User[]>('users');
        if (remoteUsersMap) {
          const rawArray: User[] = Array.isArray(remoteUsersMap)
            ? remoteUsersMap.filter(Boolean)
            : Object.values(remoteUsersMap);
          const found = rawArray.find(u => u.id === req.userId || u.mobile === req.userMobile);
          if (found) {
            const newBal = (Number(found.balance) || 0) + Number(req.amount);
            await rtdb.update(`users/${found.id}`, { balance: newBal, wallet: newBal });
            const updatedUsers = users.map(u => u.id === found.id ? { ...u, balance: newBal, wallet: newBal } : u);
            setUsers(updatedUsers);
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
          }
        }
      } catch {}
    }

    try {
      await rtdb.set(`deposits/${id}`, {
        ...req,
        status: 'approved',
        reviewedAt: new Date().toLocaleString('bn-BD')
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminRejectDeposit = async (id: string, note?: string): Promise<boolean> => {
    const req = depositRequests.find(d => d.id === id);
    if (!req) return false;

    const updatedRequests = depositRequests.map(d =>
      d.id === id ? { ...d, status: 'rejected' as const, reviewedAt: new Date().toLocaleString('bn-BD'), note } : d
    );
    setDepositRequests(updatedRequests);
    localStorage.setItem(STORAGE_KEYS.DEPOSITS, JSON.stringify(updatedRequests));

    try {
      await rtdb.set(`deposits/${id}`, {
        ...req,
        status: 'rejected',
        reviewedAt: new Date().toLocaleString('bn-BD'),
        note
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  // Withdraw Actions (Min withdraw dynamic from settings)
  const submitWithdraw = async (
    method: 'bKash' | 'Nagad',
    accountType: 'Personal' | 'Agent',
    receiverNumber: string,
    amount: number
  ): Promise<{ success: boolean; message: string }> => {
    if (!currentUser) return { success: false, message: 'লগইন করুন' };
    const minWith = settings.minWithdraw ?? 50;
    if (amount < minWith) {
      return { success: false, message: `সর্বনিম্ন উইথড্র পরিমাণ ৳${minWith}` };
    }
    if ((currentUser.balance || 0) < amount) {
      return { success: false, message: 'আপনার অ্যাকাউন্টে পর্যাপ্ত ব্যালেন্স নেই!' };
    }
    if (!/^01[3-9]\d{8}$/.test(receiverNumber.trim())) {
      return { success: false, message: 'সঠিক প্রাপক মোবাইল নম্বর দিন' };
    }

    const newBal = (currentUser.balance || 0) - amount;
    await adminUpdateBalance(currentUser.id, newBal, `Withdraw requested: ৳${amount}`);

    const newReq: WithdrawRequest = {
      id: 'WIT-' + Math.floor(100000 + Math.random() * 900000),
      userId: currentUser.id,
      userName: currentUser.name,
      userMobile: currentUser.mobile,
      method,
      accountType,
      receiverNumber: receiverNumber.trim(),
      amount,
      status: 'pending',
      createdAt: new Date().toLocaleString('bn-BD')
    };

    const updated = [newReq, ...withdrawRequests];
    setWithdrawRequests(updated);
    localStorage.setItem(STORAGE_KEYS.WITHDRAWS, JSON.stringify(updated));

    try {
      await rtdb.set(`withdraws/${newReq.id}`, newReq);
      broadcastStateUpdate('DATA_UPDATED');
    } catch {}

    return { success: true, message: 'উইথড্র রিকোয়েস্ট গ্রহণ করা হয়েছে! অ্যাডমিন যাচাই করে টাকা পাঠিয়ে দিবে।' };
  };

  const adminApproveWithdraw = async (id: string): Promise<boolean> => {
    let req = withdrawRequests.find(w => w.id === id);
    if (!req) {
      try {
        const remote = await rtdb.get<WithdrawRequest>(`withdraws/${id}`) || await rtdb.get<WithdrawRequest>(`withdrawRequests/${id}`);
        if (remote) req = remote;
      } catch {}
    }
    if (!req) return false;

    const updatedRequests = withdrawRequests.map(w =>
      w.id === id ? { ...w, status: 'approved' as const, reviewedAt: new Date().toLocaleString('bn-BD') } : w
    );
    setWithdrawRequests(updatedRequests);
    localStorage.setItem(STORAGE_KEYS.WITHDRAWS, JSON.stringify(updatedRequests));

    const approvedPayload = {
      ...req,
      status: 'approved' as const,
      reviewedAt: new Date().toLocaleString('bn-BD'),
      updatedAt: Date.now()
    };

    try {
      await Promise.all([
        rtdb.set(`withdraws/${id}`, approvedPayload),
        rtdb.set(`withdrawRequests/${id}`, approvedPayload),
        rtdb.update(`withdraws/${id}`, { status: 'approved', updatedAt: Date.now() }),
        rtdb.update(`withdrawRequests/${id}`, { status: 'approved', updatedAt: Date.now() })
      ]);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    }
  };

  const adminRejectWithdraw = async (id: string, note?: string): Promise<boolean> => {
    const req = withdrawRequests.find(w => w.id === id);
    if (!req || req.status !== 'pending') return false;

    const targetUser = users.find(u => u.id === req.userId);
    if (targetUser) {
      const refunded = (targetUser.balance || 0) + req.amount;
      await adminUpdateBalance(targetUser.id, refunded, `Refund for rejected withdraw: ${id}`);
    }

    const updatedRequests = withdrawRequests.map(w =>
      w.id === id ? { ...w, status: 'rejected' as const, reviewedAt: new Date().toLocaleString('bn-BD'), note } : w
    );
    setWithdrawRequests(updatedRequests);
    localStorage.setItem(STORAGE_KEYS.WITHDRAWS, JSON.stringify(updatedRequests));

    try {
      await rtdb.set(`withdraws/${id}`, {
        ...req,
        status: 'rejected',
        reviewedAt: new Date().toLocaleString('bn-BD'),
        note
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  // Matches
  const joinMatch = async (matchId: number): Promise<{ success: boolean; message: string; isOngoing?: boolean }> => {
    if (!currentUser) return { success: false, message: 'ম্যাচে জয়েন করতে আগে লগইন করুন' };
    if (currentUser.isBlocked || currentUser.status === 'blocked') {
      return { success: false, message: 'আপনার অ্যাকাউন্টটি অ্যাডমিন কর্তৃক ব্লক করা হয়েছে। ম্যাচে জয়েন করা সম্ভব নয়।' };
    }
    const match = matches.find(m => m.id === matchId);
    if (!match) return { success: false, message: 'ম্যাচ পাওয়া যায়নি' };
    
    const joinedList = match.joinedUserIds || [];
    if (joinedList.includes(currentUser.id)) {
      return { success: false, message: 'আপনি ইতিমধ্যে এই ম্যাচে যুক্ত আছেন!' };
    }
    if (match.players >= match.maxPlayers) return { success: false, message: 'এই রুমটি ইতিমধ্যে ফুল হয়ে গেছে!' };
    if ((currentUser.balance || 0) < match.entry) {
      return { success: false, message: `পর্যাপ্ত ব্যালেন্স নেই! এন্ট্রি ফি ৳${match.entry}` };
    }

    const newBal = (currentUser.balance || 0) - match.entry;
    await adminUpdateBalance(currentUser.id, newBal, `Joined match #${match.id}`);

    const newPlayersCount = match.players + 1;
    const willBeOngoing = newPlayersCount >= (match.maxPlayers || 2);

    const updatedMatch: Match = {
      ...match,
      players: newPlayersCount,
      joinedUserIds: [...joinedList, currentUser.id],
      status: willBeOngoing ? 'on' : 'up',
      roomCode: match.roomCode || String(Math.floor(10000000 + Math.random() * 90000000)),
      opponentName: match.players === 0 ? 'অপেক্ষমাণ...' : (currentUser.name || 'Pro Player BD')
    };

    const updatedMatches = matches.map(m => m.id === matchId ? updatedMatch : m);
    setMatches(updatedMatches);
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(updatedMatches));

    await updateUserProfile({ matchesPlayed: (currentUser.matchesPlayed || 0) + 1 });

    try {
      await rtdb.set(`matches/${matchId}`, updatedMatch);
      broadcastStateUpdate('DATA_UPDATED');
    } catch {}

    return {
      success: true,
      isOngoing: willBeOngoing,
      message: willBeOngoing
        ? '২ জন প্লেয়ার যুক্ত হয়েছে! ম্যাচটি এখন Ongoing ট্যাবে চালু হয়েছে।'
        : 'ম্যাচে সফলভাবে জয়েন করেছেন! ২য় প্লেয়ার যুক্ত হলে ম্যাচটি Ongoing ট্যাবে যাবে।'
    };
  };

  // Submit match result claim + screenshot to Admin Panel (Point 2 & 3)
  const submitMatchResult = async (
    matchId: number,
    claim: 'win' | 'lose',
    screenshot?: string
  ): Promise<{ success: boolean; message: string }> => {
    const match = matches.find(m => m.id === matchId);
    if (!match || !currentUser) return { success: false, message: 'ম্যাচ বা ইউজার পাওয়া যায়নি' };

    const claimId = 'CLAIM-' + Math.floor(100000 + Math.random() * 900000);
    const newClaim: MatchResultClaim = {
      id: claimId,
      matchId: match.id,
      userId: currentUser.id,
      userName: currentUser.name,
      userMobile: currentUser.mobile,
      claim,
      screenshotUrl: screenshot || '',
      prize: match.prize,
      winAmount: match.win,
      status: 'pending',
      createdAt: new Date().toLocaleString('bn-BD')
    };

    const updatedClaims = [newClaim, ...matchClaims];
    setMatchClaims(updatedClaims);
    localStorage.setItem(STORAGE_KEYS.MATCH_CLAIMS, JSON.stringify(updatedClaims));

    // Update match with screenshot, claim, and immediately move status to 'done' (Completed tab)
    const updatedMatch: Match = {
      ...match,
      status: 'done', // Moves to Completed tab
      userClaim: claim,
      screenshotUrl: screenshot,
      isApproved: false
    };
    const updatedMatches = matches.map(m => m.id === matchId ? updatedMatch : m);
    setMatches(updatedMatches);
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(updatedMatches));

    try {
      await rtdb.set(`matchClaims/${claimId}`, newClaim);
      await rtdb.set(`matches/${matchId}`, updatedMatch);
      broadcastStateUpdate('DATA_UPDATED');
    } catch {}

    return {
      success: true,
      message: 'ফলাফল ও স্ক্রিনশট সাবমিট হয়েছে! অ্যাডমিন প্যানেলে রিভিউ পেন্ডিং।'
    };
  };

  // Admin approves match result claim (Point 2)
  const adminApproveMatchClaim = async (claimId: string): Promise<boolean> => {
    let claim = matchClaims.find(c => c.id === claimId);
    if (!claim) {
      try {
        const remote = await rtdb.get<MatchResultClaim>(`claims/${claimId}`) || await rtdb.get<MatchResultClaim>(`matchClaims/${claimId}`);
        if (remote) claim = remote;
      } catch {}
    }
    if (!claim) return false;

    const winAmount = Number(claim.winAmount) || Number(claim.prize) || 0;

    // 1. Mark claim approved in local state & localStorage
    const updatedClaims = matchClaims.map(c =>
      c.id === claimId ? { ...c, status: 'approved' as const, reviewedAt: new Date().toLocaleString('bn-BD') } : c
    );
    setMatchClaims(updatedClaims);
    localStorage.setItem(STORAGE_KEYS.MATCH_CLAIMS, JSON.stringify(updatedClaims));

    // 2. If claim was 'win', credit the winner user's balance and wallet!
    if (claim.claim === 'win' && winAmount > 0) {
      let winner = users.find(u => u.id === claim!.userId || u.mobile === claim!.userMobile);
      if (!winner && claim.userName) {
        winner = users.find(u => u.name.toLowerCase() === claim!.userName.toLowerCase());
      }

      if (winner) {
        const newBal = (Number(winner.balance) || 0) + winAmount;
        const newTotalWon = (Number(winner.totalWon) || 0) + winAmount;
        await adminUpdateBalance(winner.id, newBal, `Match #${claim.matchId} Win Approved`);
        const updatedUsers = users.map(u =>
          u.id === winner!.id ? { ...u, balance: newBal, wallet: newBal, totalWon: newTotalWon } : u
        );
        setUsers(updatedUsers);
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
        try {
          await rtdb.update(`users/${winner.id}`, { balance: newBal, wallet: newBal, totalWon: newTotalWon });
        } catch {}
      } else {
        // Search remote users in Firebase RTDB if not in local array
        try {
          const remoteUsersMap = await rtdb.get<Record<string, User> | User[]>('users');
          if (remoteUsersMap) {
            const rawArray: User[] = Array.isArray(remoteUsersMap) ? remoteUsersMap.filter(Boolean) : Object.values(remoteUsersMap);
            const foundWinner = rawArray.find(u => u.id === claim!.userId || u.mobile === claim!.userMobile || (u.name && u.name.toLowerCase() === claim!.userName.toLowerCase()));
            if (foundWinner) {
              const newBal = (Number(foundWinner.balance) || 0) + winAmount;
              const newTotalWon = (Number(foundWinner.totalWon) || 0) + winAmount;
              await rtdb.update(`users/${foundWinner.id}`, { balance: newBal, wallet: newBal, totalWon: newTotalWon });
              const updatedUsers = users.map(u => u.id === foundWinner.id ? { ...u, balance: newBal, wallet: newBal, totalWon: newTotalWon } : u);
              setUsers(updatedUsers);
              localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(updatedUsers));
            }
          }
        } catch {}
      }
    }

    // 3. Mark match as completed (done) with isApproved flag set to true
    const match = matches.find(m => m.id === claim!.matchId);
    if (match) {
      const updatedMatch: Match = {
        ...match,
        status: 'done',
        isApproved: true,
        winnerId: claim.claim === 'win' ? claim.userId : 'opponent'
      };
      const updatedMatches = matches.map(m => m.id === match.id ? updatedMatch : m);
      setMatches(updatedMatches);
      localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(updatedMatches));
      rtdb.update(`matches/${match.id}`, { status: 'done', isApproved: true, winnerId: updatedMatch.winnerId }).catch(() => {});
    }

    // 4. Update both claims/{id} and matchClaims/{id} in Firebase RTDB
    const approvedClaimData = {
      ...claim,
      status: 'approved' as const,
      reviewedAt: new Date().toLocaleString('bn-BD'),
      updatedAt: Date.now()
    };

    try {
      await Promise.all([
        rtdb.set(`matchClaims/${claimId}`, approvedClaimData),
        rtdb.set(`claims/${claimId}`, approvedClaimData),
        rtdb.update(`matchClaims/${claimId}`, { status: 'approved', updatedAt: Date.now() }),
        rtdb.update(`claims/${claimId}`, { status: 'approved', updatedAt: Date.now() })
      ]);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    }
  };

  // Admin rejects match result claim (Point 2)
  const adminRejectMatchClaim = async (claimId: string, note?: string): Promise<boolean> => {
    const claim = matchClaims.find(c => c.id === claimId);
    if (!claim || claim.status !== 'pending') return false;

    const updatedClaims = matchClaims.map(c =>
      c.id === claimId ? { ...c, status: 'rejected' as const, reviewedAt: new Date().toLocaleString('bn-BD'), adminNote: note } : c
    );
    setMatchClaims(updatedClaims);
    localStorage.setItem(STORAGE_KEYS.MATCH_CLAIMS, JSON.stringify(updatedClaims));

    try {
      await rtdb.set(`matchClaims/${claimId}`, {
        ...claim,
        status: 'rejected',
        reviewedAt: new Date().toLocaleString('bn-BD'),
        adminNote: note
      });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminUpdateMatch = async (match: Match): Promise<boolean> => {
    const updated = matches.map(m => m.id === match.id ? match : m);
    setMatches(updated);
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(updated));
    try {
      await rtdb.set(`matches/${match.id}`, match);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminCreateMatch = async (newMatchData: Omit<Match, 'id'>): Promise<boolean> => {
    const newId = matches.length > 0 ? Math.max(...matches.map(m => m.id)) + 1 : 1;
    const newMatch: Match = { ...newMatchData, id: newId };
    const updated = [...matches, newMatch];
    setMatches(updated);
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(updated));
    try {
      await rtdb.set(`matches/${newId}`, newMatch);
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  const adminDeleteMatch = async (matchId: number): Promise<boolean> => {
    const updated = matches.filter(m => m.id !== matchId);
    setMatches(updated);
    localStorage.setItem(STORAGE_KEYS.MATCHES, JSON.stringify(updated));
    try {
      await fetch(`${rtdb.getBaseUrl()}/matches/${matchId}.json`, { method: 'DELETE' });
      broadcastStateUpdate('DATA_UPDATED');
      return true;
    } catch {
      return true;
    }
  };

  // In-Game Live Real Player Chat (All bot/automated replies permanently removed)
  const sendChatMessage = (matchId: number, text: string, senderName: string) => {
    if (!text.trim()) return;
    const senderId = currentUser?.id || 'anon';
    const newMsg: ChatMessage = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      matchId,
      sender: 'me',
      senderId,
      senderName: senderName || currentUser?.name || 'খেলোয়াড়',
      text: text.trim(),
      time: new Date().toLocaleTimeString('bn-BD', { hour: '2-digit', minute: '2-digit' })
    };

    setChatMessages(prev => {
      const matchChats = prev[matchId] || [];
      const updated = [...matchChats, newMsg];
      return { ...prev, [matchId]: updated };
    });

    // Save to RTDB and notify other open windows/players in real time
    try {
      rtdb.set(`chats/${matchId}/${newMsg.id}`, newMsg).catch(() => {});
      broadcastStateUpdate('DATA_UPDATED');
    } catch {}
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        updateSettings,
        resetSettingsToDefault,
        updateAdminPin,
        users,
        currentUser,
        setCurrentUser,
        login,
        signup,
        logout,
        updateUserProfile,
        adminUpdateBalance,
        adminToggleBlock,
        adminBlockUser,
        adminUnblockUser,
        adminDeleteUser,
        depositRequests,
        submitDeposit,
        adminApproveDeposit,
        adminRejectDeposit,
        withdrawRequests,
        submitWithdraw,
        adminApproveWithdraw,
        adminRejectWithdraw,
        matches,
        joinMatch,
        submitMatchResult,
        adminUpdateMatch,
        adminCreateMatch,
        adminDeleteMatch,
        matchClaims,
        adminApproveMatchClaim,
        adminRejectMatchClaim,
        chatMessages,
        sendChatMessage,
        notifications,
        sendPushNotification,
        deleteNotification,
        markNotificationsAsRead,
        isRtdbConnected,
        isSyncing,
        refreshFromFirebase
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
          
    
