#include <node_api.h>
#include <assert.h>
#include <string>
#include <vector>
#include <iostream>
#include <cstring>
#include <algorithm>

// Base64 编码表
static const char *BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Base64 编码
std::string base64_encode(const unsigned char *data, size_t len)
{
  if (!data || len == 0)
    return "";

  std::string result;
  result.reserve((len + 2) / 3 * 4); // 预分配内存

  for (size_t i = 0; i < len; i += 3)
  {
    uint32_t value = static_cast<uint32_t>(data[i]) << 16;
    if (i + 1 < len)
      value |= static_cast<uint32_t>(data[i + 1]) << 8;
    if (i + 2 < len)
      value |= static_cast<uint32_t>(data[i + 2]);

    result += BASE64_CHARS[(value >> 18) & 0x3F];
    result += BASE64_CHARS[(value >> 12) & 0x3F];
    result += (i + 1 < len) ? BASE64_CHARS[(value >> 6) & 0x3F] : '=';
    result += (i + 2 < len) ? BASE64_CHARS[value & 0x3F] : '=';
  }

  return result;
}

// Base64 解码
std::vector<uint8_t> base64_decode(const std::string &encoded)
{
  if (encoded.empty())
    return {};

  auto get_base64_index = [](char c) -> int
  {
    if (c >= 'A' && c <= 'Z')
      return c - 'A';
    if (c >= 'a' && c <= 'z')
      return c - 'a' + 26;
    if (c >= '0' && c <= '9')
      return c - '0' + 52;
    if (c == '+')
      return 62;
    if (c == '/')
      return 63;
    return -1;
  };

  std::vector<uint8_t> result;
  result.reserve(encoded.size() * 3 / 4);

  for (size_t i = 0; i < encoded.size(); i += 4)
  {
    uint32_t value = 0;
    int valid_chars = 0;

    for (int j = 0; j < 4 && i + j < encoded.size(); j++)
    {
      char c = encoded[i + j];
      if (c == '=')
        break;

      int index = get_base64_index(c);
      if (index == -1)
        continue;

      value = (value << 6) | index;
      valid_chars++;
    }

    if (valid_chars >= 2)
    {
      value <<= (4 - valid_chars) * 6;
      result.push_back((value >> 16) & 0xFF);
      if (valid_chars >= 3)
        result.push_back((value >> 8) & 0xFF);
      if (valid_chars >= 4)
        result.push_back(value & 0xFF);
    }
  }

  return result;
}

// 创建字符串值
napi_value create_string(napi_env env, const std::string &str)
{
  napi_value result;
  napi_status status = napi_create_string_utf8(env, str.c_str(), str.size(), &result);
  if (status != napi_ok)
    return nullptr;
  return result;
}

// 创建带类型标识的对象
napi_value create_typed_object(napi_env env, const char *type_name)
{
  napi_value obj, type_value;
  if (napi_create_object(env, &obj) != napi_ok)
    return nullptr;
  if (napi_create_string_utf8(env, type_name, NAPI_AUTO_LENGTH, &type_value) != napi_ok)
    return nullptr;
  if (napi_set_named_property(env, obj, "$type", type_value) != napi_ok)
    return nullptr;
  return obj;
}

// 获取字符串值
std::string get_string_value(napi_env env, napi_value str_val)
{
  size_t str_len;
  if (napi_get_value_string_utf8(env, str_val, nullptr, 0, &str_len) != napi_ok)
    return "";

  std::string result(str_len, '\0');
  if (napi_get_value_string_utf8(env, str_val, &result[0], str_len + 1, &str_len) != napi_ok)
    return "";

  return result;
}

// 类型检测函数
bool is_buffer(napi_env env, napi_value val)
{
  bool result = false;
  napi_is_buffer(env, val, &result);
  return result;
}

bool is_array(napi_env env, napi_value val)
{
  bool result = false;
  napi_is_array(env, val, &result);
  return result;
}

bool is_map(napi_env env, napi_value val)
{
  napi_value global, map_constructor;
  if (napi_get_global(env, &global) != napi_ok)
    return false;
  if (napi_get_named_property(env, global, "Map", &map_constructor) != napi_ok)
    return false;

  bool result = false;
  napi_instanceof(env, val, map_constructor, &result);
  return result;
}

// 前向声明
napi_value encode_value(napi_env env, napi_value value);
napi_value decode_value(napi_env env, napi_value obj);

// 编码 Map 类型
napi_value encode_map(napi_env env, napi_value map)
{
  napi_value result = create_typed_object(env, "Map");
  if (!result)
    return nullptr;

  // 获取 Map 的 entries
  napi_value entries_method, iterator;
  if (napi_get_named_property(env, map, "entries", &entries_method) != napi_ok)
    return nullptr;
  if (napi_call_function(env, map, entries_method, 0, nullptr, &iterator) != napi_ok)
    return nullptr;

  napi_value entries_array;
  if (napi_create_array(env, &entries_array) != napi_ok)
    return nullptr;

  uint32_t index = 0;
  napi_value next_method;
  if (napi_get_named_property(env, iterator, "next", &next_method) != napi_ok)
    return nullptr;

  while (true)
  {
    napi_value next_result;
    if (napi_call_function(env, iterator, next_method, 0, nullptr, &next_result) != napi_ok)
      break;

    napi_value done_val;
    bool done = false;
    if (napi_get_named_property(env, next_result, "done", &done_val) != napi_ok)
      break;
    if (napi_get_value_bool(env, done_val, &done) != napi_ok)
      break;
    if (done)
      break;

    napi_value entry_pair;
    if (napi_get_named_property(env, next_result, "value", &entry_pair) != napi_ok)
      break;

    napi_value key, value;
    if (napi_get_element(env, entry_pair, 0, &key) != napi_ok)
      break;
    if (napi_get_element(env, entry_pair, 1, &value) != napi_ok)
      break;

    napi_value encoded_key = encode_value(env, key);
    napi_value encoded_value = encode_value(env, value);
    if (!encoded_key || !encoded_value)
      break;

    napi_value encoded_pair;
    if (napi_create_array_with_length(env, 2, &encoded_pair) != napi_ok)
      break;
    if (napi_set_element(env, encoded_pair, 0, encoded_key) != napi_ok)
      break;
    if (napi_set_element(env, encoded_pair, 1, encoded_value) != napi_ok)
      break;
    if (napi_set_element(env, entries_array, index++, encoded_pair) != napi_ok)
      break;
  }

  napi_set_named_property(env, result, "$value", entries_array);
  return result;
}

// 编码数组类型
napi_value encode_array(napi_env env, napi_value arr)
{
  napi_value result = create_typed_object(env, "Array");
  if (!result)
    return nullptr;

  uint32_t length;
  if (napi_get_array_length(env, arr, &length) != napi_ok)
    return nullptr;

  napi_value encoded_array;
  if (napi_create_array_with_length(env, length, &encoded_array) != napi_ok)
    return nullptr;

  for (uint32_t i = 0; i < length; i++)
  {
    napi_value element;
    if (napi_get_element(env, arr, i, &element) != napi_ok)
      continue;

    napi_value encoded_element = encode_value(env, element);
    if (encoded_element)
    {
      napi_set_element(env, encoded_array, i, encoded_element);
    }
  }

  napi_set_named_property(env, result, "$value", encoded_array);
  return result;
}

// 编码对象类型
napi_value encode_object(napi_env env, napi_value obj)
{
  napi_value result = create_typed_object(env, "Object");
  if (!result)
    return nullptr;

  napi_value prop_names;
  if (napi_get_property_names(env, obj, &prop_names) != napi_ok)
    return nullptr;

  uint32_t prop_count;
  if (napi_get_array_length(env, prop_names, &prop_count) != napi_ok)
    return nullptr;

  napi_value encoded_obj;
  if (napi_create_object(env, &encoded_obj) != napi_ok)
    return nullptr;

  for (uint32_t i = 0; i < prop_count; i++)
  {
    napi_value prop_name;
    if (napi_get_element(env, prop_names, i, &prop_name) != napi_ok)
      continue;

    std::string key = get_string_value(env, prop_name);
    if (key.empty())
      continue;

    napi_value prop_value;
    if (napi_get_named_property(env, obj, key.c_str(), &prop_value) != napi_ok)
      continue;

    napi_value encoded_value = encode_value(env, prop_value);
    if (encoded_value)
    {
      napi_set_named_property(env, encoded_obj, key.c_str(), encoded_value);
    }
  }

  napi_set_named_property(env, result, "$value", encoded_obj);
  return result;
}

// 主编码函数
napi_value encode_value(napi_env env, napi_value value)
{
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok)
    return nullptr;

  // 检查 null
  bool is_null_val = false;
  if (napi_is_null(env, value, &is_null_val) == napi_ok && is_null_val)
  {
    return create_typed_object(env, "null");
  }

  // 检查 undefined
  bool is_undefined_val = false;
  if (napi_is_undefined(env, value, &is_undefined_val) == napi_ok && is_undefined_val)
  {
    return create_typed_object(env, "undefined");
  }

  switch (type)
  {
  case napi_number:
  {
    napi_value result = create_typed_object(env, "number");
    if (result)
      napi_set_named_property(env, result, "$value", value);
    return result;
  }

  case napi_string:
  {
    napi_value result = create_typed_object(env, "string");
    if (result)
      napi_set_named_property(env, result, "$value", value);
    return result;
  }

  case napi_boolean:
  {
    napi_value result = create_typed_object(env, "boolean");
    if (result)
      napi_set_named_property(env, result, "$value", value);
    return result;
  }

  case napi_object:
  {
    if (is_buffer(env, value))
    {
      // 处理 Buffer
      void *data;
      size_t length;
      if (napi_get_buffer_info(env, value, &data, &length) != napi_ok)
        return nullptr;

      std::string base64_str = base64_encode(static_cast<const unsigned char *>(data), length);
      napi_value result = create_typed_object(env, "Buffer");
      napi_value base64_val = create_string(env, base64_str);
      if (result && base64_val)
      {
        napi_set_named_property(env, result, "$value", base64_val);
      }
      return result;
    }

    if (is_map(env, value))
    {
      return encode_map(env, value);
    }

    if (is_array(env, value))
    {
      return encode_array(env, value);
    }

    return encode_object(env, value);
  }

  default:
    return nullptr;
  }
}

// 主解码函数
napi_value decode_value(napi_env env, napi_value obj)
{
  napi_valuetype type;
  if (napi_typeof(env, obj, &type) != napi_ok || type != napi_object)
  {
    return nullptr;
  }

  // 获取类型标识
  napi_value type_val;
  bool has_type = false;
  if (napi_has_named_property(env, obj, "$type", &has_type) != napi_ok || !has_type)
  {
    return nullptr;
  }

  if (napi_get_named_property(env, obj, "$type", &type_val) != napi_ok)
  {
    return nullptr;
  }

  std::string type_str = get_string_value(env, type_val);
  if (type_str.empty())
    return nullptr;

  if (type_str == "null")
  {
    napi_value result;
    napi_get_null(env, &result);
    return result;
  }

  if (type_str == "undefined")
  {
    napi_value result;
    napi_get_undefined(env, &result);
    return result;
  }

  // 获取值
  napi_value value_obj;
  if (napi_get_named_property(env, obj, "$value", &value_obj) != napi_ok)
  {
    return nullptr;
  }

  if (type_str == "number" || type_str == "string" || type_str == "boolean")
  {
    return value_obj;
  }

  if (type_str == "Buffer")
  {
    std::string base64_str = get_string_value(env, value_obj);
    std::vector<uint8_t> data = base64_decode(base64_str);

    napi_value buffer;
    if (napi_create_buffer_copy(env, data.size(), data.data(), nullptr, &buffer) == napi_ok)
    {
      return buffer;
    }
    return nullptr;
  }

  if (type_str == "Array")
  {
    uint32_t length;
    if (napi_get_array_length(env, value_obj, &length) != napi_ok)
      return nullptr;

    napi_value result;
    if (napi_create_array_with_length(env, length, &result) != napi_ok)
      return nullptr;

    for (uint32_t i = 0; i < length; i++)
    {
      napi_value element;
      if (napi_get_element(env, value_obj, i, &element) == napi_ok)
      {
        napi_value decoded_element = decode_value(env, element);
        if (decoded_element)
        {
          napi_set_element(env, result, i, decoded_element);
        }
      }
    }
    return result;
  }

  if (type_str == "Object")
  {
    napi_value prop_names;
    if (napi_get_property_names(env, value_obj, &prop_names) != napi_ok)
      return nullptr;

    uint32_t prop_count;
    if (napi_get_array_length(env, prop_names, &prop_count) != napi_ok)
      return nullptr;

    napi_value result;
    if (napi_create_object(env, &result) != napi_ok)
      return nullptr;

    for (uint32_t i = 0; i < prop_count; i++)
    {
      napi_value prop_name;
      if (napi_get_element(env, prop_names, i, &prop_name) != napi_ok)
        continue;

      std::string key = get_string_value(env, prop_name);
      if (key.empty())
        continue;

      napi_value prop_value;
      if (napi_get_named_property(env, value_obj, key.c_str(), &prop_value) != napi_ok)
        continue;

      napi_value decoded_value = decode_value(env, prop_value);
      if (decoded_value)
      {
        napi_set_named_property(env, result, key.c_str(), decoded_value);
      }
    }
    return result;
  }

  if (type_str == "Map")
  {
    napi_value global, map_constructor;
    if (napi_get_global(env, &global) != napi_ok)
      return nullptr;
    if (napi_get_named_property(env, global, "Map", &map_constructor) != napi_ok)
      return nullptr;

    napi_value map_instance;
    if (napi_new_instance(env, map_constructor, 0, nullptr, &map_instance) != napi_ok)
      return nullptr;

    uint32_t length;
    if (napi_get_array_length(env, value_obj, &length) != napi_ok)
      return map_instance;

    napi_value set_method;
    if (napi_get_named_property(env, map_instance, "set", &set_method) != napi_ok)
      return map_instance;

    for (uint32_t i = 0; i < length; i++)
    {
      napi_value pair;
      if (napi_get_element(env, value_obj, i, &pair) != napi_ok)
        continue;

      napi_value key, value;
      if (napi_get_element(env, pair, 0, &key) != napi_ok)
        continue;
      if (napi_get_element(env, pair, 1, &value) != napi_ok)
        continue;

      napi_value decoded_key = decode_value(env, key);
      napi_value decoded_value = decode_value(env, value);

      if (decoded_key && decoded_value)
      {
        napi_value args[2] = {decoded_key, decoded_value};
        napi_call_function(env, map_instance, set_method, 2, args, nullptr);
      }
    }
    return map_instance;
  }

  return nullptr;
}

// 导出函数
napi_value Encode(napi_env env, napi_value value)
{
  return encode_value(env, value);
}

napi_value Decode(napi_env env, napi_value obj)
{
  return decode_value(env, obj);
}