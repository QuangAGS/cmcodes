/**
 * PATH       : src/pages/AdminMfoPlanPage.jsx
 * DATETIME   : 2026-10-12T17:05:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-REALDATA-ADMIN
 * DESCRIPTION:
 * - Màn hình Thẩm định 2 Cửa dành cho Quản trị viên dòng họ.
 * - Nạp danh sách Tờ trình THẬT 100% từ CSDL[cite: 3].
 * - Ma trận Cửa 1 đúng 2 nút, Cửa 2 đúng 3 nút (Nút Bác bỏ gọi Lát 0 terminateResultGate2Api).
 * - Lịch sử Lần trình Lớp Soi riêng Read-Only.
 * REFERENCE  : MFO-FE-DOCTRINE-2.1; Patch Plan 2.1.1
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Check, RotateCcw, OctagonX, ShieldCheck, RefreshCw } from 'lucide-react';

import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import MfoHistoryChain from '../features/mfo/components/history/MfoHistoryChain.jsx';
import MfoReadOnlyPreviewModal from '../features/mfo/components/history/MfoReadOnlyPreviewModal.jsx';
import MfoCentralAlarmOverlay from '../features/mfo/components/alarms/MfoCentralAlarmOverlay.jsx';

import {
  fetchMfoPlansApi,
  fetchMfoPlanDetailApi,
  approvePlanGate1Api,
  returnPlanGate1Api,
  approvePlanGate2Api,
  rejectPlanGate2Api,
  terminateResultGate2Api,
} from '../features/mfo/api/mfoApi.js';

import { resolveMfoLifecycle } from '../features/mfo/lib/mfoLifecycleMapper.js';

export function AdminMfoPlanPage() {
  const [plansList, setPlansList] = useState([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [currentPlan, setCurrentPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [activeTab, setActiveTab] = useState('GATE1');
  const [adminNote, setAdminNote] = useState('');

  const [previewState, setPreviewState] = useState({ isOpen: false, previewAttempt: null });
  const [alarmState, setAlarmState] = useState({ isOpen: false, type: 'ERROR', code: null, message: null });

  const triggerAlarm = useCallback((type, code, message = null) => {
    setAlarmState({ isOpen: true, type, code, message });
  }, []);

  // 1. TẢI DANH SÁCH TỜ TRÌNH CẦN THẨM ĐỊNH THẬT TỪ CSDL[cite: 3]
  const loadAdminQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMfoPlansApi();
      const list = Array.isArray(res) ? res : res.data || [];
      setPlansList(list);

      if (list.length > 0 && !selectedPlanId) {
        setSelectedPlanId(list[0].id);
        loadPlanDetail(list[0].id);
      } else if (list.length === 0) {
        setCurrentPlan(null);
      }
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedPlanId, triggerAlarm]);

  // 2. TẢI CHI TIẾT TỜ TRÌNH ĐANG CHỌN[cite: 3]
  const loadPlanDetail = useCallback(async (planId) => {
    if (!planId) return;
    setLoading(true);
    try {
      const detail = await fetchMfoPlanDetailApi(planId);
      const row = detail.data || detail;
      setCurrentPlan(row);

      const lifecycle = resolveMfoLifecycle(row);
      setActiveTab(lifecycle.gate === 2 ? 'GATE2' : 'GATE1');
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setLoading(false);
    }
  }, [triggerAlarm]);

  useEffect(() => {
    loadAdminQueue();
  }, []);

  // ---------------------------------------------------------------------------
  // XỬ LÝ CÁC THAO TÁC THẨM ĐỊNH CỬA 1 (ĐÚNG 2 NÚT)
  // ---------------------------------------------------------------------------
  const handleGate1Approve = async () => {
    if (!currentPlan) return;
    setSubmitting(true);
    try {
      await approvePlanGate1Api(currentPlan.id, { admin_note: adminNote });
      triggerAlarm('SUCCESS', 'MFO_PLAN_APPROVED');
      setAdminNote('');
      loadAdminQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGate1Return = async () => {
    if (!currentPlan) return;
    if (!adminNote.trim()) {
      triggerAlarm('ERROR', 'MFO_REASON_REQUIRED');
      return;
    }
    setSubmitting(true);
    try {
      await returnPlanGate1Api(currentPlan.id, { admin_note: adminNote });
      triggerAlarm('SUCCESS', null, 'Đã gửi yêu cầu sửa lại Khung 5L.');
      setAdminNote('');
      loadAdminQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // XỬ LÝ CÁC THAO TÁC THẨM ĐỊNH CỬA 2 (ĐÚNG 3 NÚT - BÁC BỎ CỬA 2 LÁT 0)
  // ---------------------------------------------------------------------------
  const handleGate2Approve = async () => {
    if (!currentPlan) return;
    setSubmitting(true);
    try {
      await approvePlanGate2Api(currentPlan.id, { admin_note: adminNote });
      triggerAlarm('SUCCESS', 'MFO_RESULT_APPROVED');
      setAdminNote('');
      loadAdminQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGate2Return = async () => {
    if (!currentPlan) return;
    if (!adminNote.trim()) {
      triggerAlarm('ERROR', 'MFO_REASON_REQUIRED');
      return;
    }
    setSubmitting(true);
    try {
      await rejectPlanGate2Api(currentPlan.id, { admin_note: adminNote });
      triggerAlarm('SUCCESS', null, 'Đã trả Tờ khai yêu cầu sửa lại.');
      setAdminNote('');
      loadAdminQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // BÁC BỎ CỬA 2 RIÊNG BIỆT (GỌI ROUTE LÁT 0 POST /plans/:id/result/terminate)
  const handleGate2Terminate = async () => {
    if (!currentPlan) return;
    if (!adminNote.trim()) {
      triggerAlarm('ERROR', 'MFO_REASON_REQUIRED');
      return;
    }
    setSubmitting(true);
    try {
      await terminateResultGate2Api(currentPlan.id, { admin_note: adminNote });
      triggerAlarm('ERROR', null, 'Đã bác bỏ vĩnh viễn Tờ khai Cửa 2.');
      setAdminNote('');
      loadAdminQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between pb-16">
      <TenantHeader title="Hệ thống Quản trị Gia tộc" />

      <main className="max-w-[480px] w-full mx-auto p-3 space-y-3 flex-1">
        
        {/* Dropdown Chọn Tờ trình Thẩm định Thật từ CSDL[cite: 3] */}
        <section className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-black uppercase tracking-wider text-slate-700">
              Chọn Tờ trình cần thẩm định:
            </label>
            <button
              type="button"
              onClick={loadAdminQueue}
              className="p-1 text-slate-400 hover:text-indigo-600"
              title="Tải lại"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <select
            value={selectedPlanId}
            onChange={(e) => {
              setSelectedPlanId(e.target.value);
              if (e.target.value) loadPlanDetail(e.target.value);
            }}
            className="w-full min-h-[48px] bg-indigo-50 border-2 border-indigo-200 rounded-xl px-3 text-xs font-black text-indigo-950 outline-none"
          >
            <option value="">-- Bấm để chọn --</option>
            {plansList.map((plan) => {
              const lifecycle = resolveMfoLifecycle(plan);
              return (
                <option key={plan.id} value={plan.id}>
                  Tờ #{plan.id} - {lifecycle.dropdownLabel}
                </option>
              );
            })}
          </select>
        </section>

        {currentPlan && (
          <>
            {/* Switch Cửa 1 vs Cửa 2 */}
            <div className="grid grid-cols-2 gap-2 bg-slate-200 p-1 rounded-2xl text-xs font-black">
              <button
                type="button"
                onClick={() => setActiveTab('GATE1')}
                className={`min-h-[44px] rounded-xl transition-all ${
                  activeTab === 'GATE1' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                CỬA 1: KHUNG 5L
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('GATE2')}
                className={`min-h-[44px] rounded-xl transition-all ${
                  activeTab === 'GATE2' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                CỬA 2: TỜ KHAI
              </button>
            </div>

            {/* Bảng Thao tác Thẩm định */}
            <section className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-black uppercase text-slate-900 flex items-center gap-1">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  {activeTab === 'GATE1' ? 'Thẩm định Khung Ý định 5L' : 'Thẩm định Tờ khai (Workbench)'}
                </span>
                <span className="text-[10px] font-bold text-slate-400">Tờ #{currentPlan.id}</span>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  Ý kiến Bút phê Quản trị (* khi trả sửa / bác bỏ):
                </label>
                <textarea
                  rows={2}
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Nhập ghi chú bút phê..."
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-600 rounded-xl text-xs font-medium outline-none"
                />
              </div>

              {/* MA TRẬN BẤM CỬA 1 (ĐÚNG 2 NÚT) */}
              {activeTab === 'GATE1' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleGate1Approve}
                    disabled={submitting}
                    className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Phê Duyệt Khung 5L</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGate1Return}
                    disabled={submitting}
                    className="w-full min-h-[48px] bg-amber-50 hover:bg-amber-100 text-amber-950 border-2 border-amber-400 font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-600" />
                    <span>Không duyệt Khung / Yêu cầu sửa</span>
                  </button>
                </div>
              )}

              {/* MA TRẬN BẤM CỬA 2 (ĐÚNG 3 NÚT) */}
              {activeTab === 'GATE2' && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={handleGate2Approve}
                    disabled={submitting}
                    className="w-full min-h-[48px] bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-md active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>Duyệt Tờ khai (Chốt Sổ CSDL)</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGate2Return}
                    disabled={submitting}
                    className="w-full min-h-[48px] bg-amber-50 hover:bg-amber-100 text-amber-950 border-2 border-amber-400 font-black text-xs uppercase tracking-wider rounded-2xl active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <RotateCcw className="w-4 h-4 text-amber-600" />
                    <span>Trả về yêu cầu sửa Tờ khai</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleGate2Terminate}
                    disabled={submitting}
                    className="w-full min-h-[44px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl active:scale-98 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    <OctagonX className="w-4 h-4 text-rose-600" />
                    <span>Bác bỏ vĩnh viễn Tờ khai (Route Cửa 2 Lát 0)</span>
                  </button>
                </div>
              )}
            </section>

            {/* Lịch sử Audit Trail Lần trình từ CSDL[cite: 3] */}
            {currentPlan.attempts && currentPlan.attempts.length > 0 && (
              <MfoHistoryChain
                attempts={currentPlan.attempts}
                onOpenPreviewModal={(attempt) => setPreviewState({ isOpen: true, previewAttempt: attempt })}
              />
            )}
          </>
        )}

      </main>

      {/* Modal Soi Lần trình Read-Only */}
      <MfoReadOnlyPreviewModal
        isOpen={previewState.isOpen}
        previewAttempt={previewState.previewAttempt}
        onClose={() => setPreviewState({ isOpen: false, previewAttempt: null })}
      />

      {/* Alarm Độc tôn 2/3 màn hình */}
      <MfoCentralAlarmOverlay
        isOpen={alarmState.isOpen}
        type={alarmState.type}
        code={alarmState.code}
        message={alarmState.message}
        onClose={() => setAlarmState((prev) => ({ ...prev, isOpen: false }))}
      />

      <AppFooterNav />
    </div>
  );
}

export default AdminMfoPlanPage;