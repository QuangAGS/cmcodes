/**
 * ============================================================================
 * PATH       : frontend/src/features/membership/components/ClaimMemberWizard.jsx
 * DATETIME   : 2026-11-13T15:20:00+07:00
 * VERSION    : 1.3.0-MULTIHOME-UAT-BUG1-CONTEXT-PROMPTS
 * DESCRIPTION:
 * - [AMEND-RP-OP-2026-02 V1.5.0 MF-05] Wizard nhận hồ sơ thành viên có sẵn trên cây (Claim EM):
 *   + Hỗ trợ tra cứu dòng họ công khai qua GET /api/public/tenants/search?q= (nếu chưa có tenantId)
 *   + Tra cứu thành viên CHINH_THUC qua GET /api/public/tenants/:tenantId/members/claim-search?q=
 *   + Tự động điều chỉnh bộ 3 câu hỏi xác minh theo ngữ cảnh quan hệ (linkType / child_type):
 *     * Nhà dâu / rể (SPOUSE_FAMILY / CON_DAU / CON_RE): Xác minh Vợ/Chồng & Gia đình bên vợ/chồng
 *       (không hỏi "Huyết thống & Tiền nhân trực hệ").
 *     * Họ ngoại (MATERNAL): Xác minh quan hệ bên ngoại & tiền nhân phía Mẹ.
 *     * Nuôi dưỡng / Giám hộ (GUARDIAN / CON_NUOI / CON_DO_DAU): Xác minh Cha/Mẹ nuôi, người đỡ đầu.
 *     * Trực hệ nội tộc (PRIMARY_PATERNAL / CON_DE): Xác minh huyết thống & tiền nhân trực hệ.
 * - Dùng chung cho cả C2 (Guest đăng ký tại /auth) và C1 (Multi-Home tại /membership/claim).
 * ============================================================================
 * CHANGELOGS:
 * - 2026-11-12T21:35:00+07:00 (v1.2.0): Hiển thị nhãn child_type & giữ Authorization: ''.
 * - 2026-11-13T15:20:00+07:00 (v1.3.0-MULTIHOME-UAT-BUG1-CONTEXT-PROMPTS):
 *   + Fix UAT Bug 1: Tách bộ câu hỏi 3 lớp xác minh theo linkType / child_type, loại bỏ câu hỏi
 *     huyết thống vô lý khi EEU/NEU gia nhập họ bên vợ/chồng (SPOUSE_FAMILY / CON_RE / CON_DAU).
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Loader2,
  UserCheck,
  ShieldCheck,
  CheckCircle2,
  RotateCcw,
  Users,
  MapPin,
  MessageSquareText,
  AlertCircle,
  Landmark,
} from 'lucide-react';
import apiClient from '../../../lib/apiClient.js';

const GENDER_OPTIONS = [
  { value: 'NAM', label: 'Nam' },
  { value: 'NU', label: 'Nữ' },
  { value: 'KHAC', label: 'Khác' },
];

const CHILD_TYPE_LABELS = {
  CON_DE: 'Con đẻ',
  CON_DAU: 'Con dâu',
  CON_RE: 'Con rể',
  CON_NUOI: 'Con nuôi',
  CON_DO_DAU: 'Con đỡ đầu',
  CON_RIENG: 'Con riêng',
};

/**
 * Xác định bộ 3 câu hỏi xác minh phù hợp với ngữ cảnh quan hệ của người xin gia nhập.
 * Tránh hỏi "Huyết thống & Tiền nhân trực hệ" đối với con dâu/rể (SPOUSE_FAMILY / CON_DAU / CON_RE).
 */
const resolveVerificationPrompts = ({ linkType = '', childType = '' } = {}) => {
  const normalizedLink = String(linkType || '').toUpperCase();
  const normalizedChild = String(childType || '').toUpperCase();

  if (
    normalizedLink === 'SPOUSE_FAMILY' ||
    normalizedChild === 'CON_DAU' ||
    normalizedChild === 'CON_RE'
  ) {
    return {
      contextKind: 'SPOUSE_FAMILY',
      step2Label: '2. Xác minh hôn phối',
      sectionTitle:
        'Bước 2: Xác thực 3 lớp quan hệ hôn phối để Ban Quản trị đối chiếu',
      layer1Label: 'Lớp 1 — Vợ/Chồng trong họ & Gia đình bên vợ/chồng',
      layer1Placeholder:
        'Nhập họ tên Vợ/Chồng trong họ, năm kết hôn, và họ tên Bố/Mẹ vợ (hoặc Bố/Mẹ chồng)...',
      layer1MissingError:
        'Bác vui lòng nhập Lớp 1 xác minh (họ tên Vợ/Chồng trong họ và Bố/Mẹ vợ hoặc chồng).',
      layer2Label: 'Lớp 2 — Chi phái bên vợ/chồng & Quê quán / Nơi cư trú',
      layer2Placeholder:
        'Nhập tên Chi/Phái của gia đình bên vợ/chồng, quê quán hoặc nơi gia đình đang sinh sống...',
      layer2MissingError:
        'Bác vui lòng nhập Lớp 2 xác minh (tên Chi/Phái bên vợ/chồng hoặc nơi cư trú).',
      layer3Label: 'Lớp 3 — Người thân trong họ bảo lãnh & Lời nhắn xác minh',
      layer3Placeholder:
        'Ghi tên anh/chị/em bên vợ/chồng hoặc người trong họ có thể xác nhận...',
      layer3MissingError:
        'Bác vui lòng nhập Lớp 3 xác minh (người bảo lãnh bên vợ/chồng hoặc lời nhắn xác minh).',
      step3SummaryLabel: '3 lớp thông tin hôn phối',
    };
  }

  if (normalizedLink === 'MATERNAL') {
    return {
      contextKind: 'MATERNAL',
      step2Label: '2. 3 lớp bên ngoại',
      sectionTitle:
        'Bước 2: Xác thực 3 lớp quan hệ bên ngoại để Ban Quản trị đối chiếu',
      layer1Label: 'Lớp 1 — Quan hệ bên ngoại & Tiền nhân phía Mẹ',
      layer1Placeholder:
        'Nhập họ tên Mẹ đẻ, Ông/Bà ngoại hoặc ngày giỗ tổ bên ngoại...',
      layer1MissingError:
        'Bác vui lòng nhập Lớp 1 xác minh (họ tên Mẹ, Ông/Bà ngoại hoặc ngày giỗ bên ngoại).',
      layer2Label: 'Lớp 2 — Chi phái bên ngoại & Quê quán / Nơi cư trú',
      layer2Placeholder:
        'Nhập tên Chi/Phái bên ngoại, quê quán gốc hoặc nơi gia đình đang sinh sống...',
      layer2MissingError:
        'Bác vui lòng nhập Lớp 2 xác minh (tên Chi/Phái bên ngoại hoặc quê quán).',
      layer3Label: 'Lớp 3 — Người bảo lãnh trong họ & Lời nhắn xác minh',
      layer3Placeholder:
        'Ghi tên người thân bên ngoại có thể xác nhận hoặc lời nhắn gửi Hội đồng gia tộc...',
      layer3MissingError:
        'Bác vui lòng nhập Lớp 3 xác minh (người bảo lãnh trong họ hoặc lời nhắn xác minh).',
      step3SummaryLabel: '3 lớp thông tin bên ngoại',
    };
  }

  if (
    normalizedLink === 'GUARDIAN' ||
    normalizedChild === 'CON_NUOI' ||
    normalizedChild === 'CON_DO_DAU'
  ) {
    return {
      contextKind: 'GUARDIAN',
      step2Label: '2. 3 lớp xác minh',
      sectionTitle:
        'Bước 2: Xác thực 3 lớp quan hệ nuôi dưỡng / giám hộ để Ban Quản trị đối chiếu',
      layer1Label: 'Lớp 1 — Cha/Mẹ nuôi hoặc Người đỡ đầu trong họ',
      layer1Placeholder:
        'Nhập họ tên Cha/Mẹ nuôi, người đỡ đầu hoặc bối cảnh gắn kết với gia đình...',
      layer1MissingError:
        'Bác vui lòng nhập Lớp 1 xác minh (họ tên Cha/Mẹ nuôi hoặc người đỡ đầu).',
      layer2Label: 'Lớp 2 — Chi phái & Quê quán / Nơi cư trú',
      layer2Placeholder:
        'Nhập tên Chi/Phái, quê quán hoặc nơi gia đình đang sinh sống...',
      layer2MissingError:
        'Bác vui lòng nhập Lớp 2 xác minh (tên Chi/Phái hoặc nơi cư trú).',
      layer3Label: 'Lớp 3 — Người bảo lãnh trong họ & Lời nhắn xác minh',
      layer3Placeholder:
        'Ghi tên người thân trong họ có thể xác nhận hoặc lời nhắn gửi Hội đồng gia tộc...',
      layer3MissingError:
        'Bác vui lòng nhập Lớp 3 xác minh (người bảo lãnh trong họ hoặc lời nhắn xác minh).',
      step3SummaryLabel: '3 lớp thông tin xác minh',
    };
  }

  return {
    contextKind: 'PATERNAL',
    step2Label: '2. 3 lớp gia mật',
    sectionTitle: 'Bước 2: Xác thực 3 lớp gia mật để Ban Quản trị đối chiếu',
    layer1Label: 'Lớp 1 — Huyết thống & Tiền nhân trực hệ',
    layer1Placeholder:
      'Nhập họ tên Cha, Mẹ, Ông nội hoặc ngày giỗ tổ của gia đình...',
    layer1MissingError:
      'Bác vui lòng nhập Lớp 1 gia mật (họ tên Cha, Mẹ, Ông nội hoặc ngày giỗ tổ).',
    layer2Label: 'Lớp 2 — Chi phái & Quê quán / Nơi cư trú',
    layer2Placeholder:
      'Nhập tên Chi/Phái, quê quán gốc hoặc nơi gia đình đang sinh sống...',
    layer2MissingError:
      'Bác vui lòng nhập Lớp 2 gia mật (tên Chi/Phái hoặc quê quán).',
    layer3Label: 'Lớp 3 — Người bảo lãnh trong họ & Lời nhắn xác minh',
    layer3Placeholder:
      'Ghi tên người thân trong họ có thể xác nhận hoặc lời nhắn gửi Hội đồng gia tộc...',
    layer3MissingError:
      'Bác vui lòng nhập Lớp 3 gia mật (người bảo lãnh trong họ hoặc lời nhắn xác minh).',
    step3SummaryLabel: '3 lớp gia mật',
  };
};

const ClaimMemberWizard = ({
  tenantId: propTenantId = '',
  tenantName: propTenantName = '',
  linkType = '',
  isMultiHome = false,
  onMemberSelect,
  onTenantSelect,
  value = {},
  onChange,
  onFocusZone,
  disabled = false,
  errors = {},
}) => {
  const [internalTenant, setInternalTenant] = useState(null);
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantResults, setTenantResults] = useState([]);
  const [tenantSearching, setTenantSearching] = useState(false);
  const tenantTimerRef = useRef(null);

  const activeTenantId = propTenantId || internalTenant?.id || '';
  const activeTenantName = propTenantName || internalTenant?.name || '';

  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchTimerRef = useRef(null);

  const selectedMember = value?.claimed_member_summary || null;
  const selectedMemberId = value?.claimed_member_id || selectedMember?.id || '';
  const gender = value?.gender || 'NAM';
  const verification = value?.claim_verification || {
    layer1_lineage: '',
    layer2_branch_origin: '',
    layer3_guarantor_note: '',
  };

  const prompts = resolveVerificationPrompts({
    linkType,
    childType: selectedMember?.child_type || '',
  });

  useEffect(() => {
    if (propTenantId || internalTenant) return;
    const q = String(tenantQuery || '').trim();
    if (q.length < 2) {
      setTenantResults([]);
      return;
    }
    if (tenantTimerRef.current) clearTimeout(tenantTimerRef.current);
    tenantTimerRef.current = setTimeout(async () => {
      setTenantSearching(true);
      try {
        const res = await apiClient.get('/public/tenants/search', {
          params: { q },
          headers: { Authorization: '' },
        });
        setTenantResults(res.data?.data || []);
      } catch (_) {
        setTenantResults([]);
      } finally {
        setTenantSearching(false);
      }
    }, 400);

    return () => clearTimeout(tenantTimerRef.current);
  }, [tenantQuery, propTenantId, internalTenant]);

  useEffect(() => {
    setResults([]);
    setSearchError('');
  }, [activeTenantId]);

  const executeSearch = useCallback(
    async (keyword) => {
      const q = String(keyword || '').trim();
      if (!activeTenantId || q.length < 2) {
        setResults([]);
        setSearchError('');
        return;
      }

      setSearching(true);
      setSearchError('');

      try {
        const res = await apiClient.get(
          `/public/tenants/${encodeURIComponent(activeTenantId)}/members/claim-search`,
          {
            params: { q },
            headers: { Authorization: '' },
          }
        );
        const list = res.data?.data || [];
        setResults(Array.isArray(list) ? list : []);
        if (Array.isArray(list) && list.length === 0) {
          setSearchError(
            'Không tìm thấy thành viên chính thức nào khớp từ khóa. Bác có thể thử tên khác hoặc chọn "Khai báo mới 21 trường".'
          );
        }
      } catch (err) {
        const status = err?.response?.status;
        if (status === 429) {
          setSearchError(
            err?.response?.data?.message ||
              'Bác thao tác tra cứu hơi nhanh. Vui lòng chờ 1 phút rồi thử lại.'
          );
        } else {
          setSearchError(
            err?.response?.data?.message ||
              'Không tra cứu được danh sách thành viên lúc này.'
          );
        }
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [activeTenantId]
  );

  useEffect(() => {
    if (selectedMemberId) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      executeSearch(searchQuery);
    }, 450);

    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery, selectedMemberId, executeSearch]);

  const emitChange = (patch) => {
    if (!onChange) return;
    onChange({
      ...value,
      ...patch,
    });
  };

  const handleSelectMember = (member) => {
    onFocusZone?.();
    onMemberSelect?.(member);
    emitChange({
      claim_mode: 'CLAIM_EM',
      claimed_member_id: member.id,
      claimed_member_summary: member,
      full_name: member.full_name,
      alias: member.alias || '',
      gender: gender || 'NAM',
      birth_year: member.birth_year || undefined,
      branch_name: member.branch_name || '',
      father_name: member.father_name || '',
      mother_name: member.mother_name || '',
      generation: member.generation || undefined,
      claim_verification: {
        layer1_lineage: verification.layer1_lineage || '',
        layer2_branch_origin: verification.layer2_branch_origin || '',
        layer3_guarantor_note: verification.layer3_guarantor_note || '',
      },
    });
  };

  const handleResetSelection = () => {
    onFocusZone?.();
    emitChange({
      claim_mode: 'CLAIM_EM',
      claimed_member_id: '',
      claimed_member_summary: null,
    });
  };

  const handleLayerChange = (layerKey, text) => {
    onFocusZone?.();
    const nextVerification = {
      ...verification,
      [layerKey]: text,
    };
    emitChange({
      claim_mode: 'CLAIM_EM',
      claim_verification: nextVerification,
      ...(layerKey === 'layer3_guarantor_note' ? { note: text } : {}),
    });
  };

  const isAllLayersComplete =
    Boolean(selectedMemberId) &&
    Boolean(String(verification.layer1_lineage || '').trim()) &&
    Boolean(String(verification.layer2_branch_origin || '').trim()) &&
    Boolean(String(verification.layer3_guarantor_note || '').trim());

  return (
    <div className="space-y-5">
      {/* Thanh tiến trình 3 bước trực quan */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-100 p-1.5 text-center text-xs font-black">
        <div
          className={`rounded-xl py-2 transition ${
            !selectedMemberId
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-emerald-700'
          }`}
        >
          1. Tìm trên cây
        </div>
        <div
          className={`rounded-xl py-2 transition ${
            selectedMemberId && !isAllLayersComplete
              ? 'bg-white text-emerald-700 shadow-sm'
              : isAllLayersComplete
                ? 'text-emerald-700'
                : 'text-slate-400'
          }`}
        >
          {prompts.step2Label}
        </div>
        <div
          className={`rounded-xl py-2 transition ${
            isAllLayersComplete
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400'
          }`}
        >
          3. Xác nhận
        </div>
      </div>

      {/* BƯỚC 0 (Nếu chưa chọn dòng họ từ bên ngoài): TÌM DÒNG HỌ */}
      {!propTenantId && (
        <div className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="text-xs font-black uppercase tracking-wider text-slate-700">
            Chọn dòng họ cần tra cứu <span className="text-rose-500">*</span>
          </label>
          {!internalTenant ? (
            <>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  disabled={disabled}
                  value={tenantQuery}
                  onChange={(e) => setTenantQuery(e.target.value)}
                  placeholder="Gõ tên dòng họ (tối thiểu 2 ký tự)..."
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-9 text-sm text-slate-900 outline-none focus:border-emerald-500"
                />
                {tenantSearching && (
                  <Loader2
                    size={16}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
                  />
                )}
              </div>
              {tenantResults.length > 0 && (
                <div className="max-h-48 space-y-1.5 overflow-y-auto">
                  {tenantResults.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setInternalTenant(t);
                        onTenantSelect?.(t);
                      }}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-800 hover:border-emerald-300 hover:bg-emerald-50"
                    >
                      <Landmark size={16} className="text-emerald-600" />
                      <span>{t.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-900">
              <span>{internalTenant.name}</span>
              <button
                type="button"
                onClick={() => {
                  setInternalTenant(null);
                  handleResetSelection();
                }}
                className="text-xs font-black text-emerald-700 underline"
              >
                Đổi họ
              </button>
            </div>
          )}
        </div>
      )}

      {/* BƯỚC 1: TÌM THÀNH VIÊN TRÊN CÂY */}
      {!selectedMemberId ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="space-y-1">
            <label className="text-sm font-black text-slate-800">
              Bước 1: Tìm tên của bác trên cây gia phả{' '}
              {activeTenantName ? `(${activeTenantName})` : ''}{' '}
              <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs font-medium text-slate-500">
              Gõ tối thiểu 2 chữ cái họ tên hoặc tên tự để tra cứu thành viên
              chính thức đã có trên sổ họ.
            </p>
          </div>

          <div className="relative">
            <Search
              size={18}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              disabled={disabled || !activeTenantId}
              onFocus={() => onFocusZone?.()}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTenantId
                  ? 'Ví dụ: Nguyễn Văn An...'
                  : 'Vui lòng chọn dòng họ trước...'
              }
              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-10 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
            />
            {searching && (
              <Loader2
                size={18}
                className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
              />
            )}
          </div>

          {errors.claimed_member_id && (
            <p className="text-xs font-bold text-rose-600">
              {errors.claimed_member_id}
            </p>
          )}

          {searchError && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{searchError}</span>
            </div>
          )}

          {results.length > 0 && (
            <div className="max-h-72 space-y-2.5 overflow-y-auto pr-1">
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleSelectMember(m)}
                  className="w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-black text-slate-900">
                        {m.full_name}
                        {m.alias ? (
                          <span className="ml-2 text-xs font-bold text-slate-500">
                            (Tự/Hiệu: {m.alias})
                          </span>
                        ) : null}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                        {m.generation != null && (
                          <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-indigo-700">
                            Đời thứ {m.generation}
                          </span>
                        )}
                        {m.branch_name && (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-slate-700">
                            Chi: {m.branch_name}
                          </span>
                        )}
                        {m.birth_year && (
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-slate-700">
                            Sinh năm {m.birth_year}
                          </span>
                        )}
                        {m.child_type && CHILD_TYPE_LABELS[m.child_type] && (
                          <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-amber-800">
                            {CHILD_TYPE_LABELS[m.child_type]}
                          </span>
                        )}
                      </div>
                      {(m.father_name || m.mother_name) && (
                        <p className="mt-1.5 text-xs font-medium text-slate-500">
                          {m.father_name ? `Cha: ${m.father_name}` : ''}
                          {m.father_name && m.mother_name ? ' • ' : ''}
                          {m.mother_name ? `Mẹ: ${m.mother_name}` : ''}
                        </p>
                      )}
                    </div>

                    <span className="shrink-0 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white">
                      Chọn hồ sơ
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* BƯỚC 2 & BƯỚC 3: HIỂN THỊ HỒ SƠ ĐÃ CHỌN + 3 LỚP XÁC MINH */
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 text-emerald-950">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                  <UserCheck size={20} />
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-emerald-700">
                    Hồ sơ trên cây xin nhận
                  </p>
                  <p className="text-lg font-black text-slate-900">
                    {selectedMember?.full_name}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-600">
                    {[
                      selectedMember?.generation != null
                        ? `Đời thứ ${selectedMember.generation}`
                        : null,
                      selectedMember?.branch_name
                        ? `Chi: ${selectedMember.branch_name}`
                        : null,
                      selectedMember?.birth_year
                        ? `Sinh năm ${selectedMember.birth_year}`
                        : null,
                      selectedMember?.child_type &&
                      CHILD_TYPE_LABELS[selectedMember.child_type]
                        ? CHILD_TYPE_LABELS[selectedMember.child_type]
                        : null,
                      selectedMember?.father_name
                        ? `Cha: ${selectedMember.father_name}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' • ') || 'Thành viên chính thức trên cây'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={disabled}
                onClick={handleResetSelection}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
              >
                <RotateCcw size={14} />
                Chọn lại
              </button>
            </div>
          </div>

          {/* Xác nhận giới tính */}
          <div className="space-y-1">
            <label className="text-xs font-black uppercase tracking-wider text-slate-600">
              Xác nhận giới tính <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => emitChange({ gender: opt.value })}
                  className={`rounded-xl border py-2.5 text-sm font-black transition ${
                    gender === opt.value
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* 3 LỚP XÁC MINH THEO NGỮ CẢNH QUAN HỆ */}
          <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div className="flex items-center gap-2 text-indigo-900">
              <ShieldCheck size={18} className="text-indigo-600" />
              <h4 className="text-sm font-black">
                {prompts.sectionTitle}
              </h4>
            </div>

            {/* Lớp 1 */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                <Users size={14} className="text-indigo-600" />
                {prompts.layer1Label}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                value={verification.layer1_lineage || ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) =>
                  handleLayerChange('layer1_lineage', e.target.value)
                }
                placeholder={prompts.layer1Placeholder}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              {errors.layer1_lineage && (
                <p className="text-xs font-bold text-rose-600">
                  {errors.layer1_lineage}
                </p>
              )}
            </div>

            {/* Lớp 2 */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                <MapPin size={14} className="text-indigo-600" />
                {prompts.layer2Label}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={disabled}
                value={verification.layer2_branch_origin || ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) =>
                  handleLayerChange('layer2_branch_origin', e.target.value)
                }
                placeholder={prompts.layer2Placeholder}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              {errors.layer2_branch_origin && (
                <p className="text-xs font-bold text-rose-600">
                  {errors.layer2_branch_origin}
                </p>
              )}
            </div>

            {/* Lớp 3 */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                <MessageSquareText size={14} className="text-indigo-600" />
                {prompts.layer3Label}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                disabled={disabled}
                value={verification.layer3_guarantor_note || ''}
                onFocus={() => onFocusZone?.()}
                onChange={(e) =>
                  handleLayerChange('layer3_guarantor_note', e.target.value)
                }
                placeholder={prompts.layer3Placeholder}
                className="min-h-[84px] w-full resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
              {errors.layer3_guarantor_note && (
                <p className="text-xs font-bold text-rose-600">
                  {errors.layer3_guarantor_note}
                </p>
              )}
            </div>
          </div>

          {/* BƯỚC 3: THẺ XÁC NHẬN SẴN SÀNG */}
          {isAllLayersComplete && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 size={18} className="shrink-0 text-emerald-600" />
              <span>
                Bước 3: Đã hoàn tất {prompts.step3SummaryLabel} cho hồ sơ{' '}
                <strong>{selectedMember?.full_name}</strong>.{' '}
                {isMultiHome
                  ? 'Bác bấm nút "Gửi hồ sơ xin gia nhập dòng họ" bên dưới để hoàn tất.'
                  : 'Bác tiếp tục hoàn thiện thông tin tài khoản bên dưới để rà soát và gửi đơn.'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export { ClaimMemberWizard, resolveVerificationPrompts };
export default ClaimMemberWizard;