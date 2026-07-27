"""Generate city recommendations via AI, resolve places with Amap."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import AppError
from app.schemas.city_hints import CityHintsResponse
from app.schemas.place import PlaceSearchResult
from app.services import amap_places

logger = logging.getLogger("travel_planner.city_hints")

# 本地回退：标题建议 + 可检索的真实地点名
_FALLBACK: dict[str, tuple[list[str], list[str]]] = {
    "西安": (["参观西安城墙", "逛陕西历史博物馆"], ["西安城墙", "兵马俑", "陕西历史博物馆"]),
    "成都": (["逛宽窄巷子", "看大熊猫"], ["宽窄巷子", "成都大熊猫繁育研究基地", "锦里"]),
    "北京": (["游览故宫", "颐和园半日"], ["故宫博物院", "天安门广场", "颐和园"]),
    "上海": (["外滩夜景", "豫园半日游"], ["外滩", "东方明珠", "豫园"]),
    "杭州": (["西湖漫步", "灵隐寺"], ["西湖", "灵隐寺", "西溪国家湿地公园"]),
    "重庆": (["洪崖洞夜景", "磁器口古镇"], ["洪崖洞", "磁器口", "解放碑"]),
    "广州": (["参观中山大学", "陈家祠", "登白云山"], ["中山大学", "陈家祠", "白云山", "沙面"]),
    "深圳": (["莲花山公园", "大鹏所城"], ["世界之窗", "莲花山公园", "大鹏所城"]),
    "南京": (["夫子庙秦淮", "中山陵"], ["夫子庙", "中山陵", "玄武湖"]),
    "苏州": (["拙政园", "平江路漫步"], ["拙政园", "寒山寺", "平江路"]),
    "厦门": (["鼓浪屿半日", "南普陀"], ["鼓浪屿", "南普陀寺", "曾厝垵"]),
    "昆明": (["翠湖公园", "滇池风光"], ["翠湖公园", "石林风景区", "滇池"]),
    "大理": (["洱海骑行", "大理古城"], ["洱海", "大理古城", "喜洲古镇"]),
    "丽江": (["丽江古城", "玉龙雪山"], ["丽江古城", "玉龙雪山", "束河古镇"]),
}


@dataclass(frozen=True)
class _NameBundle:
    titles: list[str]
    place_names: list[str]
    source: str  # ai | fallback


def _lookup_fallback(city: str) -> tuple[list[str], list[str]]:
    city_name = city.strip()
    pair = _FALLBACK.get(city_name) or _FALLBACK.get(city_name.removesuffix("市"))
    if pair is not None:
        return list(pair[0]), list(pair[1])
    return [f"游览{city_name}市区"], [f"{city_name}博物馆", f"{city_name}公园"]


def fallback_bundle(city: str) -> _NameBundle:
    titles, places = _lookup_fallback(city)
    return _NameBundle(titles=titles, place_names=places, source="fallback")


def _extract_json_object(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else None
        except json.JSONDecodeError:
            return None


def _clean_str_list(value: Any, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        name = item.strip()
        if not name or name in seen:
            continue
        seen.add(name)
        out.append(name)
        if len(out) >= limit:
            break
    return out


def _parse_ai_bundle(city: str, data: dict[str, Any]) -> _NameBundle | None:
    titles = _clean_str_list(data.get("titles"), limit=6)
    places = _clean_str_list(data.get("places"), limit=8)
    if not titles or not places:
        return None
    return _NameBundle(titles=titles, place_names=places, source="ai")


async def _suggest_names(city: str) -> _NameBundle:
    city_name = city.strip()
    if not city_name:
        return fallback_bundle("未知城市")

    settings = get_settings()
    base = settings.ai_api_base_url.strip().rstrip("/")
    key = settings.ai_api_key.strip()
    model = settings.ai_model.strip()
    if not base or not key or not model:
        return fallback_bundle(city_name)

    url = f"{base}/chat/completions"
    prompt = (
        f"你是中国城市旅游顾问。针对「{city_name}」，输出严格 JSON：\n"
        '{"titles":["事项标题1","事项标题2"],"places":["真实地点名1","真实地点名2"]}\n'
        "要求：\n"
        "1. titles 3~5 条，可直接当作行程事项标题（如「参观中山大学」）；\n"
        "2. places 4~6 条，必须是该城市真实可游览地点（大学校园、景点、公园、博物馆等），"
        "用完整惯用名（如「中山大学」「陈家祠」「广州塔」）；\n"
        "3. 不要地铁站、公交站；不要编造；不要加「例如」前缀；只输出 JSON。"
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "你只输出合法 JSON 对象。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.3,
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        if response.status_code != 200:
            logger.warning("AI city hints HTTP %s", response.status_code)
            return fallback_bundle(city_name)

        payload = response.json()
        choices = payload.get("choices") if isinstance(payload, dict) else None
        if not isinstance(choices, list) or not choices:
            return fallback_bundle(city_name)
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if not isinstance(content, str):
            return fallback_bundle(city_name)

        parsed = _extract_json_object(content)
        if parsed is None:
            return fallback_bundle(city_name)
        bundle = _parse_ai_bundle(city_name, parsed)
        return bundle if bundle is not None else fallback_bundle(city_name)
    except Exception:
        logger.exception("AI city hints failed for city=%s", city_name)
        return fallback_bundle(city_name)


async def _resolve_one(city: str, keyword: str) -> PlaceSearchResult | None:
    try:
        hits = await amap_places.search_places(keyword=keyword, city=city, page=1, offset=5)
    except AppError:
        logger.warning("Resolve place failed city=%s keyword=%s", city, keyword)
        return None
    if not hits:
        return None

    def score(hit: PlaceSearchResult) -> tuple[int, int]:
        name = hit.name
        # 地铁/公交站优先级最低
        transit_penalty = 1 if ("地铁站" in name or "公交站" in name or name.endswith("站")) else 0
        # 名称更贴近关键词优先
        exact = 0 if (keyword == name or keyword in name or name in keyword) else 1
        return (transit_penalty, exact)

    return sorted(hits, key=score)[0]


async def resolve_place_names(city: str, names: list[str]) -> list[PlaceSearchResult]:
    """Resolve place names to Amap POIs; skip failures; dedupe by poi id / name."""
    if not names:
        return []
    results = await asyncio.gather(*[_resolve_one(city, name) for name in names])
    out: list[PlaceSearchResult] = []
    seen: set[str] = set()
    for hit in results:
        if hit is None:
            continue
        key = hit.amap_poi_id or f"{hit.name}:{hit.lng}:{hit.lat}"
        if key in seen:
            continue
        seen.add(key)
        out.append(hit)
    return out


async def generate_city_hints(city: str) -> CityHintsResponse:
    """Recommend titles + real places for a city."""
    city_name = city.strip() or "未知城市"
    bundle = await _suggest_names(city_name)
    places = await resolve_place_names(city_name, bundle.place_names)
    return CityHintsResponse(
        city_name=city_name,
        titles=bundle.titles,
        places=places,
        source="ai" if bundle.source == "ai" else "fallback",
    )


# 兼容旧测试命名
def fallback_hints(city: str) -> CityHintsResponse:
    bundle = fallback_bundle(city)
    return CityHintsResponse(
        city_name=city.strip(),
        titles=bundle.titles,
        places=[],
        source="fallback",
    )
