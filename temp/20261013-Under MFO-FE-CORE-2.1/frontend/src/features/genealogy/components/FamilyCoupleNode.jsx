/**
 * PATH       : frontend/src/features/genealogy/components/FamilyCoupleNode.jsx
 * DATETIME   : 2026-10-03T22:50:00+07:00
 * VERSION    : 3.1.0-COMPLETE-5L-CANVAS-KD
 * DESCRIPTION:
 * - Bảo tồn 100% v3.0.0-COMPLETE-5L-CANVAS: Handles đa điểm, Drag/Drop, Tabs, Avatar "XT".
 * - Bổ sung nhận diện thành viên khuyết danh (isAnonymous === true hoặc avatarType === 'KD'):
 *   Render Avatar "KD" chữ đậm (bold), viền và nền xám trung tính (border-slate-500 bg-slate-100 text-slate-800).
 * - Bổ sung truyền cờ isAnonymous, originSource, tabs vào payload onOpenActionForm phục vụ ma trận bật/tắt Action Form.
 */

import React from 'react';
import { Handle, Position } from 'reactflow';

/**
 * <2026-10-03T22:50:00+07:00>
 * Hàm trích xuất tên hiển thị của thành viên từ dữ liệu gốc, fallback mặc định 'Chưa rõ'.
 */
function textOf(member, fallback = 'Chưa rõ') {
  return member?.full_name || fallback;
}

/**
 * <2026-10-03T22:50:00+07:00>
 * Hàm trích xuất 2 ký tự viết tắt.
 * Đối với người nháp mang nhãn '(Xin tạo)', tự động sinh chuỗi "XT".
 */
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

/**
 * <2026-10-03T22:50:00+07:00>
 * Component Face đại diện cho ảnh đại diện hoặc ký tự viết tắt:
 * - isAnonymous === true: Render Avatar xám, chữ in hoa đậm 'KD'.
 * - Nhân sự nháp (Xin tạo): Render Avatar sky 'XT'.
 * - Phối ngẫu nữ/nam: Phân biệt border pink hoặc sky theo vai trò right/left.
 */
function Face({ name, url, right, isAnonymous }) {
  const [failed, setFailed] = React.useState(false);

  // Nhận diện nhân sự khuyết danh
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

/**
 * <2026-10-03T22:50:00+07:00>
 * Component Person hiển thị 1 cá nhân (chủ hộ hoặc phối ngẫu) gồm Avatar + Tên.
 */
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

/**
 * <2026-10-03T22:50:00+07:00>
 * Chuyển đổi mã trạng thái hôn nhân sang tiếng Việt.
 */
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

/**
 * <2026-10-03T22:50:00+07:00>
 * Custom Node đại diện cho Cụm Hôn phối (Standard Tree Card):
 * - Quản lý Handles theo Hợp đồng A-1.5 (Top, 22% Unassigned vàng, 78% Active Tab chàm).
 * - Quản lý Tabs Hôn phối đa vợ/chồng.
 * - Phát sự kiện mở Action Form và truyền cờ isAnonymous / originSource.
 */
export default function FamilyCoupleNode({ id, data }) {
  const nodeRef = React.useRef(null);
  const tabs = Array.isArray(data?.tabs) ? data.tabs : [];
  const activeUnionId = data?.activeUnionId || null;
  const activeTab = tabs.find((tab) => tab.unionId === activeUnionId) || tabs[0] || null;

  const isClanAnonymous = Boolean(data?.isAnonymous);
  const isPartnerAnonymous = Boolean(activeTab?.partner?.isAnonymous || activeTab?.isAnonymous);

  /**
   * <2026-10-03T22:50:00+07:00>
   * Chuyển Tab hôn phối đang kích hoạt.
   */
  function selectTab(unionId) {
    if (!unionId || unionId === activeUnionId) return;
    data?.onTabChange?.(data?.treeId, unionId);
  }

  /**
   * <2026-10-03T22:50:00+07:00>
   * Bắt sự kiện click vào thẻ Card để mở Action Form (AF) Portal.
   * Truyền bổ sung cờ isAnonymous và originSource để AF xác định ma trận nút bấm.
   */
  function handleCardClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (nodeRef.current) {
      const rect = nodeRef.current.getBoundingClientRect();
      const flowNodeId = id || data?.id;

      data?.onOpenActionForm?.({
        nodeId: flowNodeId,
        treeId: data?.treeId,
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
      {/* Handle Đỉnh (Target đón nối từ thế hệ cha mẹ ở Lane trên) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-0 !bg-indigo-500"
      />

      {/* Handle Đáy 22% (Vàng hổ phách - Con chưa gắn hôn phối / đơn thân) */}
      <Handle
        id="owner:unassigned"
        type="source"
        position={Position.Bottom}
        className="!left-[22%] !h-2.5 !w-2.5 !border-0 !bg-amber-500"
      />

      {/* Handle Đáy 78% (Tím chàm - Con thuộc Tab Hôn phối active) */}
      {activeTab?.unionId ? (
        <Handle
          id={'union:' + activeTab.unionId + ':children'}
          type="source"
          position={Position.Bottom}
          className="!left-[78%] !h-2.5 !w-2.5 !border-0 !bg-indigo-500"
        />
      ) : null}

      {}
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

      {}
      {tabs.length > 0 ? (
        <div className="mt-2 flex gap-1 overflow-x-auto border-t border-slate-100 pt-2">
          {tabs.map((tab, index) => (
            <button
              key={tab.unionId || `tab-${index}`}
              type="button"
              className={[
                'nodrag nopan shrink-0 rounded-lg border px-2 py-1 text-[10px] font-extrabold',
                tab.unionId === activeUnionId
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-slate-50 text-slate-700',
              ].join(' ')}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selectTab(tab.unionId);
              }}
            >
              {tab.order != null ? String(tab.order) : '?'}
            </button>
          ))}
        </div>
      ) : null}

      {}
      <div className="mt-2 flex min-h-4 items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="text-[10px] font-bold text-slate-500">
          {statusText(activeTab?.status || data?.unionStatus)}
        </span>
        <span className="text-[10px] font-bold text-slate-500">
          {Number(activeTab?.childCount ?? data?.childCount ?? 0)} con
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