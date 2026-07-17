/**
 * PATH       : backend/src/services/onboarding.service.js
 * DATETIME   : 2026-06-23T22:35:00+07:00
 * VERSION    : 1.0.0-ONBOARDING-SERVICE-EXHAUSTIVE
 * DESCRIPTION:
 * - TRÁI TIM NGHIỆP VỤ: Thực thi giao dịch nguyên tử (Atomic Transaction) thông qua Prisma.
 * - TRÀO LƯU LEDGER VẾT CẠN: Ghi chép đồng thời lịch sử tiến trình BPL và kích hoạt thông điệp mạng lưới CL.
 * - Tuân thủ cơ chế lọc dữ liệu mềm Soft Delete và Multi-tenant cô lập hoàn toàn từ hệ thống lõi.
 */

const { prisma } = require('../lib/prisma'); // Kế thừa hạ tầng prisma.js cấu hình sẵn

/**
 * <2026-06-23T22:38:00+07:00> Nghiệp vụ Hoàn thiện hồ sơ thành viên (Member Step 1)
 */
exports.executeMemberProfileCompletion = async ({ userId, tenantId, formData, correlationId, ipAddress, userAgent }) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Kiểm tra an ninh trạng thái tài khoản hiện tại
        const user = await tx.users.findUnique({ where: { id: userId } });
        if (!user || user.member_id) {
            throw { statusCode: 400, code: 'ALREADY_ONBOARDED', message: 'Tài khoản đã được liên kết thành viên dòng họ.' };
        }

        // 2. Đồng bộ khởi tạo địa chỉ cư trú của thành viên (Addresses)
        const currentAddress = await tx.addresses.create({
            data: {
                tenant_id: tenantId,
                full_address: formData.full_address,
                province_name: formData.province_name,
                changed_by: userId
            }
        });

        // 3. Khởi tạo thực thể Member mới ở trạng thái dự bị
        const newMember = await tx.members.create({
            data: {
                tenant_id: tenantId,
                full_name: formData.full_name || user.name,
                gender: formData.gender,
                birth_year: formData.birth_year,
                phone_number: user.phone || formData.phone,
                current_address_id: currentAddress.id,
                status: 'DU_BI', // Ép trạng thái dự bị chờ khớp nối cây lớn
                role: 'THANH_VIEN',
                changed_by: userId
            }
        });

        // 4. Cập nhật con trỏ mấu chốt member_id trên bảng users
        await tx.users.update({
            where: { id: userId },
            data: { member_id: newMember.id }
        });

        // 5. GHI GIAO DỊCH BPL (Business Process Ledger)
        await tx.business_process_logs.create({
            data: {
                correlation_id: correlationId,
                attempt_no: 1,
                process_type: 'MEMBER_ADD',
                actor_type: 'USER',
                actor_id: userId,
                tenant_id: tenantId,
                process_status: 'SUCCESS',
                metadata: {
                    process_name: 'MEMBER_ONBOARDING_INIT',
                    stage: 'STAGE_1_PROFILE_COMPLETION',
                    payload_snapshot: { member_id: newMember.id, address_id: currentAddress.id }
                }
            }
        });

        // 6. GHI NHẬT KÝ KIỂM TOÁN AUDIT_LOGS
        await tx.audit_logs.create({
            data: {
                table_name: 'members',
                record_id: newMember.id,
                action: 'THEM_MOI',
                new_data: { full_name: newMember.full_name, status: 'DU_BI' },
                tenant_id: tenantId,
                changed_by: userId,
                correlation_id: correlationId
            }
        });

        return { memberId: newMember.id, status: 'DU_BI' };
    });
};

/**
 * <2026-06-23T22:45:00+07:00> Nghiệp vụ Kích hoạt không gian dòng họ (Clan Admin Step 4)
 */
exports.executeClanActivation = async ({ userId, tenantId, correlationId, ipAddress, userAgent }) => {
    return await prisma.$transaction(async (tx) => {
        // 1. Cập nhật trạng thái Tenant sang HOAT_DONG
        const updatedTenant = await tx.tenants.update({
            where: { id: tenantId },
            data: { status: 'HOAT_DONG' }
        });

        // 2. Chuyển quyền người dùng lên CLAN_ADMIN thực thụ
        await tx.users.update({
            where: { id: userId },
            data: { role: 'CLAN_ADMIN' }
        });

        // 3. Đánh vết chuỗi hoạt động BPL
        await tx.business_process_logs.create({
            data: {
                correlation_id: correlationId,
                attempt_no: 1,
                process_type: 'CLAN_CREATE',
                actor_type: 'USER',
                actor_id: userId,
                tenant_id: tenantId,
                process_status: 'SUCCESS',
                metadata: { process_name: 'CLAN_ACTIVATION', final_status: 'HOAT_DONG' }
            }
        });

        // 4. BẮN THÔNG BÁO CL (Communication Ledger): Tạo tin báo hệ thống toàn cục cho Admin dòng họ
        const notification = await tx.notifications.create({
            data: {
                user_id: userId,
                tenant_id: tenantId,
                type: 'HE_THONG',
                title: 'Kích hoạt không gian số dòng họ thành công',
                content: `Không gian dòng họ thuộc Tenant ${updatedTenant.name} đã chính thức hoạt động. Bạn có thể chia sẻ mã mời con cháu gia nhập.`,
                is_read: false,
                level: 'IMPORTANT',
                status: 'SENT',
                event_type: 'PASSWORD_CHANGED', // Hoặc bổ sung enum chuyên biệt
                correlation_id: correlationId,
                reliability: 'HIGH'
            }
        });

        // Ghi nhận bảng người nhận tin nhắn (Notification Recipients)
        await tx.notification_recipients.create({
            data: {
                notification_id: notification.id,
                user_id: userId,
                changed_by: userId
            }
        });

        return { tenantId, status: 'HOAT_DONG' };
    });
};