/**
 * PATH       : src/pages/OpHubPage.jsx
 * DATETIME   : 2026-08-17T15:30:00+07:00
 * VERSION    : 1.0.0-FE-OP-B1-UI1
 * DESCRIPTION:
 * - Hub /op: Danh mục loại công việc (member DU_BI / hasOpen).
 * - Elder: AudioHelpButton (trang) + AttentionZone khung thông báo
 *   + card expand/collapse + ZoneVoiceButton theo loại việc.
 * - Labels: opFieldLabels / opMessages / opWorkItems (feature onboarding).
 * - Q1: không đụng RP / admin.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';

import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';

import AttentionZone from '../components/AttentionZone.jsx';
import AudioHelpButton from '../features/elder-doctrine/components/AudioHelpButton.jsx';
import ZoneVoiceButton from '../features/elder-doctrine/components/ZoneVoiceButton.jsx';

import {
  labelFields,
  labelEnum,
} from '../features/onboarding/constants/opFieldLabels.js';
import {
  OP_HUB_AUDIO_HELP,
  OP_HUB_WELCOME,
  buildProcessStatusMessage,
  buildBaseProfileGuidance,
} from '../features/onboarding/constants/opMessages.js';
import {
  OP_WORK_ITEMS,
  OP_WORK_ITEM_IDS,
} from '../features/onboarding/constants/opWorkItems.js';

function getSubtitle(user, primary) {
  return (
    user?.phone ||
    user?.email ||
    primary?.full_name ||
    user?.name ||
    'Thành viên'
  );
}

function statusBadgeForItem(itemId, data) {
  if (itemId !== OP_WORK_ITEM_IDS.BASE_PROFILE) return '—';
  if (data?.completeness?.complete) return 'Đã đủ thông tin bắt buộc';
  return 'Cần bổ sung';
}

export default function OpHubPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [expandedId, setExpandedId] = useState(OP_WORK_ITEM_IDS.BASE_PROFILE);

  const fetchMyOp = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.get('/onboarding/my-op');
      const payload = res.data?.data ?? res.data ?? null;
      setData(payload);
    } catch (err) {
      setData(null);
      setLoadError(
        err?.response?.status === 401
          ? 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.'
          : 'Không tải được danh mục công việc. Vui lòng thử lại.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyOp();
  }, [fetchMyOp]);

  const handleLogout = () => {
    logout();
    navigate('/auth', { replace: true });
  };

  const caseStatus = data?.case?.status ?? null;
  const profileComplete = data?.completeness?.complete === true;
  const missingKeys = data?.completeness?.missingFields || [];
  const missingLabels = useMemo(
    () => labelFields(missingKeys, 'members'),
    [missingKeys]
  );

  const processMessage = useMemo(
    () => buildProcessStatusMessage(caseStatus, profileComplete),
    [caseStatus, profileComplete]
  );

  const caseStatusLabel = caseStatus
    ? labelEnum('case_status', caseStatus)
    : '';

  const baseProfileGuidance = useMemo(
    () =>
      buildBaseProfileGuidance(
        data?.completeness,
        missingLabels,
        caseStatusLabel || caseStatus
      ),
    [data?.completeness, missingLabels, caseStatusLabel, caseStatus]
  );

  const subtitle = getSubtitle(user, data?.primary);

  const bannerText = loadError
    ? loadError
    : [OP_HUB_WELCOME, processMessage].filter(Boolean).join(' ');

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans text-slate-500">
        Đang tải danh mục công việc...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 sm:px-6">
      <div className="mx-auto w-full max-w-[480px]">
        {/* Header */}
        <header className="mb-6 text-center">
          <h1 className="text-2xl font-black tracking-tight text-slate-800">
            Danh mục loại công việc
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            <span className="font-semibold text-slate-700">{subtitle}</span>
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2 text-sm font-semibold text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            Đăng xuất
          </button>
        </header>

        {/* Khung thông báo + AudioHelp toàn trang */}
        <div className="mb-6 space-y-3">
          <AudioHelpButton
            text={OP_HUB_AUDIO_HELP}
            label="Nghe hướng dẫn trang"
            size="md"
          />

          <AttentionZone
            active
            priority={loadError ? 'high' : 'medium'}
            className="rounded-3xl border p-4 text-left text-sm leading-relaxed"
            recoveryKey="op-hub-banner"
          >
            {bannerText}
          </AttentionZone>

          {!loadError && caseStatusLabel && (
            <p className="px-1 text-xs font-medium text-slate-400">
              Trạng thái: {caseStatusLabel}
            </p>
          )}
        </div>

        {/* Danh sách loại công việc */}
        <div className="space-y-3">
          {OP_WORK_ITEMS.map((item) => {
            const expanded = expandedId === item.id;
            const badge = statusBadgeForItem(item.id, data);
            const guidance =
              item.id === OP_WORK_ITEM_IDS.BASE_PROFILE
                ? baseProfileGuidance
                : '';

            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-3xl border shadow-sm ${
                  item.primary
                    ? 'border-indigo-200 bg-indigo-50/40'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedId((prev) =>
                      prev === item.id ? null : item.id
                    )
                  }
                  className="flex w-full items-center gap-3 p-5 text-left transition active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800">{item.title}</div>
                    <div className="mt-0.5 text-sm text-slate-500">{badge}</div>
                  </div>
                  {expanded ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                  )}
                </button>

                {expanded && (
                  <div className="space-y-3 border-t border-indigo-100/80 px-5 pb-5 pt-3">
                    <ZoneVoiceButton
                      visible
                      text={guidance}
                      label="Nghe hướng dẫn việc này"
                    />

                    <AttentionZone
                      active
                      priority="low"
                      className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-700"
                      recoveryKey={`op-work-${item.id}`}
                    >
                      {guidance}
                    </AttentionZone>

                    {item.path && (
                      <Link
                        to={item.path}
                        className="flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition active:scale-[0.98]"
                      >
                        Thực hiện
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="mt-10 space-y-3 pb-6 text-center text-sm">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="font-semibold text-slate-500 underline-offset-2 hover:underline"
          >
            Trang chủ
          </button>
          <div>
            <button
              type="button"
              onClick={handleLogout}
              className="font-semibold text-slate-400 underline-offset-2 hover:underline"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}