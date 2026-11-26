/**
 * PATH       : features/mfo/__tests__/fe-phase1-qa.test.jsx
 * DATETIME   : 2026-11-26T11:10:00+07:00
 * VERSION    : 1.1.0-QA
 * DESCRIPTION:
 * - Bộ kiểm thử tự động (Vitest + React Testing Library) cho FE-01..FE-04 & tích hợp Phase 1.
 * QX: Tuân thủ chặt chẽ Q1–Q4.
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { GenerationOffsetWarning } from '../components/GenerationOffsetWarning';
import { ConflictCitationList } from '../components/ConflictCitationList';
import { CanonicalRedirectBanner } from '../components/CanonicalRedirectBanner';
import { MemberCanonicalRedirectNotice } from '../components/MemberCanonicalRedirectNotice';
import { attachCanonicalRedirectInterceptor } from '../../../lib/canonicalRedirectInterceptor';
import { SMALL_TREE_STATUS_LABELS, getStatusLabel } from '../small-trees/constants';
import { SmallTreeMergePanel } from '../small-trees/SmallTreeMergePanel';
import { CreateSmallTreeForm } from '../small-trees/CreateSmallTreeForm';
import { EntityResolutionWizard } from '../entity-resolution/EntityResolutionWizard';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

afterEach(() => {
  cleanup();
});

describe('FE-04: Shared Components', () => {
  it('GenerationOffsetWarning trả về null khi offset = 0 hoặc null/boolean', () => {
    const { container, rerender } = render(<GenerationOffsetWarning offset={0} sourceTitle="Src A" />);
    expect(container.firstChild).toBeNull();

    rerender(<GenerationOffsetWarning offset={null} sourceTitle="Src A" />);
    expect(container.firstChild).toBeNull();

    rerender(<GenerationOffsetWarning offset={true} sourceTitle="Src A" />);
    expect(container.firstChild).toBeNull();
  });

  it('GenerationOffsetWarning hiển thị cảnh báo mềm khi offset !== 0 và không gắn nhãn trạng thái DISPUTED', () => {
    render(<GenerationOffsetWarning offset={-2} sourceTitle="Cây nhánh A" />);
    expect(screen.getByText(/Cảnh báo mềm/i)).toBeTruthy();
    expect(screen.getByText(/root_generation_offset = -2/i)).toBeTruthy();
    expect(screen.queryByText(/^DISPUTED$/i)).toBeNull();
  });

  it('ConflictCitationList trả về null khi rỗng và render danh sách khi có conflict', () => {
    const { container, rerender } = render(<ConflictCitationList conflicts={[]} />);
    expect(container.firstChild).toBeNull();

    rerender(
      <ConflictCitationList
        conflicts={[
          { citation_id: 'SYS_CIT::CONFLICT_MERGE::1', claimed_generation: 5 },
          { citation_id: 'SYS_CIT::CONFLICT_MERGE::1', claimed_generation: 6 },
        ]}
      />
    );
    expect(screen.getByText(/Conflict Assertions/i)).toBeTruthy();
    expect(screen.getAllByText(/SYS_CIT::CONFLICT_MERGE::1/i)).toHaveLength(2);
  });
});

describe('FE-03: Canonical Redirect', () => {
  it('attachCanonicalRedirectInterceptor gắn _canonicalRedirect khi có X-Canonical-Member-Id và data là object', async () => {
    let fulfilled;
    const mockClient = {
      interceptors: {
        response: {
          use: (fn) => {
            fulfilled = fn;
          },
        },
      },
    };
    attachCanonicalRedirectInterceptor(mockClient);

    const resObj = await fulfilled({
      headers: { 'x-canonical-member-id': 'mem-canonical-99', 'x-merge-redirect-depth': '2' },
      data: { id: 'mem-old-1', name: 'Nguyễn Văn A' },
    });
    expect(resObj.data._canonicalRedirect).toEqual({ to: 'mem-canonical-99', depth: '2' });

    const resArr = await fulfilled({
      headers: { 'x-canonical-member-id': 'mem-canonical-99' },
      data: [{ id: 'mem-old-1' }],
    });
    expect(resArr.data._canonicalRedirect).toBeUndefined();
  });

  it('CanonicalRedirectBanner render khi có redirect.to và trả về null khi không có', () => {
    const Wrapper = createWrapper();
    const { container, rerender } = render(<CanonicalRedirectBanner redirect={null} />, {
      wrapper: Wrapper,
    });
    expect(container.firstChild).toBeNull();

    rerender(<CanonicalRedirectBanner redirect={{ to: 'mem-canonical-99' }} />);
    expect(screen.getByText(/Hồ sơ này đã được gộp vào hồ sơ chuẩn/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Xem hồ sơ chuẩn/i })).toBeTruthy();
  });

  it('MemberCanonicalRedirectNotice gắn tại cấp page hiển thị banner khi có _canonicalRedirect', () => {
    render(
      <MemberCanonicalRedirectNotice
        tenantId="tenant-1"
        data={{ id: 'm1', _canonicalRedirect: { to: 'm2' } }}
      />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByText(/Xem hồ sơ chuẩn/i)).toBeTruthy();
  });
});

describe('FE-02: Small Trees Constants & Permissions', () => {
  it('Nhãn trạng thái tiếng Việt đúng chuẩn', () => {
    expect(SMALL_TREE_STATUS_LABELS).toEqual({
      CHO_GHEP: 'Chờ ghép',
      DA_GHEP: 'Đã ghép',
      HUY: 'Đã hủy',
    });
    expect(getStatusLabel('CHO_GHEP')).toBe('Chờ ghép');
  });

  it('SmallTreeMergePanel chỉ hiện nút Ghép cho Admin và nút Hủy cho Admin hoặc owner', () => {
    const tree = { id: 'st-1', status: 'CHO_GHEP', owner_user_id: 'user-owner' };

    const { rerender } = render(
      <SmallTreeMergePanel smallTree={tree} isAdmin={false} currentUserId="user-other" />,
      { wrapper: createWrapper() }
    );
    expect(screen.queryByRole('button', { name: 'Ghép' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hủy' })).toBeNull();

    rerender(
      <SmallTreeMergePanel smallTree={tree} isAdmin={false} currentUserId="user-owner" />,
      { wrapper: createWrapper() }
    );
    expect(screen.queryByRole('button', { name: 'Ghép' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeTruthy();

    rerender(
      <SmallTreeMergePanel smallTree={tree} isAdmin={true} currentUserId="admin-1" />,
      { wrapper: createWrapper() }
    );
    expect(screen.getByRole('button', { name: 'Ghép' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hủy' })).toBeTruthy();
  });

  it('CreateSmallTreeForm giữ form khi submit thiếu dữ liệu bắt buộc', () => {
    render(<CreateSmallTreeForm tenantId={null} ownerUserId={null} />, {
      wrapper: createWrapper(),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));
    expect(screen.getByPlaceholderText(/Nhập ID thành viên gốc/i)).toBeTruthy();
  });
});

describe('FE-01: EntityResolutionWizard Guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Chặn tự gộp khi sourceMemberId === targetMemberId', () => {
    render(<EntityResolutionWizard tenantId="tenant-1" />, { wrapper: createWrapper() });
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'member-same' } });
    fireEvent.change(inputs[1], { target: { value: 'member-same' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('button', { name: 'Xác nhận gộp' }).disabled).toBe(true);
  });
});