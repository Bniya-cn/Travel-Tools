import type { ApiClientError } from '../../types/api';
import type { Place } from '../../types/place';

export type PlaceKind =
  | 'attraction'
  | 'museum'
  | 'transport'
  | 'hotel'
  | 'restaurant'
  | 'subway'
  | 'other';

export type PlacePresentation = {
  kind: PlaceKind;
  label: string;
};

const kindRules: Array<{ kind: PlaceKind; label: string; pattern: RegExp }> = [
  { kind: 'museum', label: '博物馆', pattern: /博物馆|纪念馆|展览馆/ },
  { kind: 'attraction', label: '景点', pattern: /景区|公园|古城|城墙|寺|塔|山|湖|街|广场|遗址/ },
  { kind: 'transport', label: '交通枢纽', pattern: /机场|火车站|高铁站|客运站|码头/ },
  { kind: 'subway', label: '地铁站', pattern: /地铁|站$/ },
  { kind: 'hotel', label: '住宿', pattern: /酒店|宾馆|民宿|旅舍/ },
  { kind: 'restaurant', label: '餐饮', pattern: /餐厅|饭店|饭馆|咖啡|茶馆|小吃/ },
];

/** 仅为展示分组和图标服务，不写回或推断业务状态。 */
export function getPlacePresentation(place: Pick<Place, 'name' | 'address'>): PlacePresentation {
  const text = `${place.name} ${place.address ?? ''}`;
  const matched = kindRules.find(({ pattern }) => pattern.test(text));
  return matched ? { kind: matched.kind, label: matched.label } : { kind: 'other', label: '地点' };
}

export function formatPlannerError(action: string, error: unknown): string {
  const apiError = error as ApiClientError | undefined;
  if (apiError?.code === 'NETWORK_ERROR') return '网络连接暂时不可用，请检查网络后重试';
  if (apiError?.status === 404) return '需要的信息暂时不可用，请刷新后重试';
  if (apiError?.status && apiError.status >= 500) {
    return action === '生成路线' ? '路线暂时生成失败，请稍后重试' : `${action}暂时失败，请稍后重试`;
  }
  return `${action}失败，请稍后重试`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
