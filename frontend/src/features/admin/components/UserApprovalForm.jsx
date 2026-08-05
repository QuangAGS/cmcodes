/**
 * PATH       : src/features/admin/components/UserApprovalForm.jsx
 * DATETIME   : 2026-08-04T17:20:00+07:00
 * VERSION    : 14.4.2-PR-OP-4-R1
 * DESCRIPTION:
 * - TỐI ƯU UX MOBILE SCREEN: Label nhử động (Xem chi tiết / Thu gọn) trên 3 Khung.
 * - [14.4.2-R1] Option trạng thái theo nguồn user:
 *   + CHO_DUYET → DA_DUYET | TU_CHOI | RETURN_FOR_REVISION
 *   + TU_CHOI → CHO_DUYET (mở lại)
 *   + DA_DUYET → không đổi tại form này
 * - Q1: Giữ 3 khung, formState một cổng onSubmit.
 * - Q2: Header + changelog.
 */

import React, { useState } from 'react';
import { User, Shield, Network, ChevronDown, ChevronUp, Save, X } from 'lucide-react';

const UserApprovalForm = ({ userData, onSubmit, onCancel, loading }) => {
  const raw = userData?.rawBackendData || userData || {};

  const userCore = raw.userData || raw;
  const snapshot = userCore.temp_snapshot || raw.temp_snapshot || {};
  const tenant = userCore.tenant || raw.tenant || raw.tenantData;
  const member = userCore.member_profile || raw.member_profile || raw.memberData;

  const currentUserStatus = userCore.status || raw.status || 'CHO_DUYET';

  const resolveDefaultNewStatus = (status) => {
    if (status === 'CHO_DUYET') return 'DA_DUYET';
    if (status === 'TU_CHOI') return 'CHO_DUYET';
    return '';
  };

  const [toggleJson, setToggleJson] = useState({
    user: false,
    tenant: false,
    member: false,
  });

  const [openBlocks, setOpenBlocks] = useState({
    user: true,
    tenant: false,
    member: false,
  });
  /*
  const [formState, setFormState] = useState({
    userId: userCore.id || raw.id,
    newStatus: resolveDefaultNewStatus(currentUserStatus),
    adminNote: userCore.adminNote || '',
    tenantId: tenant?.id || null,
    newTenantStatus: tenant?.status || 'CHO_DUYET',
  });
  */
 
  // PR-OP-4R2: Add isFinalRejection to formState for final rejection handling
  const [formState, setFormState] = useState({
    userId: userCore.id || raw.id,
    newStatus: resolveDefaultNewStatus(currentUserStatus),
    adminNote: userCore.adminNote || '',
    tenantId: tenant?.id || null,
    newTenantStatus: tenant?.status || 'CHO_DUYET',
    isFinalRejection: false, // R2
  });

  const handleToggleJson = (key, e) => {
    e.stopPropagation();
    setToggleJson((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleToggleBlock = (key) => {
    setOpenBlocks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLocalSubmit = (e) => {
    e.preventDefault();
    if (!formState.adminNote || formState.adminNote.trim() === '') {
      alert('Vui lòng nhập Bút phê / Ghi chú của Admin trước khi lưu Sổ Cái.');
      return;
    }
    if (!formState.newStatus) {
      alert('Trạng thái hiện tại không cho phép thao tác tại form này.');
      return;
    }
    onSubmit(formState);
  };

  const renderPrettyJson = (obj) => {
    if (!obj) {
      return <p className="text-slate-400 italic text-xs">Không có dữ liệu.</p>;
    }
    return (
      <pre className="mt-2 max-h-[180px] overflow-y-auto rounded-xl bg-slate-900 p-3 text-[11px] font-mono leading-relaxed text-emerald-400 shadow-inner border border-slate-950">
        {JSON.stringify(obj, null, 2)}
      </pre>
    );
  };

  return (
    <form
      onSubmit={handleLocalSubmit}
      className="space-y-4 text-slate-900 font-sans animate-fadeIn"
    >
      {/* KHUNG 1: USER */}
      <div
        className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-all duration-200 ${
          openBlocks.user
            ? 'border-indigo-300 ring-2 ring-indigo-50'
            : 'border-slate-200'
        }`}
      >
        <div
          onClick={() => handleToggleBlock('user')}
          className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer select-none gap-2 ${
            openBlocks.user
              ? 'bg-indigo-50/40 border-b border-indigo-100'
              : 'bg-white hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <User size={18} className="text-indigo-600 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-indigo-950">
              Khung 1: Tài khoản User
            </span>
            <span className="rounded-md bg-indigo-100 text-indigo-700 font-extrabold px-1.5 py-0.5 text-[9px] uppercase">
              {currentUserStatus}
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-slate-100 pt-2 sm:border-none sm:pt-0">
            <button
              type="button"
              onClick={(e) => handleToggleJson('user', e)}
              className="text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-wider"
            >
              {toggleJson.user ? 'Ẩn JSON' : 'Xem JSON Gốc'}
            </button>

            <div className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-black text-indigo-700 shadow-sm">
              {openBlocks.user ? (
                <>
                  Thu gọn <ChevronUp size={12} className="text-indigo-600" />
                </>
              ) : (
                <>
                  Xem chi tiết <ChevronDown size={12} className="text-indigo-600" />
                </>
              )}
            </div>
          </div>
        </div>

        {openBlocks.user && (
          <div className="p-5 space-y-4 animate-slideDown">
            <div className="grid grid-cols-1 bg-slate-50 rounded-xl p-3.5 gap-2 text-xs border border-slate-100/60">
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Họ tên:</span>
                <span className="font-black text-slate-900 text-sm">
                  {snapshot.full_name || userCore.name || 'Chưa khai báo'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Năm sinh:</span>
                <span className="font-bold text-slate-800">
                  {snapshot.birth_year || 'Chưa rõ'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Điện thoại:</span>
                <span className="font-bold text-slate-800">
                  {userCore.phone || 'Chưa khai báo'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Email:</span>
                <span className="font-bold text-slate-800">
                  {userCore.email || 'Chưa khai báo'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Tên Cha/Mẹ:</span>
                <span className="font-bold text-slate-700">
                  {snapshot.father_name || 'Chưa rõ'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">
                  Quan hệ với dòng họ:
                </span>
                <span className="font-bold text-slate-800">
                  {snapshot.relationship || 'Chưa khai báo'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">
                  Vai trò trong dòng họ:
                </span>
                <span className="font-bold text-slate-800">
                  {userCore.role || 'USER'}
                </span>
              </div>
              {toggleJson.user && renderPrettyJson(userCore)}
            </div>

            <div className="flex justify-between text-xs">
              <span className="text-slate-500 font-medium">
                Trạng thái hiện tại:
              </span>
              <span className="font-bold text-slate-800">
                {currentUserStatus}
              </span>
            </div>

            <div className="bg-indigo-50/40 rounded-xl p-3.5 border border-indigo-100/60 grid grid-cols-1 gap-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1.5">
                  Lời nhắn tới quản trị viên
                </label>
                <textarea
                  rows={2}
                  readOnly
                  className="w-full rounded-xl border border-indigo-200 p-2 text-xs font-medium bg-slate-50 outline-none text-slate-600"
                  value={snapshot.note || 'Không có ghi chú kèm theo'}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1.5">
                  Thao tác / Trạng thái User
                </label>
                <select
                  className="w-full rounded-xl border border-indigo-200 p-2.5 text-xs font-bold bg-white text-indigo-950 outline-none focus:ring-4 focus:ring-indigo-100"
                  value={formState.newStatus}
                  onChange={(e) => {
                    const v = e.target.value;
                    setFormState((p) => ({
                      ...p,
                      newStatus: v,
                      isFinalRejection:
                        v === 'TU_CHOI' ? p.isFinalRejection : false,
                    }));
                  }}
                  disabled={currentUserStatus === 'DA_DUYET'}
                >
                  {currentUserStatus === 'CHO_DUYET' && (
                    <>
                      <option value="DA_DUYET">[DA_DUYET] Duyệt</option>
                      <option value="TU_CHOI">[TU_CHOI] Từ chối</option>
                      <option value="RETURN_FOR_REVISION">[BỔ SUNG] Yêu cầu bổ sung hồ sơ (trả về sửa)</option>
                    </>
                  )}
                  {currentUserStatus === 'TU_CHOI' && (
                    <option value="CHO_DUYET">
                      [CHO_DUYET] Mở lại hồ sơ
                    </option>
                  )}
                  {currentUserStatus === 'DA_DUYET' && (
                    <option value="">Đã duyệt — không đổi tại đây</option>
                  )}
                  {!['CHO_DUYET', 'TU_CHOI', 'DA_DUYET'].includes(
                    currentUserStatus
                  ) && (
                    <option value="" disabled>
                      Trạng thái {currentUserStatus} — không hỗ trợ tại form
                      này
                    </option>
                  )}
                </select>
              </div>

              {/* R2: từ chối lần cuối */}
              {formState.newStatus === 'TU_CHOI' && (
                <label className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 shrink-0"
                    checked={formState.isFinalRejection === true}
                    onChange={(e) =>
                      setFormState((p) => ({
                        ...p,
                        isFinalRejection: e.target.checked,
                      }))
                    }
                  />
                  <span className="font-bold text-rose-800 leading-relaxed">
                    Từ chối lần cuối — không cho mở lại hồ sơ qua quy trình
                    reopen.
                  </span>
                </label>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1.5">
                  Bút phê / Ghi chú của Admin
                </label>
                <textarea
                  rows={2}
                  required
                  placeholder="Bắt buộc: lý do duyệt / từ chối / yêu cầu bổ sung gửi tới người đăng ký..."
                  className="w-full rounded-xl border border-indigo-200 p-2 text-xs font-medium bg-white outline-none focus:border-indigo-500"
                  value={formState.adminNote}
                  onChange={(e) =>
                    setFormState((p) => ({
                      ...p,
                      adminNote: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KHUNG 2: TENANT — giữ nguyên */}
      <div
        className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-all duration-200 ${
          openBlocks.tenant
            ? 'border-amber-300 ring-2 ring-amber-50'
            : 'border-slate-200'
        }`}
      >
        <div
          onClick={() => handleToggleBlock('tenant')}
          className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer select-none gap-2 ${
            openBlocks.tenant
              ? 'bg-amber-50/40 border-b border-amber-100'
              : 'bg-white hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-amber-600 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-amber-950">
              Khung 2: Thông tin dòng họ
            </span>
            <span className="rounded-md bg-amber-100 text-amber-700 font-extrabold px-1.5 py-0.5 text-[9px] uppercase">
              {tenant?.status || 'HOAT_DONG'}
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-slate-100 pt-2 sm:border-none sm:pt-0">
            <button
              type="button"
              onClick={(e) => handleToggleJson('tenant', e)}
              className="text-[10px] font-black text-slate-400 hover:text-amber-600 uppercase tracking-wider"
            >
              {toggleJson.tenant ? 'Ẩn JSON' : 'Xem JSON Gốc'}
            </button>

            <div className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-white px-2.5 py-1 text-[11px] font-black text-amber-700 shadow-sm">
              {openBlocks.tenant ? (
                <>
                  Thu gọn <ChevronUp size={12} className="text-amber-600" />
                </>
              ) : (
                <>
                  Xem chi tiết <ChevronDown size={12} className="text-amber-600" />
                </>
              )}
            </div>
          </div>
        </div>

        {openBlocks.tenant && (
          <div className="p-5 space-y-4 animate-slideDown">
            <div className="grid grid-cols-1 bg-slate-50 rounded-xl p-3.5 gap-2 text-xs border border-slate-100/60">
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Tên dòng họ:</span>
                <span className="font-black text-indigo-950 text-sm">
                  {tenant?.name || tenant?.clan_name || 'Hệ thống Trung tâm'}
                </span>
              </div>
              <div className="flex justify-between border-b border-slate-200/50 pb-1.5">
                <span className="text-slate-500 font-medium">Mã định danh:</span>
                <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-700">
                  {tenant?.slug || 'global-root'}
                </span>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                  Mô tả ngắn về dòng họ
                </label>
                <textarea
                  rows={2}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 p-2 font-medium bg-white text-slate-700 text-xs outline-none"
                  value={
                    tenant?.description ||
                    'Chưa có mô tả chi tiết cho tổ chức này.'
                  }
                />
              </div>
              {toggleJson.tenant && renderPrettyJson(tenant)}
            </div>

            {tenant ? (
              <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-100 grid grid-cols-1 gap-2 text-xs">
                <label className="block text-[10px] font-black uppercase tracking-wider text-amber-600 mb-1">
                  Cấu hình trạng thái hoạt động Dòng họ
                </label>
                <div className="flex justify-between border-b border-slate-200/30 pb-1.5 mb-1">
                  <span className="text-slate-500">Trạng thái hiện tại:</span>
                  <span className="font-bold text-slate-800">
                    {tenant?.status || 'null'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <label className="block text-[10px] font-black tracking-wider text-indigo-900 mb-1">
                    Chọn trạng thái mới để duyệt
                  </label>
                </div>
                <select
                  className="w-full rounded-xl border border-amber-200 p-2.5 text-xs font-bold bg-white text-amber-950 outline-none"
                  value={formState.newTenantStatus}
                  onChange={(e) =>
                    setFormState((p) => ({
                      ...p,
                      newTenantStatus: e.target.value,
                    }))
                  }
                >
                  <option value="DA_DUYET">[DA_DUYET] Đã duyệt</option>
                  <option value="CHO_DUYET">[CHO_DUYET] Chờ xét duyệt</option>
                  <option value="TU_CHOI">[TU_CHOI] Từ chối</option>
                  <option value="HOAT_DONG">[HOAT_DONG] Đang hoạt động</option>
                  <option value="BI_KHOA">[BI_KHOA] Tạm khoá</option>
                  <option value="TAM_NGUNG">[TAM_NGUNG] Tạm ngừng</option>
                  <option value="NGUNG_HAN">[NGUNG_HAN] Ngừng hẳn</option>
                </select>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Không tìm thấy thực thể Tenant liên kết trên hồ sơ này.
              </p>
            )}
          </div>
        )}
      </div>

      {/* KHUNG 3: MEMBER — giữ nguyên */}
      <div
        className={`rounded-2xl border bg-white shadow-sm overflow-hidden transition-all duration-200 ${
          openBlocks.member
            ? 'border-emerald-300 ring-2 ring-emerald-50'
            : 'border-slate-200'
        }`}
      >
        <div
          onClick={() => handleToggleBlock('member')}
          className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer select-none gap-2 ${
            openBlocks.member
              ? 'bg-emerald-50/40 border-b border-emerald-100'
              : 'bg-white hover:bg-slate-50 active:bg-slate-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <Network size={18} className="text-emerald-600 shrink-0" />
            <span className="text-xs font-black uppercase tracking-wider text-emerald-950">
              Khung 3: Vị trí trên cây phả hệ
            </span>
            <span
              className={`rounded-md font-extrabold px-1.5 py-0.5 text-[9px] uppercase ${
                member
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {member ? 'ĐÃ LIÊN KẾT' : 'TỰ DO'}
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-slate-100 pt-2 sm:border-none sm:pt-0">
            <button
              type="button"
              onClick={(e) => handleToggleJson('member', e)}
              className="text-[10px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-wider"
            >
              {toggleJson.member ? 'Ẩn JSON' : 'Xem JSON Gốc'}
            </button>

            <div className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-black text-emerald-700 shadow-sm">
              {openBlocks.member ? (
                <>
                  Thu gọn <ChevronUp size={12} className="text-emerald-600" />
                </>
              ) : (
                <>
                  Xem chi tiết{' '}
                  <ChevronDown size={12} className="text-emerald-600" />
                </>
              )}
            </div>
          </div>
        </div>

        {openBlocks.member && (
          <div className="p-5 space-y-4 animate-slideDown">
            {member ? (
              <div className="grid grid-cols-1 bg-emerald-50/50 rounded-xl p-3.5 gap-2.5 text-xs border border-emerald-100">
                <div className="flex justify-between border-b border-emerald-200/40 pb-1.5">
                  <span className="text-emerald-700 font-medium">
                    Họ tên trong cây phả hệ:
                  </span>
                  <span className="font-black text-slate-900 text-sm">
                    {member.full_name || member.name}
                  </span>
                </div>
                <div className="flex justify-between border-b border-emerald-200/40 pb-1.5">
                  <span className="text-emerald-700 font-medium">
                    Thế hệ dòng họ (Đời thứ):
                  </span>
                  <span className="font-black text-emerald-800 bg-white border border-emerald-200 px-2 py-0.5 rounded">
                    Thế hệ số {member.generation || '1'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-emerald-200/40 pb-1.5">
                  <span className="text-emerald-700 font-medium">
                    Thuộc Chi họ:
                  </span>
                  <span className="font-bold text-slate-800">
                    {member.branch_name || 'Chi cành mặc định'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-700 font-medium">
                    Trạng thái sinh tồn:
                  </span>
                  <span
                    className={`font-bold ${
                      member.is_alive ? 'text-emerald-600' : 'text-slate-400'
                    }`}
                  >
                    {member.is_alive ? 'Còn sống' : 'Đã tạ thế'}
                  </span>
                </div>
                {toggleJson.member && renderPrettyJson(member)}
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 bg-slate-50/50">
                Hồ sơ tự do —{' '}
                <span className="font-bold text-rose-600">
                  Chưa cắm mốc liên kết
                </span>{' '}
                với bất kỳ vị trí vật lý nào trên cây phả hệ dòng họ.
              </div>
            )}

            <div className="rounded-xl bg-slate-50 p-3 text-[11px] font-bold text-slate-500 border border-slate-200 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
              Khung 3 bảo vệ cây phả hệ nghiêm ngặt (Chế độ Chỉ đọc).
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-black text-slate-600 shadow-sm hover:bg-slate-50 transition inline-flex items-center gap-1.5"
        >
          <X size={14} /> Hủy thao tác
        </button>
        <button
          type="submit"
          disabled={loading || currentUserStatus === 'DA_DUYET'}
          className="rounded-xl bg-slate-900 px-6 py-2.5 text-xs font-black text-white shadow-md hover:bg-slate-800 transition disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Save size={14} />{' '}
          {loading ? 'Đang cập nhật...' : 'Lưu Sổ Cái trung tâm'}
        </button>
      </div>
    </form>
  );
};

export default UserApprovalForm;