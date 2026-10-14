/**
 * PATH       : frontend/src/features/mfo/components/MfoAlarmHost.jsx
 * DATETIME   : 2026-10-13T19:41:00+07:00
 * VERSION    : 3.2.0-REUSE-REACT-ALARM
 * DESCRIPTION: Host React cố định ngoài routes, sử dụng MfoAlarmOverlay gốc.
 * RULE       : Q1 giữ UI/API ngoài alarm; Q2 metadata và chú thích thời gian.
 */
import { useSyncExternalStore } from 'react';
import MfoAlarmOverlay from './MfoAlarmOverlay.jsx';
import { subscribeMfoAlarm, getMfoAlarmSnapshot, getMfoAlarmServerSnapshot, closeMfoAlarm } from '../lib/mfoAlarmStore.js';
/** <2026-10-13T19:41:00+07:00> Mục đích: Không dựng giao diện mới; truyền entry đang đầu queue vào component hiện có. */
export default function MfoAlarmHost(){
 const alarm=useSyncExternalStore(subscribeMfoAlarm,getMfoAlarmSnapshot,getMfoAlarmServerSnapshot);
 return <MfoAlarmOverlay host open={Boolean(alarm)} message={alarm?.message || ''} alarmId={alarm?.id} onClose={()=>{if(alarm)closeMfoAlarm(alarm.id);}} />;
}
