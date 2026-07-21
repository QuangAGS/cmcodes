// Nạp basePrisma và tenantContext từ file cấu hình prisma.js
// Lưu ý: Đảm bảo đường dẫn '../lib/prisma' là chính xác với cấu trúc thư mục của bạn
const { basePrisma, tenantContext } = require('../lib/prisma.js');

/**
 * Middleware: tenantMiddleware
 * Mục tiêu: Lấy 'slug' từ người dùng, tìm ID dòng họ và lưu vào bộ nhớ tạm (Context)
 */
const tenantMiddleware = async (req, res, next) => {
  // 1. Tìm mã định danh (slug) từ Header HOẶC từ URL (Query String)
  // Ưu tiên Header 'x-tenant-slug', nếu không có thì tìm '?slug=...' trên URL
  const slug = req.headers['x-tenant-slug'] || req.query.slug;

  // 2. Nếu không có mã định danh, chặn yêu cầu và báo lỗi
  if (!slug) {
    return res.status(403).json({ 
      error: "Thiếu mã định danh dòng họ",
      message: "Bạn cần cung cấp 'x-tenant-slug' trong Header hoặc '?slug=...' trong URL để truy cập dữ liệu."
    });
  }

  try {
    // 3. Truy vấn bảng 'tenants' để tìm ID dòng họ tương ứng với slug
    // Quan trọng: Sử dụng 'basePrisma' (bản gốc) để tránh bị bộ lọc tự động chặn chính nó
    const tenant = await basePrisma.tenants.findUnique({
      where: { slug: slug },
      select: { id: true, name: true }
    });

    // 4. Nếu mã slug không tồn tại trong hệ thống, báo lỗi 404
    if (!tenant) {
      return res.status(404).json({ 
        error: "Dòng họ không tồn tại",
        message: `Không tìm thấy dòng họ nào với mã định danh: '${slug}'` 
      });
    }

    // 5. "Gói" toàn bộ các xử lý tiếp theo (next) vào trong ngữ cảnh của Tenant này.
    // Mọi câu lệnh Prisma ở các file Service sau đó sẽ tự động lấy được 'tenantId' này.
    tenantContext.run({ tenantId: tenant.id }, () => {
      // Log nhẹ để bạn dễ theo dõi khi debug trong console
      // console.log(`[Tenant Context] Đang xử lý yêu cầu cho: ${tenant.name}`);
      next();
    });

  } catch (error) {
    console.error("Lỗi xác thực Tenant Middleware:", error);
    res.status(500).json({ 
      error: "Lỗi hệ thống", 
      message: "Đã xảy ra lỗi khi xác định thông tin dòng họ." 
    });
  }
};

module.exports = tenantMiddleware;