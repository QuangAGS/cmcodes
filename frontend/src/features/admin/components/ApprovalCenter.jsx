/**
 * PATH       : src/features/admin/components/ApprovalCenter.jsx
 * OLD PATH   : src/features/management/components/ApprovalCenter.jsx
 * DATETIME   : 2026-11-20T07:22:00+07:00
 * VERSION    : 2.0.0-PHASE2-SPRINT-FE4
 * DESCRIPTION:
 * - Trung tâm duyệt thành viên (BR3) & Bàn làm việc Quản trị Phase 2.
 * - [IMPL-PLAN-FE-PHASE2-V1.8-ISO29148 - Sprint FE-4]:
 *   + Cảnh báo Khóa QA (`qa_locked === true` / 3 lần sai) kèm nút Mở khóa QA
 *     tối đa 1 lần/hồ sơ [FUNC-03, FUNC-08, TC-FE-03].
 *   + Bảo toàn toàn bộ dữ liệu nhập trên form (vị trí chọn, ghi chú/bút phê)
 *     khi nhận HTTP 409 CONCURRENT_TRANSACTION_LOCKED (Keep State) [ARCH-01, ARCH-04, TC-FE-14].
 *   + Xử lý HTTP 400 REFERRER_DECEASED: hiện PersistentMessageBanner (dạng modal)
 *     "Hồ sơ lùi về NEEDS_REVISION" và gọi lại API refetch (onActionSuccess) [FUNC-02, TC-FE-02].
 *   + Thay thế hoàn toàn alert() bằng PersistentMessageBanner (kèm X-Correlation-Id
 *     fallback "Không có") và BlockingLoadingOverlay [ARCH-02, ARCH-04].
 *   + Tích hợp AudioHelpButton & ZoneVoiceButton, nút >= 48px, chữ >= 16px [NFR-FE-02, TC-FE-18].
 * ============================================================================
 * CHANGELOGS:
 * - 14-04-2026 20:45 (v1.0.0): Khởi tạo Trung tâm duyệt thành viên.
 * - 2026-11-20T07:22:00+07:00 (v2.0.0-PHASE2-SPRINT-FE4):
 *   + Nâng cấp chuẩn Phase 2 ISO 29148, bổ sung import ShieldCheck bị thiếu ở v1.0.0,
 *     quản lý form state chuẩn React (Keep State 409) và QA Lock.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useState } from 'react';
import {
  Check,
  X,
  UserSearch,
  MapPin,
  Calendar,
  ChevronRight,
  AlertCircle,
  Search,
  ShieldCheck,
  Lock,
} from 'lucide-react';
import apiClient from '../../../lib/apiClient';
import PersistentMessageBanner from '../../../components/common/PersistentMessageBanner';
import BlockingLoadingOverlay from '../../../components/common/BlockingLoadingOverlay';
import AudioHelpButton from '../../elder-doctrine/components/AudioHelpButton';
import ZoneVoiceButton from '../../elder-doctrine/components/ZoneVoiceButton';
import { extractApiErrorInfo } from '../../../shared/hooks/useTurnstileFailClosed';

const ApprovalCenter = ({ pendingUsers, onActionSuccess }) => {
  const [processingId, setProcessingId] = useState(null);
  const [searchMember, setSearchMember] = useState('');

  // [ARCH-01, TC-FE-14] Lưu trữ state biểu mẫu theo từng userId để bảo toàn tuyệt đối khi gặp lỗi 409 LCK
  const [selectedTargets, setSelectedTargets] = useState({});
  const [adminNotes, setAdminNotes] = useState({});
  const [bannerState, setBannerState] = useState(null);

  const handleTargetChange = (userId, targetValue) => {
    setSelectedTargets((prev) => ({
      ...prev,
      [userId]: targetValue,
    }));
  };

  const handleNoteChange = (userId, noteValue) => {
    setAdminNotes((prev) => ({
      ...prev,
      [userId]: noteValue,
    }));
  };

  /**
   * [FUNC-03, FUNC-08] Mở khóa QA (tối đa 1 lần/hồ sơ)
   */
  const handleUnlockQa = async (user) => {
    const caseId = user?.caseId || user?.case_id;
    if (!caseId) return;

    setProcessingId(user.id);
    setBannerState(null);
    try {
      const res = await apiClient.post(`/onboarding/cases/${encodeURIComponent(caseId)}/unlock-qa`, {
        note: 'Quản trị viên mở khóa QA từ Trung tâm duyệt',
      });
      setBannerState({
        type: 'success',
        mode: 'inline',
        title: 'Đã mở khóa câu hỏi bảo mật (QA)',
        message: 'Đã mở khóa QA thành công (lượt mở khóa duy nhất của hồ sơ).',
        correlationId: res?.data?._correlationId || 'Không có',
      });
      if (typeof onActionSuccess === 'function') {
        await onActionSuccess();
      }
    } catch (err) {
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title: 'Không thể mở khóa QA',
        message: info.message,
        correlationId: info.correlationId,
      });
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * Phê duyệt thành viên (bảo toàn form state khi dính 409 LCK) [ARCH-01, TC-FE-14]
   */
  const handleApprove = async (userId, targetMemberId) => {
    const effectiveTarget = targetMemberId || selectedTargets[userId] || '';
    const adminNote = (adminNotes[userId] || '').trim();

    if (!effectiveTarget) {
      setBannerState({
        type: 'warning',
        mode: 'inline',
        title: 'Chưa chọn vị trí trên phả đồ',
        message: 'Vui lòng chọn một vị trí (Node) trên cây để nối thành viên này vào!',
        correlationId: 'Không có',
      });
      return;
    }

    setProcessingId(userId);
    setBannerState(null);
    try {
      await apiClient.patch(`/members/${effectiveTarget}/approve`, {
        userId,
        ...(adminNote ? { adminNote } : {}),
      });
      setBannerState({
        type: 'success',
        mode: 'inline',
        title: 'Đã phê duyệt thành viên thành công',
        message: 'Hồ sơ thành viên đã được phê duyệt và liên kết vào phả đồ.',
        correlationId: 'Không có',
      });
      if (typeof onActionSuccess === 'function') {
        await onActionSuccess();
      }
    } catch (err) {
      console.error('Lỗi duyệt:', err);
      const info = extractApiErrorInfo(err);

      // [FUNC-02, TC-FE-02] 400 REFERRER_DECEASED -> Banner modal + refetch
      if (info.status === 400 && info.code === 'REFERRER_DECEASED') {
        setBannerState({
          type: 'warning',
          mode: 'modal',
          title: 'Hồ sơ lùi về NEEDS_REVISION',
          message: `Hồ sơ lùi về NEEDS_REVISION. ${info.message}`,
          correlationId: info.correlationId,
        });
        if (typeof onActionSuccess === 'function') {
          await onActionSuccess();
        }
        return;
      }

      // [ARCH-01, ARCH-04, TC-FE-14] 409 CONCURRENT_TRANSACTION_LOCKED:
      // Giữ nguyên selectedTargets[userId] và adminNotes[userId], hiện nút "Thử lại ngay"
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không thể duyệt thành viên này',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleApprove(userId, effectiveTarget)}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * Từ chối hồ sơ (bảo toàn ghi chú khi dính 409 LCK) [ARCH-01]
   */
  const handleReject = async (user) => {
    const userId = user.id;
    const caseId = user.caseId || user.case_id;
    const reason = (adminNotes[userId] || '').trim();

    if (!reason) {
      setBannerState({
        type: 'warning',
        mode: 'inline',
        title: 'Thiếu lý do từ chối',
        message: 'Bác vui lòng nhập bút phê / lý do từ chối trước khi bấm Từ chối.',
        correlationId: 'Không có',
      });
      return;
    }

    setProcessingId(userId);
    setBannerState(null);
    try {
      if (caseId) {
        await apiClient.post(`/onboarding/cases/${encodeURIComponent(caseId)}/reject`, {
          rejectionReason: reason,
          note: reason,
        });
      } else {
        await apiClient.post('/auth/process-approval', {
          userId,
          newStatus: 'TU_CHOI',
          adminNote: reason,
        });
      }
      setBannerState({
        type: 'success',
        mode: 'inline',
        title: 'Đã từ chối hồ sơ',
        message: 'Đã ghi nhận quyết định từ chối hồ sơ.',
        correlationId: 'Không có',
      });
      if (typeof onActionSuccess === 'function') {
        await onActionSuccess();
      }
    } catch (err) {
      const info = extractApiErrorInfo(err);
      setBannerState({
        type: info.status === 409 ? 'warning' : 'error',
        mode: 'inline',
        title:
          info.status === 409
            ? 'Hồ sơ đang được xử lý đồng thời'
            : 'Không thể từ chối hồ sơ',
        message: info.message,
        correlationId: info.correlationId,
        actionButton:
          info.status === 409 ? (
            <button
              type="button"
              onClick={() => handleReject(user)}
              className="min-h-[48px] rounded-xl bg-amber-600 px-4 py-2 text-base font-bold text-white"
            >
              Thử lại ngay
            </button>
          ) : null,
      });
    } finally {
      setProcessingId(null);
    }
  };

  if (!pendingUsers || pendingUsers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <UserSearch size={32} className="opacity-30" />
        </div>
        <p className="text-base font-black uppercase tracking-wider">Hòm thư duyệt trống</p>
      </div>
    );
  }

  const filteredUsers = pendingUsers.filter((u) => {
    const q = searchMember.trim().toLowerCase();
    if (!q) return true;
    const blob = [u.temp_full_name, u.temp_father_name, u.phone, u.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return blob.includes(q);
  });

  return (
    <div className="flex flex-col gap-6 px-4 pb-24 font-sans">
      {/* Vòng quay chặn màn hình hợp nhất duy nhất [ARCH-04] */}
      <BlockingLoadingOverlay
        isOpen={Boolean(processingId)}
        message="Đang xử lý phê duyệt hồ sơ..."
      />

      {/* Header trợ lý giọng nói & tìm nhanh [NFR-FE-02, TC-FE-18] */}
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-black text-slate-900">
            Trung tâm đối soát &amp; duyệt thành viên ({filteredUsers.length})
          </h2>
          <AudioHelpButton
            text="Trung tâm duyệt thành viên. Bác kiểm tra thông tin khai báo, cảnh báo khóa câu hỏi bảo mật nếu có, nhập bút phê quản trị rồi bấm Xác nhận và cấp quyền hoặc Từ chối."
            label="Nghe hướng dẫn"
            variant="soft"
          />
        </div>

        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchMember}
            onChange={(e) => setSearchMember(e.target.value)}
            placeholder="Lọc nhanh theo tên, tên cha, số điện thoại..."
            className="min-h-[48px] w-full rounded-2xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-4 text-base text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Banner thông báo nghiệp vụ hợp nhất duy nhất (inline hoặc modal) [ARCH-02] */}
      {bannerState && (
        <PersistentMessageBanner
          type={bannerState.type}
          mode={bannerState.mode}
          title={bannerState.title}
          message={bannerState.message}
          correlationId={bannerState.correlationId}
          actionButton={bannerState.actionButton}
          onClose={() => setBannerState(null)}
        />
      )}

      {filteredUsers.map((user) => {
        const isQaLocked = Boolean(
          user.qa_locked === true ||
            user.qaLocked === true ||
            user.metadata?.qa_locked === true
        );
        const qaUnlockUsed = Number(
          user.qa_unlock_count || user.metadata?.qa_unlock_count || 0
        ) >= 1;
        const currentSelectedTarget =
          selectedTargets[user.id] ?? user.selectedTarget ?? '';
        const currentAdminNote = adminNotes[user.id] ?? '';

        return (
          <div
            key={user.id}
            className="bg-white rounded-[35px] shadow-2xl shadow-slate-200/60 border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-500"
          >
            {/* Header Card: Tên người đăng ký */}
            <div className="p-6 bg-slate-900 text-white relative">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="bg-amber-500 text-slate-950 text-xs font-black px-3 py-1.5 rounded-full uppercase tracking-tight">
                  {user.temp_relationship || 'Gia nhập'}
                </div>
                <ZoneVoiceButton
                  visible
                  text={`Hồ sơ của ${user.temp_full_name || 'thành viên'}. Cha: ${user.temp_father_name || 'chưa rõ'}. Năm sinh: ${user.temp_birth_year || 'chưa rõ'}.${isQaLocked ? ' Cảnh báo: Hồ sơ đang bị khóa QA do trả lời sai 3 lần.' : ''}`}
                  label="Nghe hồ sơ"
                />
              </div>
              <h3 className="font-black italic text-xl uppercase tracking-tighter leading-snug mb-1">
                {user.temp_full_name}
              </h3>
              {user.createdAt && (
                <p className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Calendar size={14} />{' '}
                  {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                </p>
              )}
            </div>

            {/* Body: Đối soát dữ liệu Vét cạn */}
            <div className="p-6 space-y-5">
              {/* [FUNC-03] Cảnh báo Khóa QA (3 lần sai) nổi bật */}
              {isQaLocked && (
                <div
                  role="alert"
                  data-testid={`qa-lock-warning-${user.id}`}
                  className="rounded-2xl border-2 border-amber-500 bg-amber-50 p-4 text-amber-950 space-y-2.5"
                >
                  <div className="flex items-center gap-2 font-black text-base text-amber-900">
                    <Lock size={18} className="shrink-0 text-amber-700" />
                    <span>
                      Cảnh báo Khóa QA (3 lần sai) — Hồ sơ chuyển sang duyệt thủ công
                    </span>
                  </div>
                  <p className="text-base text-amber-900">
                    Ứng viên đã trả lời sai câu hỏi bảo mật 3 lần liên tiếp. Bác có thể thẩm tra ngoại tuyến và duyệt thủ công hoặc mở khóa QA 1 lần.
                  </p>
                  {(user.caseId || user.case_id) && (
                    <div>
                      <button
                        type="button"
                        disabled={processingId === user.id || qaUnlockUsed}
                        onClick={() => handleUnlockQa(user)}
                        className="min-h-[48px] rounded-xl bg-amber-700 px-4 py-2.5 text-base font-bold text-white hover:bg-amber-800 disabled:bg-slate-300 disabled:text-slate-600"
                      >
                        {qaUnlockUsed
                          ? 'Đã mở khóa QA (Hết lượt)'
                          : 'Mở khóa QA (1 lần)'}
                      </button>
                      {qaUnlockUsed && (
                        <p className="mt-1.5 text-base font-medium text-amber-900">
                          Đã sử dụng lượt mở khóa QA duy nhất cho hồ sơ này.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Khối 1: Thông tin nhân thân khai báo */}
              <div className="bg-blue-50/70 p-5 rounded-[25px] border border-blue-100/50">
                <h4 className="text-xs font-black text-blue-700 uppercase mb-4 tracking-widest flex items-center gap-2">
                  <ShieldCheck size={16} /> Dữ liệu khai báo (Vét cạn)
                </h4>

                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                      <UserSearch className="text-blue-500" size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                        Cha &amp; Ông nội
                      </p>
                      <p className="text-base font-black text-slate-800 leading-tight italic">
                        {user.temp_father_name}{' '}
                        <span className="text-slate-400 mx-1">/</span>{' '}
                        {user.temp_grandfather_name || 'Chưa rõ'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm shrink-0">
                      <MapPin className="text-blue-500" size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-tight">
                        Năm sinh &amp; Địa chỉ
                      </p>
                      <p className="text-base font-black text-slate-800 leading-tight italic">
                        {user.temp_birth_year || '????'}{' '}
                        <span className="text-slate-400 mx-1">•</span>{' '}
                        {user.temp_address || 'Không rõ địa chỉ'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Khối 2: Lời nhắn/Ghi chú thêm */}
              {user.temp_note && (
                <div className="px-5 py-4 bg-slate-50 rounded-[20px] border border-dashed border-slate-200">
                  <span className="text-xs font-black text-slate-500 uppercase block mb-1">
                    Ghi chú từ thành viên:
                  </span>
                  <p className="text-base font-bold text-slate-700 italic leading-relaxed">
                    &ldquo;{user.temp_note}&rdquo;
                  </p>
                </div>
              )}

              {/* Khối 3: Tìm kiếm vị trí trên cây (Duyệt) */}
              <div className="space-y-3 pt-2">
                <label className="text-sm font-black text-slate-800 uppercase px-1 flex items-center gap-2">
                  <AlertCircle size={14} className="text-amber-500" /> Chọn vị
                  trí nối vào cây:
                </label>

                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={18} />
                  </div>
                  <select
                    value={currentSelectedTarget}
                    className="min-h-[48px] w-full pl-11 pr-10 py-3.5 bg-white border-2 border-slate-200 rounded-[22px] text-base font-bold text-slate-800 appearance-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all shadow-sm"
                    onChange={(e) =>
                      handleTargetChange(user.id, e.target.value)
                    }
                  >
                    <option value="">-- Tìm người cha trên cây --</option>
                    <option value="member_id_1">
                      Ông {user.temp_father_name} (Đời 4 - Nhánh 1)
                    </option>
                    <option value="manual_add">Thêm mới Node cha (Vét cạn)</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                    <ChevronRight size={18} className="text-slate-400" />
                  </div>
                </div>
              </div>

              {/* Khối 4: Bút phê quản trị (được bảo toàn nguyên vẹn khi 409 LCK) [ARCH-01] */}
              <div className="space-y-2">
                <label
                  htmlFor={`approval-note-${user.id}`}
                  className="text-sm font-black text-slate-800 uppercase px-1 block"
                >
                  Bút phê / Ghi chú của Quản trị viên:
                </label>
                <textarea
                  id={`approval-note-${user.id}`}
                  rows={2}
                  value={currentAdminNote}
                  onChange={(e) => handleNoteChange(user.id, e.target.value)}
                  placeholder="Nhập ghi chú đối soát hoặc lý do từ chối..."
                  className="w-full rounded-2xl border-2 border-slate-200 p-3.5 text-base font-medium text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Footer Card: Hành động >= 48px */}
            <div className="p-6 bg-slate-50/80 flex flex-col sm:flex-row gap-3 border-t border-slate-100">
              <button
                type="button"
                disabled={processingId === user.id}
                className="min-h-[48px] flex-1 py-3.5 px-4 bg-white border-2 border-rose-200 text-rose-600 rounded-2xl font-black uppercase tracking-wider text-sm active:scale-95 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                onClick={() => handleReject(user)}
              >
                <X size={16} /> Từ chối
              </button>
              <button
                type="button"
                disabled={processingId === user.id}
                className="min-h-[48px] flex-[2] py-3.5 px-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-wider text-sm shadow-xl shadow-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                onClick={() => handleApprove(user.id, currentSelectedTarget)}
              >
                {processingId === user.id ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Check size={18} /> Xác nhận &amp; Cấp quyền
                  </>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ApprovalCenter;
