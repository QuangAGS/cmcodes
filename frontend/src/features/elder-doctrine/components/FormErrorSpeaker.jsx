/**
 * PATH       : src/features/elder-doctrine/components/FormErrorSpeaker.jsx
 * DATETIME   : 2026-05-11T00:00:00+07:00
 * VERSION    : 1.0.0 (REFACTOR))
 * DESCRIPTION:
 * - Sprint 3: Tạo component FormErrorSpeaker dùng chung cho Frontend Accessibility Layer.
 * - Component cho phép người dùng chủ động bấm để nghe hướng dẫn ngắn.
 * - Không tự động đọc khi render.
 * - Không thay đổi business logic, auth flow, validation hoặc UI/UX hiện có.
 * - Tuân thủ Q1/Q2.
 */

import React from 'react';
import { useTts } from '../../../shared/hooks/useTts';

const FormErrorSpeaker = ({ errors }) => {
  const { speak } = useTts();

  React.useEffect(() => {
    if (errors && Object.keys(errors).length > 0) {
      const errorText = Object.values(errors).join('. ');
      speak(`Có lỗi xảy ra: ${errorText}`);
    }
  }, [errors, speak]);

  return null;
};

export default FormErrorSpeaker;