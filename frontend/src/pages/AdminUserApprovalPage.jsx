/**
 * PATH       : src/pages/AdminUserApprovalPage.jsx (Hàm fetchReviewableUsers)
 * DATETIME   : 2026-06-20T12:05:00+07:00
 * VERSION    : 25.1.3-ISSUE1-DATA-BRIDGING-PATCH
 * DESCRIPTION:
 * - VÁ DỨT ĐIỂM ISSUE 1: Khớp nối và truyền trọn vẹn dữ liệu hợp đồng (userData, tenantData) sang cho UserApprovalForm.
 * - Hòa trộn cấu trúc dữ liệu phẳng bề nổi và dữ liệu nested lồng nhau vào một Object duy nhất khi setSelectedUser.
 * - Q1-Bảo tồn: Giữ vẹn nguyên 100% giao diện thẻ card Mobile-first và logic đóng mở view review chi tiết của bản gốc.
 * - Q2-Code Format: Chú thích rõ ràng mục đích bổ sung kèm thẻ thời gian thực thi an toàn.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Search, 
  SlidersHorizontal, 
  ChevronLeft, 
  ChevronRight, 
  UserCheck, 
  UserX, 
  ShieldAlert, 
  RefreshCw 
} from 'lucide-react';
import UserApprovalForm from '../features/admin/components/UserApprovalForm.jsx';
import apiClient from  '../lib/apiClient.js';
import { useAuth } from '../context/AuthContext.jsx';

const STATUS_BADGES = {
  CHO_DUYET: 'bg-amber-50 text-amber-700 border-amber-200',
  DA_DUYET: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  TU_CHOI: 'bg-rose-50 text-rose-700 border-rose-200',
  BI_KHOA: 'bg-slate-100 text-slate-700 border-slate-300 font-black',
};

const STATUS_LABELS = {
  CHO_DUYET: 'Chờ duyệt',
  DA_DUYET: 'Đang hoạt động',
  TU_CHOI: 'Bị từ chối',
  BI_KHOA: 'Đang bị khóa',
};

const AdminUserApprovalPage = () => {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();

  // State quản lý danh sách & phân trang nhận từ Backend
  const [usersList, setUsersList] = useState([]);
  const [pagination, setPagination] = useState({ total_records: 0, current_page: 1, total_pages: 1 });
  
  // State quản lý Trạng thái nghiệp vụ
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFilters, setShowFilters] = useState(false); // Toggle bộ lọc trên mobile

  // State lưu trữ các "Mối quan tâm" (Bộ lọc động)
  const [filters, setFilters] = useState({
    status: 'CHO_DUYET', // Mặc định hiển thị hồ sơ đăng ký mới
    role: '',
    searchKeyword: '',
    page: 1,
    limit: 10
  });

  // Hàm gọi API truy vấn động
  const fetchReviewableUsers = useCallback(async (currentFilters) => {
    setLoading(true);
    try {
      // Chuyển đổi các trường trống thành undefined để tối ưu hóa query string params
      const params = {};
      Object.keys(currentFilters).forEach(key => {
        if (currentFilters[key] !== '') params[key] = currentFilters[key];
      });

      const response = await apiClient.post('/auth/query-reviewable-users', params);
      
      const rawData = response.data?.data || response.data || [];
      const rawUsersArray = Array.isArray(rawData) ? rawData : (rawData.data || []);
      const serverPagination = rawData.pagination || { total_records: rawUsersArray.length, current_page: 1, total_pages: 1 };

      /**
       * 🚨 KHỐI MÃ LỆNH ÁNH XẠ VẾT CẠN DỮ LIỆU ĐỐI CHIẾU <2026-06-20T12:18:00+07:00>
       * LÝ DO: Giao diện UserApprovalForm cần Năm sinh, Tên Cha/Mẹ, Mô tả dòng họ để Admin đối chiếu thông tin chính xác.
       * CHỨC NĂNG: Khai thác triệt để các trường lồng sâu trong temp_snapshot và tenant để đẩy lên các thuộc tính phẳng.
       */
      const normalizedUsers = rawUsersArray
        .map(item => {
          if (!item) return item;

          const actualUser = item.userData || item;
          const snapshot = actualUser.temp_snapshot || item.temp_snapshot || {};
          const actualTenant = actualUser.tenant || item.tenant || null;
          const actualMember = actualUser.member_profile || item.memberData || null;

          // Trích xuất thông tin đối chiếu thô từ hồ sơ đăng ký của thành viên
          const registrationFullName = snapshot.full_name || item.temp_full_name || actualUser.name || 'Thành viên chưa đặt tên';
          const registrationBirthYear = snapshot.birth_year || actualUser.birth_year || 'Chưa cập nhật';
          const registrationFatherName = snapshot.father_name || actualUser.father_name || 'Chưa rõ';
          const registrationMotherName = snapshot.mother_name || actualUser.mother_name || 'Chưa rõ';
          const registrationRelationship = snapshot.relationship_to_clan || actualUser.relationship_to_clan || 'Thành viên đăng ký mới';

          return {
            // 🏛️ LỚP 1: Các trường phẳng bề nổi phục vụ hiển thị tức thì trên Thẻ Card và Form
            id: actualUser.id || item.id,
            name: registrationFullName,
            temp_full_name: registrationFullName,
            phone: actualUser.phone || item.phone || 'Chưa có số',
            email: actualUser.email || item.email || 'Chưa có email',
            status: actualUser.status || item.status || 'CHO_DUYET',
            role: actualUser.role || item.role || 'MEMBER',

            // 🏛️ LỚP 2: Các trường bổ sung đặc hiệu để Admin đối chiếu hồ sơ (Vừa bổ sung)
            birth_year: registrationBirthYear,
            father_name: registrationFatherName,
            mother_name: registrationMotherName,
            relationship_to_clan: registrationRelationship,

            // 🏛️ LỚP 3: Cấu trúc nested bọc thông tin gốc bảng Users để bảo vệ các logic phụ trợ
            userData: {
              ...actualUser,
              id: actualUser.id || item.id,
              temp_full_name: registrationFullName,
              birth_year: registrationBirthYear,
              father_name: registrationFatherName,
              mother_name: registrationMotherName,
              relationship_to_clan: registrationRelationship
            },

            // 🏛️ LỚP 4: Cấu trúc tenantData tương thích ngược cho Form hiển thị chi tiết dòng họ
            tenantData: actualTenant ? {
              id: actualTenant.id,
              clan_name: actualTenant.name || 'Dòng họ chưa đặt tên',
              status: actualTenant.status || 'CHO_DUYET',
              description: actualTenant.description || actualTenant.notes || 'Hệ thống dữ liệu tộc hệ chính thức',
              slug: actualTenant.slug || '',
              ...actualTenant
            } : null,

            // 🏛️ LỚP 5: Cấu trúc dữ liệu cây gia phả vật lý chuẩn bị cho Issue 2
            memberData: actualMember ? {
              id: actualMember.id,
              branch_name: actualMember.branch_name || snapshot.branch_name || 'Chi cành chủ quản',
              generation: actualMember.generation || 1,
              ...actualMember
            } : null,

            // Giữ lại các nhánh nguyên bản phòng hờ
            temp_snapshot: snapshot,
            tenant: actualTenant,
            member_profile: actualMember
          };
        })
        // Bộ lọc UX thực chiến: Gạt SYSTEM_ADMIN ra ngoài danh sách xử lý của dòng họ
        .filter(u => u && u.role !== 'SYSTEM_ADMIN');

      setUsersList(normalizedUsers);
      setPagination(serverPagination);

    } catch (err) {
      console.error('❌ [Fetch Users Error]:', err);

      const code = err?.response?.data?.code || err?.code;
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Không thể tải danh sách tài khoản theo bộ lọc.';

      if (code === 'TENANT_NOT_ACTIVATED') {
        toast.error(
          msg ||
            'Dòng họ đang tạm ngưng hoặc chưa kích hoạt. Vui lòng hoàn thiện thông tin dòng họ trước khi duyệt thành viên.'
        );
        // Optional: đưa CLAN_ADMIN về trang chính thay vì kẹt màn hình trống
        // navigate('/tree');
        setUsersList([]);
        return;
      }

      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // Kích hoạt nạp dữ liệu khi bộ lọc hoặc số trang thay đổi
  useEffect(() => {
    fetchReviewableUsers(filters);
  }, [filters.page, fetchReviewableUsers]);

  // Xử lý khi Admin nhấn nút Tìm kiếm trên Form
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setFilters(prev => ({ ...prev, page: 1 })); // Reset về trang 1 khi lọc mới
    fetchReviewableUsers({ ...filters, page: 1 });
  };

  // Thay đổi trang (Pagination)
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= pagination.total_pages) {
      setFilters(prev => ({ ...prev, page: newPage }));
    }
  };

  // Xử lý nộp quyết định thay đổi trạng thái (Approve/Reject/Lock)
  const handleApprovalSubmit = async (formData) => {
    setSubmitting(true);
    try {
      await apiClient.post('/auth/process-approval', {
        userId: selectedUser.id,
        newStatus: formData.newStatus,
        adminNote: formData.adminNote
      });

      toast.success(`Cập nhật trạng thái tài khoản thành công!`);
      setSelectedUser(null);
      // Tải lại dữ liệu tại trang hiện tại để cập nhật bảng
      fetchReviewableUsers(filters);
    } catch (err) {
      console.error('❌ [Submit Approval Error]:', err);
      toast.error(err.response?.data?.message || 'Thao tác xử lý hồ sơ thất bại.');
    } finally {
      setSubmitting(false);
    }
  };

  // Giao diện hiển thị khi đang mở Modal/Form Review chi tiết một User
  if (selectedUser) {
    return (
      <div className="min-h-screen bg-slate-50 py-6">
        <div className="max-w-[480px] mx-auto px-4">
          <div className="mb-6">
            <button
              onClick={() => setSelectedUser(null)}
              className="inline-flex items-center gap-2 text-sm font-black text-slate-600 hover:text-indigo-600 transition"
            >
              <ChevronLeft size={16} /> Quay lại bảng điều khiển
            </button>
          </div>
          <UserApprovalForm
            userData={selectedUser}
            loading={submitting}
            onCancel={() => setSelectedUser(null)}
            onSubmit={handleApprovalSubmit}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-6 text-slate-900 font-sans">
      <div className="max-w-[640px] mx-auto px-4">
        
        {/* HEADER ĐỒNG BỘ AUTH_PAGE */}
        <div className="mb-8 text-center">
          <p className="text-xs font-black uppercase tracking-widest text-indigo-600">HỆ THỐNG TRUNG TÂM</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Sổ Cái Thành Viên</h1>
          <p className="mt-2 text-sm text-slate-600 font-medium">Tìm kiếm, điều phối vòng đời tài khoản tộc hệ</p>
        </div>

        {/* COMPONENT 1: BỘ LỌC TÌM KIẾM ĐỘNG (MOBILE-FIRST ADAPTIVE) */}
        <form onSubmit={handleSearchSubmit} className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên, email, số điện thoại..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium outline-none transition focus:border-indigo-50 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                value={filters.searchKeyword}
                onChange={(e) => setFilters(prev => ({ ...prev, searchKeyword: e.target.value }))}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center justify-center rounded-2xl border p-3.5 transition ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'}`}
            >
              <SlidersHorizontal size={18} />
            </button>
          </div>

          {/* VÙNG LỌC NÂNG CAO */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-4 animate-fadeIn">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Mối quan tâm Trạng thái</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">-- Tất cả trạng thái vòng đời --</option>
                  <option value="CHO_DUYET">Hồ sơ chờ phê duyệt mới</option>
                  <option value="DA_DUYET">Tài khoản đang hoạt động bình thường</option>
                  <option value="TU_CHOI">Hồ sơ đăng ký bị từ chối</option>
                  <option value="BI_KHOA">Tài khoản bị khóa (Bảo mật/Kỷ luật)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-1.5">Vai trò nghiệp vụ</label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold"
                  value={filters.role}
                  onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="">-- Tất cả vai trò --</option>
                  <option value="USER">Thành viên liên kết họ (USER)</option>
                  <option value="CLAN_ADMIN">Quản trị viên dòng họ (CLAN_ADMIN)</option>
                </select>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="w-full sm:w-auto rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-black text-white shadow-sm hover:bg-slate-800 transition"
                >
                  Áp dụng bộ lọc
                </button>
              </div>
            </div>
          )}
        </form>

        {/* COMPONENT 2: DANH SÁCH DẠNG THẺ CARD */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-slate-200 bg-white">
            <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin" />
            <p className="mt-3 text-sm font-black text-slate-600">Đang quét sổ cái cơ sở dữ liệu...</p>
          </div>
        ) : usersList.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-slate-200 bg-white p-6">
            <ShieldAlert className="mx-auto h-10 w-10 text-slate-400" />
            <h3 className="mt-4 text-sm font-black text-slate-900">Không tìm thấy tài khoản nào</h3>
            <p className="mt-1 text-xs text-slate-500">Mối quan tâm hiện tại của bạn không khớp với dữ liệu biến động nào trong dòng họ.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {usersList.map((item) => (
              <div 
                key={item.id} 
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 transition flex flex-col justify-between gap-4 sm:flex-row sm:items-center"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-black tracking-tight text-slate-900">
                      {item.temp_full_name}
                    </span>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${STATUS_BADGES[item.status] || 'bg-slate-50'}`}>
                      {STATUS_LABELS[item.status] || item.status}
                    </span>
                  </div>
                  
                  <div className="text-xs font-medium text-slate-500 space-y-0.5">
                    <p>Liên hệ: <span className="font-bold text-slate-700">{item.phone || item.email}</span></p>
                    <p>Dòng họ: <span className="font-bold text-indigo-900">{item.tenantData?.clan_name || 'Chưa phân bổ tộc hệ'}</span></p>
                    
                    {item.memberData && (
                      <p className="mt-1 inline-flex items-center gap-1 rounded bg-indigo-50/70 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">
                        🔗 Đã liên kết cây: {item.memberData.branch_name} (Đời {item.memberData.generation})
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-end border-t border-slate-50 pt-3 sm:border-none sm:pt-0">
                  <button
                    onClick={() => setSelectedUser(item)}
                    className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-black border shadow-sm transition ${
                      item.status === 'CHO_DUYET' 
                        ? 'bg-amber-600 border-amber-600 text-white hover:bg-amber-700' 
                        : item.status === 'BI_KHOA'
                        ? 'bg-white border-slate-200 text-emerald-700 hover:bg-slate-50'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {item.status === 'CHO_DUYET' && <UserCheck size={14} />}
                    {item.status === 'BI_KHOA' && <UserCheck size={14} />}
                    {item.status === 'DA_DUYET' && <UserX size={14} />}
                    
                    {item.status === 'CHO_DUYET' ? 'Xét duyệt hồ sơ' : item.status === 'BI_KHOA' ? 'Mở khóa tài khoản' : 'Điều chỉnh quyền'}
                  </button>
                </div>
              </div>
            ))}

            {/* COMPONENT 3: PHÂN TRANG THÍCH ỨNG */}
            {pagination.total_pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200 pt-4 px-2">
                <span className="text-xs font-bold text-slate-500">
                  Trang {pagination.current_page} / {pagination.total_pages} ({pagination.total_records} hồ sơ)
                </span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pagination.current_page === 1 || loading}
                    onClick={() => handlePageChange(pagination.current_page - 1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    disabled={pagination.current_page === pagination.total_pages || loading}
                    onClick={() => handlePageChange(pagination.current_page + 1)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default AdminUserApprovalPage;