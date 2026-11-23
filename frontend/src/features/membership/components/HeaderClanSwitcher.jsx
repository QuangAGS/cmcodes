/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/components/HeaderClanSwitcher.jsx
 * DATETIME    : 2026-11-23T17:35:00+07:00
 * VERSION     : 2.0.0-ISO29148-UAT-IMP9
 * DESCRIPTION : Bộ chuyển không gian dòng họ & vai trò làm việc trên Header:
 *               - [UAT-IMP9]:
 *                 1. Thanh Header tối giản: hiển thị "Đang vào: <tenants.name>"
 *                    (kèm tư cách đang tác nghiệp) và nút "Thay đổi" (>= 48px).
 *                 2. Khi bấm "Thay đổi", mở giao diện Card động (CollapsibleDetailCard)
 *                    tách bạch 2 nhóm độc lập:
 *                    + Nhóm 1: "1. Chọn dòng họ & vai trò làm việc" (mỗi dòng họ là một
 *                      thẻ động đóng/mở được, đánh dấu rõ vai trò đang mở).
 *                    + Nhóm 2: "2. Mở rộng dòng họ" (+ Gia nhập dòng họ khác, + Lập dòng họ mới).
 *                 3. Bảng màu thống nhất 2 tông (Indigo cho ngữ cảnh làm việc, Slate trung tính
 *                    cho nhãn phụ & hành động mở rộng), loại bỏ màu sắc xung đột.
 *                 4. Tích hợp AudioHelpButton & ZoneVoiceButton hỗ trợ giọng nói cho người cao tuổi.
 *                 5. Khi chọn bất kỳ tùy chọn nào, tự động đóng giao diện Card và chuyển sang
 *                    màn hình tương ứng.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-11T12:05:00+07:00 (v1.3.1): Khác họ gọi switchContext(id, path); cùng họ navigate.
 * - 2026-11-12T21:50:00+07:00 (v1.4.0): Thêm + Gia nhập dòng họ khác & + Lập dòng họ mới.
 * - 2026-11-20T06:55:00+07:00 (v1.5.0): Đồng bộ is_default / isDefault [FUNC-05, TC-FE-05].
 * - 2026-11-23T17:35:00+07:00 (v2.0.0-ISO29148-UAT-IMP9):
 *   + Thiết kế lại Header ("Đang vào: <tên họ>" + nút "Thay đổi") & Panel Card động 2 nhóm.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  Landmark,
  ShieldCheck,
  User,
  Star,
  X,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../lib/apiClient';
import { getLinkTypeMeta } from '../constants/membershipLabels';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton.jsx';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed';

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

const ROLE_DISPLAY_LABELS = {
  SYSTEM_ADMIN: 'Quản trị hệ thống',
  CLAN_ADMIN: 'Quản trị dòng họ',
  TRUONG_HO: 'Trưởng họ (Quản trị)',
  TRUONG_TOC: 'Trưởng tộc (Quản trị)',
  TRUONG_NGANH: 'Trưởng ngành (Quản trị)',
  TRUONG_CHI: 'Trưởng chi (Quản trị)',
  EDITOR: 'Biên tập gia phả',
  USER: 'Thành viên dòng họ',
  VIEWER: 'Thành viên dòng họ',
  GUEST: 'Thành viên dự bị',
};

const getRoleInTenant = (clan) =>
  String(clan?.roleInTenant || clan?.role_in_tenant || 'USER').toUpperCase();

const isAdminRole = (role) => ADMIN_ROLES.has(role);

const getFriendlyRoleLabel = (role) =>
  ROLE_DISPLAY_LABELS[String(role || '').toUpperCase()] || 'Thành viên dòng họ';

/**
 * [FUNC-05, TC-FE-05] Chuẩn hóa cờ dòng họ mặc định (hỗ trợ cả camelCase và snake_case)
 */
const isClanDefault = (clan) =>
  Boolean(clan?.isDefault === true || clan?.is_default === true);

const resolveMemberEntryPath = (clan) => {
  const st = String(clan?.status || 'DA_DUYET').toUpperCase();
  if (st === 'DRAFT') return '/op/mfo/plan';
  if (st === 'CHO_DUYET' || st === 'TU_CHOI') return '/membership/status';
  return '/op';
};

export const HeaderClanSwitcher = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    activeContext,
    availableClans,
    switchContext,
    refreshContext,
    isSwitchingContext,
  } = useAuth();

  const [isOpen, setIsOpen] = useState(false);
  const [expandedClanIds, setExpandedClanIds] = useState({});
  const [bannerState, setBannerState] = useState(null);
  const [settingDefaultTenantId, setSettingDefaultTenantId] = useState('');

  // Đóng panel khi nhấn phím Escape
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // [FUNC-05] Sắp xếp ưu tiên dòng họ mặc định (is_default = true) lên đầu danh sách
  const orderedClans = useMemo(() => {
    if (!Array.isArray(availableClans)) return [];
    return [...availableClans].sort((a, b) => {
      const aDef = isClanDefault(a) ? 1 : 0;
      const bDef = isClanDefault(b) ? 1 : 0;
      return bDef - aDef;
    });
  }, [availableClans]);

  // Khởi tạo trạng thái mở card con cho từng dòng họ khi mở panel
  useEffect(() => {
    if (!isOpen || orderedClans.length === 0) return;
    const activeId = activeContext?.activeTenantId;
    const initialMap = {};
    orderedClans.forEach((c) => {
      // Nếu <= 3 dòng họ thì mở sẵn tất cả để thao tác 1 chạm; nếu nhiều hơn thì mở dòng họ đang chọn
      initialMap[c.tenantId] = orderedClans.length <= 3 || c.tenantId === activeId;
    });
    setExpandedClanIds(initialMap);
  }, [isOpen, orderedClans, activeContext?.activeTenantId]);

  if (!user || orderedClans.length === 0) {
    return null;
  }

  const currentClan =
    orderedClans.find((c) => c.tenantId === activeContext?.activeTenantId) ||
    orderedClans.find((c) => isClanDefault(c)) ||
    orderedClans[0];

  const isOnAdminRoute = location.pathname.startsWith('/admin');
  const currentWorkspaceLabel = isOnAdminRoute ? 'Quản trị' : 'Thành viên';

  const toggleClanSubCard = (tenantId) => {
    setExpandedClanIds((prev) => ({
      ...prev,
      [tenantId]: !prev[tenantId],
    }));
  };

  /**
   * [FUNC-05, TC-FE-05] Đặt dòng họ đã duyệt làm dòng họ mặc định (is_default = true)
   */
  const handleSetDefaultClan = async (clan) => {
    if (!clan?.tenantId || settingDefaultTenantId) return;
    setBannerState(null);
    setSettingDefaultTenantId(clan.tenantId);

    try {
      const res = await apiClient.post('/membership/default-clan', {
        tenantId: clan.tenantId,
      });
      if (typeof refreshContext === 'function') {
        await refreshContext();
      }
      setBannerState({
        type: 'success',
        title: 'Đã cập nhật dòng họ mặc định',
        message: `Dòng họ ${clan.clanName} đã được đặt làm dòng họ mặc định của bác.`,
        correlationId:
          res?.data?._correlationId || res?.data?.correlationId || 'Không có',
      });
    } catch (err) {
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        title: 'Chưa thể cập nhật dòng họ mặc định',
        message: info.message,
        correlationId: info.correlationId,
      });
    } finally {
      setSettingDefaultTenantId('');
    }
  };

  /**
   * Chọn một không gian làm việc (dòng họ + vai trò):
   * Đóng ngay giao diện Card rồi chuyển sang màn hình tương ứng.
   */
  const enterClanAs = async (clan, path) => {
    setBannerState(null);
    setIsOpen(false);

    try {
      const sameTenant = clan.tenantId === activeContext?.activeTenantId;
      if (!sameTenant) {
        await switchContext(clan.tenantId, path);
        return;
      }
      navigate(path, { replace: true });
    } catch (err) {
      console.error('Không thể chuyển dòng họ / vai trò:', err);
      const info = extractApiErrorInfo(err);
      setIsOpen(true);
      setBannerState({
        type: 'error',
        title: 'Không thể chuyển dòng họ',
        message: info.message,
        correlationId: info.correlationId,
      });
    }
  };

  /**
   * Chọn hành động mở rộng dòng họ (C1 Gia nhập / C1-S Lập họ mới):
   * Đóng ngay giao diện Card rồi chuyển sang màn hình tương ứng.
   */
  const handleMultiHomeAction = (targetPath) => {
    setBannerState(null);
    setIsOpen(false);
    navigate(targetPath);
  };

  const overallVoiceHelp = `Bác đang vào dòng họ ${
    currentClan?.clanName || 'hiện tại'
  } với tư cách ${currentWorkspaceLabel}. Bác có ${
    orderedClans.length
  } dòng họ. Ở mục 1, bác chọn dòng họ và bấm Vào Thành viên để xem hồ sơ cá nhân, hoặc bấm Vào Quản trị để quản lý gia phả. Ở mục 2, bác có thể gia nhập thêm dòng họ khác hoặc lập dòng họ mới.`;

  const group1VoiceText =
    'Mục 1: Chọn dòng họ và vai trò làm việc. Bấm Vào Thành viên để xem và cập nhật thông tin cá nhân, hoặc bấm Vào Quản trị để duyệt hồ sơ và quản lý cây gia phả.';

  const group2VoiceText =
    'Mục 2: Mở rộng dòng họ. Bấm Gia nhập dòng họ khác để kết nối thêm với họ ngoại hoặc họ nhà vợ, nhà chồng. Bấm Lập dòng họ mới để khởi tạo gia phả cho một dòng họ mới.';

  return (
    <>
      <BlockingLoadingOverlay
        isOpen={Boolean(settingDefaultTenantId) || isSwitchingContext}
        message={
          isSwitchingContext
            ? 'Đang chuyển không gian dòng họ...'
            : 'Đang đồng bộ dòng họ mặc định...'
        }
      />

      {/* PHẦN TRÊN HEADER: "Đang vào: <tenants.name>" + Nút "Thay đổi" */}
      <div className="flex items-center justify-end gap-2.5 min-w-0">
        <div className="min-w-0 text-right leading-tight">
          <p className="truncate text-xs sm:text-sm font-normal text-slate-600 max-w-[155px] sm:max-w-[260px] md:max-w-[340px]">
            <span>Đang vào: </span>
            <strong className="font-black text-slate-900">
              {currentClan?.clanName || 'Dòng họ'}
            </strong>
          </p>
          <p className="mt-0.5 truncate text-[11px] sm:text-xs font-bold text-indigo-700">
            Tư cách: {currentWorkspaceLabel}
          </p>
        </div>

        <button
          type="button"
          disabled={isSwitchingContext}
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="min-h-[48px] h-12 shrink-0 inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 sm:px-4 text-sm sm:text-base font-bold text-indigo-900 whitespace-nowrap shadow-sm transition hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        >
          {isOpen ? 'Đóng' : 'Thay đổi'}
        </button>
      </div>

      {/* GIAO DIỆN CARD ĐỘNG KHI BẤM "THAY ĐỔI" */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/45 p-3 pt-16 sm:pt-20 overflow-y-auto"
          onClick={() => setIsOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Chuyển không gian dòng họ"
        >
          <div
            className="w-full max-w-[480px] rounded-3xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xl space-y-4 my-auto sm:my-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tiêu đề khung Card động + Nút Đóng lại */}
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                  Không gian làm việc
                </p>
                <h2 className="text-lg sm:text-xl font-black text-slate-900">
                  Chuyển dòng họ &amp; vai trò
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="min-h-[48px] h-12 shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 text-base font-bold text-slate-700 whitespace-nowrap hover:bg-slate-50"
              >
                <X size={18} />
                <span>Đóng lại</span>
              </button>
            </div>

            {/* Nút Nghe hướng dẫn tổng quát */}
            <div className="flex justify-center">
              <AudioHelpButton
                text={overallVoiceHelp}
                label="Nghe hướng dẫn"
                variant="soft"
              />
            </div>

            {bannerState && (
              <PersistentMessageBanner
                type={bannerState.type}
                title={bannerState.title}
                message={bannerState.message}
                correlationId={bannerState.correlationId}
                onClose={() => setBannerState(null)}
              />
            )}

            {/* =================================================================
                NHÓM 1 (CARD ĐỘNG): CHỌN DÒNG HỌ & VAI TRÒ LÀM VIỆC
               ================================================================= */}
            <CollapsibleDetailCard
              title="1. Chọn dòng họ & vai trò làm việc"
              statusLabel={`${orderedClans.length} dòng họ`}
              statusVariant="complete"
              voiceText={group1VoiceText}
              defaultExpanded={true}
              disabled={isSwitchingContext}
            >
              <div className="space-y-3">
                {orderedClans.map((clan) => {
                  const role = getRoleInTenant(clan);
                  const linkStatus = String(clan?.status || 'DA_DUYET').toUpperCase();
                  const isApproved = linkStatus === 'DA_DUYET';
                  const clanDefault = isClanDefault(clan);
                  const admin = isApproved && isAdminRole(role);
                  const isCurrentTenant =
                    clan.tenantId === activeContext?.activeTenantId;
                  const linkMeta = getLinkTypeMeta(clan.linkType);
                  const memberEntryPath = resolveMemberEntryPath(clan);
                  const isCardExpanded = Boolean(expandedClanIds[clan.tenantId]);

                  const isActiveAsMember =
                    isCurrentTenant && isApproved && !isOnAdminRoute;
                  const isActiveAsAdmin =
                    isCurrentTenant && admin && isOnAdminRoute;

                  return (
                    <div
                      key={clan.tenantId}
                      className={`rounded-2xl border-2 transition-colors ${
                        isCurrentTenant
                          ? 'border-indigo-300 bg-indigo-50/40'
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      {/* Tiêu đề thẻ con của từng dòng họ (bấm để đóng/mở động) */}
                      <button
                        type="button"
                        onClick={() => toggleClanSubCard(clan.tenantId)}
                        className="w-full flex items-start justify-between gap-2 p-3.5 text-left min-h-[48px]"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {clanDefault && (
                              <Star
                                size={16}
                                className="shrink-0 fill-amber-400 text-amber-500"
                              />
                            )}
                            <span className="text-base font-black text-slate-900 leading-snug">
                              {clan.clanName}
                            </span>
                            {isCurrentTenant && (
                              <span className="inline-flex items-center rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-bold text-white">
                                Đang mở
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm text-slate-600">
                            <span>{getFriendlyRoleLabel(role)}</span>
                            <span className="text-slate-300">•</span>
                            <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                              {linkMeta.short}
                            </span>
                            {clanDefault && (
                              <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">
                                Họ gốc
                              </span>
                            )}
                            {linkStatus === 'CHO_DUYET' && (
                              <span className="rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                                Chờ duyệt
                              </span>
                            )}
                            {linkStatus === 'TU_CHOI' && (
                              <span className="rounded bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                                Từ chối
                              </span>
                            )}
                          </div>
                        </div>

                        <span className="mt-1 shrink-0 text-slate-500">
                          {isCardExpanded ? (
                            <ChevronUp size={20} />
                          ) : (
                            <ChevronDown size={20} />
                          )}
                        </span>
                      </button>

                      {/* Thân thẻ con: Các nút chọn tư cách làm việc */}
                      {isCardExpanded && (
                        <div className="border-t border-slate-200/80 p-3.5 pt-3 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={isSwitchingContext}
                              onClick={() => enterClanAs(clan, memberEntryPath)}
                              className={`min-h-[48px] h-12 px-3.5 rounded-xl text-base font-bold inline-flex items-center justify-center gap-2 transition ${
                                isActiveAsMember
                                  ? 'bg-indigo-600 text-white shadow-sm'
                                  : 'border border-slate-300 bg-white text-slate-900 hover:border-indigo-400 hover:bg-indigo-50'
                              }`}
                            >
                              {isActiveAsMember ? (
                                <CheckCircle2 size={18} className="shrink-0" />
                              ) : (
                                <User size={18} className="shrink-0 text-slate-600" />
                              )}
                              <span className="truncate">
                                {linkStatus === 'CHO_DUYET' || linkStatus === 'TU_CHOI'
                                  ? 'Xem hồ sơ'
                                  : isActiveAsMember
                                    ? 'Đang ở Thành viên'
                                    : 'Vào Thành viên'}
                              </span>
                            </button>

                            {admin && (
                              <button
                                type="button"
                                disabled={isSwitchingContext}
                                onClick={() => enterClanAs(clan, '/admin')}
                                className={`min-h-[48px] h-12 px-3.5 rounded-xl text-base font-bold inline-flex items-center justify-center gap-2 transition ${
                                  isActiveAsAdmin
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'border border-indigo-200 bg-indigo-50 text-indigo-900 hover:bg-indigo-100'
                                }`}
                              >
                                {isActiveAsAdmin ? (
                                  <CheckCircle2 size={18} className="shrink-0" />
                                ) : (
                                  <ShieldCheck size={18} className="shrink-0 text-indigo-700" />
                                )}
                                <span className="truncate">
                                  {isActiveAsAdmin
                                    ? 'Đang ở Quản trị'
                                    : 'Vào Quản trị'}
                                </span>
                              </button>
                            )}
                          </div>

                          {isApproved && !clanDefault && orderedClans.length > 1 && (
                            <button
                              type="button"
                              disabled={
                                isSwitchingContext || Boolean(settingDefaultTenantId)
                              }
                              onClick={() => handleSetDefaultClan(clan)}
                              className="min-h-[48px] h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-bold text-slate-700 hover:bg-slate-100 transition inline-flex items-center justify-center gap-1.5"
                            >
                              <Star size={16} className="text-slate-500" />
                              <span>Đặt làm dòng họ mặc định</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CollapsibleDetailCard>

            {/* =================================================================
                NHÓM 2 (CARD ĐỘNG): MỞ RỘNG DÒNG HỌ (C1 & C1-S)
               ================================================================= */}
            <CollapsibleDetailCard
              title="2. Mở rộng dòng họ"
              statusLabel="Thêm mới"
              statusVariant="pending"
              voiceText={group2VoiceText}
              defaultExpanded={true}
              disabled={isSwitchingContext}
            >
              <div className="space-y-2.5">
                <p className="text-sm font-normal text-slate-600">
                  Kết nối thêm với dòng họ khác của gia đình hoặc khởi tạo gia phả cho một dòng họ mới:
                </p>

                <button
                  type="button"
                  disabled={isSwitchingContext}
                  onClick={() =>
                    handleMultiHomeAction('/membership/claim?mode=add-clan')
                  }
                  className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-900 hover:border-indigo-400 hover:bg-indigo-50 transition inline-flex items-center justify-center gap-2"
                >
                  <PlusCircle size={18} className="shrink-0 text-indigo-600" />
                  <span>Gia nhập dòng họ khác</span>
                </button>

                <button
                  type="button"
                  disabled={isSwitchingContext}
                  onClick={() => handleMultiHomeAction('/membership/setup')}
                  className="min-h-[48px] h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold text-slate-900 hover:border-indigo-400 hover:bg-indigo-50 transition inline-flex items-center justify-center gap-2"
                >
                  <Landmark size={18} className="shrink-0 text-indigo-600" />
                  <span>Lập dòng họ mới</span>
                </button>
              </div>
            </CollapsibleDetailCard>
          </div>
        </div>
      )}
    </>
  );
};

export default HeaderClanSwitcher;
