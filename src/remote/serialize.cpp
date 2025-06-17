#include <node_api.h>
#include <assert.h>
#include <string>
#include <vector>
#include <iostream>
#include <cstring>
#include <algorithm>
#include <cstdio>

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

bool is_uint8_array(napi_env env, napi_value val)
{
  napi_value global, uint8_array_constructor;
  if (napi_get_global(env, &global) != napi_ok)
    return false;
  if (napi_get_named_property(env, global, "Uint8Array", &uint8_array_constructor) != napi_ok)
    return false;

  bool result = false;
  napi_instanceof(env, val, uint8_array_constructor, &result);
  return result;
}

bool is_array(napi_env env, napi_value val)
{
  bool result = false;
  napi_is_array(env, val, &result);
  return result;
}

bool is_array_like(napi_env env, napi_value val)
{
  // 检查是否是数组
  if (is_array(env, val))
    return true;

  // 检查是否有length属性且为数字
  napi_valuetype type;
  if (napi_typeof(env, val, &type) != napi_ok || type != napi_object)
    return false;

  bool has_length = false;
  if (napi_has_named_property(env, val, "length", &has_length) != napi_ok || !has_length)
    return false;

  napi_value length_val;
  if (napi_get_named_property(env, val, "length", &length_val) != napi_ok)
    return false;

  napi_valuetype length_type;
  if (napi_typeof(env, length_val, &length_type) != napi_ok || length_type != napi_number)
    return false;

  return true;
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

// 编码数组或类数组类型
napi_value encode_array(napi_env env, napi_value arr)
{
  napi_value result = create_typed_object(env, "Array");
  if (!result)
    return nullptr;

  uint32_t length = 0;

  // 获取长度
  if (is_array(env, arr))
  {
    if (napi_get_array_length(env, arr, &length) != napi_ok)
      return nullptr;
  }
  else
  {
    // 类数组对象，获取length属性
    napi_value length_val;
    if (napi_get_named_property(env, arr, "length", &length_val) != napi_ok)
      return nullptr;
    double length_double;
    if (napi_get_value_double(env, length_val, &length_double) != napi_ok)
      return nullptr;
    length = static_cast<uint32_t>(length_double);
  }

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

    // 检查属性是否存在(hasOwnProperty)
    bool has_own_property = false;
    if (napi_has_own_property(env, obj, prop_name, &has_own_property) != napi_ok || !has_own_property)
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
    if (is_buffer(env, value) || is_uint8_array(env, value))
    {
      // 处理 Buffer 和 Uint8Array
      void *data;
      size_t length;

      if (is_buffer(env, value))
      {
        if (napi_get_buffer_info(env, value, &data, &length) != napi_ok)
          return nullptr;
      }
      else
      {
        // Uint8Array
        napi_value buffer;
        size_t byte_offset;
        if (napi_get_typedarray_info(env, value, nullptr, &length, &data, &buffer, &byte_offset) != napi_ok)
          return nullptr;
      }

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

    if (is_array_like(env, value))
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

      // 只有当值不是undefined时才设置属性
      bool is_undefined_val = false;
      if (napi_is_undefined(env, prop_value, &is_undefined_val) == napi_ok && is_undefined_val)
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

// 导出的 rpc_encode 函数
napi_value rpc_encode(napi_env env, napi_callback_info info)
{
  size_t argc = 1;
  napi_value args[1];

  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok)
  {
    napi_throw_error(env, nullptr, "Failed to get callback info");
    return nullptr;
  }

  if (argc < 1)
  {
    napi_throw_error(env, nullptr, "Expected 1 argument");
    return nullptr;
  }

  napi_value result = encode_value(env, args[0]);
  if (!result)
  {
    napi_throw_error(env, nullptr, "Unsupported type");
    return nullptr;
  }

  return result;
}

// 导出的 rpc_decode 函数
napi_value rpc_decode(napi_env env, napi_callback_info info)
{
  size_t argc = 1;
  napi_value args[1];

  if (napi_get_cb_info(env, info, &argc, args, nullptr, nullptr) != napi_ok)
  {
    napi_throw_error(env, nullptr, "Failed to get callback info");
    return nullptr;
  }

  if (argc < 1)
  {
    napi_throw_error(env, nullptr, "Expected 1 argument");
    return nullptr;
  }

  napi_value result = decode_value(env, args[0]);
  if (!result)
  {
    napi_throw_error(env, nullptr, "Invalid encoded object");
    return nullptr;
  }

  return result;
}

// JSON字符串转义
std::string escape_json_string(const std::string &str)
{
  std::string result;
  result.reserve(str.size() * 2); // 预分配足够空间

  for (char c : str)
  {
    switch (c)
    {
    case '"':
      result += "\\\"";
      break;
    case '\\':
      result += "\\\\";
      break;
    case '\b':
      result += "\\b";
      break;
    case '\f':
      result += "\\f";
      break;
    case '\n':
      result += "\\n";
      break;
    case '\r':
      result += "\\r";
      break;
    case '\t':
      result += "\\t";
      break;
    default:
      if (c >= 0 && c < 32)
      {
        // 控制字符用Unicode转义
        char buffer[8];
        snprintf(buffer, sizeof(buffer), "\\u%04x", static_cast<unsigned char>(c));
        result += buffer;
      }
      else
      {
        result += c;
      }
      break;
    }
  }
  return result;
}

// 将napi_value转换为JSON字符串
std::string value_to_json(napi_env env, napi_value value)
{
  napi_valuetype type;
  if (napi_typeof(env, value, &type) != napi_ok)
  {
    return "null";
  }

  // 检查null
  bool is_null_val = false;
  if (napi_is_null(env, value, &is_null_val) == napi_ok && is_null_val)
  {
    return "null";
  }

  // 检查undefined
  bool is_undefined_val = false;
  if (napi_is_undefined(env, value, &is_undefined_val) == napi_ok && is_undefined_val)
  {
    return "null"; // JSON中没有undefined，用null代替
  }

  switch (type)
  {
  case napi_boolean:
  {
    bool bool_val;
    if (napi_get_value_bool(env, value, &bool_val) == napi_ok)
    {
      return bool_val ? "true" : "false";
    }
    return "null";
  }

  case napi_number:
  {
    double num_val;
    if (napi_get_value_double(env, value, &num_val) == napi_ok)
    {
      // 检查是否为整数
      if (num_val == static_cast<int64_t>(num_val))
      {
        return std::to_string(static_cast<int64_t>(num_val));
      }
      else
      {
        return std::to_string(num_val);
      }
    }
    return "null";
  }

  case napi_string:
  {
    std::string str_val = get_string_value(env, value);
    return "\"" + escape_json_string(str_val) + "\"";
  }

  case napi_object:
  {
    // 检查是否为数组
    if (is_array(env, value))
    {
      std::string result = "[";
      uint32_t length;
      if (napi_get_array_length(env, value, &length) == napi_ok)
      {
        for (uint32_t i = 0; i < length; i++)
        {
          if (i > 0)
            result += ",";
          napi_value element;
          if (napi_get_element(env, value, i, &element) == napi_ok)
          {
            result += value_to_json(env, element);
          }
          else
          {
            result += "null";
          }
        }
      }
      result += "]";
      return result;
    }

    // 处理普通对象
    std::string result = "{";
    napi_value prop_names;
    if (napi_get_property_names(env, value, &prop_names) == napi_ok)
    {
      uint32_t prop_count;
      if (napi_get_array_length(env, prop_names, &prop_count) == napi_ok)
      {
        bool first = true;
        for (uint32_t i = 0; i < prop_count; i++)
        {
          napi_value prop_name;
          if (napi_get_element(env, prop_names, i, &prop_name) == napi_ok)
          {
            std::string key = get_string_value(env, prop_name);
            if (!key.empty())
            {
              napi_value prop_value;
              if (napi_get_named_property(env, value, key.c_str(), &prop_value) == napi_ok)
              {
                if (!first)
                  result += ",";
                first = false;
                result += "\"" + escape_json_string(key) + "\":" + value_to_json(env, prop_value);
              }
            }
          }
        }
      }
    }
    result += "}";
    return result;
  }

  default:
    return "null";
  }
}

// JSON解析辅助函数
class JSONParser
{
private:
  const char *json;
  size_t pos;
  size_t len;

  void skip_whitespace()
  {
    while (pos < len && (json[pos] == ' ' || json[pos] == '\t' ||
                         json[pos] == '\n' || json[pos] == '\r'))
    {
      pos++;
    }
  }

  bool match_string(const char *str)
  {
    size_t str_len = strlen(str);
    if (pos + str_len > len)
      return false;

    for (size_t i = 0; i < str_len; i++)
    {
      if (json[pos + i] != str[i])
        return false;
    }
    pos += str_len;
    return true;
  }

  std::string parse_string()
  {
    if (pos >= len || json[pos] != '"')
      return "";
    pos++; // skip opening quote

    std::string result;
    while (pos < len && json[pos] != '"')
    {
      if (json[pos] == '\\' && pos + 1 < len)
      {
        pos++;
        switch (json[pos])
        {
        case '"':
          result += '"';
          break;
        case '\\':
          result += '\\';
          break;
        case '/':
          result += '/';
          break;
        case 'b':
          result += '\b';
          break;
        case 'f':
          result += '\f';
          break;
        case 'n':
          result += '\n';
          break;
        case 'r':
          result += '\r';
          break;
        case 't':
          result += '\t';
          break;
        case 'u':
          if (pos + 4 < len)
          {
            // 简单的Unicode处理，这里只处理基本的ASCII范围
            char hex_str[5] = {0};
            memcpy(hex_str, json + pos + 1, 4);
            unsigned int code_point = strtoul(hex_str, nullptr, 16);
            if (code_point <= 0x7F)
            {
              result += static_cast<char>(code_point);
            }
            pos += 4;
          }
          break;
        default:
          result += json[pos];
          break;
        }
      }
      else
      {
        result += json[pos];
      }
      pos++;
    }

    if (pos < len && json[pos] == '"')
    {
      pos++; // skip closing quote
    }
    return result;
  }

  double parse_number()
  {
    size_t start = pos;

    // 处理负号
    if (pos < len && json[pos] == '-')
    {
      pos++;
    }

    // 处理整数部分
    if (pos < len && json[pos] == '0')
    {
      pos++;
    }
    else if (pos < len && json[pos] >= '1' && json[pos] <= '9')
    {
      while (pos < len && json[pos] >= '0' && json[pos] <= '9')
      {
        pos++;
      }
    }

    // 处理小数部分
    if (pos < len && json[pos] == '.')
    {
      pos++;
      while (pos < len && json[pos] >= '0' && json[pos] <= '9')
      {
        pos++;
      }
    }

    // 处理指数部分
    if (pos < len && (json[pos] == 'e' || json[pos] == 'E'))
    {
      pos++;
      if (pos < len && (json[pos] == '+' || json[pos] == '-'))
      {
        pos++;
      }
      while (pos < len && json[pos] >= '0' && json[pos] <= '9')
      {
        pos++;
      }
    }

    std::string num_str(json + start, pos - start);
    return strtod(num_str.c_str(), nullptr);
  }

public:
  JSONParser(const char *json_str) : json(json_str), pos(0)
  {
    len = strlen(json_str);
  }

  napi_value parse_value(napi_env env)
  {
    skip_whitespace();

    if (pos >= len)
      return nullptr;

    char c = json[pos];

    // null
    if (c == 'n' && match_string("null"))
    {
      napi_value result;
      napi_get_null(env, &result);
      return result;
    }

    // true
    if (c == 't' && match_string("true"))
    {
      napi_value result;
      napi_get_boolean(env, true, &result);
      return result;
    }

    // false
    if (c == 'f' && match_string("false"))
    {
      napi_value result;
      napi_get_boolean(env, false, &result);
      return result;
    }

    // string
    if (c == '"')
    {
      std::string str = parse_string();
      return create_string(env, str);
    }

    // number
    if (c == '-' || (c >= '0' && c <= '9'))
    {
      double num = parse_number();
      napi_value result;
      napi_create_double(env, num, &result);
      return result;
    }

    // array
    if (c == '[')
    {
      pos++; // skip '['
      skip_whitespace();

      napi_value array;
      if (napi_create_array(env, &array) != napi_ok)
      {
        return nullptr;
      }

      uint32_t index = 0;

      // 处理空数组
      if (pos < len && json[pos] == ']')
      {
        pos++;
        return array;
      }

      while (pos < len)
      {
        napi_value element = parse_value(env);
        if (element)
        {
          napi_set_element(env, array, index++, element);
        }

        skip_whitespace();
        if (pos < len && json[pos] == ',')
        {
          pos++; // skip ','
          skip_whitespace();
        }
        else if (pos < len && json[pos] == ']')
        {
          pos++; // skip ']'
          break;
        }
        else
        {
          break; // 格式错误
        }
      }

      return array;
    }

    // object
    if (c == '{')
    {
      pos++; // skip '{'
      skip_whitespace();

      napi_value obj;
      if (napi_create_object(env, &obj) != napi_ok)
      {
        return nullptr;
      }

      // 处理空对象
      if (pos < len && json[pos] == '}')
      {
        pos++;
        return obj;
      }

      while (pos < len)
      {
        skip_whitespace();

        // 解析键
        if (pos >= len || json[pos] != '"')
          break;
        std::string key = parse_string();
        if (key.empty())
          break;

        skip_whitespace();
        if (pos >= len || json[pos] != ':')
          break;
        pos++; // skip ':'

        // 解析值
        napi_value value = parse_value(env);
        if (value)
        {
          napi_set_named_property(env, obj, key.c_str(), value);
        }

        skip_whitespace();
        if (pos < len && json[pos] == ',')
        {
          pos++; // skip ','
          skip_whitespace();
        }
        else if (pos < len && json[pos] == '}')
        {
          pos++; // skip '}'
          break;
        }
        else
        {
          break; // 格式错误
        }
      }

      return obj;
    }

    return nullptr;
  }
};

// 将JSON字符串转换为napi_value
napi_value json_to_value(napi_env env, const std::string &json_str)
{
  if (json_str.empty())
  {
    return nullptr;
  }

  JSONParser parser(json_str.c_str());
  return parser.parse_value(env);
}