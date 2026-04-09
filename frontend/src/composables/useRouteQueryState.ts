import { reactive, ref, watch } from 'vue'
import {
  useRoute,
  useRouter,
  type LocationQuery,
  type LocationQueryRaw,
  type LocationQueryValue,
} from 'vue-router'

type QueryPrimitive = string | string[] | undefined

export interface QueryCodec<T> {
  parse: (value: LocationQueryValue | LocationQueryValue[] | undefined) => T
  serialize: (value: T) => QueryPrimitive
}

type QuerySchema<TState extends Record<string, unknown>> = {
  [K in keyof TState]: QueryCodec<TState[K]>
}

interface UseRouteQueryStateOptions<TState extends Record<string, unknown>> {
  runOnInit?: boolean
  onQueryStateChange?: (state: TState, context: { initial: boolean }) => void | Promise<void>
}

function readSingleValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === 'string')
  return typeof value === 'string' ? value : undefined
}

function readArrayValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string') return [value]
  return []
}

function normalizeQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string[] {
  if (Array.isArray(value)) return value.map((item) => item ?? '')
  if (typeof value === 'string') return [value]
  return []
}

function isSameQuery(a: LocationQuery, b: LocationQueryRaw): boolean {
  const aKeys = Object.keys(a).sort()
  const bKeys = Object.keys(b).sort()
  if (aKeys.length !== bKeys.length) return false
  for (let index = 0; index < aKeys.length; index += 1) {
    if (aKeys[index] !== bKeys[index]) return false
  }

  for (const key of aKeys) {
    const left = normalizeQueryValue(a[key]).join('\u0000')
    const right = normalizeQueryValue(b[key] as LocationQueryValue | LocationQueryValue[] | undefined).join('\u0000')
    if (left !== right) return false
  }
  return true
}

export function stringQueryParam(defaultValue = ''): QueryCodec<string> {
  return {
    parse: (value) => readSingleValue(value) ?? defaultValue,
    serialize: (value) => {
      const trimmed = value.trim()
      return trimmed && trimmed !== defaultValue ? trimmed : undefined
    },
  }
}

export function optionalStringQueryParam(): QueryCodec<string | undefined> {
  return {
    parse: (value) => {
      const parsed = readSingleValue(value)?.trim()
      return parsed ? parsed : undefined
    },
    serialize: (value) => {
      const trimmed = value?.trim()
      return trimmed ? trimmed : undefined
    },
  }
}

export function numberQueryParam(defaultValue: number, options?: { min?: number; max?: number }): QueryCodec<number> {
  return {
    parse: (value) => {
      const parsed = parseInt(readSingleValue(value) ?? '', 10)
      if (Number.isNaN(parsed)) return defaultValue
      if (options?.min !== undefined && parsed < options.min) return defaultValue
      if (options?.max !== undefined && parsed > options.max) return defaultValue
      return parsed
    },
    serialize: (value) => (value === defaultValue ? undefined : String(value)),
  }
}

export function enumQueryParam<const TValue extends string>(
  values: readonly TValue[],
  defaultValue: TValue
): QueryCodec<TValue> {
  return {
    parse: (value) => {
      const parsed = readSingleValue(value)
      return parsed && values.includes(parsed as TValue) ? (parsed as TValue) : defaultValue
    },
    serialize: (value) => (value === defaultValue ? undefined : value),
  }
}

export function stringArrayQueryParam(defaultValue: string[] = [], separator = ','): QueryCodec<string[]> {
  return {
    parse: (value) => {
      const raw = readArrayValue(value)
      if (raw.length === 0) return [...defaultValue]
      return raw
        .flatMap((item) => item.split(separator))
        .map((item) => item.trim())
        .filter(Boolean)
    },
    serialize: (value) => {
      const next = value.map((item) => item.trim()).filter(Boolean)
      return next.length > 0 ? next.join(separator) : undefined
    },
  }
}

export function booleanQueryParam(defaultValue: boolean): QueryCodec<boolean> {
  return {
    parse: (value) => {
      const parsed = readSingleValue(value)
      if (parsed === undefined) return defaultValue
      if (parsed === 'true' || parsed === '1') return true
      if (parsed === 'false' || parsed === '0') return false
      return defaultValue
    },
    serialize: (value) => (value === defaultValue ? undefined : String(value)),
  }
}

export function useRouteQueryState<TState extends Record<string, unknown>>(
  schema: QuerySchema<TState>,
  options: UseRouteQueryStateOptions<TState> = {}
) {
  const route = useRoute()
  const router = useRouter()
  const state = reactive({} as TState) as TState
  const ready = ref(false)

  let initialized = false
  let skipNextRouteChange = false

  function snapshotState(): TState {
    return Object.fromEntries(
      Object.keys(schema).map((key) => [key, state[key as keyof TState]])
    ) as TState
  }

  function applyQuery(query: LocationQuery = route.query) {
    for (const key of Object.keys(schema) as Array<keyof TState>) {
      state[key] = schema[key].parse(query[key as string])
    }
  }

  function buildQuery(): LocationQueryRaw {
    const next: LocationQueryRaw = {}

    for (const [key, value] of Object.entries(route.query)) {
      if (!(key in schema) && value !== undefined) {
        next[key] = value as string | string[]
      }
    }

    for (const key of Object.keys(schema) as Array<keyof TState>) {
      const serialized = schema[key].serialize(state[key])
      if (serialized !== undefined) {
        next[key as string] = serialized
      }
    }

    return next
  }

  async function updateQuery(patch?: Partial<TState>) {
    if (patch) {
      Object.assign(state, patch)
    }

    const nextQuery = buildQuery()
    if (isSameQuery(route.query, nextQuery)) return

    skipNextRouteChange = true
    try {
      await router.replace({ query: nextQuery, hash: route.hash })
    } finally {
      // Route watchers clear this flag when they observe the synced query.
      if (isSameQuery(route.query, nextQuery)) {
        skipNextRouteChange = false
      }
    }
  }

  watch(
    () => route.query,
    async (query) => {
      const initial = !initialized
      applyQuery(query)
      ready.value = true

      if (skipNextRouteChange) {
        skipNextRouteChange = false
        initialized = true
        return
      }

      initialized = true
      if (initial && options.runOnInit === false) return
      await options.onQueryStateChange?.(snapshotState(), { initial })
    },
    { immediate: true }
  )

  return {
    state,
    ready,
    updateQuery,
  }
}
