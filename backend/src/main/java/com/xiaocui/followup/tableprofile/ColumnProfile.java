package com.xiaocui.followup.tableprofile;

import java.util.List;

public record ColumnProfile(
        String column,
        String typeGuess,
        double nonEmptyRate,
        int uniqueCount,
        List<String> sampleValues
) {
}
