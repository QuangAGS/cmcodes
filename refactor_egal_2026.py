#!/usr/bin/env python3
# ============================================================================
# PATH        : refactor_egal_2026.py
# DATETIME    : 2026-07-18T10:00:00+07:00
# VERSION     : EGAL-AUTO-REFAC-V1.4-MAC-HARDENED
# DESCRIPTION : Bản vá tối ưu tầng sâu cho hệ điều hành macOS.
#               Loại bỏ hoàn toàn lỗi Cannot find module bằng cơ chế
#               chuẩn hóa đường dẫn tuyệt đối (Absolute Normalization).
# ============================================================================

import os
import re
import logging

# Cấu hình hệ thống Giám sát Nhật ký
logger = logging.getLogger("EGAL_Harden_Orchestrator")
logger.setLevel(logging.DEBUG)
log_formatter = logging.Formatter('[%(asctime)s] [%(levelname)-8s] %(message)s', datefmt='%Y-%m-%d %H:%M:%S')

file_handler = logging.FileHandler("refactor_execution.log", encoding="utf-8", mode="w")
file_handler.setLevel(logging.DEBUG)
file_handler.setFormatter(log_formatter)

console_handler = logging.StreamHandler()
console_handler.setLevel(logging.INFO)
console_handler.setFormatter(log_formatter)

logger.addHandler(file_handler)
logger.addHandler(console_handler)

# MA TRẬN ĐÍCH ĐẾN BẤT BIẾN CỦA CLEAN ARCHITECTURE (SỰ THẬT QUY CHIẾU)
EXACT_DESTINATION_MAP = {
    'branchRoutes': 'src/modules/members/branch.routes.js',
    'memberRoutes': 'src/modules/members/member.routes.js',
    'addressRoutes': 'src/modules/interactions/address.routes.js',
    'worshipRoutes': 'src/modules/worship/worship.routes.js',
    'tenantRoutes': 'src/modules/tenants/tenant.routes.js',
    'authLogRoutes': 'src/modules/auth/authLog.routes.js',
    'notificationRoutes': 'src/modules/notifications/notification.routes.js',
    'rateLimitMiddleware': 'src/middlewares/rateLimit.middleware.js',
    'achievementRoutes': 'src/modules/tenants/achievement.routes.js',
    'assetRoutes': 'src/modules/finance/asset.routes.js',
    'cemeteryRoutes': 'src/modules/worship/cemetery.routes.js',
    'graveRoutes': 'src/modules/worship/grave.routes.js',
    'eventRoutes': 'src/modules/interactions/event.routes.js',
    'fundRoutes': 'src/modules/finance/fund.routes.js',
    'fundTransactionRoutes': 'src/modules/finance/fundTransaction.routes.js',
    'suggestionRoutes': 'src/modules/interactions/suggestion.routes.js',
    'mediaRoutes': 'src/modules/interactions/media.routes.js',
    'authRoutes': 'src/modules/auth/auth.routes.js',
    'authService': 'src/modules/auth/auth.service.js',
    'authLogService': 'src/modules/auth/authLog.service.js',
    'securityGuard.service': 'src/services/security.service.js',
    'securityGuard.middleware': 'src/middlewares/securityGuard.middleware.js',
    'ipBlockMiddleware': 'src/middlewares/ipBlock.middleware.js',
    'ipBlock.middleware': 'src/middlewares/ipBlock.middleware.js',
    'validateMiddleware': 'src/middlewares/validate.middleware.js',
    'authMiddleware': 'src/middlewares/auth.middleware.js',
    'uploadMiddleware': 'src/middlewares/upload.middleware.js',
    'baseController': 'src/shared/controllers/base.controller.js',
    'commonService': 'src/shared/utils/common.utils.service.js',
    'prisma': 'src/lib/prisma.js',
    'dataIntegrityService': 'src/services/dataIntegrity.service.js',
    'auditService': 'src/services/audit.service.js',
    'emailService': 'src/services/email.service.js',
    'notificationService': 'src/modules/notifications/notification.service.js',
    'memberService': 'src/modules/members/member.service.js',
    'branchService': 'src/modules/members/branch.service.js',
    'mediaService': 'src/modules/interactions/media.service.js',
    'business-logger.service': 'src/services/ledger.service.js',
    'business-log-schemas': 'src/services/businessLogSchemas.js',
    'slugUtils': 'src/shared/utils/slug.utils.js',
    'turnstile': 'src/shared/utils/turnstile.utils.js',
    'baseValidation': 'src/shared/validations/base.validation.js'
}

def calculate_relative_require(src_file, raw_req_path):
    """Tính toán tuyến đường dẫn tuyệt đối an toàn cho môi trường UNIX/macOS"""
    # Chuẩn hóa đường dẫn nguồn loại bỏ dấu chấm đầu dòng rác nếu có
    clean_src = src_file.lstrip('./').replace('\\', '/')
    base_target = os.path.basename(raw_req_path)
    
    clean_target = base_target
    if clean_target.endswith('.js'):
        clean_target = clean_target[:-3]
        
    if clean_target not in EXACT_DESTINATION_MAP:
        return None
        
    target_physical_path = EXACT_DESTINATION_MAP[clean_target]
    
    src_dir = os.path.dirname(clean_src)
    target_dir = os.path.dirname(target_physical_path)
    
    target_basename = os.path.basename(target_physical_path)
    if target_basename.endswith('.js') and target_basename not in ['prisma.js']:
        target_basename = target_basename[:-3]
        
    # CHỐT CHẶN MACOS: Nếu cùng thư mục cha, ép thẳng tiền tố cấu trúc nội bộ './'
    if src_dir == target_dir:
        return f"./{target_basename}"
        
    # Nếu lệch phân hệ thư mục, tính toán số bước giật lùi cấp chuẩn hóa
    computed_rel = os.path.relpath(target_dir, src_dir).replace('\\', '/')
    
    new_path = f"{computed_rel}/{target_basename}"
    return new_path if new_path.startswith('.') else './' + new_path

def main():
    logger.info("====================================================================")
    logger.info("🚀 KÍCH HOẠT BẢN VÁ MAC-HARDENED V1.4: ĐỒNG BỘ TOÀN DIỆN HỆ THỐNG")
    logger.info("====================================================================")
    
    all_files = []
    for root, _, filenames in os.walk('.'):
        for filename in filenames:
            f_path = os.path.relpath(os.path.join(root, filename), '.').replace('\\', '/')
            if f_path.startswith('src/') and not f_path.endswith('.DS_Store'):
                all_files.append(f_path)

    success_count = 0
    for file_path in all_files:
        if not file_path.endswith('.js'):
            continue
            
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
            
        modified = False
        lines = content.splitlines(keepends=True)
        new_lines = []
        
        for idx, line in enumerate(lines):
            line_content = line
            
            # Sửa Header Block comment
            if idx < 30:
                match_p = re.search(r'((?:PATH|FILE|file)\s*:\s*)([^\s\n\*]+)', line_content, re.IGNORECASE)
                if match_p:
                    old_val = match_p.group(2).strip()
                    if old_val != file_path:
                        line_content = line_content.replace(old_val, file_path)
                        modified = True
                
                match_dt = re.search(r'((?:DATETIME|date)\s*:\s*)([^\n\*]+)', line_content, re.IGNORECASE)
                if match_dt:
                    old_dt = match_dt.group(2).strip()
                    if "2026-07-16" not in old_dt:
                        line_content = line_content.replace(old_dt, "2026-07-16T12:15:00+07:00")
                        modified = True

            # Sửa câu lệnh require() dựa trên bộ gác cổng phẳng mới
            if 'require(' in line_content and not line_content.strip().startswith('//') and not line_content.strip().startswith('*'):
                match_req = re.search(r'require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)', line_content)
                if match_req:
                    req_path = match_req.group(1).strip()
                    if req_path.startswith('.'):
                        new_path = calculate_relative_require(file_path, req_path)
                        if new_path and new_path != req_path:
                            logger.debug(f"[{file_path}] Dòng {idx+1}: '{req_path}' -> '{new_path}'")
                            line_content = line_content.replace(req_path, new_path)
                            modified = True
                            
            new_lines.append(line_content)
            
        if modified:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.writelines(new_lines)
            logger.info(f"Đã cập nhật cấu trúc thành công: {file_path}")
            success_count += 1

    logger.info("====================================================================")
    logger.info(f"🏁 HOÀN TẤT CHIẾN DỊCH V1.4: Sửa lỗi gãy import thành công trên {success_count} files.")
    logger.info("====================================================================")

if __name__ == '__main__':
    main()