/**
 * ============================================================================
 * PATH       : frontend/src/features/onboarding/components/RulesAgreementCard.jsx
 * DATETIME   : 2026-11-22T18:10:00+07:00
 * VERSION    : 1.0.0-ISO29148-UAT-IMP5-RULES
 * DESCRIPTION:
 * - Card cam kết tuân thủ Nội quy chung của nền tảng & Nội quy từng Dòng họ
 *   dùng chung cho cả MEMBER_JOIN (C1 & C2) và CLAN_SETUP (C1-S & C2-S)
 *   [UAT-IMP5 Mục 3 / Baseline FUNC-11].
 * - Tuân thủ chuẩn CollapsibleDetailCard (2 dòng / 3 cột), nút >= 48px, chữ >= 16px,
 *   nhãn rõ ràng, tích hợp trợ lý giọng nói ZoneVoiceButton.
 * ============================================================================
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React, { useEffect, useState, useMemo } from 'react';
import { ShieldCheck, BookOpen, Landmark, Loader2 } from 'lucide-react';
import CollapsibleDetailCard from '../../../components/common/CollapsibleDetailCard.jsx';
import apiClient from '../../../lib/apiClient.js';
import {
  DEFAULT_TOS_VERSION,
  PLATFORM_GENERAL_ARTICLES,
  PLATFORM_GENERAL_RULES_TEXT,
  DEFAULT_CLAN_RULES_FALLBACK,
  CLAN_FOUNDER_COMMITMENT_TEXT,
  composeAgreedRulesSnapshot,
} from '../constants/platformRulesCatalog.js';

export default function RulesAgreementCard({
  mode = 'MEMBER_JOIN', // MEMBER_JOIN | CLAN_SETUP
  tenantId = '',
  clanName = '',
  agreed = false,
  onChange,
  disabled = false,
  error = '',
  title = 'Cam kết tuân thủ Nội quy chung & Nội quy dòng họ',
}) {
  const isClanSetup = mode === 'CLAN_SETUP';
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesPayload, setRulesPayload] = useState({
    tosVersion: DEFAULT_TOS_VERSION,
    platformRules: PLATFORM_GENERAL_RULES_TEXT,
    clanRules: '',
    clanRulesVersion: 1,
    hasCustomClanRules: false,
  });

  useEffect(() => {
    if (isClanSetup || !tenantId) {
      setRulesPayload((prev) => ({
        ...prev,
        clanRules: '',
        clanRulesVersion: 1,
        hasCustomClanRules: false,
      }));
      return undefined;
    }

    let cancelled = false;
    setLoadingRules(true);

    apiClient
      .get(`/tenants/${encodeURIComponent(tenantId)}/rules`, {
        headers: { Authorization: '' },
      })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data || res.data || {};
        setRulesPayload({
          tosVersion: data.tosVersion || DEFAULT_TOS_VERSION,
          platformRules: data.platformRules || PLATFORM_GENERAL_RULES_TEXT,
          clanRules: data.clanRules || '',
          clanRulesVersion: Number(data.clanRulesVersion || 1),
          hasCustomClanRules: Boolean(data.hasCustomClanRules || data.clanRules),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setRulesPayload({
          tosVersion: DEFAULT_TOS_VERSION,
          platformRules: PLATFORM_GENERAL_RULES_TEXT,
          clanRules: '',
          clanRulesVersion: 1,
          hasCustomClanRules: false,
        });
      })
      .finally(() => {
        if (!cancelled) setLoadingRules(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isClanSetup, tenantId]);

  const snapshotText = useMemo(
    () =>
      composeAgreedRulesSnapshot({
        mode,
        clanName,
        platformRules: rulesPayload.platformRules,
        tosVersion: rulesPayload.tosVersion,
        clanRules: rulesPayload.clanRules,
        clanRulesVersion: rulesPayload.clanRulesVersion,
      }),
    [mode, clanName, rulesPayload]
  );

  // Đồng bộ snapshot mới nhất mỗi khi rulesPayload hoặc clanName thay đổi
  useEffect(() => {
    if (typeof onChange === 'function') {
      onChange({
        agreed: Boolean(agreed),
        agreed_rules: Boolean(agreed),
        agreed_rules_snapshot: snapshotText,
        agreed_tos_version: rulesPayload.tosVersion,
        agreed_clan_rules_version: rulesPayload.clanRulesVersion,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotText, rulesPayload.tosVersion, rulesPayload.clanRulesVersion]);

  const handleToggleAgree = (checked) => {
    if (typeof onChange === 'function') {
      onChange({
        agreed: checked,
        agreed_rules: checked,
        agreed_rules_snapshot: snapshotText,
        agreed_tos_version: rulesPayload.tosVersion,
        agreed_clan_rules_version: rulesPayload.clanRulesVersion,
      });
    }
  };

  const voiceReadingText = useMemo(() => {
    const baseSpeech = PLATFORM_GENERAL_ARTICLES.map(
      (a) => `${a.code}: ${a.title}. ${a.body}`
    ).join(' ');
    if (isClanSetup) {
      return `${title}. ${baseSpeech} Cam kết người sáng lập dòng họ: ${CLAN_FOUNDER_COMMITMENT_TEXT}. Bác vui lòng tích vào ô cam kết bên dưới trước khi gửi hồ sơ.`;
    }
    const clanSpeech = rulesPayload.clanRules
      ? `Nội quy của dòng họ ${clanName || ''}: ${rulesPayload.clanRules}.`
      : `Quy ước dòng họ ${clanName || ''}: ${DEFAULT_CLAN_RULES_FALLBACK}`;
    return `${title}. ${baseSpeech} ${clanSpeech} Bác vui lòng tích vào ô cam kết bên dưới trước khi gửi hồ sơ.`;
  }, [title, isClanSetup, clanName, rulesPayload.clanRules]);

  const checkboxLabel = isClanSetup
    ? `Tôi đã đọc kỹ và cam kết tuân thủ nghiêm túc Nội quy chung của nền tảng, chịu trách nhiệm về tính xác thực của dòng họ${clanName ? ` "${clanName}"` : ''} mới thành lập.`
    : `Tôi đã đọc kỹ và cam kết tuân thủ nghiêm túc Nội quy chung của nền tảng cùng Nội quy của dòng họ${clanName ? ` "${clanName}"` : ''}.`;

  return (
    <CollapsibleDetailCard
      title={title}
      statusLabel={agreed ? 'Đã cam kết' : 'Chưa cam kết'}
      statusVariant={agreed ? 'complete' : 'pending'}
      voiceText={voiceReadingText}
      defaultExpanded={true}
      disabled={disabled}
    >
      <div className="space-y-4">
        {/* Khung 1: Nội quy chung của nền tảng Gia Phả Số */}
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
          <div className="flex items-center gap-2 text-slate-900">
            <BookOpen size={18} className="shrink-0 text-indigo-600" />
            <h4 className="text-base font-bold">
              1. Nội quy chung của nền tảng Gia Phả Số (v{rulesPayload.tosVersion})
            </h4>
          </div>

          <div className="max-h-56 space-y-2.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 text-base leading-relaxed text-slate-800">
            {PLATFORM_GENERAL_ARTICLES.map((art) => (
              <p key={art.code} className="font-normal">
                <strong className="font-bold text-slate-900">
                  {art.code}. {art.title}:
                </strong>{' '}
                {art.body}
              </p>
            ))}
          </div>
        </div>

        {/* Khung 2: Nội quy riêng của từng Dòng họ hoặc Cam kết Trưởng họ sáng lập */}
        <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
          <div className="flex items-center gap-2 text-indigo-950">
            <Landmark size={18} className="shrink-0 text-indigo-700" />
            <h4 className="text-base font-bold">
              {isClanSetup
                ? `2. Cam kết trách nhiệm Trưởng họ sáng lập${clanName ? ` (${clanName})` : ''}`
                : `2. Nội quy của dòng họ${clanName ? ` ${clanName}` : ''}${
                    rulesPayload.hasCustomClanRules
                      ? ` (v${rulesPayload.clanRulesVersion})`
                      : ''
                  }`}
            </h4>
          </div>

          {loadingRules ? (
            <div className="flex items-center gap-2 rounded-xl border border-indigo-100 bg-white p-3.5 text-base font-normal text-slate-600">
              <Loader2 size={18} className="animate-spin text-indigo-600" />
              <span>Đang tải nội quy riêng của dòng họ...</span>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl border border-indigo-100 bg-white p-3.5 text-base font-normal leading-relaxed text-slate-800">
              {isClanSetup
                ? CLAN_FOUNDER_COMMITMENT_TEXT
                : rulesPayload.clanRules || DEFAULT_CLAN_RULES_FALLBACK}
            </div>
          )}
        </div>

        {/* Ô tích xác nhận bắt buộc (>= 48px, chữ >= 16px) */}
        <label
          className={`flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors ${
            agreed
              ? 'border-emerald-500 bg-emerald-50 text-emerald-950'
              : 'border-amber-300 bg-amber-50/80 text-amber-950 hover:bg-amber-50'
          }`}
        >
          <input
            type="checkbox"
            checked={Boolean(agreed)}
            disabled={disabled}
            onChange={(e) => handleToggleAgree(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-400 text-emerald-600 focus:ring-emerald-500"
          />
          <span className="text-base font-bold leading-snug">
            {checkboxLabel} <span className="text-rose-600">*</span>
          </span>
        </label>

        {error && (
          <p role="alert" className="text-base font-bold text-rose-600">
            {error}
          </p>
        )}
      </div>
    </CollapsibleDetailCard>
  );
}
