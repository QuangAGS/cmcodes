/**
 * PATH       : frontend/src/features/genealogy/components/FiveLineLanes.jsx
 * DATETIME   : 2026-10-01T17:00:00+07:00
 * VERSION    : 1.0.0-COMPLETE-5L-CANVAS
 * DESCRIPTION: FanConnector nối đường SVG vuông góc (Orthogonal Path) theo đúng quan hệ st.parent.member.id -> child.member.id.
 * REFERENCE  : Technical Spec MFO (5L) v1.1.0-MFO-CANONICAL
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';

export const LANE_TONE = {
  0: { stroke: '#0284c7', bg: 'bg-sky-500', text: 'text-sky-700', border: 'border-sky-300' },
  1: { stroke: '#0d9488', bg: 'bg-teal-500', text: 'text-teal-700', border: 'border-teal-300' },
  2: { stroke: '#16a34a', bg: 'bg-emerald-500', text: 'text-emerald-700', border: 'border-emerald-300' },
  3: { stroke: '#9333ea', bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-300' },
  4: { stroke: '#e11d48', bg: 'bg-rose-500', text: 'text-rose-700', border: 'border-rose-300' },
};

export function LaneShell({ line = 0, k = '', showYou = false, children }) {
  const safeLine = typeof line === 'number' ? line : Number(line?.line ?? line) || 0;
  const tone = LANE_TONE[safeLine] || LANE_TONE[0];

  return (
    <div
      className={`relative my-1 inline-flex w-fit min-w-[340px] flex-nowrap items-center rounded-2xl border-2 ${tone.border} bg-transparent p-2 transition-all`}
    >
      <div
        className={`mr-3 flex h-full min-h-[90px] w-8 shrink-0 flex-col items-center justify-center rounded-xl ${tone.bg} px-1 text-center font-black text-white shadow-xs`}
      >
        <span className="text-[10px] tracking-wider uppercase opacity-90">ĐỜI</span>
        <span className="text-base leading-none">{safeLine}</span>
        {showYou && (
          <span className="mt-1 rounded-sm bg-white px-0.5 py-0.5 text-[8px] font-bold text-slate-900">
            TÔI
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-nowrap items-center gap-3 overflow-visible">
        {children}
      </div>
    </div>
  );
}

export function FanConnector({ lineIndex = 0, color = '#94a3b8', clusters = [] }) {
  const svgRef = useRef(null);
  const [paths, setPaths] = useState([]);

  const safeLineIndex = typeof lineIndex === 'number' ? lineIndex : Number(lineIndex?.lineIndex ?? lineIndex) || 0;
  const safeColor = typeof color === 'string' ? color : String(color || '#94a3b8');

  const recalculateConnector = useCallback(() => {
    if (!svgRef.current) return;
    const svgRect = svgRef.current.getBoundingClientRect();
    if (!svgRect.width || svgRect.width === 0) return;

    const newPaths = [];

    // Chỉ quét các thẻ Nội tộc chính chủ mang data-clan="true"
    const parentNodes = document.querySelectorAll(`[data-lane="${safeLineIndex - 1}"][data-clan="true"]`);
    const childNodes = document.querySelectorAll(`[data-lane="${safeLineIndex}"][data-clan="true"]`);

    if (parentNodes.length === 0 || childNodes.length === 0) {
      setPaths([]);
      return;
    }

    parentNodes.forEach((pNode) => {
      const parentId = pNode.getAttribute('data-member-id');
      if (!parentId) return;

      const pRect = pNode.getBoundingClientRect();
      const pX = pRect.left + pRect.width / 2 - svgRect.left;

      const matchedChildren = [];
      childNodes.forEach((cNode) => {
        const fId = cNode.getAttribute('data-father-id');
        const mId = cNode.getAttribute('data-mother-id');

        if (fId === parentId || mId === parentId) {
          const cRect = cNode.getBoundingClientRect();
          const cX = cRect.left + cRect.width / 2 - svgRect.left;
          matchedChildren.push(cX);
        }
      });

      if (matchedChildren.length === 1) {
        newPaths.push({ type: 'single', pX, cX: matchedChildren[0] });
      } else if (matchedChildren.length > 1) {
        const minCX = Math.min(...matchedChildren);
        const maxCX = Math.max(...matchedChildren);
        newPaths.push({ type: 'fan', pX, childrenX: matchedChildren, minCX, maxCX });
      }
    });

    setPaths(newPaths);
  }, [safeLineIndex]);

  useEffect(() => {
    const timer = setTimeout(recalculateConnector, 120);

    window.addEventListener('resize', recalculateConnector);
    window.addEventListener('scroll', recalculateConnector, true);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', recalculateConnector);
      window.removeEventListener('scroll', recalculateConnector, true);
    };
  }, [recalculateConnector, clusters]);

  return (
    <div className="relative my-0 h-7 w-full overflow-visible">
      <svg
        ref={svgRef}
        className="h-full w-full overflow-visible"
        style={{ vectorEffect: 'non-scaling-stroke' }}
      >
        <g stroke={safeColor} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
          {paths.map((p, idx) => {
            if (p.type === 'single') {
              // ĐƯỜNG NỐI CHỮ-N VUÔNG GÓC CHO 1 CON
              return (
                <path
                  key={idx}
                  d={`M ${p.pX} 0 L ${p.pX} 14 L ${p.cX} 14 L ${p.cX} 28`}
                />
              );
            }
            if (p.type === 'fan') {
              // ĐƯỜNG NỐI HÌNH QUẠT VUÔNG GÓC CHO NHIỀU CON TRONG CÙNG 1 ST
              const startX = Math.min(p.pX, p.minCX);
              const endX = Math.max(p.pX, p.maxCX);
              return (
                <g key={idx}>
                  <line x1={p.pX} y1="0" x2={p.pX} y2="14" />
                  <line x1={startX} y1="14" x2={endX} y2="14" />
                  {p.childrenX.map((cX, cIdx) => (
                    <line key={cIdx} x1={cX} y1="14" x2={cX} y2="28" />
                  ))}
                </g>
              );
            }
            return null;
          })}
        </g>
      </svg>
    </div>
  );
}