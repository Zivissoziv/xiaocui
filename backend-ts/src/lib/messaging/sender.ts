import { FollowupTask, ReminderEvent } from '../../common/types';
import { nowStr } from '../../common/util';

/** 手动复制发送：只产生一条留痕记录，等价 Java 版 ManualCopySender。 */
export function send(sessionId: number, task: FollowupTask): ReminderEvent {
  return {
    id: 0,
    sessionId,
    followupTaskId: task.id,
    channel: 'manual',
    recipientId: task.recipientId,
    messageSnapshot: task.messageFinal,
    status: 'sent',
    sentAt: nowStr(),
    failedReason: '',
  };
}
