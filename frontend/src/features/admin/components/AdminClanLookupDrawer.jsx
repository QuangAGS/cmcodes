/**
 * ============================================================================
 * PATH       : frontend/src/features/admin/components/AdminClanLookupDrawer.jsx
 * DATETIME   : 2026-11-22T15:15:00+07:00
 * VERSION    : 1.2.0-ISO29148-CLAN-SETUP-M2
 * DESCRIPTION:
 * - [UAT-IMP5 Mục 3] Ngăn kéo (Drawer) trợ giúp Ban Quản trị tra cứu thông tin
 *   thành viên trong dòng họ ngay tại màn hình xét duyệt (/admin/approval):
 *   + Tìm kiếm theo Họ tên, Tên tự / Tên hiệu, hoặc Số điện thoại.
 *   + Lọc đa tiêu chí: Chi / Phái / Nhánh, Đời thứ, Tư cách dòng họ
 *     (members.is_clan: Nội tộc / Ngoại tộc Con dâu - Con rể), và Sống / Chết.
 *   + Hiển thị đầy đủ toàn bộ thông tin của một member trong CollapsibleDetailCard
 *     + KeyValueDetailTable (label italic, value đậm, Text Area cho ghi chú)
 *     kèm nút gọi điện trực tiếp (tel:...) để Admin xác minh người giới thiệu.
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-21T17:30:00+07:00 (v1.0.0-ISO29148-UAT-IMP5): Khởi tạo ngăn tra cứu Admin.
 * - 2026-11-21T20:25:00+07:00 (v1.1.0-ISO29148-UAT-BUG9-FIX):
 *   + Fix UAT-Bug 9: Đọc đúng cột `members.phone_number` (fallback `m?.phone`) và
 *     `members.role` (fallback `m?.member_role`), hiển thị mạng xã hội từ `social_profiles`.
 *   + Hỗ trợ tìm kiếm chính xác theo SĐT (cả dạng 0xxx lẫn +84xxx) mà không bị bỏ sót
 *     nếu endpoint GET /members chỉ lọc theo họ tên.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  X,
  Phone,
  RefreshCw,
  Filter,
  Users,
} from 'lucide-react';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import KeyValueDetailTable from '../../../components/common/KeyValueDetailTable.jsx';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner.jsx';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton.jsx';
import { getPhase2UserMessage } from '../../onboarding/constants/phase2MessageCatalog.js';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed.js';
import apiClient from '../../../lib/apiClient.js';
import {
  searchMembers,
  unwrapMembers,
  clearSearchCache,
} from '../../member/api/memberSearchApi.js';

const GENDER_LABELS = {
  NAM: 'Nam',
  MALE: 'Nam',
  NU: 'Nữ',
  NỮ: 'Nữ',
  FEMALE: 'Nữ',
  KHAC: 'Khác',
};

const CHILD_TYPE_LABELS = {
  CON_DE: 'Con đẻ',
  CON_DAU: 'Con dâu',
  CON_RE: 'Con rể',
  CON_NUOI: 'Con nuôi',
  CON_DO_DAU: 'Con đỡ đầu',
  CON_RIENG: 'Con riêng',
  KHAC: 'Khác',
};

const MEMBER_ROLE_LABELS = {
  THANH_VIEN: 'Thành viên trong họ',
  TRUONG_CHI: 'Trưởng chi / Trưởng phái',
  TRUONG_NGANH: 'Trưởng ngành',
  TRUONG_TOC: 'Trưởng tộc',
  TRUONG_HO: 'Trưởng họ',
  CLAN_ADMIN: 'Quản trị viên dòng họ',
  KHAC: 'Vai vế khác',
};

function formatGenderVi(g) {
  const key = String(g || '').trim().toUpperCase();
  return GENDER_LABELS[key] || 'Không rõ';
}

function resolveMemberClanStatus(m) {
  if (!m) return { isClan: true, shortLabel: 'Nội tộc', fullLabel: 'Thành viên trong họ (Nội tộc)' };
  const isClan = m.is_clan !== false;
  if (isClan) {
    const ct = String(m.child_type || '').toUpperCase();
    const ctLabel = CHILD_TYPE_LABELS[ct];
    return {
      isClan: true,
      shortLabel: 'Nội tộc',
      fullLabel: ctLabel
        ? `Thành viên trong họ (Nội tộc — ${ctLabel})`
        : 'Thành viên trong họ (Nội tộc)',
    };
  }
  const ct = String(m.child_type || '').toUpperCase();
  const g = String(m.gender || '').toUpperCase();
  if (ct === 'CON_DAU' || g === 'NU' || g === 'NỮ' || g === 'FEMALE') {
    return {
      isClan: false,
      shortLabel: 'Ngoại tộc',
      fullLabel: 'Thành viên ngoại tộc (Con dâu)',
    };
  }
  if (ct === 'CON_RE' || g === 'NAM' || g === 'MALE') {
    return {
      isClan: false,
      shortLabel: 'Ngoại tộc',
      fullLabel: 'Thành viên ngoại tộc (Con rể)',
    };
  }
  return {
    isClan: false,
    shortLabel: 'Ngoại tộc',
    fullLabel: 'Thành viên ngoại tộc (Con rể / Con dâu)',
  };
}

function formatBirthDisplay(m) {
  const d = m?.birth_day != null && m.birth_day !== '' ? String(m.birth_day).trim() : '';
  const mo = m?.birth_month != null && m.birth_month !== '' ? String(m.birth_month).trim() : '';
  const y = m?.birth_year != null && m.birth_year !== '' ? String(m.birth_year).trim() : '';
  if (d && mo && y) return `${d}/${mo}/${y}`;
  if (mo && y) return `Tháng ${mo}/${y}`;
  if (y) return y;
  return 'Chưa rõ';
}

const SOCIAL_LABELS = {
  zalo: 'Zalo',
  facebook: 'Facebook',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  website: 'Trang web',
};

function resolveMemberPhone(m) {
  if (!m || typeof m !== 'object') return '';
  return String(m.phone_number ?? m.phone ?? '').trim();
}

function normalizePhoneDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('84') && digits.length >= 10) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function isPhoneLikeQuery(q) {
  const trimmed = String(q || '').trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 3 && /^[+\d\s().-]+$/.test(trimmed);
}

function extractMemberSocialRows(m) {
  const sp =
    m?.social_profiles && typeof m.social_profiles === 'object'
      ? m.social_profiles
      : null;
  if (!sp) return [];
  const rows = [];
  const seen = new Set();

  Object.entries(sp).forEach(([key, val]) => {
    if (key === 'items') return;
    if (val === undefined || val === null || typeof val === 'object') return;
    const text = String(val).trim();
    if (!text) return;
    const normKey = key.toLowerCase();
    const label = SOCIAL_LABELS[normKey] || key;
    const sig = `${label}:${text}`;
    if (!seen.has(sig)) {
      seen.add(sig);
      rows.push({ label, value: text });
    }
  });

  if (Array.isArray(sp.items)) {
    sp.items.forEach((item) => {
      const text = String(item?.value || '').trim();
      if (!text) return;
      const kindKey = String(item?.kind || '').trim().toLowerCase();
      const label = SOCIAL_LABELS[kindKey] || item?.kind || 'Mạng xã hội';
      const sig = `${label}:${text}`;
      if (!seen.has(sig)) {
        seen.add(sig);
        rows.push({ label, value: text });
      }
    });
  }

  return rows;
}

function buildMemberSpeakText(m) {
  const fullName = String(m?.full_name || m?.name || '').trim();
  const rel = resolveMemberClanStatus(m).fullLabel;
  const branch = m?.branch_name || m?.branch?.name || '';
  const gen = m?.generation != null ? `Đời thứ ${m.generation}` : '';
  const alive = m?.is_alive === false ? 'Đã mất' : 'Còn sống';
  const memberPhone = resolveMemberPhone(m);
  const phone = memberPhone ? `Số điện thoại ${memberPhone}` : '';
  return [fullName, rel, gen, branch ? `Chi ${branch}` : '', alive, phone]
    .filter(Boolean)
    .join('. ');
}

const TENANT_STATUS_LABELS = {
  HOAT_DONG: 'Đang hoạt động',
  TAM_NGUNG: 'Tạm ngưng',
  CHO_DUYET: 'Chờ duyệt',
  TU_CHOI: 'Từ chối',
  BI_KHOA: 'Bị khóa',
  NGUNG_HAN: 'Ngưng hẳn',
};

export default function AdminClanLookupDrawer({
  isOpen,
  onClose,
  initialQuery = '',
  clanName = '',
  mode = 'MEMBERS', // MEMBERS | CLAN_DIRECTORY
  targetTenantId = '',
}) {
  const isClanDirectoryMode = mode === 'CLAN_DIRECTORY';
  const [directoryClans, setDirectoryClans] = useState([]);
  const [directoryStatusFilter, setDirectoryStatusFilter] = useState('');
  const [keyword, setKeyword] = useState(initialQuery || '');
  const [isClanFilter, setIsClanFilter] = useState('ALL'); // ALL | CLAN | NON_CLAN
  const [isAliveFilter, setIsAliveFilter] = useState('ALL'); // ALL | ALIVE | DECEASED
  const [branchFilter, setBranchFilter] = useState('');
  const [generationFilter, setGenerationFilter] = useState('');

  const [rawMembers, setRawMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [bannerState, setBannerState] = useState(null);

  // Đồng bộ từ khóa mỗi khi Drawer được mở với initialQuery mới (ví dụ bấm từ Card Người giới thiệu)
  useEffect(() => {
    if (isOpen) {
      setKeyword(initialQuery || '');
    }
  }, [isOpen, initialQuery]);

  // Đếm ngược khóa tạm thời khi gặp HTTP 429
  useEffect(() => {
    if (rateLimitSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setRateLimitSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [rateLimitSeconds]);

  const fetchClansForDirectory = useCallback(
    async ({ overrideKeyword } = {}) => {
      if (!isOpen || !isClanDirectoryMode) return;
      const qValue = String(
        overrideKeyword !== undefined ? overrideKeyword : keyword
      ).trim();

      setLoading(true);
      try {
        const res = await apiClient.get('/tenants', {
          params: {
            q: qValue || undefined,
            status: directoryStatusFilter || undefined,
            page: 1,
            limit: 50,
          },
        });
        const data = res.data?.data || res.data || {};
        setDirectoryClans(Array.isArray(data.items) ? data.items : []);
      } catch (err) {
        const info = extractApiErrorInfo(err);
        setDirectoryClans([]);
        setBannerState({
          type: 'error',
          title: 'Không tải được danh bạ dòng họ',
          message: info.message,
        });
      } finally {
        setLoading(false);
      }
    },
    [isOpen, isClanDirectoryMode, keyword, directoryStatusFilter]
  );

  const fetchMembersForAdmin = useCallback(
    async ({ force = false, overrideKeyword } = {}) => {
      if (!isOpen || isClanDirectoryMode) return;
      if (rateLimitSeconds > 0) return;

      const qValue = String(
        overrideKeyword !== undefined ? overrideKeyword : keyword
      ).trim();

      if (force) {
        clearSearchCache();
      }

      setLoading(true);
      try {
        const queryParams = {
          status: 'CHINH_THUC',
          limit: 200,
          ...(targetTenantId ? { tenant_id: targetTenantId } : {}),
        };
        if (qValue.length >= 2 && !isPhoneLikeQuery(qValue)) {
          queryParams.q = qValue;
        }
        if (isClanFilter === 'CLAN') queryParams.is_clan = true;
        if (isClanFilter === 'NON_CLAN') queryParams.is_clan = false;
        if (isAliveFilter === 'ALIVE') queryParams.is_alive = true;
        if (isAliveFilter === 'DECEASED') queryParams.is_alive = false;

        const res = await searchMembers(queryParams);
        const list = unwrapMembers(res);
        setRawMembers(list);
      } catch (err) {
        const info = extractApiErrorInfo(err);
        if (info.status === 429) {
          const retryAfter = Number(
            info.details?.retryAfter || info.details?.retry_after || 30
          );
          setRateLimitSeconds(retryAfter > 0 ? retryAfter : 30);
          const msgObj = getPhase2UserMessage('IN_APP_SEARCH_RATE_LIMITED', {
            message: info.message,
          });
          setBannerState({
            type: msgObj.type,
            title: msgObj.title,
            message: msgObj.message,
          });
        } else {
          setRawMembers([]);
          const msgObj = getPhase2UserMessage(info.code, {
            message: info.message,
          });
          setBannerState({
            type: msgObj.type,
            title: msgObj.title,
            message: msgObj.message,
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [isOpen, isClanDirectoryMode, keyword, isClanFilter, isAliveFilter, rateLimitSeconds, targetTenantId]
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const t = setTimeout(() => {
      if (isClanDirectoryMode) {
        fetchClansForDirectory();
      } else {
        fetchMembersForAdmin();
      }
    }, 300);
    return () => clearTimeout(t);
  }, [isOpen, isClanDirectoryMode, fetchClansForDirectory, fetchMembersForAdmin]);

  // Danh sách Chi/Phái & Đời thứ trích xuất động từ dữ liệu sổ họ hiện tại để Admin chọn nhanh
  const branchOptions = useMemo(() => {
    const set = new Set();
    rawMembers.forEach((m) => {
      const b = String(m?.branch_name || m?.branch?.name || '').trim();
      if (b) set.add(b);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [rawMembers]);

  const generationOptions = useMemo(() => {
    const set = new Set();
    rawMembers.forEach((m) => {
      if (m?.generation != null && m.generation !== '') {
        set.add(Number(m.generation));
      }
    });
    return Array.from(set)
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  }, [rawMembers]);

  // Lọc tinh tại client theo Chi/Phái, Đời thứ, Nội tộc/Ngoại tộc, Sống/Chết & từ khóa SĐT/Tên tự
  const filteredMembers = useMemo(() => {
    const qLower = String(keyword || '').trim().toLowerCase();
    const bLower = String(branchFilter || '').trim().toLowerCase();
    const gTarget = String(generationFilter || '').trim();

    return rawMembers.filter((m) => {
      if (isClanFilter === 'CLAN' && m.is_clan === false) return false;
      if (isClanFilter === 'NON_CLAN' && m.is_clan !== false) return false;
      if (isAliveFilter === 'ALIVE' && m.is_alive === false) return false;
      if (isAliveFilter === 'DECEASED' && m.is_alive !== false) return false;

      const mBranch = String(m?.branch_name || m?.branch?.name || '').trim();
      if (bLower && !mBranch.toLowerCase().includes(bLower)) {
        return false;
      }

      if (gTarget && String(m?.generation ?? '') !== gTarget) {
        return false;
      }

      if (qLower.length >= 2) {
        const memberPhone = resolveMemberPhone(m);
        const memberPhoneNorm = normalizePhoneDigits(memberPhone);
        const queryPhoneNorm = normalizePhoneDigits(qLower);

        const phoneMatched =
          Boolean(queryPhoneNorm) &&
          (memberPhone.toLowerCase().includes(qLower) ||
            (memberPhoneNorm && memberPhoneNorm.includes(queryPhoneNorm)));

        if (!phoneMatched) {
          const haystack = [
            m?.full_name,
            m?.name,
            m?.alias,
            memberPhone,
            m?.email,
            m?.father_name,
            mBranch,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(qLower)) return false;
        }
      }

      return true;
    });
  }, [rawMembers, keyword, branchFilter, generationFilter, isClanFilter, isAliveFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Công cụ tra cứu thông tin dòng họ"
    >
      {/* Nền mờ che phủ */}
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Ngăn kéo trượt từ bên phải (Mobile-first full width, max-w-md) */}
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-slate-50 shadow-2xl">
        {/* Header ngăn kéo */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3.5">
          <div className="min-w-0">
            <h2 className="text-lg font-black text-slate-900 truncate">
              {isClanDirectoryMode
                ? 'Kiểm tra trùng dòng họ hệ thống'
                : 'Tra cứu thông tin dòng họ'}
            </h2>
            {clanName && (
              <p className="text-sm font-semibold text-indigo-700 truncate">
                {isClanDirectoryMode ? `Hồ sơ xin lập: ${clanName}` : clanName}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <ZoneVoiceButton
              visible
              text="Công cụ tra cứu thành viên trong sổ họ. Quản trị viên có thể tìm theo họ tên, tên tự, số điện thoại, hoặc lọc theo Chi phái, Đời thứ, Nội tộc hay Ngoại tộc."
              label="Nghe"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng ngăn tra cứu"
              className="min-h-[48px] h-12 w-12 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Bộ lọc đa tiêu chí */}
        <div className="border-b border-slate-200 bg-white p-4 space-y-3">
          {/* Ô tìm theo tên, tên tự/hiệu, SĐT */}
          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              disabled={rateLimitSeconds > 0}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Gõ họ tên, tên tự/hiệu, hoặc SĐT..."
              className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-10 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword('')}
                aria-label="Xóa từ khóa tìm kiếm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {isClanDirectoryMode ? (
            <div className="space-y-2.5">
              <div>
                <label className="block text-sm font-normal text-slate-600 mb-1">
                  Trạng thái dòng họ trên hệ thống
                </label>
                <select
                  value={directoryStatusFilter}
                  onChange={(e) => setDirectoryStatusFilter(e.target.value)}
                  className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="">Tất cả trạng thái</option>
                  <option value="HOAT_DONG">Đang hoạt động</option>
                  <option value="CHO_DUYET">Chờ duyệt</option>
                  <option value="TAM_NGUNG">Tạm ngưng</option>
                  <option value="TU_CHOI">Từ chối</option>
                </select>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                  <Filter size={15} />
                  <span>Tìm thấy {directoryClans.length} dòng họ</span>
                </span>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setKeyword('');
                    setDirectoryStatusFilter('');
                    fetchClansForDirectory({ overrideKeyword: '' });
                  }}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
                >
                  <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                  <span>Đặt lại</span>
                </button>
              </div>
            </div>
          ) : (
          <>
          {/* Hàng lọc 1: Nội tộc/Ngoại tộc & Sống/Chết */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-sm font-normal text-slate-600 mb-1">
                Nội tộc / Ngoại tộc
              </label>
              <select
                value={isClanFilter}
                onChange={(e) => setIsClanFilter(e.target.value)}
                className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="ALL">Tất cả tư cách</option>
                <option value="CLAN">Nội tộc (Trong họ)</option>
                <option value="NON_CLAN">Ngoại tộc (Dâu/Rể)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-normal text-slate-600 mb-1">
                Sống / Chết
              </label>
              <select
                value={isAliveFilter}
                onChange={(e) => setIsAliveFilter(e.target.value)}
                className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="ALL">Mọi tình trạng</option>
                <option value="ALIVE">Còn sống</option>
                <option value="DECEASED">Đã mất</option>
              </select>
            </div>
          </div>

          {/* Hàng lọc 2: Chi / Phái / Nhánh & Đời thứ */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-sm font-normal text-slate-600 mb-1">
                Chi / Phái / Nhánh
              </label>
              {branchOptions.length > 0 ? (
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
                >
                  <option value="">Tất cả Chi / Phái</option>
                  {branchOptions.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  placeholder="Lọc tên Chi..."
                  className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 outline-none focus:border-emerald-500"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-normal text-slate-600 mb-1">
                Đời thứ
              </label>
              <select
                value={generationFilter}
                onChange={(e) => setGenerationFilter(e.target.value)}
                className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 outline-none focus:border-emerald-500"
              >
                <option value="">Tất cả các đời</option>
                {(generationOptions.length > 0
                  ? generationOptions
                  : Array.from({ length: 20 }, (_, i) => i + 1)
                ).map((gen) => (
                  <option key={gen} value={String(gen)}>
                    Đời thứ {gen}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600">
              <Filter size={15} />
              <span>Tìm thấy {filteredMembers.length} thành viên</span>
            </span>

            <button
              type="button"
              disabled={loading || rateLimitSeconds > 0}
              onClick={() => {
                setKeyword('');
                setIsClanFilter('ALL');
                setIsAliveFilter('ALL');
                setBranchFilter('');
                setGenerationFilter('');
                fetchMembersForAdmin({ force: true, overrideKeyword: '' });
              }}
              className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm font-bold text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>Đặt lại</span>
            </button>
          </div>
          </>
          )}
        </div>

        {/* Vùng hiển thị kết quả tra cứu */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {bannerState && (
            <PersistentMessageBanner
              type={bannerState.type}
              mode="inline"
              title={bannerState.title}
              message={bannerState.message}
              onClose={() => setBannerState(null)}
            />
          )}

          {rateLimitSeconds > 0 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-base font-semibold text-amber-900">
              Ô tìm kiếm tạm khóa do thao tác nhanh. Vui lòng thử lại sau {rateLimitSeconds} giây.
            </p>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-12">
              <RefreshCw size={26} className="animate-spin text-emerald-600" />
              <p className="mt-3 text-base font-bold text-slate-700">
                {isClanDirectoryMode
                  ? 'Đang tra cứu danh bạ dòng họ...'
                  : 'Đang tra cứu sổ họ...'}
              </p>
            </div>
          ) : isClanDirectoryMode ? (
            directoryClans.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-2">
                <Users size={28} className="mx-auto text-slate-400" />
                <p className="text-base font-bold text-slate-800">
                  Không thấy dòng họ trùng khớp
                </p>
                <p className="text-base font-normal text-slate-600">
                  Chưa có dòng họ nào trên hệ thống trùng với từ khóa đang tìm.
                </p>
              </div>
            ) : (
              directoryClans.map((t) => {
                const statusLabel = TENANT_STATUS_LABELS[t.status] || t.status;
                const modeLabel =
                  t.status === 'HOAT_DONG'
                    ? t.isSandbox || t.social_configs?.isSandbox
                      ? 'Đang dựng cây (Sandbox)'
                      : 'Vận hành chính thức'
                    : statusLabel;
                return (
                  <CollapsibleDetailCard
                    key={t.id}
                    title={t.name}
                    statusLabel={statusLabel}
                    statusVariant={t.status === 'HOAT_DONG' ? 'complete' : 'pending'}
                    voiceText={`Dòng họ ${t.name}, mã định danh ${t.slug || 'chưa có'}, trạng thái ${modeLabel}.`}
                    defaultExpanded={directoryClans.length <= 3}
                  >
                    <KeyValueDetailTable
                      rows={[
                        { label: 'Tên dòng họ', value: t.name },
                        { label: 'Mã định danh', value: t.slug || 'Chưa cấp' },
                        { label: 'Trạng thái', value: statusLabel },
                        { label: 'Chế độ hoạt động', value: modeLabel },
                      ]}
                      notes={
                        t.description
                          ? [{ label: 'Mô tả dòng họ', value: t.description }]
                          : []
                      }
                    />
                  </CollapsibleDetailCard>
                );
              })
            )
          ) : filteredMembers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center space-y-2">
              <Users size={28} className="mx-auto text-slate-400" />
              <p className="text-base font-bold text-slate-800">
                Không tìm thấy thành viên phù hợp
              </p>
              <p className="text-base font-normal text-slate-600">
                Admin hãy thử đổi từ khóa họ tên, số điện thoại hoặc nới lỏng bộ lọc Chi / Đời.
              </p>
            </div>
          ) : (
            filteredMembers.map((m) => {
              const fullName = String(m?.full_name || m?.name || 'Chưa rõ tên').trim();
              const clanRel = resolveMemberClanStatus(m);
              const branchName = String(m?.branch_name || m?.branch?.name || '').trim();
              const memberPhone = resolveMemberPhone(m);
              const socialRows = extractMemberSocialRows(m);
              const roleCode = String(m?.role || m?.member_role || '').toUpperCase();
              const roleLabel =
                MEMBER_ROLE_LABELS[roleCode] ||
                String(m?.role_title || '').trim() ||
                'Thành viên trong họ';
              const fatherName = String(
                m?.father_name || m?.father?.full_name || ''
              ).trim();
              const motherName = String(
                m?.mother_name || m?.mother?.full_name || ''
              ).trim();
              const aliveText =
                m?.is_alive === false
                  ? `Đã mất${m?.death_year ? ` (Năm mất: ${m.death_year})` : ''}`
                  : 'Còn sống';

              const cardTitle = m?.alias
                ? `${fullName} (Tự/Hiệu: ${m.alias})`
                : fullName;

              const detailRows = [
                { label: 'Họ và tên khai sinh', value: fullName },
                ...(m?.alias
                  ? [{ label: 'Tên tự / Tên hiệu', value: m.alias }]
                  : []),
                { label: 'Tư cách dòng họ', value: clanRel.fullLabel },
                { label: 'Vai vế / Chức trách', value: roleLabel },
                { label: 'Giới tính', value: formatGenderVi(m?.gender) },
                { label: 'Ngày / Tháng / Năm sinh', value: formatBirthDisplay(m) },
                { label: 'Sống / Chết', value: aliveText },
                ...(m?.generation != null
                  ? [{ label: 'Đời thứ', value: `Đời thứ ${m.generation}` }]
                  : []),
                ...(branchName
                  ? [{ label: 'Chi / Phái / Nhánh', value: branchName }]
                  : []),
                ...(fatherName
                  ? [{ label: 'Họ và tên Cha', value: fatherName }]
                  : []),
                ...(motherName
                  ? [{ label: 'Họ và tên Mẹ', value: motherName }]
                  : []),
                {
                  label: 'Số điện thoại',
                  value: memberPhone || 'Chưa cập nhật trên sổ',
                },
                ...(m?.email
                  ? [{ label: 'Email', value: m.email }]
                  : []),
                ...socialRows,
              ];

              const detailNotes = [
                ...(m?.birth_place
                  ? [{ label: 'Nơi sinh / Nguyên quán', value: m.birth_place }]
                  : []),
                ...(m?.address
                  ? [{ label: 'Địa chỉ cư trú', value: m.address }]
                  : []),
                ...(m?.note
                  ? [{ label: 'Ghi chú phả hệ', value: m.note }]
                  : []),
              ];

              return (
                <CollapsibleDetailCard
                  key={m.id}
                  title={cardTitle}
                  statusLabel={clanRel.shortLabel}
                  statusVariant={clanRel.isClan ? 'complete' : 'pending'}
                  voiceText={buildMemberSpeakText(m)}
                  defaultExpanded={filteredMembers.length === 1}
                >
                  <div className="space-y-3">
                    <KeyValueDetailTable rows={detailRows} notes={detailNotes} />

                    {memberPhone && (
                      <a
                        href={`tel:${memberPhone.replace(/\s+/g, '')}`}
                        className="min-h-[48px] h-12 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-base font-bold text-emerald-900 whitespace-nowrap hover:bg-emerald-100"
                      >
                        <Phone size={18} />
                        <span>Gọi điện xác minh ({memberPhone})</span>
                      </a>
                    )}
                  </div>
                </CollapsibleDetailCard>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
