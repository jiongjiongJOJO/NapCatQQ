interface EncodedValue {
  $type: string;
  $value?: unknown;
}

interface EncodedNull {
  $type: "null";
}

interface EncodedUndefined {
  $type: "undefined";
}

interface EncodedPrimitive {
  $type: "number" | "string" | "boolean";
  $value: number | string | boolean;
}

interface EncodedBuffer {
  $type: "Buffer";
  $value: string;
}

interface EncodedMap {
  $type: "Map";
  $value: [EncodedValue, EncodedValue][];
}

interface EncodedArray {
  $type: "Array";
  $value: EncodedValue[];
}

interface EncodedObject {
  $type: "Object";
  $value: { [key: string]: EncodedValue };
}

type SerializedValue = EncodedNull | EncodedUndefined | EncodedPrimitive | EncodedBuffer | EncodedMap | EncodedArray | EncodedObject;

function rpc_encode<T>(value: T): SerializedValue {
  if (value === null) return { $type: "null" };
  if (value === undefined) return { $type: "undefined" };

  if (typeof value === "number") return { $type: "number", $value: value };
  if (typeof value === "string") return { $type: "string", $value: value };
  if (typeof value === "boolean") return { $type: "boolean", $value: value };

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    // Buffer和Uint8Array都转成base64字符串
    let base64: string = Buffer.from(value).toString("base64");
    return { $type: "Buffer", $value: base64 };
  }

  if (value instanceof Map) {
    let arr: [SerializedValue, SerializedValue][] = [];
    for (let [k, v] of value.entries()) {
      arr.push([rpc_encode(k), rpc_encode(v)]);
    }
    return { $type: "Map", $value: arr };
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null && typeof (value as unknown as ArrayLike<unknown>).length === "number")) {
    // ArrayLike也认为是Array
    let arr: SerializedValue[] = [];
    const arrayLike = value as unknown as ArrayLike<unknown>;
    for (let i = 0; i < arrayLike.length; i++) {
      arr.push(rpc_encode(arrayLike[i]));
    }
    return { $type: "Array", $value: arr };
  }

  if (typeof value === "object" && value !== null) {
    let obj: { [key: string]: SerializedValue } = {};
    for (let k in value) {
      if (Object.prototype.hasOwnProperty.call(value, k)) {
        obj[k] = rpc_encode((value as Record<string, unknown>)[k]);
      }
    }
    return { $type: "Object", $value: obj };
  }

  throw new Error("Unsupported type");
}

function rpc_decode<T = unknown>(obj: EncodedValue): T {
  if (obj == null || typeof obj !== "object" || !("$type" in obj)) {
    throw new Error("Invalid encoded object");
  }
  switch (obj.$type) {
    case "null": return null as T;
    case "undefined": return undefined as T;
    case "number": return (obj as EncodedPrimitive).$value as T;
    case "string": return (obj as EncodedPrimitive).$value as T;
    case "boolean": return (obj as EncodedPrimitive).$value as T;
    case "Buffer":
      return Buffer.from((obj as EncodedBuffer).$value, "base64") as T;
    case "Map":
      {
        let map = new Map();
        for (let [k, v] of (obj as EncodedMap).$value) {
          map.set(rpc_decode(k), rpc_decode(v));
        }
        return map as T;
      }
    case "Array":
      {
        let arr: unknown[] = [];
        for (let item of (obj as EncodedArray).$value) {
          arr.push(rpc_decode(item));
        }
        return arr as T;
      }
    case "Object":
      {
        let out: Record<string, unknown> = {};
        for (let k in (obj as EncodedObject).$value) {
          const value = (obj as EncodedObject).$value[k];
          if (value !== undefined) {
            out[k] = rpc_decode(value);
          }
        }
        return out as T;
      }
    default:
      throw new Error("Unknown $type: " + obj.$type);
  }
}

export { rpc_encode, rpc_decode };
export type { SerializedValue };