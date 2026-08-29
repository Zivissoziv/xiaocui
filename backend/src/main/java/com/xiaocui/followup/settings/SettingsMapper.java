package com.xiaocui.followup.settings;

import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;

@Mapper
public interface SettingsMapper {

    @Select("SELECT setting_value FROM app_settings WHERE setting_key = #{key}")
    String selectValue(@Param("key") String key);

    @Insert("INSERT INTO app_settings(setting_key, setting_value, updated_at) VALUES(#{key}, #{value}, #{now})")
    void insert(@Param("key") String key, @Param("value") String value, @Param("now") LocalDateTime now);

    @Update("UPDATE app_settings SET setting_value = #{value}, updated_at = #{now} WHERE setting_key = #{key}")
    void update(@Param("key") String key, @Param("value") String value, @Param("now") LocalDateTime now);
}
