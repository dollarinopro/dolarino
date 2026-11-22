import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bot,
  BrainCircuit,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CreditCard,
  Download,
  ExternalLink,
  FileText,
  Gift,
  Headphones,
  Image,
  KeyRound,
  Lock,
  LogOut,
  Mail,
  Moon,
  Phone,
  Radar,
  Save,
  Send,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  Trash2,
  User,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiFetch, setStoredToken } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { AuthUserInfo, DashboardPayload, NavTab } from '../lib/types';
import type { LookId } from '../components/AppearanceModal';
import type { UiMode } from '../components/Layout';

async function compressImageToAvatarDataUrl(file: File): Promise<string> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Invalid image file'));
      el.src = bitmapUrl;
    });
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');

    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - minSide) / 2);
    const sy = Math.max(0, (img.height - minSide) / 2);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export function ServicesPage({
  lang,
  uiMode,
  onToggleUiMode,
  currentLook,
  onToggleDaylight,
  user,
  data,
  onNavigate,
  onUpdateUser,
  onOpenSupport,
  onLogout,
}: {
  lang: Lang;
  uiMode: UiMode;
  onToggleUiMode: (mode: UiMode) => void;
  currentLook: LookId;
  onToggleDaylight: () => void;
  user: AuthUserInfo;
  data: DashboardPayload;
  onNavigate: (tab: NavTab) => void;
  onUpdateUser?: (next: AuthUserInfo) => void;
  onOpenSupport?: () => void;
  onLogout: () => Promise<void>;
}) {
  const isFa = lang === 'fa';
  const isAdmin = user.role.toUpperCase() === 'ADMIN' || user.role.toUpperCase() === 'OWNER';
  const Arrow = isFa ? ChevronLeft : ChevronRight;
  const BackArrow = isFa ? ArrowRight : ArrowLeft;
  const isTelegramPseudo = user.email.endsWith('@telegram.dollarino.local');
  const [accountView, setAccountView] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarStatus, setAvatarStatus] = useState('');

  const [editUsername, setEditUsername] = useState(user.username || '');
  const [editEmail, setEditEmail] = useState(isTelegramPseudo ? '' : user.email || '');
  const [editBio, setEditBio] = useState(user.display_bio || '');
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    setEditUsername(user.username || '');
    setEditEmail(user.email.endsWith('@telegram.dollarino.local') ? '' : user.email || '');
    setEditBio(user.display_bio || '');
  }, [user.username, user.email, user.display_bio]);

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    setAvatarStatus('');
    try {
      const dataUrl = await compressImageToAvatarDataUrl(file);
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: dataUrl }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setAvatarStatus(isFa ? 'تصویر پروفایل با موفقیت ذخیره شد' : 'Profile photo updated');
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : isFa ? 'خطا در آپلود تصویر' : 'Upload failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setAvatarBusy(true);
    setAvatarStatus('');
    try {
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ avatarUrl: null }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setAvatarStatus(isFa ? 'تصویر پروفایل حذف شد' : 'Profile photo removed');
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : 'Error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleUseTelegramAvatar = async () => {
    setAvatarBusy(true);
    setAvatarStatus('');
    try {
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ useTelegramAvatar: true }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setAvatarStatus(isFa ? 'تصویر پروفایل تلگرام شما همگام‌سازی و جایگزین شد' : 'Synced with your Telegram profile photo');
    } catch (err) {
      setAvatarStatus(err instanceof Error ? err.message : 'Error');
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleSaveProfileDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileMsg(null);
    try {
      const payload: { username?: string; email?: string; displayBio?: string | null } = {
        username: editUsername.trim(),
        displayBio: editBio.trim() || null,
      };
      const cleanEmail = editEmail.trim().toLowerCase();
      if (cleanEmail) payload.email = cleanEmail;

      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo; token?: string }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (res.token) setStoredToken(res.token);
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setProfileMsg({
        ok: true,
        text: isFa ? 'مشخصات حساب با موفقیت ذخیره و به‌روزرسانی شد.' : 'Profile details updated successfully.',
      });
    } catch (err) {
      setProfileMsg({
        ok: false,
        text: err instanceof Error ? err.message : isFa ? 'خطا در ذخیره مشخصات' : 'Failed to save profile',
      });
    } finally {
      setProfileBusy(false);
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ ok: false, text: isFa ? 'رمز عبور باید حداقل ۶ کاراکتر باشد' : 'Password must be at least 6 characters' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: isFa ? 'تکرار رمز عبور مطابقت ندارد' : 'Passwords do not match' });
      return;
    }
    setPasswordBusy(true);
    try {
      const hasExistingPwd = Boolean(user.has_custom_password) && !isTelegramPseudo;
      const res = await apiFetch<{ ok: boolean; user?: AuthUserInfo }>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: hasExistingPwd ? currentPassword : undefined,
          newPassword,
        }),
      });
      if (res.user && onUpdateUser) onUpdateUser(res.user);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({
        ok: true,
        text: isFa
          ? 'رمز عبور اختصاصی شما ذخیره شد. از این پس می‌توانید با ایمیل شخصی و همین رمز نیز وارد شوید.'
          : 'Password saved successfully.',
      });
    } catch (err) {
      setPasswordMsg({
        ok: false,
        text: err instanceof Error ? err.message : isFa ? 'خطا در تغییر رمز عبور' : 'Failed to update password',
      });
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErr(null);
    const clean = deleteConfirmText.trim();
    if (clean.toUpperCase() !== 'DELETE' && clean !== 'حذف' && clean !== 'حذف حساب') {
      setDeleteErr(isFa ? 'لطفاً عبارت DELETE یا «حذف» را تایپ کنید.' : 'Please type DELETE to confirm.');
      return;
    }
    setDeleteBusy(true);
    try {
      const hasExistingPwd = Boolean(user.has_custom_password) && !isTelegramPseudo;
      await apiFetch<{ ok: boolean; deleted: boolean }>('/api/auth/account', {
        method: 'DELETE',
        body: JSON.stringify({
          confirmText: clean,
          password: hasExistingPwd ? deletePassword : undefined,
        }),
      });
      setStoredToken(null);
      await onLogout();
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : isFa ? 'خطا در حذف حساب کاربری' : 'Failed to delete account');
    } finally {
      setDeleteBusy(false);
    }
  };

  const activePlanLabel = data.entitlement?.hasPaidPlan
    ? isFa
      ? data.entitlement.planNameFa
      : data.entitlement.planNameEn
    : isFa
      ? 'بدون اشتراک فعال (نیازمند خرید اشتراک)'
      : 'No Active Plan (Subscription Required)';

  /* Dedicated Account Management View: Full Editable Profile with Locked Verified Phone */
  if (accountView) {
    const hasExistingPwd = Boolean(user.has_custom_password) && !isTelegramPseudo;
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleAvatarSelected}
          className="hidden"
        />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setAccountView(false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl panel text-xs font-black text-main hover:bg-[var(--soft)] transition"
          >
            <BackArrow className="w-4 h-4" />
            <span>{isFa ? 'مدیریت حساب' : 'Account'}</span>
          </button>
          <span className="text-[11px] font-bold text-dim">{isFa ? 'پروفایل یکپارچه تلگرام و وب' : 'Synced Dollarino Profile'}</span>
        </div>

        {/* Centered Profile Photo Upload Avatar */}
        <div className="pt-2 pb-1 text-center space-y-2.5">
          <div className="relative inline-flex mx-auto">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-[#1652F0] to-[#3B82F6] shadow-md group relative overflow-visible"
              title={isFa ? 'تغییر عکس پروفایل' : 'Change profile photo'}
            >
              <div className="w-full h-full rounded-full bg-[var(--panel)] overflow-hidden grid place-items-center font-display font-black text-3xl text-[#1652F0]">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  user.username.slice(0, 1).toUpperCase()
                )}
              </div>
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-white text-slate-800 shadow-md grid place-items-center border border-slate-200 group-hover:scale-110 transition">
                <Camera className="w-3.5 h-3.5" />
              </span>
            </button>
            <span className="absolute top-0 end-0 w-6 h-6 rounded-full bg-[#0D9455] text-white grid place-items-center border-2 border-[var(--bg)] shadow-xs">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </span>
          </div>

          <div>
            <h2 className="font-display font-bold text-lg text-main">{user.username}</h2>
            <p className="text-xs text-dim mt-0.5">
              {user.telegram_username ? `@${user.telegram_username} · ` : ''}
              {isTelegramPseudo ? (isFa ? 'ثبت‌نام‌شده با تلگرام (ایمیل شخصی ثبت نشده)' : 'Telegram Account') : user.email}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-full panel text-[11px] font-bold text-[#1652F0] inline-flex items-center gap-1.5 hover:bg-[var(--soft)] transition"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{avatarBusy ? '...' : isFa ? 'آپلود تصویر دلخواه' : 'Upload Photo'}</span>
            </button>
            {user.telegram_id && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void handleUseTelegramAvatar()}
                className="px-3.5 py-1.5 rounded-full panel text-[11px] font-bold text-[#0EA5E9] inline-flex items-center gap-1.5 hover:bg-[var(--soft)] transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isFa ? 'عکس پروفایل تلگرام' : 'Use Telegram Photo'}</span>
              </button>
            )}
            {user.avatar_url && (
              <button
                type="button"
                disabled={avatarBusy}
                onClick={() => void handleRemoveAvatar()}
                className="px-3 py-1.5 rounded-full panel text-[11px] font-bold text-loss inline-flex items-center gap-1 hover:bg-rose-500/10 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isFa ? 'حذف' : 'Remove'}</span>
              </button>
            )}
          </div>
          {avatarStatus && <p className="text-[11px] font-bold text-jade">{avatarStatus}</p>}
        </div>

        {/* Locked Verified Phone + Account Overview */}
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-dim px-1">{isFa ? 'هویت تاییدشده تلگرام (غیرقابل تغییر)' : 'Verified Telegram Identity (Locked)'}</p>
          <div className="panel rounded-[24px] divide-y hairline overflow-hidden">
            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Phone className="w-4 h-4 text-jade" />
                <span>{isFa ? 'شماره تماس تاییدشده' : 'Verified Phone'}</span>
              </span>
              <div className="flex items-center gap-2">
                <span dir="ltr" className="font-mono-num font-black text-main">
                  {user.phone_number || (isFa ? 'تاییدشده' : 'Verified')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-jade text-[10px] font-black inline-flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  <span>{isFa ? 'قفل‌شده' : 'Locked'}</span>
                </span>
              </div>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Send className="w-4 h-4 text-[#0EA5E9]" />
                <span>{isFa ? 'شناسه اکانت تلگرام' : 'Telegram Account'}</span>
              </span>
              <span dir="ltr" className="font-mono-num font-bold text-sub">
                {user.telegram_username ? `@${user.telegram_username}` : user.telegram_id ? `ID: ${user.telegram_id}` : '—'}
              </span>
            </div>

            <div className="px-4 py-3.5 flex items-center justify-between gap-3 text-xs">
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <UserCheck className="w-4 h-4 text-dim" />
                <span>{isFa ? 'وضعیت اشتراک' : 'Plan Status'}</span>
              </span>
              <span className="px-3 py-1 rounded-full bg-[#0D9455]/12 text-[#0D9455] text-[11px] font-black">
                {activePlanLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Editable Profile Form */}
        <form onSubmit={handleSaveProfileDetails} className="panel rounded-[24px] p-4 sm:p-5 space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-main flex items-center gap-2">
              <User className="w-4 h-4 text-[#1652F0]" />
              <span>{isFa ? 'ویرایش مشخصات کاربری' : 'Edit Profile Information'}</span>
            </h3>
            <span className="text-[10px] text-dim">{isFa ? 'تمامی فیلدها به جز شماره تماس قابل ویرایشند' : 'All fields editable except phone'}</span>
          </div>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'نام نمایشی / نام کاربری' : 'Username'}</label>
              <div className="relative">
                <User className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  minLength={2}
                  maxLength={40}
                  required
                  className="field ps-10 text-xs"
                  placeholder={isFa ? 'نام شما در پنل و کارت سود' : 'Your display name'}
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">
                {isFa ? 'ایمیل شخصی (برای ورود با ایمیل و اعلان‌ها)' : 'Personal Email'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-dim absolute start-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  dir="ltr"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="field ps-10 text-xs"
                  placeholder="you@gmail.com"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-dim block mb-1">{isFa ? 'معرفی کوتاه / بیوگرافی (اختیاری)' : 'Short Bio (optional)'}</label>
              <div className="relative">
                <FileText className="w-4 h-4 text-dim absolute start-3.5 top-3" />
                <textarea
                  rows={2}
                  maxLength={160}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="field ps-10 text-xs py-2.5"
                  placeholder={isFa ? 'مثلاً تریدر فیوچرز و اسکالپ طلا و BTC...' : 'Short bio...'}
                />
              </div>
            </div>
          </div>

          {profileMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] font-bold ${profileMsg.ok ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
              {profileMsg.text}
            </div>
          )}

          <button type="submit" disabled={profileBusy} className="btn-cobalt w-full py-2.5 rounded-xl text-xs font-black inline-flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            <span>{profileBusy ? '...' : isFa ? 'ذخیره تغییرات پروفایل' : 'Save Profile Changes'}</span>
          </button>
        </form>

        {/* Password Setup / Change Form */}
        <form onSubmit={handleSavePassword} className="panel rounded-[24px] p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-black text-main flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-gold" />
              <span>{hasExistingPwd ? (isFa ? 'تغییر رمز عبور' : 'Change Password') : isFa ? 'تنظیم رمز عبور برای ورود از سایت' : 'Set Web Login Password'}</span>
            </h3>
          </div>
          {!hasExistingPwd && (
            <p className="text-[11px] text-sub leading-relaxed">
              {isFa
                ? 'شما با حساب تلگرام وارد شده‌اید. اگر ایمیل شخصی خود را در کادر بالا ثبت کرده و این‌جا یک رمز عبور بسازید، از این پس علاوه‌بر ربات می‌توانید با ایمیل و رمز نیز وارد سایت شوید.'
                : 'Set a password here along with your personal email above if you also want password sign-in.'}
            </p>
          )}
          <div className="space-y-2.5 text-xs">
            {hasExistingPwd && (
              <input
                type="password"
                dir="ltr"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={isFa ? 'رمز عبور فعلی' : 'Current Password'}
                className="field text-xs"
              />
            )}
            <div className="grid sm:grid-cols-2 gap-2.5">
              <input
                type="password"
                dir="ltr"
                minLength={6}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={isFa ? 'رمز عبور جدید (حداقل ۶ کاراکتر)' : 'New Password (min 6)'}
                className="field text-xs"
              />
              <input
                type="password"
                dir="ltr"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={isFa ? 'تکرار رمز عبور جدید' : 'Confirm Password'}
                className="field text-xs"
              />
            </div>
          </div>

          {passwordMsg && (
            <div className={`p-2.5 rounded-xl text-[11px] font-bold ${passwordMsg.ok ? 'bg-emerald-500/15 text-jade' : 'bg-rose-500/15 text-loss'}`}>
              {passwordMsg.text}
            </div>
          )}

          <button type="submit" disabled={passwordBusy} className="btn-gold w-full py-2.5 rounded-xl text-xs font-black">
            {passwordBusy ? '...' : hasExistingPwd ? (isFa ? 'به‌روزرسانی رمز عبور' : 'Update Password') : isFa ? 'ثبت رمز عبور اختصاصی' : 'Set Password'}
          </button>
        </form>

        {/* Dollarino Quick Settings */}
        <div className="space-y-1.5">
          <p className="text-xs font-extrabold text-dim px-1">{isFa ? 'حساب کاربری دلارینو' : 'Dollarino Settings'}</p>
          <div className="panel rounded-[24px] divide-y hairline overflow-hidden">
            <button
              type="button"
              onClick={() => onNavigate('copy')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--soft)] transition"
            >
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <KeyRound className="w-4 h-4 text-dim" />
                <span>{isFa ? 'اتصال صرافی‌ها (Toobit / Bitunix / KCEX)' : 'Exchange API Vault'}</span>
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-dim font-bold">
                  {data.activeExchange?.provider?.toUpperCase() || 'PAPER'}
                </span>
                <Arrow className="w-4 h-4 text-dim" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('pricing')}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-xs hover:bg-[var(--soft)] transition"
            >
              <span className="inline-flex items-center gap-2.5 font-bold text-main">
                <Users className="w-4 h-4 text-dim" />
                <span>{isFa ? 'زیرمجموعه‌ها و اشتراک (+۷ روز هدیه)' : 'Referrals & Plans'}</span>
              </span>
              <Arrow className="w-4 h-4 text-dim" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onLogout()}
          className="w-full panel rounded-[22px] py-3.5 px-5 flex items-center justify-center gap-2 text-xs font-black text-loss hover:bg-rose-500/10 transition"
        >
          <LogOut className="w-4 h-4" />
          <span>{isFa ? 'خروج از حساب کاربری' : 'Sign Out'}</span>
        </button>

        {/* Danger Zone: Permanent Account Deletion */}
        <div className="panel rounded-[24px] p-4 sm:p-5 border border-rose-500/30 bg-rose-500/5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-loss shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-black text-loss">
                  {isFa ? 'حذف دائمی حساب کاربری (Delete Account)' : 'Danger Zone — Delete Account'}
                </h3>
                <p className="text-[11px] text-sub mt-0.5 leading-relaxed">
                  {isFa
                    ? 'با حذف حساب، تمامی اطلاعات پروفایل، کلیدهای API صرافی، اتصال ربات، تاریخچه معاملات و کلید اکستنشن برای همیشه پاک می‌شوند و قابل بازیابی نیستند.'
                    : 'Permanently erases your profile, exchange APIs, trades, alerts, and extension key. This cannot be undone.'}
                </p>
              </div>
            </div>
          </div>

          {user.role.toLowerCase() === 'owner' ? (
            <p className="text-[11px] font-bold text-amber-400">
              {isFa
                ? 'حساب مالک اصلی پلتفرم جهت حفظ امنیت سیستم قابل حذف نیست.'
                : 'Primary platform owner account cannot be deleted.'}
            </p>
          ) : !deleteOpen ? (
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteErr(null);
              }}
              className="px-4 py-2.5 rounded-xl bg-rose-500/15 text-loss border border-rose-500/30 text-xs font-black inline-flex items-center gap-2 hover:bg-rose-500/25 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isFa ? 'حذف حساب کاربری من' : 'Delete My Account'}</span>
            </button>
          ) : (
            <form onSubmit={handleDeleteAccount} className="space-y-2.5 pt-2 border-t border-rose-500/20 text-xs">
              <div>
                <label className="text-[11px] font-bold text-sub block mb-1">
                  {isFa ? 'برای تایید، کلمه DELETE یا «حذف» را بنویسید:' : 'Type DELETE to confirm:'}
                </label>
                <input
                  dir="ltr"
                  required
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="field text-xs font-mono-num"
                />
              </div>

              {hasExistingPwd && (
                <div>
                  <label className="text-[11px] font-bold text-sub block mb-1">
                    {isFa ? 'رمز عبور فعلی جهت تایید امنیتی:' : 'Current Password:'}
                  </label>
                  <input
                    type="password"
                    dir="ltr"
                    required
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={isFa ? 'رمز عبور فعلی' : 'Current Password'}
                    className="field text-xs"
                  />
                </div>
              )}

              {deleteErr && (
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-loss text-[11px] font-bold">{deleteErr}</div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={deleteBusy}
                  className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-xs font-black inline-flex items-center gap-1.5 hover:bg-rose-700 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deleteBusy ? '...' : isFa ? 'تایید و حذف کامل حساب' : 'Permanently Delete Account'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmText('');
                    setDeletePassword('');
                    setDeleteErr(null);
                  }}
                  className="btn-ghost px-4 py-2.5 rounded-xl text-xs font-bold"
                >
                  {isFa ? 'انصراف' : 'Cancel'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  /* Main Services Hub matching image-6.png */
  const doubleRingShortcuts: Array<{
    tab: NavTab;
    title: string;
    icon: typeof Bot;
    bg: string;
    color: string;
  }> = [
    {
      tab: 'myai',
      title: isFa ? 'هوش مصنوعی من' : 'My AI',
      icon: BrainCircuit,
      bg: 'from-[#1652F0] to-[#3B82F6]',
      color: '#FFFFFF',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار AI' : 'AI Radar',
      icon: Radar,
      bg: 'from-[#0EA5E9] to-[#2563EB]',
      color: '#FFFFFF',
    },
    {
      tab: 'copy',
      title: isFa ? 'کپی‌ترید و API' : 'Copy & API',
      icon: Users,
      bg: 'from-[#1D4ED8] to-[#60A5FA]',
      color: '#FFFFFF',
    },
    {
      tab: 'pricing',
      title: isFa ? 'اشتراک و هدیه' : 'Plans & Gift',
      icon: Gift,
      bg: 'from-[#F59E0B] to-[#FBBF24]',
      color: '#FFFFFF',
    },
  ];

  const featuredServices: Array<{
    tab: NavTab;
    title: string;
    subtitle: string;
    icon: typeof Bot;
    tileBg: string;
    tileColor: string;
    badge?: string;
  }> = [
    {
      tab: 'myai',
      title: isFa ? 'هوش مصنوعی من (قابل آموزش با چت)' : 'My Trainable AI Agent',
      subtitle: isFa ? 'با چت فارسی استراتژی خودت را به AI یاد بده، تست بگیر و ۲۴/۷ اجرا کن' : 'Teach your strategy via chat, test live & activate 24/7',
      icon: BrainCircuit,
      tileBg: 'bg-[#1652F0]/15',
      tileColor: 'text-[#1652F0]',
      badge: isFa ? 'جدید' : 'NEW',
    },
    {
      tab: 'overview',
      title: isFa ? 'ربات معامله‌گر هوشمند ۲۴/۷' : '24/7 Autonomous AI Bot',
      subtitle: isFa ? 'اسکن کل بازار با استاپ، تریلینگ و TP1-TP3 خودکار' : 'Automated TP1-TP3, breakeven & AI filtering',
      icon: Bot,
      tileBg: 'bg-[#F59E0B]/15',
      tileColor: 'text-[#D97706]',
      badge: data.config.bot_state.startsWith('RUNNING') ? (isFa ? 'روشن' : 'LIVE') : isFa ? 'آماده' : 'READY',
    },
    {
      tab: 'radar',
      title: isFa ? 'رادار شکار فرصت و IDE کاستوم' : 'Market Radar & Strategy IDE',
      subtitle: isFa ? 'اسکن ۸۰۷ جفت‌ارز، بک‌تست ۹۰۰ کندلی و ادیتور Pine/Python' : '807 pairs radar, 900-candle backtest & Pine/Py IDE',
      icon: Sparkles,
      tileBg: 'bg-slate-900/90 dark:bg-white/15',
      tileColor: 'text-white',
    },
    {
      tab: 'copy',
      title: isFa ? 'کپی‌ترید تاییدشده و صرافی Toobit / Bitunix / KCEX' : 'Verified Copy Trade & Exchanges',
      subtitle: isFa ? 'تریدرهای تاییدشده ادمین + اتصال امن صرافی AES-256' : 'Admin-verified Copy Traders & AES-256 exchange vault',
      icon: Users,
      tileBg: 'bg-[#0EA5E9]/15',
      tileColor: 'text-[#0284C7]',
    },
    {
      tab: 'card',
      title: isFa ? 'کارت سود تاییدشده (Live / Demo)' : 'Verified Profit Card',
      subtitle: isFa ? 'صدور تصویر PNG رسمی عملکرد با مهر حساب واقعی/دمو و امضای سرور' : 'Generate official Live/Demo PNG Profit Card with HMAC verification',
      icon: Image,
      tileBg: 'bg-[#10B981]/15',
      tileColor: 'text-[#0D9455]',
    },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* 1. Kifpool image-6.png Compact Top Profile Card with Inline Action Circles */}
      <div className="panel rounded-[22px] p-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setAccountView(true)}
          className="flex items-center gap-3 min-w-0 text-start group"
        >
          <div className="w-11 h-11 rounded-full p-0.5 bg-gradient-to-tr from-[#1652F0] to-[#3B82F6] shrink-0">
            <div className="w-full h-full rounded-full bg-[var(--panel)] overflow-hidden grid place-items-center font-display font-black text-sm text-[#1652F0]">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                user.username.slice(0, 1).toUpperCase()
              )}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="font-display font-bold text-sm text-main truncate group-hover:text-[#1652F0] transition">
                {user.username}
              </h2>
              <CheckCircle2 className="w-3.5 h-3.5 text-[#0D9455] shrink-0" />
            </div>
            <p className="text-[11px] text-dim truncate">{activePlanLabel}</p>
          </div>
        </button>

        {/* 3 Circular Inline Controls matching image-6.png */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => onToggleUiMode(uiMode === 'simple' ? 'pro' : 'simple')}
            title={isFa ? 'تغییر سطح کاربری (ساده / حرفه‌ای)' : 'Toggle Easy / Pro'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-xs font-black text-main hover:bg-[var(--line)] transition"
          >
            {uiMode === 'simple' ? <Sprout className="w-4 h-4 text-[#0D9455]" /> : <Zap className="w-4 h-4 text-[#1652F0]" />}
          </button>
          <button
            type="button"
            onClick={onToggleDaylight}
            title={isFa ? 'تغییر تم روز / شب' : 'Toggle Day / Night'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-[#F59E0B] hover:bg-[var(--line)] transition"
          >
            {currentLook === 'paper' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => setAccountView(true)}
            title={isFa ? 'مدیریت حساب و عکس پروفایل' : 'Account & Photo'}
            className="w-9 h-9 rounded-full surface-soft grid place-items-center text-main hover:bg-[var(--line)] transition"
          >
            <User className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Kifpool image-6.png Double-Ring Glossy Circular Shortcuts */}
      <div className="grid grid-cols-4 gap-2 text-center py-1">
        {doubleRingShortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => onNavigate(item.tab)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="w-14 h-14 rounded-full p-1 border-2 border-[#1652F0]/25 bg-[var(--panel)] shadow-xs transition group-hover:scale-105">
                <span className={`w-full h-full rounded-full bg-gradient-to-tr ${item.bg} grid place-items-center shadow-inner`}>
                  <Icon className="w-5 h-5" style={{ color: item.color }} />
                </span>
              </span>
              <span className="text-[11px] font-extrabold text-main leading-tight">{item.title}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Studio Generated Banner Card matching image-6.png */}
      <div className="rounded-[24px] relative overflow-hidden border hairline shadow-sm min-h-[124px] flex items-center bg-[#F3F5F8] dark:bg-slate-900">
        <img
          src="/assets/banner-radar-studio.webp"
          alt=""
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full object-cover pointer-events-none select-none opacity-95 dark:opacity-45 ${
            isFa ? '-scale-x-100 object-right' : 'object-right'
          }`}
        />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              currentLook === 'paper'
                ? isFa
                  ? 'linear-gradient(90deg, rgba(243,245,248,0.02) 0%, rgba(243,245,248,0.78) 46%, rgba(243,245,248,0.97) 100%)'
                  : 'linear-gradient(270deg, rgba(243,245,248,0.02) 0%, rgba(243,245,248,0.78) 46%, rgba(243,245,248,0.97) 100%)'
                : isFa
                  ? 'linear-gradient(90deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.82) 48%, rgba(15,23,42,0.96) 100%)'
                  : 'linear-gradient(270deg, rgba(15,23,42,0.18) 0%, rgba(15,23,42,0.82) 48%, rgba(15,23,42,0.96) 100%)',
          }}
        />
        <div className="relative z-10 w-full px-5 py-4 flex items-center justify-between gap-3">
          <div className="space-y-1.5 max-w-[66%]">
            <p className={`text-xs sm:text-sm font-black ${currentLook === 'paper' ? 'text-slate-900' : 'text-white'}`}>
              {isFa ? 'رادار هوشمند و استراتژی کاستوم دلارینو' : 'Dollarino Smart Radar & Pine/Py IDE'}
            </p>
            <p className={`text-[11px] leading-relaxed ${currentLook === 'paper' ? 'text-slate-600' : 'text-slate-300'}`}>
              {isFa ? (
                <>
                  اسکن زنده ۸۰۷ جفت‌ارز، بک‌تست ۹۰۰ کندلی و اتصال ۱-کلیکی به{' '}
                  <span dir="ltr" className="font-bold">@Dollarino_bot</span>
                </>
              ) : (
                '807-pair live scanner, 900-candle backtest & @Dollarino_bot sync'
              )}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('radar')}
              className="mt-1 px-3.5 py-1.5 rounded-full bg-[#1652F0] hover:bg-[#0D3CC4] text-white text-[11px] font-black inline-flex items-center gap-1 shadow-xs transition"
            >
              <span>{isFa ? 'شروع تحلیل و معامله' : 'Open Radar Lab'}</span>
              <Arrow className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. Kifpool image-6.png Grouped White Service Cards */}
      <div className="space-y-2">
        <p className="text-xs font-black text-dim px-1">{isFa ? 'سرویس‌های ویژه دلارینو' : 'Featured Services'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          {featuredServices.map((srv) => {
            const Icon = srv.icon;
            return (
              <button
                key={srv.tab}
                type="button"
                onClick={() => onNavigate(srv.tab)}
                className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
              >
                <span className={`w-10 h-10 rounded-2xl ${srv.tileBg} ${srv.tileColor} grid place-items-center shrink-0`}>
                  <Icon className="w-5 h-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs sm:text-sm font-extrabold text-main truncate">{srv.title}</span>
                    {srv.badge && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#0D9455]/12 text-[#0D9455]">
                        {srv.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-dim mt-0.5 line-clamp-1">{srv.subtitle}</p>
                </div>
                <Arrow className="w-4 h-4 text-dim shrink-0" />
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black text-dim px-1">{isFa ? 'مدیریت حساب، اشتراک و پشتیبانی' : 'Account, Plans & Support'}</p>
        <div className="panel rounded-[26px] divide-y hairline overflow-hidden">
          <button
            type="button"
            onClick={() => setAccountView(true)}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/12 text-[#1652F0] grid place-items-center shrink-0">
              <UserCheck className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'مدیریت حساب، ویرایش مشخصات و رمز عبور' : 'Account Details, Avatar & Password'}</span>
              <span className="text-[11px] text-dim block">
                {isFa ? 'ویرایش نام کاربری، ایمیل، بیوگرافی، عکس پروفایل و رمز عبور (شماره تماس ثابت)' : 'Edit profile, email, bio, avatar & password'}
              </span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('pricing')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 text-[#D97706] grid place-items-center shrink-0">
              <Award className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-main">{isFa ? 'اشتراک، باشگاه رفرال و درآمد دلاری' : 'Plans, Partner Club & Referrals'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#0D9455]/15 text-[#0D9455]">
                  {isFa ? 'تا ۲۲٪ پورسانت' : 'Up to 22%'}
                </span>
              </div>
              <span className="text-[11px] text-dim block">{activePlanLabel} · {isFa ? 'برداشت USDT یا تبدیل به اشتراک' : 'USDT Payout & Pro Credit'}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <a
            href="/downloads/dollarino-extension.zip"
            download="dollarino-extension.zip"
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#1652F0]/15 text-[#1652F0] grid place-items-center shrink-0">
              <Download className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-extrabold text-main">{isFa ? 'اکستنشن مرورگر (Chrome / Edge / Brave)' : 'Browser Extension (v9.7 ZIP)'}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#1652F0]/15 text-[#1652F0]">v9.7 گرافیکی</span>
              </div>
              <span className="text-[11px] text-dim block">{isFa ? 'طراحی Liquid Glass هم‌شکل سایت · کنترل ربات، بازارها و رادار DEX' : 'Liquid Glass UI matching web app · Bot, Markets & DEX radar'}</span>
            </div>
            <ExternalLink className="w-4 h-4 text-dim shrink-0" />
          </a>

          {onOpenSupport && (
            <button
              type="button"
              onClick={onOpenSupport}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
            >
              <span className="w-10 h-10 rounded-2xl bg-[#10B981]/15 text-[#0D9455] grid place-items-center shrink-0">
                <Headphones className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'پشتیبانی آنلاین و چت با ادمین' : 'Online Support & Live Admin Chat'}</span>
                <span className="text-[11px] text-dim block">{isFa ? 'ارسال پیام فوری همگام با تلگرام پشتیبانی' : 'Direct chat synced with Telegram support'}</span>
              </div>
              <Arrow className="w-4 h-4 text-dim shrink-0" />
            </button>
          )}

          <button
            type="button"
            onClick={() => onNavigate('faq')}
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#0D9455]/12 text-[#0D9455] grid place-items-center shrink-0">
              <CircleHelp className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">{isFa ? 'راهنمای کامل و امنیت حساب' : 'User Guide & Security'}</span>
              <span className="text-[11px] text-dim block">{isFa ? 'آموزش گام‌به‌گام و پشتیبانی' : 'Step-by-step guide & help'}</span>
            </div>
            <Arrow className="w-4 h-4 text-dim shrink-0" />
          </button>

          <a
            href="https://t.me/Dollarino_official"
            target="_blank"
            rel="noreferrer"
            className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
          >
            <span className="w-10 h-10 rounded-2xl bg-[#0EA5E9]/15 text-[#0284C7] grid place-items-center shrink-0">
              <Send className="w-5 h-5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-xs sm:text-sm font-extrabold text-main block">
                {isFa ? 'کانال رسمی سیگنال و اخبار دلارینو' : 'Official Dollarino Signals Channel'}
              </span>
              <span dir="ltr" className="text-[11px] text-[#0284C7] font-mono-num font-bold block">@Dollarino_official</span>
            </div>
            <ExternalLink className="w-4 h-4 text-dim shrink-0" />
          </a>

          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-[var(--soft)] transition text-start"
            >
              <span className="w-10 h-10 rounded-2xl bg-[#F59E0B]/15 text-[#F59E0B] grid place-items-center shrink-0">
                <Shield className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-extrabold text-main">{isFa ? 'پنل مدیریت کل دلارینو' : 'Super Admin Console'}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-[#F59E0B]/15 text-[#D97706]">
                    {user.role.toUpperCase()}
                  </span>
                </div>
                <span className="text-[11px] text-dim block">{isFa ? 'کاربران، اشتراک‌ها، کدهای هدیه و AI' : 'Users, plans, gift codes & AI'}</span>
              </div>
              <Arrow className="w-4 h-4 text-dim shrink-0" />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void onLogout()}
        className="w-full panel rounded-[22px] py-3.5 px-5 flex items-center justify-center gap-2 text-xs font-black text-loss hover:bg-rose-500/10 transition"
      >
        <LogOut className="w-4 h-4" />
        <span>{isFa ? 'خروج از حساب کاربری' : 'Sign Out'}</span>
      </button>
    </div>
  );
}
