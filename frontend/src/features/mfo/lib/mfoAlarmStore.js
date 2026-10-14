/**
 * PATH       : frontend/src/features/mfo/lib/mfoAlarmStore.js
 * DATETIME   : 2026-10-13T19:41:00+07:00
 * VERSION    : 3.2.0-REUSE-REACT-ALARM
 * DESCRIPTION: Queue dữ liệu thuần; không DOM, không TTS, không Sonner.
 * RULE       : Q1 giữ UI/API ngoài alarm; Q2 metadata và chú thích thời gian.
 */
const entries=[];
const listeners=new Set();
let serial=0;
const empty=null;
/** <2026-10-13T19:41:00+07:00> Mục đích: Snapshot ổn định cho useSyncExternalStore; chưa có host vẫn giữ queue. */
export function getMfoAlarmSnapshot(){return entries[0] || empty;}
/** <2026-10-13T19:41:00+07:00> Mục đích: SSR không hiển thị modal, không truy cập window/document. */
export function getMfoAlarmServerSnapshot(){return empty;}
/** <2026-10-13T19:41:00+07:00> Mục đích: Đăng ký host và cleanup subscription. */
export function subscribeMfoAlarm(listener){listeners.add(listener);return ()=>listeners.delete(listener);}
/** <2026-10-13T19:41:00+07:00> Mục đích: Thông báo thay đổi queue, không dựng UI trong store. */
function emit(){listeners.forEach((listener)=>listener());}
/** <2026-10-13T19:41:00+07:00> Mục đích: Giữ nguyên câu từ caller; hàng đợi FIFO, callback optional. */
export function enqueueMfoAlarm(text,options={}){
 const message=String(text ?? '').trim();if(!message)return ()=>{};
 const entry={id:++serial,message,kind:options.kind || 'info',onClose:options.onClose,spoken:false};
 entries.push(entry);emit();
 return ()=>remove(entry,false);
}
/** <2026-10-13T19:41:00+07:00> Mục đích: Xóa đúng entry; close callback chỉ chạy lúc người dùng đóng, không khi cleanup. */
function remove(entry,notify){
 const index=entries.indexOf(entry);if(index<0)return;
 entries.splice(index,1);emit();if(notify)entry.onClose?.();
}
/** <2026-10-13T19:41:00+07:00> Mục đích: Nút Đóng của host đóng đúng message hiện tại, chống callback cũ đóng entry mới. */
export function closeMfoAlarm(id){const entry=entries.find((item)=>item.id===id);if(entry)remove(entry,true);}
/** <2026-10-13T19:41:00+07:00> Mục đích: Đánh dấu đọc một lần theo id; StrictMode/remount không phát lại cùng entry. */
export function claimMfoAlarmSpeech(id){const entry=entries.find((item)=>item.id===id);if(!entry || entry.spoken)return false;entry.spoken=true;return true;}
