/**
 * 类型工具
 * ------------------------------------------------------------------
 * lib/data/*.ts 用 `as const` 推出 readonly literal 类型；后台编辑器
 * 要做表单更新（设值 / 替换数组项 / 删除行），需要可变类型。
 *
 * Writable<T>：
 *   - 把 `readonly` 全部去掉
 *   - 数组保留为可变数组（元素递归）
 *   - 字符串/数字/布尔字面量 → string/number/boolean（distributive
 *     over union，让 union 类型变宽）
 *   - 对象保留原始类型（递归 mapped）
 */
export type Writable<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends ReadonlyArray<infer U>
        ? Writable<U>[]
        : T extends object
          ? { -readonly [K in keyof T]: Writable<T[K]> }
          : T;