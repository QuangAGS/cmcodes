/**
 * PATH       : src/pages/AdminWorkSelectorPage.jsx
 * DATETIME   : 2026-08-09T20:15:00+07:00
 * VERSION    : 1.0.0-OP-2
 * DESCRIPTION:
 * - OP-2: Trang trung gian (Work Selector) cho SYSTEM_ADMIN / CLAN_ADMIN.
 * - Nếu tenantStatus === TAM_NGUNG → ưu tiên card Kích hoạt dòng họ, khóa các card nặng.
 * - Nếu HOAT_DONG → hiện đầy đủ lựa chọn.
 * - Q1: Không đụng logic Approval / Register hiện có.
 */

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  ShieldCheck,
  Users,
  Building2,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';

const AdminWorkSelectorPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const tenantStatus = user?.tenantStatus || user?.tenant_status || null;
  const isTamNgung = tenantStatus === 'TAM_NGUNG';
  const isHoatDong = tenantStatus === 'HOAT_DONG';
  const isSystemAdmin = user?.role === 'SYSTEM_ADMIN';

  const cards = [
    {
      id: 'activate',
      title: 'Kích hoạt dòng họ',
      description: 'Chuyển dòng họ từ tạm ngưng sang hoạt động để bắt đầu sử dụng đầy đủ.',
      icon: Building2,
      path: '/admin/tenant/activate',
      visible: isTamNgung || isSystemAdmin,
      primary: isTamNgung,
      disabled: !isTamNgung && !isSystemAdmin,
    },
    {
      id: 'approval',
      title: 'Phê duyệt thành viên',
      description: 'Duyệt, từ chối hoặc yêu cầu bổ sung hồ sơ đăng ký.',
      icon: Users,
      path: '/admin/approval',
      visible: true,
      primary: false,
      disabled: isTamNgung && !isSystemAdmin,
    },
    {
      id: 'dashboard',
      title: 'Tổng quan quản trị',
      description: 'Xem thông tin tổng quan dòng họ và các chức năng quản trị khác.',
      icon: ShieldCheck,
      path: '/tree',
      visible: true,
      primary: false,
      disabled: isTamNgung && !isSystemAdmin,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black text-slate-800">
            Chọn công việc
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Xin chào, <span className="font-semibold text-slate-700">{user?.name || 'Quản trị viên'}</span>
          </p>
          {isTamNgung && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <span>
                Dòng họ đang ở trạng thái <strong>Tạm ngưng</strong>. 
                Vui lòng kích hoạt trước khi sử dụng các chức năng quản trị khác.
              </span>
            </div>
          )}
        </div>

        {/* Cards */}
        <div className="space-y-3">
          {cards
            .filter((c) => c.visible)
            .map((card) => {
              const Icon = card.icon;
              const isDisabled = card.disabled;

              return (
                <button
                  key={card.id}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && navigate(card.path)}
                  className={`
                    flex w-full items-center gap-4 rounded-3xl border p-5 text-left transition
                    ${card.primary
                      ? 'border-indigo-300 bg-indigo-50 shadow-md shadow-indigo-100'
                      : 'border-slate-200 bg-white shadow-sm'}
                    ${isDisabled
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:border-indigo-300 hover:bg-indigo-50/50 active:scale-[0.98]'}
                  `}
                >
                  <div
                    className={`
                      flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl
                      ${card.primary ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}
                    `}
                  >
                    <Icon className="h-6 w-6" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800">{card.title}</div>
                    <div className="mt-0.5 text-sm text-slate-500 line-clamp-2">
                      {card.description}
                    </div>
                  </div>

                  {!isDisabled && (
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </div>
  );
};

export default AdminWorkSelectorPage;