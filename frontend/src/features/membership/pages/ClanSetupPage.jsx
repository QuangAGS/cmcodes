/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/ClanSetupPage.jsx
 * DATETIME    : 2026-11-13T10:00:00+07:00
 * VERSION     : 1.0.0-MULTIHOME-AMEND02-V15-LAT3
 * DESCRIPTION : Trang Lập dòng họ mới cho người dùng đã có tài khoản (Luồng C1-S):
 *               - Không hỏi lại phone/email/mật khẩu (kế thừa từ phiên đang đăng nhập).
 *               - Nộp về POST /api/membership/clan-setup (hoặc revision khi mode=revision).
 *               - Không làm ảnh hưởng trạng thái hay quyền của dòng họ gốc A.
 * =============================================================================
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Landmark,
  User,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../../context/AuthContext';
import { membershipApi } from '../api/membershipApi';

export const ClanSetupPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, refreshContext } = useAuth();

  const caseId = searchParams.get('caseId');
  const isRevisionMode = searchParams.get('mode') === 'revision' && Boolean(caseId);

  const [clanName, setClanName] = useState('');
  const [description, setDescription] = useState('');
  const [fullName, setFullName] = useState(user?.name || '');
  const [alias, setAlias] = useState('');
  const [gender, setGender] = useState('NAM');
  const [birthYear, setBirthYear] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [address, setAddress] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [note, setNote] = useState('');

  const [loadingRevision, setLoadingRevision] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [revisionFeedback, setRevisionFeedback] = useState('');

  useEffect(() => {
    if (!isRevisionMode || !caseId) return;

    let cancelled = false;
    setLoadingRevision(true);
    membershipApi
      .getMembershipStatus({ caseId })
      .then((data) => {
        if (cancelled || !data) return;
        if (data.revisionRequest) setRevisionFeedback(data.revisionRequest);
        if (data.tenantName) setClanName(data.tenantName);
        if (data.description) setDescription(data.description);

        const rp =
          data.registration_profile &&
          typeof data.registration_profile === 'object'
            ? data.registration_profile
            : data.caseMetadata?.registration_profile || {};

        if (rp.full_name) setFullName(rp.full_name);
        if (rp.alias) setAlias(rp.alias);
        if (rp.gender) setGender(rp.gender);
        if (rp.birth_year) setBirthYear(String(rp.birth_year));
        if (rp.birth_place) setBirthPlace(rp.birth_place);
        if (rp.address) setAddress(rp.address);
        if (rp.father_name) setFatherName(rp.father_name);
        if (rp.note) setNote(rp.note);
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(
            err?.response?.data?.message ||
              'Không tải được dữ liệu hồ sơ lập dòng họ.'
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanClanName = String(clanName || '').trim();
    const cleanDesc = String(description || '').trim();
    const cleanFullName = String(fullName || '').trim();
    const cleanFatherName = String(fatherName || '').trim();
    const cleanNote = String(note || '').trim();
    const cleanBirthYear = String(birthYear || '').trim();

    if (!cleanClanName || cleanClanName.length < 3) {
      setErrorMsg('Bác vui lòng nhập tên dòng họ mới (tối thiểu 3 ký tự).');
      return;
    }
    if (!cleanDesc) {
      setErrorMsg('Bác vui lòng nhập mô tả ngắn giới thiệu về dòng họ.');
      return;
    }
    if (!cleanFullName) {
      setErrorMsg('Bác vui lòng nhập họ và tên người sáng lập (Trưởng họ).');
      return;
    }
    if (!cleanFatherName) {
      setErrorMsg('Bác vui lòng nhập tên cha hoặc mẹ để đối chiếu.');
      return;
    }
    if (cleanBirthYear && !/^\d{4}$/.test(cleanBirthYear)) {
      setErrorMsg('Năm sinh phải gồm 4 chữ số (ví dụ: 1965).');
      return;
    }
    if (!cleanNote) {
      setErrorMsg('Bác vui lòng nhập lời nhắn gửi Hệ thống Trung tâm thẩm định.');
      return;
    }

    const payload = {
      clanName: cleanClanName,
      description: cleanDesc,
      registration_profile: {
        claim_mode: 'CLAN_SETUP',
        full_name: cleanFullName,
        alias: String(alias || '').trim() || undefined,
        gender: gender || 'NAM',
        birth_year: cleanBirthYear ? Number(cleanBirthYear) : undefined,
        birth_place: String(birthPlace || '').trim() || undefined,
        address: String(address || '').trim() || undefined,
        father_name: cleanFatherName,
        generation: 1,
        member_role: 'TRUONG_HO',
        is_alive: true,
        note: cleanNote,
      },
    };

    try {
      setIsSubmitting(true);
      let res;
      if (isRevisionMode && caseId) {
        res = await membershipApi.submitRevision(caseId, payload);
        toast.success('Đã gửi lại hồ sơ bổ sung lập dòng họ!');
      } else {
        res = await membershipApi.submitClanSetup(payload);
        toast.success('Đã gửi hồ sơ lập dòng họ mới! Chờ Hệ thống Trung tâm phê duyệt.');
      }

      if (typeof refreshContext === 'function') {
        await refreshContext();
      }

      const targetCaseId = res?.data?.caseId || caseId || '';
      navigate(
        targetCaseId
          ? `/membership/status?caseId=${encodeURIComponent(targetCaseId)}`
          : '/membership/status'
      );
    } catch (err) {
      console.error('[ClanSetupPage] Submit error:', err);
      const msg =
        err?.response?.data?.message ||
        'Gửi hồ sơ lập dòng họ thất bại. Bác vui lòng thử lại.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingRevision) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center p-6">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
        <p className="mt-3 text-sm font-bold text-slate-600">
          Đang tải thông tin hồ sơ...
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
  const labelClass = 'block text-xs font-black text-slate-700 mb-1';

  return (
    <div className="mx-auto my-6 max-w-2xl px-4 pb-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-indigo-600">
              {isRevisionMode
                ? 'Bổ sung hồ sơ lập họ'
                : 'Khởi tạo không gian mới (C1-S)'}
            </span>
            <h1 className="mt-1 text-2xl font-black text-slate-900">
              Lập dòng họ mới
            </h1>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Dùng tài khoản <strong>{user?.phone || user?.email}</strong> làm
              Trưởng họ sáng lập (không ảnh hưởng dòng họ hiện tại).
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
              Góp ý từ Hệ thống Trung tâm:
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
          <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-900">
              <Landmark size={16} />
              1. Thông tin dòng họ cần thành lập
            </h2>

            <div>
              <label className={labelClass}>
                Tên dòng họ <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={isSubmitting}
                value={clanName}
                onChange={(e) => setClanName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Tộc - Chi Phái 2"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>
                Mô tả giới thiệu dòng họ <span className="text-rose-500">*</span>
              </label>
              <textarea
                disabled={isSubmitting}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Nguồn gốc, địa bàn cư trú gốc, quy mô chi phái..."
                className={`${inputClass} min-h-[96px] resize-none`}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <h2 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-800">
              <User size={16} />
              2. Hồ sơ người sáng lập (Trưởng họ)
            </h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Họ và tên Trưởng họ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Giới tính</label>
                <select
                  disabled={isSubmitting}
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={inputClass}
                >
                  <option value="NAM">Nam</option>
                  <option value="NU">Nữ</option>
                  <option value="KHAC">Khác</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Tên tự / Tên hiệu</label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  placeholder="Tên tự, tên hiệu (nếu có)"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Tên cha/mẹ <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={fatherName}
                  onChange={(e) => setFatherName(e.target.value)}
                  placeholder="Họ tên cha hoặc mẹ"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Năm sinh</label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                  placeholder="Ví dụ: 1965"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Nguyên quán / Quê gốc</label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={birthPlace}
                  onChange={(e) => setBirthPlace(e.target.value)}
                  placeholder="Xã/Phường, Huyện, Tỉnh"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Địa chỉ hiện tại</label>
                <input
                  type="text"
                  disabled={isSubmitting}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Nơi cư trú hiện tại"
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Lời nhắn gửi Hệ thống Trung tâm{' '}
                  <span className="text-rose-500">*</span>
                </label>
                <textarea
                  disabled={isSubmitting}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Thông tin xác minh tư cách đại diện thành lập dòng họ..."
                  className={`${inputClass} min-h-[88px] resize-none`}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-black text-white shadow-lg transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
                    ? 'Gửi lại hồ sơ lập dòng họ'
                    : 'Gửi hồ sơ lập dòng họ mới'}
                </span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ClanSetupPage;