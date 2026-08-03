// file: src/middlewares/validate.middleware.js
const schemas = require('../shared/validations/base.validation'); // Bạn sẽ tạo file này sau

const validateEntity = (entityName) => {
  return (req, res, next) => {
    const schema = schemas[entityName];
    
    // Nếu chưa định nghĩa schema, cho qua để tránh lỗi (hoặc chặn lại tùy bạn)
    if (!schema) return next();

    const { error, value } = schema.validate(req.body, { 
        abortEarly: false, 
        stripUnknown: false //ĐỔI THÀNH FALSE để không bị mất dữ liệu Tab
    });

    if (error) {
      const messages = error.details.map(d => d.message);
      return res.status(400).json({ status: 'error', messages });
    }

    req.body = value;
    next();
  };
};

module.exports = validateEntity;