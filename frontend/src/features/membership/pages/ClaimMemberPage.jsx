/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/ClaimMemberPage.jsx
 * DATETIME    : 2026-11-14T11:15:00+07:00
 * VERSION     : 2.3.0-MULTIHOME-UAT-BUG4-PROACTIVE-GUARD
 * DESCRIPTION : Trang Gia nhập dòng họ & Nhận diện nhân thân trên sổ họ:
 *               - Không hỏi lại SĐT, Email, Mật khẩu (kế thừa từ phiên đăng nhập).
 *               - Không gọi /auth/register; nộp về POST /api/membership/cases
 *                 (hoặc POST /api/membership/cases/:caseId/revision khi mode=revision).
 *               - Kiểm tra chủ động (proactive) ngay khi EEU chọn dòng họ đích qua
 *                 availableClans + GET /api/membership/eligibility?tenantId=...: nếu EEU đã gắn
 *                 member trong tenant đó hoặc đang có hồ sơ chờ duyệt thì chặn ngay từ Bước 1.
 *               - Phân tách rõ 3 chế độ theo URL query ?mode=:
 *                 1. Mặc định (không có mode=add-clan): Giữ nguyên dòng họ đang active của phiên
 *                    để user chưa có activeMemberId nhận hồ sơ (EM) hoặc khai 21 trường ngay tại họ đó.
 *                 2. mode=add-clan (Luồng C1 Multi-Home từ HeaderClanSwitcher): Mở bộ tìm kiếm
 *                    dòng họ công khai (GET /api/public/tenants/search?q= với Authorization: '')
 *                    để chọn họ B, sau đó tra cứu EM hoặc khai báo 21 trường.
 *                 3. mode=revision&caseId=...: Tải dữ liệu hồ sơ cũ kèm review_note và gửi bổ sung.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T11:40:00+07:00 (v1.1.0-CLAIM-MEMBER-WIZARD-AMEND-FULL): Bản gốc.
 * - 2026-11-13T10:00:00+07:00 (v2.0.0-MULTIHOME-AMEND02-V15-LAT3): Tích hợp C1 Multi-Home.
 * - 2026-11-13T10:30:00+07:00 (v2.1.0-MULTIHOME-AMEND02-V15-LAT3):
 *   + Sửa mặc định modeParam về rỗng (''); chỉ bật tìm kiếm chọn họ khác khi mode=add-clan.
 *   + Tự động giữ dòng họ hiện tại của phiên khi truy cập /membership/claim mặc định.
 * - 2026-11-13T15:34:00+07:00 (v2.2.0-MULTIHOME-UAT-BUG1-CONTEXT-PROMPTS):
 *   + Truyền linkType và isMultiHome={true} xuống ClaimMemberWizard để hiển thị 3 câu hỏi
 *     xác minh theo đúng ngữ cảnh quan hệ (Nhà dâu/rể, Họ ngoại, Nuôi dưỡng, Trực hệ).
 *   + Tự động chuyển linkType sang SPOUSE_FAMILY / GUARDIAN khi chọn hồ sơ CON_DAU / CON_RE / CON_NUOI.
 *   + Không ghi đè câu trả lời Lớp 1 vào father_name khi ở ngữ cảnh SPOUSE_FAMILY.
 * - 2026-11-13T18:05:00+07:00 (v2.2.1-MULTIHOME-UAT-BUG3-RELATIONSHIP):
 *   + Đóng gói child_type & temp_relationship vào registration_profile cho nhánh NEW_PROFILE_21.
 * - 2026-11-14T11:15:00+07:00 (v2.3.0-MULTIHOME-UAT-BUG4-PROACTIVE-GUARD):
 *   + Fix UAT Bug 4: Kiểm tra chủ động qua membershipApi.checkEligibility & availableClans ngay khi
 *     EEU chọn dòng họ; hiển thị nhãn trạng thái trên kết quả tìm kiếm và chặn sớm trước Bước 2.
 * =============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  Loader2,
  Landmark,
  CheckCircle2,
  ArrowLeft,
  AlertCircle,
  PlusCircle,
  ArrowRightLeft,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../../context/AuthContext';
import apiClient from '../../../lib/apiClient';
import { membershipApi } from '../api/membershipApi';
import ClaimMemberWizard, { resolveVerificationPrompts } from '../components/ClaimMemberWizard';
import RegistrationProfileForm from '../components/RegistrationProfileForm';
import {
  LINK_TYPE_LABELS,
  ELDER_MEMBERSHIP_MESSAGES,
} from '../constants/membershipLabels';

const C1_LINK_TYPES = [
  'SPOUSE_FAMILY',
  'MATERNAL',
  'PRIMARY_PATERNAL',
  'DESCENDANT_FAMILY',
  'GUARDIAN',
  'OTHER',
];

export const ClaimMemberPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, activeContext, availableClans, refreshContext, switchContext, isSwitchingContext } = useAuth();

  const caseId = searchParams.get('caseId');
  const modeParam = searchParams.get('mode') || '';
  const isAddClanMode = modeParam === 'add-clan';
  const isRevisionMode = modeParam === 'revision' && Boolean(caseId);

  const currentSessionTenantId =
    activeContext?.activeTenantId ||
    user?.activeTenantId ||
    user?.tenantId ||
    user?.tenant_id ||
    '';
  const currentSessionClan = (availableClans || []).find(
    (c) => c.tenantId === currentSessionTenantId
  );
  const currentSessionTenantName =
    currentSessionClan?.clanName ||
    user?.clanName ||
    user?.tenant?.name ||
    'Dòng họ hiện tại';
  const currentSessionTenantSlug =
    currentSessionClan?.clanSlug || user?.tenant?.slug || '';

  // Dòng họ đích: nếu không phải mode=add-clan và không phải revision, mặc định dùng dòng họ hiện tại của phiên
  const [tenantQuery, setTenantQuery] = useState('');
  const [tenantResults, setTenantResults] = useState([]);
  const [tenantLoading, setTenantLoading] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState(() => {
    if (!isAddClanMode && !isRevisionMode && currentSessionTenantId) {
      return {
        id: currentSessionTenantId,
        name: currentSessionTenantName,
        slug: currentSessionTenantSlug,
      };
    }
    return null;
  });
  const [linkType, setLinkType] = useState(
    isAddClanMode ? 'SPOUSE_FAMILY' : 'PRIMARY_PATERNAL'
  );
  const searchTimerRef = useRef(null);

  // Đồng bộ lại selectedTenant khi đổi mode trên URL hoặc sau khi loadUser hoàn tất
  useEffect(() => {
    if (isRevisionMode) return;
    if (isAddClanMode) {
      setSelectedTenant(null);
      setTenantQuery('');
      setTenantResults([]);
      setLinkType('SPOUSE_FAMILY');
      return;
    }
    if (currentSessionTenantId) {
      setSelectedTenant({
        id: currentSessionTenantId,
        name: currentSessionTenantName,
        slug: currentSessionTenantSlug,
      });
      setLinkType('PRIMARY_PATERNAL');
    }
  }, [
    isAddClanMode,
    isRevisionMode,
    currentSessionTenantId,
    currentSessionTenantName,
    currentSessionTenantSlug,
  ]);

  // Bước 2: Phân nhánh 'CLAIM_EM' vs 'NEW_PROFILE_21'
  const [entryMode, setEntryMode] = useState('CLAIM_EM');
  const [profileDraft, setProfileDraft] = useState({
    full_name: user?.name || '',
    alias: '',
    gender: 'NAM',
    birth_day: '',
    birth_month: '',
    birth_year: '',
    birth_place: '',
    is_alive: true,
    death_year: '',
    generation: '',
    member_role: 'THANH_VIEN',
    branch_name: '',
    father_name: '',
    mother_name: '',
    grandfather_name: '',
    grandmother_name: '',
    address: '',
    note: '',
    temp_relationship: 'CON_DE',
    social_profiles: { zalo: '', facebook: '' },
    proof_documents: [],
    claimed_member_id: '',
    claimed_member_summary: null,
    claim_verification: {
      layer1_lineage: '',
      layer2_branch_origin: '',
      layer3_guarantor_note: '',
    },
  });

  const [profileErrors, setProfileErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingRevision, setLoadingRevision] = useState(false);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibilityBlock, setEligibilityBlock] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');

  // Bản đồ các dòng họ EEU đã tham gia hoặc đang có hồ sơ mở
  const existingClanByTenantId = React.useMemo(() => {
    const map = new Map();
    for (const c of availableClans || []) {
      if (c?.tenantId) {
        map.set(c.tenantId, c);
      }
    }
    return map;
  }, [availableClans]);

  // Kiểm tra chủ động (proactive) ngay khi selectedTenant thay đổi
  useEffect(() => {
    if (isRevisionMode || !selectedTenant?.id) {
      setEligibilityBlock(null);
      return;
    }

    const localClan = existingClanByTenantId.get(selectedTenant.id);
    if (localClan && ['DA_DUYET', 'CHO_DUYET', 'DRAFT'].includes(localClan.status)) {
      const memberDisplay = localClan.memberName
        ? ` (hồ sơ: ${localClan.memberName})`
        : '';
      const isApproved = localClan.status === 'DA_DUYET';
      setEligibilityBlock({
        reasonCode: isApproved
          ? 'ALREADY_LINKED_TO_TENANT'
          : 'DUPLICATE_PENDING_CASE',
        linkStatus: localClan.status,
        memberId: localClan.memberId || null,
        memberName: localClan.memberName || null,
        caseId: localClan.caseId || null,
        tenantId: selectedTenant.id,
        clanName: selectedTenant.name,
        message: isApproved
          ? `Tài khoản của bác đã là thành viên của dòng họ ${selectedTenant.name}${memberDisplay}. Mỗi tài khoản chỉ được gắn với một thành viên trong một dòng họ.`
          : `Tài khoản của bác đã có hồ sơ xin gia nhập dòng họ ${selectedTenant.name}${memberDisplay} đang chờ xử lý.`,
      });
    } else {
      setEligibilityBlock(null);
    }

    let cancelled = false;
    setCheckingEligibility(true);
    membershipApi
      .checkEligibility(selectedTenant.id)
      .then((res) => {
        if (cancelled || !res) return;
        if (res.eligible === false) {
          setEligibilityBlock(res);
        } else {
          setEligibilityBlock(null);
        }
      })
      .catch(() => {
        // Giữ nguyên kết quả kiểm tra cục bộ nếu API tạm gián đoạn; BE vẫn chặn lúc submit
      })
      .finally(() => {
        if (!cancelled) setCheckingEligibility(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTenant?.id, selectedTenant?.name, isRevisionMode, existingClanByTenantId]);

  // Nạp dữ liệu hồ sơ cũ khi ở chế độ Revision (?caseId=...&mode=revision)
  useEffect(() => {
    if (!isRevisionMode || !caseId) return;

    let cancelled = false;
    setLoadingRevision(true);
    membershipApi
      .getMembershipStatus({ caseId })
      .then((data) => {
        if (cancelled || !data) return;
        const feedback = data.reviewNote || data.revisionRequest || '';
        if (feedback) {
          setRevisionFeedback(feedback);
        }
        if (data.tenantId) {
          setSelectedTenant({
            id: data.tenantId,
            name: data.tenantName || 'Dòng họ',
            slug: data.tenantSlug || '',
          });
        }
        if (data.linkType) {
          setLinkType(data.linkType);
        }

        const rp =
          data.registration_profile &&
          typeof data.registration_profile === 'object'
            ? data.registration_profile
            : data.caseMetadata?.registration_profile || {};

        if (rp.claim_mode === 'CLAIM_EM' || rp.claimed_member_id) {
          setEntryMode('CLAIM_EM');
        } else {
          setEntryMode('NEW_PROFILE_21');
        }

        setProfileDraft((prev) => ({
          ...prev,
          ...rp,
          temp_relationship:
            rp.child_type || rp.temp_relationship || prev.temp_relationship,
          claimed_member_summary:
            rp.claim_verification?.claimed_member_summary ||
            rp.claimed_member_summary ||
            prev.claimed_member_summary,
        }));
      })
      .catch((err) => {
        console.error('[ClaimMemberPage] Load revision error:', err);
        if (!cancelled) {
          setErrorMsg(
            err?.response?.data?.message ||
              'Không tải được dữ liệu hồ sơ cần chỉnh sửa.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRevision(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isRevisionMode, caseId]);

  // Chỉ tìm kiếm dòng họ khác khi mode=add-clan và chưa chọn dòng họ đích
  useEffect(() => {
    if (!isAddClanMode || isRevisionMode || selectedTenant) return;
    const q = String(tenantQuery || '').trim();
    if (q.length < 2) {
      setTenantResults([]);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      setTenantLoading(true);
      try {
        const res = await apiClient.get('/public/tenants/search', {
          params: { q },
          headers: { Authorization: '' },
        });
        const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
        setTenantResults(
          rawList
            .filter((t) => Boolean(t?.id))
            .map((t) => ({
              ...t,
              existingLink: existingClanByTenantId.get(t.id) || null,
            }))
        );
      } catch (_) {
        setTenantResults([]);
      } finally {
        setTenantLoading(false);
      }
    }, 400);

    return () => clearTimeout(searchTimerRef.current);
  }, [tenantQuery, isAddClanMode, isRevisionMode, selectedTenant]);

  const validateAndBuildPayload = () => {
    setProfileErrors({});
    setErrorMsg('');

    if (!selectedTenant?.id) {
      setErrorMsg('Bác vui lòng tìm và chọn dòng họ cần gia nhập trước.');
      return null;
    }

    if (!isRevisionMode && eligibilityBlock) {
      setErrorMsg(eligibilityBlock.message);
      return null;
    }

    if (entryMode === 'CLAIM_EM') {
      const emId = String(profileDraft.claimed_member_id || '').trim();
      const emSum = profileDraft.claimed_member_summary || {};
      const ver = profileDraft.claim_verification || {};
      const l1 = String(ver.layer1_lineage || '').trim();
      const l2 = String(ver.layer2_branch_origin || '').trim();
      const l3 = String(ver.layer3_guarantor_note || '').trim();
      const activePrompts = resolveVerificationPrompts({
        linkType,
        childType: emSum.child_type || '',
      });

      if (!emId) {
        const msg = 'Bác vui lòng tìm và chọn hồ sơ của mình trên cây gia phả.';
        setProfileErrors({ claimed_member_id: msg });
        setErrorMsg(msg);
        return null;
      }
      if (!l1) {
        const msg = activePrompts.layer1MissingError;
        setProfileErrors({ layer1_lineage: msg });
        setErrorMsg(msg);
        return null;
      }
      if (!l2) {
        const msg = activePrompts.layer2MissingError;
        setProfileErrors({ layer2_branch_origin: msg });
        setErrorMsg(msg);
        return null;
      }
      if (!l3) {
        const msg = activePrompts.layer3MissingError;
        setProfileErrors({ layer3_guarantor_note: msg });
        setErrorMsg(msg);
        return null;
      }

      const isSpouseContext = activePrompts.contextKind === 'SPOUSE_FAMILY';

      return {
        tenantId: selectedTenant.id,
        clanName: selectedTenant.name,
        link_type: linkType,
        claimed_member_id: emId,
        registration_profile: {
          claim_mode: 'CLAIM_EM',
          claimed_member_id: emId,
          full_name: emSum.full_name || profileDraft.full_name || user?.name,
          alias: emSum.alias || undefined,
          gender: profileDraft.gender || 'NAM',
          birth_year: emSum.birth_year ? Number(emSum.birth_year) : undefined,
          branch_name: emSum.branch_name || l2,
          father_name: isSpouseContext
            ? emSum.father_name || undefined
            : emSum.father_name || l1,
          mother_name: emSum.mother_name || undefined,
          generation:
            emSum.generation != null ? Number(emSum.generation) : undefined,
          note: l3,
          claim_verification: {
            claimed_member_summary: emSum,
            verification_context: activePrompts.contextKind,
            layer1_lineage: l1,
            layer2_branch_origin: l2,
            layer3_guarantor_note: l3,
          },
        },
      };
    }

    // Nhánh 2: Khai báo mới 21 trường
    const fName = String(profileDraft.full_name || '').trim();
    const faName = String(profileDraft.father_name || '').trim();
    const noteText = String(profileDraft.note || '').trim();

    if (!fName) {
      const msg = 'Bác vui lòng nhập họ và tên khai sinh.';
      setProfileErrors({ full_name: msg });
      setErrorMsg(msg);
      return null;
    }
    if (!faName) {
      const msg = 'Bác vui lòng nhập họ và tên Cha để Ban Quản trị đối chiếu.';
      setProfileErrors({ father_name: msg });
      setErrorMsg(msg);
      return null;
    }
    if (!noteText) {
      const msg = 'Bác vui lòng nhập lời nhắn gửi Ban Quản trị xác minh.';
      setProfileErrors({ note: msg });
      setErrorMsg(msg);
      return null;
    }

    return {
      tenantId: selectedTenant.id,
      clanName: selectedTenant.name,
      link_type: linkType,
      registration_profile: {
        claim_mode: 'NEW_PROFILE_21',
        child_type: String(profileDraft.temp_relationship || 'CON_DE').trim(),
        temp_relationship: String(profileDraft.temp_relationship || 'CON_DE').trim(),
        full_name: fName,
        alias: String(profileDraft.alias || '').trim() || undefined,
        gender: profileDraft.gender || 'NAM',
        birth_day:
          profileDraft.birth_day !== '' && profileDraft.birth_day != null
            ? Number(profileDraft.birth_day)
            : undefined,
        birth_month:
          profileDraft.birth_month !== '' && profileDraft.birth_month != null
            ? Number(profileDraft.birth_month)
            : undefined,
        birth_year:
          profileDraft.birth_year !== '' && profileDraft.birth_year != null
            ? Number(profileDraft.birth_year)
            : undefined,
        birth_place: String(profileDraft.birth_place || '').trim() || undefined,
        is_alive: profileDraft.is_alive !== false,
        death_year:
          profileDraft.is_alive === false &&
          profileDraft.death_year !== '' &&
          profileDraft.death_year != null
            ? Number(profileDraft.death_year)
            : undefined,
        generation:
          profileDraft.generation !== '' && profileDraft.generation != null
            ? Number(profileDraft.generation)
            : undefined,
        member_role: profileDraft.member_role || 'THANH_VIEN',
        branch_name: String(profileDraft.branch_name || '').trim() || undefined,
        father_name: faName,
        mother_name: String(profileDraft.mother_name || '').trim() || undefined,
        grandfather_name:
          String(profileDraft.grandfather_name || '').trim() || undefined,
        grandmother_name:
          String(profileDraft.grandmother_name || '').trim() || undefined,
        address: String(profileDraft.address || '').trim() || undefined,
        note: noteText,
        proof_documents: Array.isArray(profileDraft.proof_documents)
          ? profileDraft.proof_documents
          : [],
        social_profiles:
          profileDraft.social_profiles &&
          typeof profileDraft.social_profiles === 'object'
            ? profileDraft.social_profiles
            : {},
      },
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = validateAndBuildPayload();
    if (!payload) return;

    try {
      setIsSubmitting(true);
      let res;
      if (isRevisionMode && caseId) {
        res = await membershipApi.submitRevision(caseId, payload);
        toast.success('Đã gửi hồ sơ bổ sung thành công!');
      } else {
        res = await membershipApi.submitClaim(payload);
        toast.success('Đã gửi hồ sơ xin gia nhập dòng họ!');
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(
            ELDER_MEMBERSHIP_MESSAGES.CLAIM_SUBMITTED
          );
          utterance.lang = 'vi-VN';
          window.speechSynthesis.speak(utterance);
        }
      }

      if (typeof refreshContext === 'function') {
        await refreshContext();
      }

      const targetCaseId = res?.data?.caseId || caseId || '';
      navigate(
        targetCaseId
          ? `/membership/status?caseId=${encodeURIComponent(targetCaseId)}`
          : `/membership/status?tenantId=${encodeURIComponent(selectedTenant.id)}`
      );
    } catch (err) {
      console.error('[ClaimMemberPage] Submit error:', err);
      const msg =
        err?.response?.data?.message ||
        'Không thể gửi hồ sơ gia nhập dòng họ. Bác vui lòng thử lại.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingRevision) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
        <p className="mt-3 text-sm font-bold text-slate-600">
          Đang tải thông tin hồ sơ cần bổ sung...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto my-6 max-w-3xl px-4 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-emerald-600">
              {isRevisionMode
                ? 'Bổ sung hồ sơ gia nhập'
                : isAddClanMode
                  ? 'Đa dòng họ (Multi-Home C1)'
                  : 'Xác nhận hồ sơ thành viên'}
            </span>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              {isRevisionMode
                ? 'Chỉnh sửa hồ sơ theo góp ý'
                : isAddClanMode
                  ? 'Gia nhập dòng họ khác'
                  : 'Nhận hồ sơ trên sổ họ'}
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Tài khoản <strong>{user?.phone || user?.email}</strong> được giữ
              nguyên thông tin định danh hiện tại.
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/op')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft size={15} />
            Quay lại
          </button>
        </div>

        {revisionFeedback && (
          <div className="mb-6 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-950">
            <p className="text-xs font-black uppercase tracking-wider text-amber-800">
              Góp ý từ Ban Quản trị dòng họ:
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-bold">
              {revisionFeedback}
            </p>
          </div>
        )}

        {errorMsg && (
          <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-800">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {/* BƯỚC 1: THÔNG TIN DÒNG HỌ (CHỈ BẬT TÌM HỌ KHÁC KHI mode=add-clan) */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
                {isAddClanMode
                  ? 'Bước 1: Chọn dòng họ khác muốn gia nhập'
                  : 'Dòng họ đang thực hiện nhận hồ sơ'}
              </h2>
              {!isAddClanMode && !isRevisionMode && (
                <button
                  type="button"
                  onClick={() => navigate('/membership/claim?mode=add-clan')}
                  className="inline-flex items-center gap-1 text-xs font-black text-emerald-700 hover:underline"
                >
                  <PlusCircle size={14} />
                  Gia nhập dòng họ khác?
                </button>
              )}
            </div>

            {isAddClanMode && !selectedTenant ? (
              <div className="space-y-3">
                <div className="relative">
                  <Search
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={tenantQuery}
                    onChange={(e) => {
                      setTenantQuery(e.target.value);
                      setErrorMsg('');
                    }}
                    placeholder="Gõ tên dòng họ cần gia nhập (tối thiểu 2 ký tự)..."
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-10 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                  {tenantLoading && (
                    <Loader2
                      size={18}
                      className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-emerald-600"
                    />
                  )}
                </div>

                {tenantResults.length > 0 && (
                  <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                    {tenantResults.map((t) => {
                      const linkInfo = t.existingLink;
                      const isAlreadyMember = linkInfo?.status === 'DA_DUYET';
                      const isPending =
                        linkInfo?.status === 'CHO_DUYET' ||
                        linkInfo?.status === 'DRAFT';

                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTenant(t);
                            setErrorMsg('');
                          }}
                          className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left shadow-sm transition ${
                            isAlreadyMember
                              ? 'border-amber-200 bg-amber-50/60 hover:border-amber-300'
                              : isPending
                                ? 'border-blue-200 bg-blue-50/60 hover:border-blue-300'
                                : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                                isAlreadyMember
                                  ? 'bg-amber-100 text-amber-700'
                                  : isPending
                                    ? 'bg-blue-100 text-blue-700'
                                    : 'bg-emerald-50 text-emerald-600'
                              }`}
                            >
                              <Landmark size={20} />
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">
                                {t.name}
                              </p>
                              {t.slug && (
                                <p className="text-xs text-slate-500">
                                  Mã định danh: {t.slug}
                                </p>
                              )}
                              {isAlreadyMember && (
                                <p className="mt-0.5 text-xs font-bold text-amber-800">
                                  Đã gắn hồ sơ:{' '}
                                  {linkInfo.memberName || 'Thành viên chính thức'}
                                </p>
                              )}
                            </div>
                          </div>
                          <span
                            className={`rounded-xl px-3 py-1.5 text-xs font-black ${
                              isAlreadyMember
                                ? 'bg-amber-100 text-amber-900'
                                : isPending
                                  ? 'bg-blue-100 text-blue-900'
                                  : 'bg-emerald-600 text-white'
                            }`}
                          >
                            {isAlreadyMember
                              ? 'Đã là thành viên'
                              : isPending
                                ? 'Đang chờ duyệt'
                                : 'Chọn họ này'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : selectedTenant ? (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                    {isAddClanMode ? 'Dòng họ xin gia nhập' : 'Dòng họ hiện tại'}
                  </p>
                  <p className="text-lg font-black text-slate-900">
                    {selectedTenant.name}
                  </p>
                </div>
                {isAddClanMode && !isRevisionMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTenant(null);
                      setProfileDraft((prev) => ({
                        ...prev,
                        claimed_member_id: '',
                        claimed_member_summary: null,
                      }));
                    }}
                    className="rounded-xl border border-emerald-300 bg-white px-3 py-1.5 text-xs font-black text-emerald-800 hover:bg-emerald-100"
                  >
                    Đổi dòng họ
                  </button>
                )}
              </div>
            ) : null}

            {/* Chọn mối quan hệ liên kết với dòng họ đích */}
            <div>
              <label className="mb-1 block text-xs font-black text-slate-700">
                Quan hệ của bạn với dòng họ này
              </label>
              <select
                value={linkType}
                disabled={isSubmitting}
                onChange={(e) => setLinkType(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-emerald-500"
              >
                {C1_LINK_TYPES.map((code) => {
                  const meta = LINK_TYPE_LABELS[code];
                  return (
                    <option key={code} value={code}>
                      {meta ? `${meta.label} — ${meta.description}` : code}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {checkingEligibility && selectedTenant?.id && (
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
              <Loader2 size={16} className="animate-spin text-emerald-600" />
              <span>Đang kiểm tra điều kiện gia nhập tại {selectedTenant.name}...</span>
            </div>
          )}

          {eligibilityBlock && (
            <div className="space-y-3 rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 text-rose-950">
              <div className="flex items-start gap-3">
                <AlertCircle size={22} className="mt-0.5 shrink-0 text-rose-600" />
                <div className="space-y-1">
                  <p className="text-xs font-black uppercase tracking-wider text-rose-700">
                    Không thể gửi thêm hồ sơ tại dòng họ này
                  </p>
                  <p className="text-sm font-bold leading-relaxed">
                    {eligibilityBlock.message}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2.5 pt-1">
                {eligibilityBlock.reasonCode === 'ALREADY_LINKED_TO_TENANT' &&
                  eligibilityBlock.linkStatus === 'DA_DUYET' && (
                    <button
                      type="button"
                      disabled={isSwitchingContext}
                      onClick={() => switchContext(eligibilityBlock.tenantId, '/op')}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <ArrowRightLeft size={15} />
                      {isSwitchingContext
                        ? 'Đang chuyển dòng họ...'
                        : `Chuyển sang ${eligibilityBlock.clanName}`}
                    </button>
                  )}

                {eligibilityBlock.reasonCode === 'DUPLICATE_PENDING_CASE' && (
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        eligibilityBlock.caseId
                          ? `/membership/status?caseId=${encodeURIComponent(eligibilityBlock.caseId)}`
                          : `/membership/status?tenantId=${encodeURIComponent(eligibilityBlock.tenantId)}`
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white shadow-sm hover:bg-blue-700"
                  >
                    <ExternalLink size={15} />
                    Xem trạng thái hồ sơ đang chờ
                  </button>
                )}

                {isAddClanMode && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTenant(null);
                      setEligibilityBlock(null);
                      setErrorMsg('');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-xs font-black text-rose-800 hover:bg-rose-100"
                  >
                    Chọn dòng họ khác
                  </button>
                )}
              </div>
            </div>
          )}

          {/* BƯỚC 2: CHỌN CLAIM EM HOẶC KHAI BÁO 21 TRƯỜNG */}
          {!eligibilityBlock && (
          <div className="space-y-4">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-700">
              {isAddClanMode
                ? 'Bước 2: Nhận diện nhân thân trên sổ họ'
                : 'Chọn hình thức nhận diện nhân thân'}
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setEntryMode('CLAIM_EM');
                  setProfileErrors({});
                  setErrorMsg('');
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  entryMode === 'CLAIM_EM'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                  Cách 1 (Khuyên dùng)
                </p>
                <p className="mt-1 text-sm font-black">
                  Đã có tên trong sổ họ (Nhận hồ sơ)
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tra cứu tên bạn trên cây (bao gồm cả con rể/con dâu) và trả
                  lời 3 lớp gia mật.
                </p>
              </button>

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  setEntryMode('NEW_PROFILE_21');
                  setProfileErrors({});
                  setErrorMsg('');
                }}
                className={`rounded-2xl border p-4 text-left transition ${
                  entryMode === 'NEW_PROFILE_21'
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-950 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <p className="text-xs font-black uppercase tracking-wider text-indigo-700">
                  Cách 2 (Khai báo mới)
                </p>
                <p className="mt-1 text-sm font-black">
                  Chưa có tên trên cây (21 trường)
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Điền đầy đủ thông tin nhân thân để Ban Quản trị đối soát và
                  thêm vào cây.
                </p>
              </button>
            </div>

            {entryMode === 'CLAIM_EM' ? (
              selectedTenant?.id ? (
                <ClaimMemberWizard
                  tenantId={selectedTenant.id}
                  tenantName={selectedTenant.name}
                  linkType={linkType}
                  isMultiHome={true}
                  value={profileDraft}
                  disabled={isSubmitting}
                  errors={profileErrors}
                  onMemberSelect={(pickedMember) => {
                    const ct = String(pickedMember?.child_type || '').toUpperCase();
                    if (ct === 'CON_DAU' || ct === 'CON_RE') {
                      setLinkType('SPOUSE_FAMILY');
                    } else if (ct === 'CON_NUOI' || ct === 'CON_DO_DAU') {
                      setLinkType('GUARDIAN');
                    }
                  }}
                  onChange={(nextDraft) => {
                    setProfileDraft(nextDraft);
                    setProfileErrors({});
                    setErrorMsg('');
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800">
                  Bác vui lòng tìm và chọn dòng họ ở Bước 1 trước để tra cứu
                  danh sách thành viên trên cây.
                </div>
              )
            ) : (
              <RegistrationProfileForm
                value={profileDraft}
                disabled={isSubmitting}
                errors={profileErrors}
                onChange={(nextDraft) => {
                  setProfileDraft(nextDraft);
                  setProfileErrors({});
                  setErrorMsg('');
                }}
              />
            )}
          </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              checkingEligibility ||
              Boolean(eligibilityBlock) ||
              !selectedTenant?.id
            }
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-base font-black text-white shadow-lg transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSubmitting ? (
              <>
                <Loader2 size={20} className="animate-spin" />
                <span>Đang gửi hồ sơ...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={20} />
                <span>
                  {isRevisionMode
                    ? 'Gửi lại hồ sơ bổ sung'
                    : 'Gửi hồ sơ xin gia nhập dòng họ'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClaimMemberPage;