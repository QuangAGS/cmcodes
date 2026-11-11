/**
 * =============================================================================
 * PATH        : frontend/src/features/membership/pages/SelectTenantPage.jsx
 * DATETIME    : 2026-11-10T20:55:00+07:00
 * VERSION     : 1.1.0-SELECT-TENANT-ROLE-IN-TENANT
 * DESCRIPTION : Trang chọn dòng họ và vai trò làm việc (Multi-Home).
 *               Role lấy từ role_in_tenant của user_member_links
 *               (không dùng users.role).
 *               - ≥ 2 dòng họ DA_DUYET: chọn dòng họ.
 *               - Dòng họ có quyền admin: chọn Thành viên (/op) hoặc Quản trị (/admin).
 *               - Chỉ USER: vào thẳng /op.
 * =============================================================================
 * CHANGELOGS:
 * - 2026-11-10T20:55:00+07:00 (v1.1.0-SELECT-TENANT-ROLE-IN-TENANT):
 *   + 2 bước: chọn dòng họ → chọn vai trò theo role_in_tenant.
 *   + Default Thành viên → /op; Admin → /admin.
 *   + Chuẩn hóa QX.
 * =============================================================================
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';

const ADMIN_ROLES = new Set([
  'SYSTEM_ADMIN',
  'CLAN_ADMIN',
  'TRUONG_HO',
  'TRUONG_TOC',
  'TRUONG_NGANH',
  'TRUONG_CHI',
]);

const getRoleInTenant = (clan) =>
  String(clan?.roleInTenant || clan?.role_in_tenant || 'USER').toUpperCase();

const isAdminRole = (role) => ADMIN_ROLES.has(role);

export const SelectTenantPage = () => {
  const navigate = useNavigate();
  const { availableClans, switchContext, isSwitchingContext, activeContext } = useAuth();

  const [step, setStep] = useState(1);
  const [selectedClan, setSelectedClan] = useState(null);
  const [error, setError] = useState('');

  const approvedClans = (availableClans || []).filter(
    (c) => (c.status || 'DA_DUYET') === 'DA_DUYET'
  );

  useEffect(() => {
    if (approvedClans.length === 0) {
      navigate('/membership/claim', { replace: true });
      return;
    }
    if (approvedClans.length === 1) {
      const only = approvedClans[0];
      const role = getRoleInTenant(only);
      if (!isAdminRole(role)) {
        enterAs(only, '/op');
      } else {
        setSelectedClan(only);
        setStep(2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedClans.length]);

  const enterAs = async (clan, path) => {
    try {
      setError('');
      if (clan.tenantId && clan.tenantId !== activeContext?.activeTenantId) {
        await switchContext(clan.tenantId);
      }
      navigate(path, { replace: true });
    } catch (err) {
      console.error('Không thể vào dòng họ:', err);
      setError(err?.response?.data?.message || 'Không thể chuyển dòng họ. Vui lòng thử lại.');
    }
  };

  const handleSelectClan = (clan) => {
    setSelectedClan(clan);
    const role = getRoleInTenant(clan);
    if (isAdminRole(role)) {
      setStep(2);
    } else {
      enterAs(clan, '/op');
    }
  };

  if (approvedClans.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-gray-600">Đang chuyển hướng...</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto my-10 p-6 sm:p-8 bg-white border border-gray-200 rounded-3xl shadow-lg">
      <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 text-center">
        {step === 1 ? 'Chọn dòng họ để vào' : 'Chọn vai trò làm việc'}
      </h1>
      <p className="text-gray-600 text-center mt-2 mb-6 text-base">
        {step === 1
          ? 'Bác/Bạn thuộc nhiều dòng họ. Chọn một dòng họ để tiếp tục.'
          : `Dòng họ: ${selectedClan?.clanName || ''}. Chọn cách vào.`}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-sm">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {approvedClans.map((clan) => {
            const role = getRoleInTenant(clan);
            return (
              <button
                key={clan.tenantId}
                type="button"
                disabled={isSwitchingContext}
                onClick={() => handleSelectClan(clan)}
                className="w-full text-left px-5 py-4 min-h-[56px] rounded-2xl border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-lg font-bold text-gray-900">
                    {clan.clanName || 'Dòng họ'}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    Vai trò trong họ: {role}
                    {clan.isDefault ? ' · Mặc định' : ''}
                  </div>
                </div>
                <span className="text-sm font-semibold text-blue-700 shrink-0">Chọn</span>
              </button>
            );
          })}
        </div>
      )}

      {step === 2 && selectedClan && (
        <div className="space-y-3">
          <button
            type="button"
            disabled={isSwitchingContext}
            onClick={() => enterAs(selectedClan, '/op')}
            className="w-full py-4 min-h-[56px] rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg"
          >
            Vào với tư cách Thành viên
          </button>
          <button
            type="button"
            disabled={isSwitchingContext}
            onClick={() => enterAs(selectedClan, '/admin')}
            className="w-full py-4 min-h-[56px] rounded-2xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-lg"
          >
            Vào với tư cách Quản trị
          </button>
          {approvedClans.length > 1 && (
            <button
              type="button"
              onClick={() => setStep(1)}
              className="w-full py-3 min-h-[48px] rounded-2xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold"
            >
              Chọn lại dòng họ
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default SelectTenantPage;
