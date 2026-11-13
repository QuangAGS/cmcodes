/**
 * =============================================================================
 * PATH       : frontend/src/features/admin/components/UserApprovalForm.jsx
 * DATETIME   : 2026-11-13T17:15:00+07:00
 * VERSION    : 14.9.0-MULTIHOME-UAT-BUG2-ISCLAN-COMPOSITE
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0 Lát 4] Form đối soát & phê duyệt chi tiết hồ sơ:
 *   + Hiển thị banner phân loại hồ sơ (EM / 21 trường / CLAN SETUP / C1 Multi-Home).
 *   + Khung đối soát 2 cột EM (Hồ sơ trên cây xin nhận vs Câu trả lời 3 lớp gia mật).
 *   + Khung đối soát 4 nhóm thông tin 21 trường (Nhân thân, Tiền nhân 3 đời, Liên lạc/Cư trú, Minh chứng).
 *   + Cảnh báo bảo toàn họ gốc (is_default = false) đối với hồ sơ Multi-Home C1 / C1-S.
 *   + Xác nhận 2 bước bắt buộc khi chọn Từ chối lần cuối (khóa vĩnh viễn).
 * =============================================================================
 * CHANGELOGS:
 * - 2026-08-04T17:20:00+07:00 (v14.4.3-PR-OP-4-FINAL-LABEL): 3 khung đối soát + từ chối lần cuối.
 * - 2026-11-13T11:30:00+07:00 (v14.5.0-MULTIHOME-AMEND02-V15-LAT4):
 *   + Bổ sung khối đối soát 2 cột EM + 3 lớp gia mật, 4 nhóm 21 trường, cảnh báo C1 và xác nhận 2 bước.
 * - 2026-11-13T12:00:00+07:00 (v14.6.0-MULTIHOME-AMEND02-V15-LAT4):
 *   + Ánh xạ currentUserStatus theo caseStatus cho hồ sơ Multi-Home C1/C1-S để mở khóa nút duyệt.
 * - 2026-11-13T15:34:00+07:00 (v14.7.0-MULTIHOME-UAT-BUG1-CONTEXT-PROMPTS):
 *   + Dùng resolveVerificationPrompts hiển thị đúng nhãn 3 lớp xác minh theo ngữ cảnh link_type / child_type.
 * - 2026-11-13T16:25:00+07:00 (v14.8.0-MULTIHOME-UAT-BUG2-RELATIONSHIP-DISPLAY):
 *   + Ưu tiên đọc member.child_type và caseMetadata.link_type.
 * - 2026-11-13T17:15:00+07:00 (v14.9.0-MULTIHOME-UAT-BUG2-ISCLAN-COMPOSITE):
 *   + Chuẩn hóa hiển thị ghép 2 phần: (a) Nội tộc / Ngoại tộc (căn cứ is_clan) + (b) Vai vế
 *     (child_type / suy diễn marriages), vd: "Ngoại tộc — Con rể", "Nội tộc — Con đẻ".
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState } from 'react';
import { User, Shield, Network, ChevronDown, ChevronUp, Save, X } from 'lucide-react';
import { resolveVerificationPrompts } from '../../membership/components/ClaimMemberWizard.jsx';

const RELATIONSHIP_DISPLAY_LABELS = {
  CON_DE: 'Con đẻ',
  CON_DAU: 'Con dâu',
  CON_RE: 'Con rể',
  CON_NUOI: 'Con nuôi',
  CON_DO_DAU: 'Con đỡ đầu',
  CON_RIENG: 'Con riêng',
  SPOUSE_FAMILY: 'Nhà dâu / rể (Hôn phối)',
  MATERNAL: 'Họ ngoại',
  GUARDIAN: 'Đỡ đầu / Giám hộ',
  PRIMARY_PATERNAL: 'Họ nội (Trực hệ)',
  DESCENDANT_FAMILY: 'Dòng dõi hậu duệ',
  OTHER: 'Khác',
};

const resolveEffectiveIsClan = (
  memberIsClan,
  summaryIsClan,
  snapshotIsClan
) => {
  if (typeof memberIsClan === 'boolean') return memberIsClan;
  if (typeof summaryIsClan === 'boolean') return summaryIsClan;
  if (typeof snapshotIsClan === 'boolean') return snapshotIsClan;
  return null;
};

const formatClanRelationshipDisplay = ({
  isClan,
  memberGender,
  memberChildType,
  summaryChildType,
  snapshotChildType,
  linkType,
  snapshotRelationship,
}) => {
  let effectiveChildType = String(
    memberChildType || summaryChildType || snapshotChildType || ''
  ).toUpperCase();
  const effectiveLinkType = String(linkType || '').toUpperCase();
  const rawRel = String(snapshotRelationship || '').toUpperCase();
  const gender = String(memberGender || '').toUpperCase();

  // Nếu là Ngoại tộc (is_clan === false) nhưng child_type vẫn mang giá trị mặc định CON_DE của DB,
  // tự động quy đổi sang CON_RE / CON_DAU theo giới tính.
  if (isClan === false && (!effectiveChildType || effectiveChildType === 'CON_DE')) {
    effectiveChildType =
      gender === 'NAM' ? 'CON_RE' : gender === 'NU' ? 'CON_DAU' : 'KHAC';
  }

  const childLabel = effectiveChildType
    ? RELATIONSHIP_DISPLAY_LABELS[effectiveChildType] || effectiveChildType
    : '';
  const linkLabel = effectiveLinkType
    ? RELATIONSHIP_DISPLAY_LABELS[effectiveLinkType] || effectiveLinkType
    : '';

  // Khi đã xác định tư cách Nội tộc / Ngoại tộc từ bản ghi member trên cây
  if (typeof isClan === 'boolean') {
    const clanScopeLabel = isClan ? 'Nội tộc' : 'Ngoại tộc';
    const roleLabel =
      childLabel ||
      (rawRel ? RELATIONSHIP_DISPLAY_LABELS[rawRel] || snapshotRelationship : '') ||
      linkLabel;
    return roleLabel ? `${clanScopeLabel} — ${roleLabel}` : clanScopeLabel;
  }

  // Trường hợp hồ sơ khai báo mới 21 trường (chưa gắn node member trên cây)
  const declaredRole =
    childLabel ||
    (rawRel ? RELATIONSHIP_DISPLAY_LABELS[rawRel] || snapshotRelationship : '');
  if (declaredRole && linkLabel && declaredRole !== linkLabel) {
    return `${declaredRole} (${linkLabel})`;
  }
  return declaredRole || linkLabel || 'Chưa khai báo';
};

const UserApprovalForm = ({ userData, onSubmit, onCancel, loading }) => {
  const raw = userData?.rawBackendData || userData || {};

  const userCore = raw.userData || raw;
  const snapshot = userCore.temp_snapshot || raw.temp_snapshot || {};
  const caseMetadata = raw.caseMetadata || userCore.caseMetadata || {};
  const regProfile =
    caseMetadata.registration_profile &&
    typeof caseMetadata.registration_profile === 'object'
      ? caseMetadata.registration_profile
      : {};
  const claimVerification =
    regProfile.claim_verification &&
    typeof regProfile.claim_verification === 'object'
      ? regProfile.claim_verification
      : {};
  const isMultiHomeCase =
    raw.isMultiHomeCase === true || userCore.isMultiHomeCase === true;
  const isClaimEmCase =
    regProfile.claim_mode === 'CLAIM_EM' ||
    Boolean(regProfile.claimed_member_id || snapshot.claimed_member_id || caseMetadata.claimed_member_id);
  const isClanSetupCase =
    raw.caseType === 'CLAN_SETUP' ||
    userCore.caseType === 'CLAN_SETUP' ||
    regProfile.claim_mode === 'CLAN_SETUP';

  const tenant = userCore.tenant || raw.tenant || raw.tenantData;
  const member = userCore.member_profile || raw.member_profile || raw.memberData;

  const effectiveIsClan = resolveEffectiveIsClan(
    member?.is_clan,
    claimVerification?.claimed_member_summary?.is_clan,
    snapshot.is_clan
  );

  const resolvedRelationshipDisplay = formatClanRelationshipDisplay({
    isClan: effectiveIsClan,
    memberGender: member?.gender || snapshot.gender,
    memberChildType: member?.child_type,
    summaryChildType: claimVerification?.claimed_member_summary?.child_type,
    snapshotChildType: snapshot.child_type,
    linkType: caseMetadata.link_type || snapshot.link_type,
    snapshotRelationship: snapshot.relationship,
  });

  // Lát 4: Form C1 phải dùng trạng thái của hồ sơ (Multi-Home) thay vì users.status (DA_DUYET của họ gốc)
  const currentUserStatus = isMultiHomeCase && raw.caseStatus
    ? raw.caseStatus === 'REJECTED'
      ? 'TU_CHOI'
      : raw.caseStatus === 'APPROVED' || raw.caseStatus === 'MERGED'
      ? 'DA_DUYET'
      : 'CHO_DUYET'
    : raw.status || userCore.status || 'CHO_DUYET';

  const [confirmFinalStep2, setConfirmFinalStep2] = useState(false);

  // PR-OP-4: từ BE query / list normalize
  const isFinalRejectionRecord =
    userCore.isFinalRejection === true ||
    raw.isFinalRejection === true;

  const resolveDefaultNewStatus = (status, isFinal) => {
    if (status === 'CHO_DUYET') return 'DA_DUYET';
    if (status === 'TU_CHOI' && !isFinal) return 'CHO_DUYET';
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

  // PR-OP-4R2: Add isFinalRejection to formState for final rejection handling
  const [formState, setFormState] = useState({
    userId: userCore.id || raw.id,
    newStatus: resolveDefaultNewStatus(
      currentUserStatus,
      isFinalRejectionRecord
    ),
    adminNote: userCore.adminNote || '',
    tenantId: tenant?.id || null,
    newTenantStatus: tenant?.status || 'CHO_DUYET',
    isFinalRejection: false,
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

    let newStatus = formState.newStatus;
    let isFinalRejection = formState.isFinalRejection === true;

    // Không bao giờ gửi FINAL_REJECT lên API
    if (newStatus === 'FINAL_REJECT') {
      newStatus = 'TU_CHOI';
      isFinalRejection = true;
    }

    if (newStatus === 'TU_CHOI' && isFinalRejection && !confirmFinalStep2) {
      alert('Vui lòng tích xác nhận bước 2 cho quyết định Từ chối vĩnh viễn.');
      return;
    }

    onSubmit({
      ...formState,
      newStatus,
      isFinalRejection,
    });
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
      {/* BANNERS PHÂN LOẠI HỒ SƠ (AMEND-RP-OP-2026-02 V1.5.0 Mục 7) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-black text-indigo-800 border border-indigo-200">
            {isClanSetupCase
              ? isMultiHomeCase
                ? '[LẬP DÒNG HỌ MỚI - CLAN SETUP (C1-S)]'
                : '[LẬP DÒNG HỌ MỚI - CLAN SETUP (C2-S)]'
              : isMultiHomeCase
                ? '[GIA NHẬP HỌ THỨ HAI - C1]'
                : isClaimEmCase
                  ? '[NHẬN NGƯỜI TRÊN CÂY - EM]'
                  : '[KHAI BÁO MỚI - 21 TRƯỜNG]'}
          </span>
          {raw.caseId && (
            <span className="font-mono text-[11px] text-slate-400">
              Case #{String(raw.caseId).slice(0, 8)}
            </span>
          )}
        </div>

        {isMultiHomeCase && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs font-semibold text-indigo-950">
            Người dùng này đã có tài khoản hoạt động (<code>DA_DUYET</code>) tại dòng họ gốc.
            Khi duyệt, hệ thống chỉ tạo liên kết phụ (<code>is_default = false</code>) tại{' '}
            <strong>{tenant?.name || tenant?.clan_name || 'dòng họ đích'}</strong>, không làm thay đổi trạng thái tài khoản hay họ gốc.
          </div>
        )}
      </div>

      {/* ĐỐI SOÁT CHUYÊN BIỆT: CASE EM (2 CỘT) HOẶC 21 TRƯỜNG PHẢ HỆ (4 NHÓM) */}
      {isClaimEmCase ? (
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-emerald-900">
            Đối soát nhận người trên cây (EM) &amp; 3 lớp gia mật
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-xs space-y-1.5">
              <p className="font-black uppercase text-emerald-800">
                1. Hồ sơ trên cây xin nhận
              </p>
              <p className="font-black text-sm text-slate-900">
                {member?.full_name ||
                  claimVerification?.claimed_member_summary?.full_name ||
                  snapshot.full_name ||
                  'Chưa rõ'}
              </p>
              <p className="text-slate-600">
                Đời thứ:{' '}
                <strong>
                  {member?.generation ??
                    claimVerification?.claimed_member_summary?.generation ??
                    'Chưa rõ'}
                </strong>{' '}
                • Chi:{' '}
                <strong>
                  {member?.branch_name ||
                    member?.branch?.name ||
                    claimVerification?.claimed_member_summary?.branch_name ||
                    'Chưa rõ'}
                </strong>
                {(typeof effectiveIsClan === 'boolean' ||
                  member?.child_type ||
                  claimVerification?.claimed_member_summary?.child_type) && (
                  <>
                    {' '}
                    • Quan hệ:{' '}
                    <strong>{resolvedRelationshipDisplay}</strong>
                  </>
                )}
              </p>
              {!member && (
                <p className="mt-1 rounded bg-rose-100 px-2 py-1 text-[11px] font-bold text-rose-800">
                  Cảnh báo: Không tìm thấy bản ghi thành viên hợp lệ trên cây!
                </p>
              )}
            </div>

            {(() => {
              const adminVerPrompts = resolveVerificationPrompts({
                linkType: caseMetadata.link_type || '',
                childType:
                  member?.child_type ||
                  claimVerification?.claimed_member_summary?.child_type ||
                  '',
              });
              return (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-3 text-xs space-y-1.5">
                  <p className="font-black uppercase text-indigo-800">
                    2. Câu trả lời 3 lớp xác minh
                  </p>
                  <p>
                    <span className="text-slate-500">{adminVerPrompts.layer1Label}:</span>{' '}
                    <strong>{claimVerification.layer1_lineage || snapshot.father_name || '—'}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">{adminVerPrompts.layer2Label}:</span>{' '}
                    <strong>{claimVerification.layer2_branch_origin || snapshot.branch_name || '—'}</strong>
                  </p>
                  <p>
                    <span className="text-slate-500">{adminVerPrompts.layer3Label}:</span>{' '}
                    <strong>{claimVerification.layer3_guarantor_note || snapshot.note || '—'}</strong>
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-blue-900">
            Hồ sơ khai báo chi tiết (4 nhóm thông tin)
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 text-xs">
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-1">
              <p className="font-black text-slate-700 uppercase">1. Nhân thân</p>
              <p>Họ tên: <strong>{regProfile.full_name || snapshot.full_name || '—'}</strong></p>
              <p>Tên tự/hiệu: <strong>{regProfile.alias || snapshot.alias || '—'}</strong></p>
              <p>Giới tính: <strong>{regProfile.gender || snapshot.gender || 'NAM'}</strong></p>
              <p>
                Sinh:{' '}
                <strong>
                  {[regProfile.birth_day, regProfile.birth_month, regProfile.birth_year || snapshot.birth_year]
                    .filter(Boolean)
                    .join('/') || 'Chưa rõ'}
                </strong>
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-1">
              <p className="font-black text-slate-700 uppercase">2. Tiền nhân 3 đời</p>
              <p>Cha: <strong>{regProfile.father_name || snapshot.father_name || '—'}</strong></p>
              <p>Mẹ: <strong>{regProfile.mother_name || snapshot.mother_name || '—'}</strong></p>
              <p>Ông nội: <strong>{regProfile.grandfather_name || snapshot.grandfather_name || '—'}</strong></p>
              <p>Chi/Nhánh: <strong>{regProfile.branch_name || snapshot.branch_name || '—'}</strong> (Đời {regProfile.generation || snapshot.generation || '?'})</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-1">
              <p className="font-black text-slate-700 uppercase">3. Liên lạc &amp; Cư trú</p>
              <p>Quê quán: <strong>{regProfile.birth_place || snapshot.birth_place || '—'}</strong></p>
              <p>Địa chỉ: <strong>{regProfile.address || snapshot.address || '—'}</strong></p>
              <p>SĐT / Email: <strong>{userCore.phone || '—'} / {userCore.email || '—'}</strong></p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 border border-slate-100 space-y-1">
              <p className="font-black text-slate-700 uppercase">4. Minh chứng &amp; Lời nhắn</p>
              <p className="whitespace-pre-wrap font-medium text-slate-700">
                {regProfile.note || snapshot.note || 'Không có ghi chú'}
              </p>
            </div>
          </div>
        </div>
      )}

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
                  {resolvedRelationshipDisplay}
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
                {isFinalRejectionRecord
                  ? 'TU_CHOI · Từ chối lần cuối'
                  : currentUserStatus}
              </span>
            </div>

            {isFinalRejectionRecord && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
                Hồ sơ đã từ chối lần cuối. Không thể mở lại qua quy trình
                reopen.
              </p>
            )}

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
                        currentUserStatus === 'TU_CHOI' && v === 'TU_CHOI'
                          ? true
                          : v === 'TU_CHOI'
                            ? p.isFinalRejection
                            : false,
                    }));
                  }}
                  disabled={
                    currentUserStatus === 'DA_DUYET' || isFinalRejectionRecord
                  }
                >
                  {currentUserStatus === 'CHO_DUYET' && (
                    <>
                      <option value="DA_DUYET">[DA_DUYET] Duyệt</option>
                      <option value="TU_CHOI">[TU_CHOI] Từ chối</option>
                      <option value="RETURN_FOR_REVISION">[BỔ SUNG] Yêu cầu bổ sung hồ sơ (trả về sửa)</option>
                    </>
                  )}
                  {currentUserStatus === 'TU_CHOI' &&
                    !isFinalRejectionRecord && (
                    <>
                      <option value="CHO_DUYET">[CHO_DUYET] Mở lại hồ sơ</option>
                      <option value="TU_CHOI">[TU_CHOI] Từ chối lần cuối</option>
                    </>
                  )}
                  {currentUserStatus === 'TU_CHOI' &&
                    isFinalRejectionRecord && (
                    <option value="">
                      Đã từ chối lần cuối — không mở lại tại form này
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

              {/* R2: từ chối lần cuối (Xác nhận 2 bước theo V1.5.0 Mục 7) */}
              {formState.newStatus === 'TU_CHOI' && (
                <div className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-xs">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5 shrink-0"
                      checked={formState.isFinalRejection === true}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setConfirmFinalStep2(false);
                        setFormState((p) => ({
                          ...p,
                          isFinalRejection: checked,
                        }));
                      }}
                    />
                    <span className="font-bold text-rose-800 leading-relaxed">
                      Từ chối lần cuối — khóa vĩnh viễn hồ sơ, không cho mở lại qua quy trình reopen.
                    </span>
                  </label>

                  {formState.isFinalRejection === true && (
                    <label className="ml-5 flex items-start gap-2 rounded-lg border border-rose-300 bg-white p-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0"
                        checked={confirmFinalStep2}
                        onChange={(e) => setConfirmFinalStep2(e.target.checked)}
                      />
                      <span className="font-black text-rose-900">
                        Bước 2: Tôi xác nhận quyết định từ chối vĩnh viễn của Hội đồng gia tộc là không thể hoàn tác.
                      </span>
                    </label>
                  )}
                </div>
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
          disabled={
            loading ||
            currentUserStatus === 'DA_DUYET' ||
            isFinalRejectionRecord
          }
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