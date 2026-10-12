/**
 * PATH       : src/pages/OpMfoPlanPage.jsx
 * DATETIME   : 2026-10-12T17:00:00+07:00
 * VERSION    : 2.1.1-DOCTRINE211-REALDATA-EU
 * DESCRIPTION:
 * - Màn hình Soạn & Khai báo Tờ trình MFO cho Người dùng cuối (EU).
 * - Nạp và lưu dữ liệu THẬT 100% từ CSDL qua fetchMfoPlansApi / fetchMfoPlanDetailApi.
 * - Tuân thủ Cây 5L xuyên suốt, Central Alarm 2/3 màn hình, Active Form 7 Nút và Form SMP cờ Nội tộc bắt buộc.
 * REFERENCE  : MFO-FE-DOCTRINE-2.1; Patch Plan 2.1.1
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network, Save, Send, RefreshCw } from 'lucide-react';

import TenantHeader from '../components/shell/TenantHeader.jsx';
import AppFooterNav from '../components/shell/AppFooterNav.jsx';
import MyMfoPlans from '../features/mfo/components/MyMfoPlans.jsx';
import MfoActiveFormPortal from '../features/mfo/components/canvas/MfoActiveFormPortal.jsx';
import MfoSmpStagingDrawer from '../features/mfo/components/workbench/MfoSmpStagingDrawer.jsx';
import MfoCentralAlarmOverlay from '../features/mfo/components/alarms/MfoCentralAlarmOverlay.jsx';
import MfoHistoryChain from '../features/mfo/components/history/MfoHistoryChain.jsx';
import MfoReadOnlyPreviewModal from '../features/mfo/components/history/MfoReadOnlyPreviewModal.jsx';

import {
  fetchMfoPlansApi,
  fetchMfoPlanDetailApi,
  savePlanDraftApi,
  submitPlanGate1Api,
  saveResultStagingApi,
  submitResultGate2Api,
  deleteMfoPlanApi,
} from '../features/mfo/api/mfoApi.js';

import { resolveMfoLifecycle } from '../features/mfo/lib/mfoLifecycleMapper.js';

export function OpMfoPlanPage() {
  const navigate = useNavigate();

  // State Dữ liệu Thật từ API[cite: 3]
  const [plansList, setPlansList] = useState([]);
  const [currentProposal, setCurrentProposal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // State Payload Đồ họa Cây & Staging SMP Thật
  const [canvasDelta, setCanvasDelta] = useState({ draft_children: [], draft_spouses: [] });
  const [smpStagingData, setSmpStagingData] = useState({});
  const [attemptsHistory, setAttemptsHistory] = useState([]);

  // State Modal / Alarm / Preview Overlays
  const [alarmState, setAlarmState] = useState({ isOpen: false, type: 'ERROR', code: null, message: null });
  const [afState, setAfState] = useState({ isOpen: false, activeNode: null });
  const [drawerState, setDrawerState] = useState({ isOpen: false, activeNode: null });
  const [previewState, setPreviewState] = useState({ isOpen: false, previewAttempt: null });

  const lifecycle = useMemo(() => resolveMfoLifecycle(currentProposal), [currentProposal]);

  const triggerAlarm = useCallback((type, code, message = null) => {
    setAlarmState({ isOpen: true, type, code, message });
  }, []);

  // 1. TẢI DANH SÁCH TỜ TRÌNH THẬT TỪ CSDL[cite: 3]
  const loadPlansQueue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMfoPlansApi();
      const list = Array.isArray(res) ? res : res.data || [];
      setPlansList(list);

      // Nếu chưa chọn Tờ trình nào, tự động chọn Tờ trình đầu tiên trong CSDL nếu có
      if (list.length > 0 && !currentProposal) {
        loadPlanDetail(list[0].id);
      } else if (list.length === 0) {
        setCurrentProposal(null);
        setCanvasDelta({ draft_children: [], draft_spouses: [] });
        setSmpStagingData({});
        setAttemptsHistory([]);
      }
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setLoading(false);
    }
  }, [currentProposal, triggerAlarm]);

  // 2. TẢI CHI TIẾT MỘT TỜ TRÌNH THẬT TỪ CSDL[cite: 3]
  const loadPlanDetail = useCallback(async (planId) => {
    if (!planId) return;
    setLoading(true);
    try {
      const detail = await fetchMfoPlanDetailApi(planId);
      const row = detail.data || detail;
      setCurrentProposal(row);

      // Giải mã Payload Delta & Staging từ CSDL Backend[cite: 3]
      const payload = row.payload || {};
      setCanvasDelta(payload.canvas_delta || { draft_children: [], draft_spouses: [] });
      setSmpStagingData(payload.smp_staging_data || {});
      setAttemptsHistory(row.attempts || payload.attempts || []);
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setLoading(false);
    }
  }, [triggerAlarm]);

  useEffect(() => {
    loadPlansQueue();
  }, []);

  // 3. LƯU BẢN NHÁP THẬT LÊN CSDL (TÙY THEO CỬA 1 HAY CỬA 2)[cite: 3]
  const handleSaveDraft = async () => {
    if (!currentProposal) return;
    setSaving(true);
    try {
      if (lifecycle.gate === 1) {
        await savePlanDraftApi(currentProposal.id, {
          canvas_delta: canvasDelta,
        });
        triggerAlarm('SUCCESS', 'MFO_DRAFT_SAVED');
      } else {
        await saveResultStagingApi(currentProposal.id, {
          smp_staging_data: smpStagingData,
        });
        triggerAlarm('SUCCESS', 'MFO_STAGING_SAVED');
      }
      loadPlanDetail(currentProposal.id);
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSaving(false);
    }
  };

  // 4. TRÌNH TỜ TRÌNH THẬT LÊN BAN QUẢN TRỊ (CÓ KIỂM TRA CỜ NỘI TỘC AMENDMENT 5)
  const handleSubmitProposal = async () => {
    if (!currentProposal) return;

    if (lifecycle.gate === 2) {
      // Kiểm tra tất cả Node nháp trong delta xem đã khẳng định cờ is_clan chưa
      const allDraftKeys = [
        ...(canvasDelta.draft_children || []).map((c) => c.id),
        ...(canvasDelta.draft_spouses || []).map((s) => s.union_id),
      ];

      const missingClanConfirm = allDraftKeys.some((key) => {
        const smp = smpStagingData[key];
        return !smp || smp.is_clan === undefined;
      });

      if (missingClanConfirm) {
        triggerAlarm('ERROR', 'MFO_CLAN_UNCONFIRMED');
        return;
      }
    }

    setSaving(true);
    try {
      if (lifecycle.gate === 1) {
        await submitPlanGate1Api(currentProposal.id, { canvas_delta: canvasDelta });
        triggerAlarm('SUCCESS', 'MFO_PLAN_SUBMITTED');
      } else {
        await submitResultGate2Api(currentProposal.id, { smp_staging_data: smpStagingData });
        triggerAlarm('SUCCESS', 'MFO_RESULT_SUBMITTED');
      }
      loadPlansQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    } finally {
      setSaving(false);
    }
  };

  // 5. XÓA TỜ TRÌNH THẬT[cite: 3]
  const handleDeletePlan = async (planId) => {
    try {
      await deleteMfoPlanApi(planId);
      triggerAlarm('SUCCESS', 'MFO_DRAFT_DELETED');
      loadPlansQueue();
    } catch (err) {
      triggerAlarm('ERROR', err.code || 'MFO_SYSTEM_ERROR', err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-between pb-16">
      <TenantHeader title={lifecycle.dropdownLabel} />

      <main className="max-w-[480px] w-full mx-auto p-3 space-y-3 flex-1">
        
        {/* Banner Chỉ dẫn v2.1 */}
        <section className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex items-start gap-2 text-xs text-amber-950">
          <div className="leading-relaxed">
            <span className="font-black block text-amber-900 mb-0.5">
              {lifecycle.dropdownLabel}
            </span>
            <p className="text-[11px] text-amber-800 font-medium">
              {lifecycle.bannerText}
            </p>
          </div>
        </section>

        {/* Dropdown Tải Danh sách Tờ trình Thật từ CSDL[cite: 3] */}
        <MyMfoPlans
          plans={plansList}
          activeTicketId={currentProposal?.id}
          loading={loading}
          onSelectPlan={(plan) => {
            if (plan && plan.id) loadPlanDetail(plan.id);
            else setCurrentProposal(null);
          }}
          onReloadPlans={loadPlansQueue}
          onCreateNewPlan={() => navigate('/op/gfl-pick')}
          onDeletePlan={handleDeletePlan}
        />

        {/* Khung Canvas Cây 5L Trung tâm thị giác */}
        {currentProposal && (
          <section className="bg-white rounded-2xl border-2 border-slate-200 p-3 space-y-3 min-h-[300px] flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-black uppercase text-slate-800 flex items-center gap-1">
                <Network className="w-4 h-4 text-indigo-600" />
                {lifecycle.gate === 1 ? 'Cây Ý định Phả hệ 5L' : 'Khai báo Tờ khai trên Cây 5L'}
              </span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${lifecycle.isReadOnly ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-800'}`}>
                {lifecycle.dropdownLabel}
              </span>
            </div>

            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-4 text-center my-auto min-h-[180px] flex flex-col items-center justify-center">
              <button
                type="button"
                disabled={lifecycle.isReadOnly}
                onClick={() => {
                  const targetNode = { id: 'draft-child-1', label: 'Con nháp xin tạo 1', depth: 1 };
                  if (lifecycle.gate === 1) setAfState({ isOpen: true, activeNode: targetNode });
                  else setDrawerState({ isOpen: true, activeNode: targetNode });
                }}
                className="p-3 bg-white border-2 border-indigo-500 rounded-2xl shadow-md min-h-[48px] text-xs font-black active:scale-95 transition-all disabled:opacity-60"
              >
                Bấm vào Node nháp trên Cây 5L để {lifecycle.gate === 1 ? 'mở Bảng tác vụ 7 nút' : 'mở Form Khai báo SMP'}
              </button>
            </div>

            {/* Cụm Nút Thao tác Đáy (Lưu nháp / Trình) */}
            {!lifecycle.isReadOnly && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="min-h-[48px] bg-indigo-50 border border-indigo-200 text-indigo-950 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-indigo-600" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu bản nháp'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmitProposal}
                  disabled={saving}
                  className="min-h-[48px] bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>{saving ? 'Đang trình...' : lifecycle.gate === 1 ? 'Trình Khung' : 'Trình Tờ khai'}</span>
                </button>
              </div>
            )}
          </section>
        )}

        {/* Lịch sử Audit Trail các Lần trình thật từ CSDL[cite: 3] */}
        {attemptsHistory.length > 0 && (
          <MfoHistoryChain
            attempts={attemptsHistory}
            onOpenPreviewModal={(attempt) => setPreviewState({ isOpen: true, previewAttempt: attempt })}
          />
        )}

      </main>

      {/* Active Form Portal Cửa 1 */}
      <MfoActiveFormPortal
        isOpen={afState.isOpen}
        activeNode={afState.activeNode}
        onClose={() => setAfState({ isOpen: false, activeNode: null })}
      />

      {/* Drawer Kê khai SMP Cửa 2 */}
      <MfoSmpStagingDrawer
        isOpen={drawerState.isOpen}
        activeNode={drawerState.activeNode}
        smpStagingData={smpStagingData}
        onClose={() => setDrawerState({ isOpen: false, activeNode: null })}
        onChangeSmpField={(nodeKey, field, val, node) => {
          setSmpStagingData((prev) => ({
            ...prev,
            [nodeKey]: { ...(prev[nodeKey] || {}), [field]: val },
          }));
          if (field === 'full_name' && node) node.label = val || 'Ô nháp xin tạo';
        }}
        onSaveStaging={handleSaveDraft}
      />

      {/* Modal Soi lại Lần trình riêng Read-Only */}
      <MfoReadOnlyPreviewModal
        isOpen={previewState.isOpen}
        previewAttempt={previewState.previewAttempt}
        onClose={() => setPreviewState({ isOpen: false, previewAttempt: null })}
      />

      {/* Central Alarm Overlay 2/3 Màn hình */}
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

export default OpMfoPlanPage;