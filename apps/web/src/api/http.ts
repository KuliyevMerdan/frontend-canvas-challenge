export const apiOrigin: string = import.meta.env.VITE_API_ORIGIN ?? 'http://127.0.0.1:4001';

/** 'state' — локальное предусловие (например, не удалось сохранить граф перед генерацией). */
export type FailureKind = 'network' | 'http' | 'parse' | 'state';

/** Единый вид любой неудачи: сеть, HTTP-статус, разбор тела или локальное предусловие. */
export class ApiFailure extends Error {
  readonly kind: FailureKind;
  readonly status: number | null;
  readonly code: string;
  /** Повтор того же запроса имеет смысл (сбой сети или 5xx). */
  readonly retryable: boolean;

  constructor(kind: FailureKind, message: string, status: number | null = null, code?: string) {
    super(message);
    this.kind = kind;
    this.status = status;
    this.code =
      code ??
      (kind === 'network' ? 'NETWORK_ERROR' : kind === 'state' ? 'STATE_ERROR' : 'PARSE_ERROR');
    this.retryable = kind === 'network' || (status !== null && status >= 500);
  }
}

/** Любое пойманное значение приводится к ApiFailure ровно в одном месте. */
export function toFailure(error: unknown): ApiFailure {
  return error instanceof ApiFailure
    ? error
    : new ApiFailure('parse', 'Что-то пошло не так. Обновите страницу и повторите.');
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isErrorBody = (value: unknown): value is { error: { code: string; message: string } } =>
  isRecord(value) && isRecord(value.error) && typeof value.error.message === 'string';

export interface RequestSpec {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  idempotencyKey?: string;
  /** ETag для условной записи графа — как получен, с кавычками. */
  ifMatch?: string;
}

export interface ApiResponse<T> {
  data: T;
  /** ETag ответа (выдаётся только для графа). */
  etag: string | null;
}

/**
 * Единственная точка отправки запросов. Владеет адресом, заголовками,
 * сериализацией тела, кодами ответа, пустыми телами (204/304) и приведением
 * всех неудач к ApiFailure. Ответы здесь без конверта — ресурс целиком.
 */
export async function send<T>(path: string, spec: RequestSpec = {}): Promise<ApiResponse<T>> {
  const { method = 'GET', body, idempotencyKey, ifMatch } = spec;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  if (ifMatch) headers['If-Match'] = ifMatch;

  let response: Response;
  try {
    response = await fetch(apiOrigin + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiFailure('network', 'Нет соединения с сервером. Проверьте сеть и повторите.');
  }

  const etag = response.headers.get('ETag');

  if (response.status === 204 || response.status === 304) {
    return { data: undefined as T, etag };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error = isErrorBody(parsed) ? parsed.error : null;
    throw new ApiFailure(
      'http',
      error?.message ?? `Запрос не выполнен (код ${response.status}).`,
      response.status,
      error?.code ?? `HTTP_${response.status}`,
    );
  }

  if (parsed === null) {
    throw new ApiFailure('parse', 'Не удалось обработать ответ сервера.');
  }
  return { data: parsed as T, etag };
}

/** Как send, но когда ETag не нужен — сразу тело ответа. */
export async function request<T>(path: string, spec: RequestSpec = {}): Promise<T> {
  return (await send<T>(path, spec)).data;
}
