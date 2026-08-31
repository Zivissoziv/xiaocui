package com.xiaocui.followup.addressbook;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface AddressBookMapper {

    @Select("SELECT id, name, email, department, phone, created_at, updated_at" +
            " FROM address_book_contacts ORDER BY updated_at DESC, id DESC")
    List<AddressBookRows.ContactRow> selectAll();

    @Select("SELECT id, name, email, department, phone, created_at, updated_at" +
            " FROM address_book_contacts WHERE id = #{id}")
    AddressBookRows.ContactRow selectById(@Param("id") long id);

    /** 按姓名精确匹配，同名时取更新时间最新的一条。 */
    @Select("SELECT id, name, email, department, phone, created_at, updated_at" +
            " FROM address_book_contacts WHERE name = #{name} ORDER BY updated_at DESC, id DESC LIMIT 1")
    AddressBookRows.ContactRow selectByName(@Param("name") String name);

    @Insert("INSERT INTO address_book_contacts(id, name, email, department, phone, created_at, updated_at)" +
            " VALUES(#{id}, #{name}, #{email}, #{department}, #{phone}, #{now}, #{now})")
    void insert(@Param("id") long id,
                @Param("name") String name,
                @Param("email") String email,
                @Param("department") String department,
                @Param("phone") String phone,
                @Param("now") LocalDateTime now);

    @Update("UPDATE address_book_contacts SET email = #{email}, department = #{department}," +
            " phone = #{phone}, updated_at = #{now} WHERE id = #{id}")
    void updateContact(@Param("id") long id,
                       @Param("email") String email,
                       @Param("department") String department,
                       @Param("phone") String phone,
                       @Param("now") LocalDateTime now);

    @Update("UPDATE address_book_contacts SET name = #{name}, updated_at = #{now} WHERE id = #{id}")
    void rename(@Param("id") long id, @Param("name") String name, @Param("now") LocalDateTime now);

    @Delete("DELETE FROM address_book_contacts WHERE id = #{id}")
    void delete(@Param("id") long id);
}
