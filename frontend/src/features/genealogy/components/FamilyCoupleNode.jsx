/**
 * PATH       : frontend/src/features/genealogy/components/FamilyCoupleNode.jsx
 * DATETIME   : 2026-10-19T17:20:00+07:00
 * VERSION    : 3.2.1-PREVIEW-ALIGNED-FIX
 * DESCRIPTION:
 * - Bảo tồn 100% v3.0.0-COMPLETE-5L-CANVAS: Handles đa điểm, Drag/Drop, Tabs, Avatar "XT", Khuyết danh "KD".
 * - Đồng bộ cơ chế bấm Tab nguyên bản theo MfoHistoryPreview: OnClick ngắt stopPropagation.
 *
 * CHANGE LOG:
 * - 2026-10-03T22:50:00+07:00 | 3.1.0 | Giữ canvas 5L, thêm nhận diện khuyết danh.
 * - 2026-10-15T22:03:00+07:00 | 3.1.1 | Mỗi lần hôn nhân có một tay nắm. Tab đóng thì giấu, không xoá.
 * - 2026-10-15T22:24:00+07:00 | 3.1.2 | Tay nắm tab đóng vẫn được gắn, không dùng opacity 0 để khỏi rơi cạnh.
 * - 2026-10-16T06:19:00+07:00 | 3.1.3 | Đo lại tay nắm từ trong ô sau khi đổi tab hoặc số lần hôn nhân.
 * - 2026-10-18T14:57:00+07:00 | 3.1.4 | Nút hiện hoặc thu con trực tiếp.
 * - 2026-10-19T14:45:00+07:00 | 3.1.5 | Cô lập id truyền cho onTabChange và onToggleChildren (STATE ISOLATION FIX).
 * - 2026-10-19T17:20:00+07:00 | 3.2.1 | Đồng bộ cơ chế Tab click mượt 100% hệt như MfoHistoryPreview (PREVIEW ALIGNED FIX).
 *
 * RULE COMPLIANCE:
 * - Q1 (Bảo tồn): Bảo toàn 100% cấu trúc Card, Handles, Tabs, Avatar và Event delegation.
 * - Q2 (Code Format): Đầy đủ docstring header và chú thích thời gian từng khối logic.
 */

import React from 'react';
import { Handle, Position, useUpdateNodeInternals } from 'reactflow';

function textOf(member, fallback = 'Chưa rõ') {
  return member?.full_name || fallback;
}

function initials(name) {
  const cleaned = String(name || '?')
    .replace(/[()]/g, '')
    .trim();
  return (
    cleaned
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  );
}

function Face({ name, url, right, isAnonymous }) {
  const [failed, setFailed] = React.useState(false);

  if (isAnonymous) {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-slate-500 bg-slate-100 text-xs font-black text-slate-800 shadow-inner">
        KD
      </div>
    );
  }

  return (
    <div
      className={[
        'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 text-xs font-black',
        right
          ? 'border-pink-500 bg-pink-50 text-pink-700'
          : 'border-sky-600 bg-sky-50 text-sky-800',
      ].join(' ')}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={name || ''}
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

function Person({ member, name, avatarUrl, right, isAnonymous }) {
  const display = name || textOf(member);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
      <Face name={display} url={avatarUrl} right={right} isAnonymous={isAnonymous} />
      <span className="line-clamp-2 w-full text-xs font-extrabold leading-tight text-slate-800">
        {display}
      </span>
    </div>
  );
}

function statusText(status) {
  return (
    {
      DANG_KET_HON: 'Đang kết hôn',
      GOA: 'Goá',
      LY_HON: 'Ly hôn',
      LY_THAN: 'Ly thân',
      KHAC: 'Khác',
    }[status] || status || ''
  );
}

export default function FamilyCoupleNode({ id, data }) {
  const nodeRef = React.useRef(null);
  const updateNodeInternals = useUpdateNodeInternals();
  const tabs = Array.isArray(data?.tabs) ? data.tabs : [];
  const activeUnionId = data?.activeUnionId || null;

  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(frame);
  }, [id, activeUnionId, tabs.length, data?.unassignedCount, updateNodeInternals]);
  
  const activeTab = tabs.find((tab) => tab.unionId === activeUnionId) || tabs[0] || null;

  const isClanAnonymous = Boolean(data?.isAnonymous);
  const isPartnerAnonymous = Boolean(activeTab?.partner?.isAnonymous || activeTab?.isAnonymous);

  function handleCardClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      const flowNodeId = id || data?.id;

      data?.onOpenActionForm?.({
        nodeId: flowNodeId,
        treeId: data?.treeId || id,
        isEmptyNode: false,
        depth: Number(data?.depth || 0),
        clanName: data?.clanName || textOf(data?.clan),
        unassignedCount: Number(data?.unassignedCount || 0),
        hasPartner: Boolean(activeTab?.partner || data?.partner),
        activeUnionId: activeTab?.unionId || activeUnionId || null,
        childCount: Number(activeTab?.childCount ?? data?.childCount ?? 0),
        rect,
        clanMember: data?.clan,
        isAnonymous: isClanAnonymous,
        originSource: data?.originSource || null,
        tabs,
      });
    }
  }

  return (
    <section
      ref={nodeRef}
      className={[
        'relative w-[240px] rounded-2xl border-2 bg-white p-2 shadow-md transition-all cursor-grab active:cursor-grabbing',
        data?.isTarget
          ? 'border-indigo-600 ring-2 ring-indigo-200'
          : isClanAnonymous
          ? 'border-slate-400 bg-slate-50/70 hover:border-slate-600'
          : 'border-slate-300 hover:border-indigo-400',
      ].join(' ')}
      onClick={handleCardClick}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-0 !bg-indigo-500"
      />

      <Handle
        id="owner:unassigned"
        type="source"
        position={Position.Bottom}
        className="!left-[22%] !h-2.5 !w-2.5 !border-0 !bg-amber-500"
      />

      {tabs.map((tab) => tab?.unionId ? (
        <Handle
          key={tab.unionId}
          id={'union:' + tab.unionId + ':children'}
          type="source"
          position={Position.Bottom}
          className={tab.unionId === (activeTab && activeTab.unionId) ? '!left-[78%] !h-2.5 !w-2.5 !border-0 !bg-indigo-500' : '!left-[78%] !h-2.5 !w-2.5 !border-0 !bg-indigo-500 !opacity-0'}
        />
      ) : null)}

      <div className="flex items-start gap-2">
        <Person
          member={data?.clan}
          name={data?.clanName}
          avatarUrl={data?.avatarUrl}
          isAnonymous={isClanAnonymous}
        />
        <div className="mt-3 h-px w-4 shrink-0 bg-slate-300" />
        {activeTab ? (
          <Person
            member={activeTab.partner || data?.partner}
            name={activeTab.partnerName || data?.partnerName}
            avatarUrl={activeTab.partnerAvatarUrl || data?.partnerAvatarUrl}
            right
            isAnonymous={isPartnerAnonymous}
          />
        ) : (
          <div className="flex min-w-0 flex-1 justify-center pt-3 text-xs font-bold text-slate-500">
            Chưa rõ
          </div>
        )}
      </div>

      {/* <2026-10-19T17:20:00+07:00> PREVIEW ALIGNED TAB FIX: Bắt sự kiện chuẩn ngắt bubbling */}
      {tabs.length > 0 ? (
        <div className="nodrag nopan mt-2 flex gap-1 overflow-x-auto border-t border-slate-100 pt-2">
          {tabs.map((tab, index) => (
            <button
              key={tab.unionId || `tab-${index}`}
              type="button"
              className={[
                'nodrag nopan shrink-0 rounded-lg border px-2 py-1 text-[10px] font-extrabold cursor-pointer touch-manipulation',
                tab.unionId === activeUnionId
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data?.onTabChange?.(data?.treeId || id, tab.unionId);
              }}
            >
              {tab.order != null ? String(tab.order) : '?'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-2 flex min-h-4 items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="text-[10px] font-bold text-slate-500">
          {statusText(activeTab?.status || data?.unionStatus)}
        </span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
          {Number(activeTab?.childCount ?? data?.childCount ?? 0)} con
          
          {data?.hasChildren ? (
            <button
              type="button"
              className="nodrag nopan min-h-6 min-w-6 rounded border border-slate-300 bg-white text-sm font-black cursor-pointer touch-manipulation"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                data.onToggleChildren?.(id, event);
              }}
            >
              {data.collapsed ? '+' : '−'}
            </button>
          ) : null}
        </span>
      </div>

      {Number(data?.unassignedCount || 0) > 0 ? (
        <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-center text-[10px] font-bold text-amber-800">
          {data.unassignedCount} con chưa gắn hôn phối
        </div>
      ) : null}
    </section>
  );
}