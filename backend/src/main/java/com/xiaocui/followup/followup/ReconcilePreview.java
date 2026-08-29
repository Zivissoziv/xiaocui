package com.xiaocui.followup.followup;

import java.util.List;

/**
 * 上传最新版 Excel 后的对账预览：与当前数据逐行比对，只读不落库，供用户确认后再执行更新。
 *
 * @param added     新出现的待补充对象（将新建）
 * @param resolved  已补充完整、将标记完成的对象（不会动已发送留痕）
 * @param updated   仍然缺失但缺项内容有变化的对象（将刷新缺项摘要）
 * @param unchanged 与当前数据完全一致的对象数量
 */
public record ReconcilePreview(
        List<RowDiff> added,
        List<RowDiff> resolved,
        List<RowDiff> updated,
        int unchanged
) {
    /**
     * @param owner           负责人（按姓名聚合）
     * @param missing         新表中缺失的字段
     * @param previousMissing 当前记录中的缺失字段（新增对象时为空）
     * @param note            变更类型说明
     */
    public record RowDiff(
            String owner,
            List<String> missing,
            List<String> previousMissing,
            String note
    ) {}
}
