/**
 * PATH       : src/pages/AdminTenantActivatePage.jsx
 * DATETIME   : 2026-08-09T20:15:00+07:00
 * VERSION    : 1.0.0-OP-2
 * DESCRIPTION:
 * - OP-2: Trang kích hoạt tenant (TAM_NGUNG → HOAT_DONG).
 * - Gọi POST /api/tenants/:id/activate.
 * - Sau thành công bắt buộc refresh JWT rồi quay về /admin.
 * - Q1: Không đụng Approval / Register.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Building2, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import apiClient from '../lib/apiClient.js';

const AdminTenantActivatePage = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const tenantId = user?.tenantId || user?.tenant_id;
  const tenantStatus = user?.tenantStatus || user?.tenant_status;

  // Guard
  if (tenantStatus && tenantStatus !== 'TAM_NGUNG' && user?.role !== 'SYSTEM_ADMIN') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-center text-slate-600">
          Dòng họ không ở trạng thái cần kích hoạt.
        </p>
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="rounded-2xl bg-slate-800 px-6 py-3 font-bold text-white"
        >
          Quay lại
        </button>
      </div>
    );
  }

  const handleActivate = async () => {
    if (!tenantId) {
      toast.error('Không tìm thấy thông tin dòng họ.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post(`/tenants/${tenantId}/activate`);
      const data = res.data?.data || res.data;

      toast.success(res.data?.message || 'Dòng họ đã được kích hoạt thành công.');

      // Bắt buộc refresh JWT / cập nhật user
      // Cách an toàn nhất hiện tại: gọi lại /auth/me
      try {
        const meRes = await apiClient.get('/auth/me');
        const freshUser = meRes.data?.user || meRes.data?.data?.user;
        if (freshUser) {
          setUser(freshUser);
        } else if (user) {
          // Fallback: cập nhật local
          setUser({
            ...user,
            tenantStatus: 'HOAT_DONG',
            tenant_status: 'HOAT_DONG',
          });
        }
      } catch {
        // Nếu /auth/me lỗi, vẫn cập nhật local để UX không bị kẹt
        if (user) {
          setUser({
            ...user,
            tenantStatus: 'HOAT_DONG',
            tenant_status: 'HOAT_DONG',
          });
        }
      }

      setDone(true);

      // Chuyển về Work Selector sau 1.2s
      setTimeout(() => {
        navigate('/admin', { replace: true });
      }, 1200);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err.message ||
        'Không thể kích hoạt dòng họ.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-md">
        {/* Back */}
        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Quay lại
        </button>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              {done ? (
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              ) : (
                <Building2 className="h-8 w-8" />
              )}
            </div>
          </div>

          <h1 className="text-center text-xl font-black text-slate-800">
            {done ? 'Đã kích hoạt thành công' : 'Kích hoạt dòng họ'}
          </h1>

          <p className="mt-3 text-center text-sm leading-relaxed text-slate-500">
            {done
              ? 'Dòng họ đã chuyển sang trạng thái Hoạt động. Bạn sẽ được chuyển về trang lựa chọn công việc.'
              : 'Dòng họ hiện đang ở trạng thái Tạm ngưng. Nhấn nút bên dưới để kích hoạt và mở khóa đầy đủ chức năng quản trị.'}
          </p>

          {!done && (
            <button
              type="button"
              disabled={loading || !tenantId}
              onClick={handleActivate}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Đang kích hoạt...
                </>
              ) : (
                'Kích hoạt ngay'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminTenantActivatePage;